'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const request = require('superagent')
const jobs = require('kue-jobs')
const bytes = require('bytes')
const co = require('co')
const engine = require('../../util/engine')
const config = require('../../config.json')

// constants
const SEND_JOB = 'send_job'
const webhooks = ['url', 'telegram']

router.post('/send', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const id = this.request.body.id
  const format = this.request.body.format || 'best'
  const webhook = this.request.body.webhook

  this.assert(webhook != null, 400, 'webhook is not defined')
  this.assert(webhook.hasOwnProperty('type'), 400, 'webhook type is not defined')
  this.assert(webhooks.indexOf(webhook.type) != -1, 400, 'webhook type is invalid')

  if (webhook.type == 'telegram') {
    this.assert(webhook.bot_token != null && webhook.user_id != null, 400, 'Invalid Telegram properties')
  }

  // get media
  let media

  try {
    media = yield engine.getMedia(id, format)
  }
  catch(e) {
    this.log('fatal', 'downloader_sucks', e)
    this.assert(e == null, 406, e.message)
  }

  // get download max size
  const maxSize = bytes.parse(config.download.maxSize)
  this.assert(media.size < maxSize, 413,
    'You are not allowed to download files larger than ' + config.download.maxSize)

  // check if method is "stream"
  jobs.create(SEND_JOB, {
    title: 'download and send ' + media.url,
    media,
    webhook
  }, {
    attempts: 1,
    onComplete: (data) => {

    },
    onFailed: (e) => {

      // call webhook when error occuring
      request
      .post(webhook.url)
      .send(webhook)
      .send({
        status: -1,
        error: e.text || 'Can not download your requested url'
      })
      .end((err, res) => {})

      this.log('fatal', 'ytdl_sucks', { task: 'download/request', description: e })
    },
  })

  this.body = {}
})


// declare job processors
jobs.process(SEND_JOB, 5, require('./jobs/send'))

module.exports = require('koa')().use(router.routes())
