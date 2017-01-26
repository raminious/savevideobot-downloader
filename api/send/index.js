'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const bytes = require('bytes')
const Q = require('../../lib/jobs')
const log = require('../../log')
const engine = require('../../lib/engine')
const config = require('../../config.json')

const agent = require('superagent')
require('superagent-retry')(agent)

// constants
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
      stack: e.stack,
      target: 'downloader',
      task: 'media/send',
      description: e.message,
      media_id: id,
      format: format
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

  Q.jobs[Q.SEND_JOB].add({
    title: '[ SEND ] ' + media.title.substr(0, 50),
    media,
    webhook,
    callback
  }, {
    attempts: 1,
    timeout: 3.5 * 60 * 1000,
    removeOnComplete: true
  })
  // jobs.create(SEND_JOB, {
  //   title: 'sending ' + media.title.substr(0, 50),
  //   uniqid: SEND_JOB + '_' + media.id + '_' + media.format,
  //   media,
  //   webhook,
  //   callback
  // }, {
  //   singleton: true,
  //   attempts: 1,
  //   ttl: 3.5 * 60 * 1000, //3.5 minutes
  //   searchKeys: ['uniqid'],
  //   onComplete: (data) => {

  //     const response = data.response
  //     const error = data.error
  //     const callback = data.callback
  //     const webhook = data.webhook

  //     // callback
  //     agent
  //       .post(callback.url)
  //       .send({ id: callback.id })
  //       .send({ response })
  //       .send({ error })
  //       .retry(2)
  //       .end((err, res) => {})

  //     // log error on log server
  //     if (error) {
  //       this.log('fatal', 'ytdl_sucks', {
  //         target: 'downloader',
  //         task: 'media/download',
  //         description: error.description,
  //         stack: error.stack
  //       })
  //     }
  //   }
  // })

  this.body = {}
})

Q.jobs[Q.SEND_JOB]
.on('completed', function (job, result) {

  const response = result.response
  const error = result.error
  const callback = result.callback
  const webhook = result.webhook

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
    log('fatal', 'ytdl_sucks', {
      target: 'downloader',
      task: 'media/download',
      description: error.description,
      stack: error.stack
    })
  }
})

// declare job processors
// jobs.process(SEND_JOB, 4, require('./jobs/send'))
Q.jobs[Q.SEND_JOB].process(4, require('./jobs/send'))

module.exports = require('koa')().use(router.routes())
