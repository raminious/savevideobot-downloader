'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const jobs = require('../../util/jobs')
const Media = require('../../util/resources/media')

const agent = require('superagent')
require('superagent-retry')(agent)

// constants
const DUMP_JOB = 'dump_job'

router.post('/explore', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const id = this.request.body.id
  this.assert(id != null, 400, 'Id is required')

  const url = this.request.body.url
  this.assert(url != null, 400, 'Url is required')

  // callback is optional
  const callback = this.request.body.callback

  // create new job for dumping url
  jobs.create(DUMP_JOB, {
    title: 'dumping ' + url,
    id,
    url,
    callback
  }, {
    attempts: 2,
    ttl: 1 * 60 * 1000, //1 minutes
    priority: 'high',
    onComplete: (data) => {
      const id = data.id
      const callback = data.callback
      const error = data.error
      const media = data.media

      // log error
      if (error) {
        this.log('warning', error.type || error.message, {
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
      Media.update(id, attributes).then(res => {}, e => e)

      if (!callback)
        return false

      // callback
      return agent
        .post(callback.url)
        .send({ id: callback.id })
        .send({ media: media? Object.assign(media, {id}): undefined })
        .send({ error })
        .end((err, res) => {})
    }
  })

  this.body = {}
})

// declare dump job processor
jobs.process(DUMP_JOB, 3, require('./jobs/dump'))

module.exports = require('koa')().use(router.routes())
