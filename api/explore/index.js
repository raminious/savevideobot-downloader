const koa = require('koa')
const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const agent = require('superagent')
const log = require('../../log')
const Q = require('../../lib/jobs')
const Media = require('../../lib/resources/media')

const app = new koa()

router.post('/explore', bodyParser(), async function (ctx) {

  ctx.assert(ctx.is('json'), 415, 'content type should be json')

  const id = ctx.request.body.id
  ctx.assert(id != null, 400, 'Id is required')

  const url = ctx.request.body.url
  ctx.assert(url != null, 400, 'Url is required')

  // callback is optional
  const callback = ctx.request.body.callback

  Q.jobs[Q.DUMP_JOB].add({
    title: '[ dump ] ' + url,
    id,
    url,
    callback
  }, {
    attempts: 2,
    timeout: 30 * 1000,
    removeOnComplete: true,
    removeOnFail: true
  })

  ctx.body = {}
})

Q.jobs[Q.DUMP_JOB]
.on('completed', function (job, result) {
  const id = result.id
  const url = result.url
  const callback = result.callback
  const error = result.error
  const media = result.media

  // log error
  if (error) {
    log('warning', error.type || error.message, {
      target: error.target,
      action: error.action,
      task: 'media/explore',
      url: url,
      description: error.description,
      source_address: error.source_address
    })
  }

  // update media
  const attributes = error? { status: 'failed', note: error.message }: media
  Media.update(id, attributes)
  .then(res => {

    if (callback == null)
      return false

    // callback
    agent
      .post(callback.url)
      .send({ id: callback.id })
      .send({ media: media? Object.assign(media, {id}): undefined })
      .send({ error })
      .end((err, res) => {})

  }, e => e)
})
.on('failed', function(job, err) {
  const {attempts, attemptsMade} = job
  if (attempts !== attemptsMade)
    return false

  const error = {}
  error.type = 'ytdl_dump_error'
  error.description = err.message
  error.message = 'Can not get media info of requested url, please try again.'
  log('warning', error.type, {
    id: job.data.id,
    url: job.data.url,
    desc: error.description
  })

  agent
  .post(job.data.callback.url)
  .send({ id: job.data.callback.id })
  .send({ error })
  .end((err, res) => {})
})

// declare dump job processor
Q.jobs[Q.DUMP_JOB].process(4, require('./jobs/dump'))

module.exports = app.use(router.routes())
