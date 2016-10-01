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
    attempts: 1,
    priority: 'high',
    ttl: 50 * 1000, // 50 seconds
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
          url,
          description: error.description,
          source_address: error.source_address
        })
      }

      // update media
      const attributes = error? { status: 'failed'}: media
      Media.update(id, attributes)
      .then(res => {}, e => e)

      if (callback == null)
        return false

      // set media id if defined
      if (!error) {
        media.id = id
      }

      // callback
      return agent
        .post(callback.url)
        .send({ id: callback.id })
        .send({ media })
        .send({ error })
        .retry(2)
        .end((err, res) => {})
    },
    onFailed: e => {
      throw e
    }
  })

  this.body = {}
})

// declare dump job processor
jobs.process(DUMP_JOB, 3, require('./jobs/dump'))

module.exports = require('koa')().use(router.routes())
