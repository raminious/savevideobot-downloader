const koa = require('koa')
const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const agent = require('superagent')
const bytes = require('bytes')
const Q = require('../../lib/jobs')
const log = require('../../log')
const engine = require('../../lib/engine')
const config = require('../../config.json')

const app = new koa()

// constants
const maxSize = bytes.parse(config.download.maxSize)

router.post('/send', bodyParser(), async function (ctx) {
  ctx.assert(ctx.is('json'), 415, 'content type should be json')

  const { body } = ctx.request
  const { id, webhook, callback } = body
  const format = body.format || 'best'

  // get media
  let media

  try {
    media = await engine.getMedia(id, format)
  }
  catch(e) {
    ctx.log('fatal', 'download_fail', {
      type: e.type,
      stack: e.stack,
      target: 'downloader',
      task: 'media/send',
      description: e.message,
      media_id: id,
      format: format
    })

    ctx.assert(e == null, 406, e.message)
  }

  // log large file requests
  if (media.size > maxSize) {
    ctx.log('info', 'max_size', {
      target: 'downloader',
      task: 'media/download',
      site: media.site,
      url: media.url
    })
  }

  Q.jobs[Q.SEND_JOB].add({
    title: '[ SEND ] ' + media.title.substr(0, 50),
    media,
    webhook,
    callback
  }, {
    attempts: 1,
    timeout: 3 * 60 * 1000,
    removeOnComplete: true
  })

  ctx.body = {}
})

Q.jobs[Q.SEND_JOB]
.on('completed', function (job, result) {

  const response = result.response
  const error = result.error
  const callback = result.callback
  const webhook = result.webhook

  // callback
  if (callback) {
    agent
      .post(callback.url)
      .send({ id: callback.id })
      .send({ response })
      .send({ error })
      .retry(2)
      .end((err, res) => {})
  }

  // log error on log server
  if (error) {
    log('fatal', 'ytdl_sucks', {
      target: 'downloader',
      task: 'media/download',
      description: error.description,
      stack: error.stack
    })
  }
})
.on('failed', function(job, err) {
  const { attempts, attemptsMade } = job
  const { callback, media } = job.data

  if (attempts !== attemptsMade) {
    return false
  }

  const error = {}
  error.type = 'ytdl_send_error'
  error.description = err.message
  error.message =  [
    'Can not send your requested media file, because target server not responsed.',
    'You can download file by yourself via this link:\n',
    '[' + media.filename + '](' + media.stream.replace('/stream/', '/download/') + ')'
  ].join('\n')

  log('warning', error.type, {
    id: media.id,
    site: media.site,
    url: media.url,
    format: media.format,
    desc: error.description
  })

  if (callback) {
    agent
      .post(callback.url)
      .send({ id: callback.id })
      .send({ error })
      .retry(2)
      .end((err, res) => {})
  }
})

// declare job processors
Q.jobs[Q.SEND_JOB].process(4, require('./jobs/send'))

module.exports = app.use(router.routes())
