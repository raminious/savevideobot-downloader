'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const jobs = require('kue-jobs')
const bytes = require('bytes')
const co = require('co')
const engine = require('../../util/engine')
const config = require('../../config.json')

const agent = require('superagent')
require('superagent-retry')(agent)

// constants
const SEND_JOB = 'send_job'
const maxSize = bytes.parse(config.download.maxSize)

router.post('/send', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const id = this.request.body.id
  const format = this.request.body.format || 'best'
  const webhook = this.request.body.webhook
  const callback = this.request.body.callback

  // get media
  let media

  try {
    media = yield engine.getMedia(id, format)
  }
  catch(e) {

    this.log('fatal', 'download_fail', {
      type: e.type,
      target: 'downloader',
      task: 'media/send',
      description: e.message
    })

    this.assert(e == null, 406, e.message)
  }

  // log large file requests
  if (media.size > maxSize) {
    this.log('info', 'max_size', {
      target: 'downloader',
      task: 'media/download',
      site: media.site,
      url: media.url
    })
  }

  jobs.create(SEND_JOB, {
    title: 'download and send ' + media.url,
    media,
    webhook,
    callback
  }, {
    attempts: 1,
    ttl: 10 * 60 * 1000, //10 minutes
    onComplete: (data) => {

      const response = data.response
      const error = data.error
      const callback = data.callback
      const webhook = data.webhook

      // callback
      agent
        .post(callback.url)
        .send({ id: callback.id })
        .send({ response })
        .send({ error })
        .retry(2)
        .end((err, res) => {})

      // log error on log server
      if (error) {
        this.log('fatal', 'ytdl_sucks', {
          target: 'downloader',
          task: 'media/download',
          description: error.description,
          stack: error.stack
        })
      }
    },
    onFailed: (e) => { throw e }
  })

  this.body = {}
})


// declare job processors
jobs.process(SEND_JOB, 3, require('./jobs/send'))

module.exports = require('koa')().use(router.routes())
