'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const request = require('superagent')
const jobs = require('kue-jobs')
const co = require('co')

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
    onFailed: onDownloadFailed.bind(null, webhook, this.log),
    onComplete: (data) => {

      jobs.create(WEBHOOK_JOB, {
        title: 'callbacking to ' + webhook.url,
        id,
        format,
        url,
        downloadUrl: data.url,
        path: data.path,
        webhook
      }, {
        attempts: 1,
        onFailed: onWebhookFailed.bind(null, webhook, this.log)
      })
    }
  })

  this.body = 'ok'
})

/*
* trigger when downloder job sucks or facing error
*/
const onDownloadFailed = function (webhook, log, e){

  e = JSON.parse(e)

  // call webhook when error occuring
  request
  .post(webhook.url)
  .send({
    user_id: webhook.user_id,
    status: -1,
    error: e.text || 'Can not download your requested url'
  })
  .end((err, res) => {})

  // send log
  if (e.aborted)
    return log('info', 'ytdl_abort', e)

  return log('fatal', 'ytdl_sucks', Object.assign({ task: 'download/request' }, e) )
}

/*
* trigger when webhook job facing an error
*/
const onWebhookFailed = function (webhook, log, e) {

  const data = {
    task: 'webhook/call',
    type: webhook.type,
    url: webhook.url,
    description: e
  }

  return log('error', 'webhook_' + webhook.type, data)
}

// declare job processors
jobs.process(DOWNLOAD_JOB, 5, require('./jobs/download'))
jobs.process(WEBHOOK_JOB, 15, require('./jobs/webhook'))

module.exports = require('koa')().use(router.routes())
