'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const Promise = require('bluebird')
const jobs = require('kue-jobs')

const DOWNLOAD_JOB = 'download_job'
const WEBHOOK_JOB = 'webhook_job'

const webhooks = ['url', 'telegram']

router.post('/request', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const id = this.request.body.id
  const url = this.request.body.url
  const format = this.request.body.format || 18
  const filename = this.request.body.filename
  const webhook = this.request.body.webhook

  this.assert(webhook != null, 400, 'webhook is not defined')
  this.assert(webhook.hasOwnProperty('type'), 400, 'webhook type is not defined')
  this.assert(webhooks.indexOf(webhook.type) != -1, 400, 'webhook type is invalid')

  if (webhook.type == 'telegram')
    this.assert(webhook.bot_token != null && webhook.user_id != null, 400, 'Invalid Telegram properties')

  // create downloader job
  jobs.create(DOWNLOAD_JOB, {
    title: 'Download video ' + url,
    id,
    url,
    format,
    filename
  }, {
    attempts: 1,
    onFailed: (err) => {
      console.log('ooops', err)
    },
    /*
    * active webhook after file download
    */
    onComplete: (data) => {

      jobs.create(WEBHOOK_JOB, {
        title: 'callbacking to ' + webhook.url,
        id,
        format,
        url,
        downloadUrl: data.url,
        webhook,
        path: data.path,
      }, {
        ttl: 20000,
        onFailed: (err) => {
          console.log('call back oops', err)
        }
      })
    }
  })

  this.body = 'ok'
})

// declare job processors
jobs.process(DOWNLOAD_JOB, 5, require('./jobs/download'))
jobs.process(WEBHOOK_JOB, 15, require('./jobs/webhook'))

module.exports = require('koa')().use(router.routes())
