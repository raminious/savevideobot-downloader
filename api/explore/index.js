'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const agent = require('superagent')
require('superagent-retry')(agent)
const log = require('../../log')
const Q = require('../../lib/jobs')
const Media = require('../../lib/resources/media')

router.post('/explore', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const id = this.request.body.id
  this.assert(id != null, 400, 'Id is required')

  const url = this.request.body.url
  this.assert(url != null, 400, 'Url is required')

  // callback is optional
  const callback = this.request.body.callback

  Q.jobs[Q.DUMP_JOB].add({
    title: '[ dump ] ' + url,
    id,
    url,
    callback
  }, {
    attempts: 2,
    timeout: 45 * 1000,
    removeOnComplete: true
  })

  this.body = {}
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

// declare dump job processor
Q.jobs[Q.DUMP_JOB].process(4, require('./jobs/dump'))

module.exports = require('koa')().use(router.routes())
