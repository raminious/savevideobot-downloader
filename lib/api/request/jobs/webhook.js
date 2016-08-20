'use strict'

const request = require('superagent');
const Promise = require('bluebird')

const url = require('./webhooks/url')
const telegram = require('./webhooks/telegram')

const hooks = { url, telegram }

// processor for callback
module.exports = function* (job) {

  const webhook = job.data.webhook
  const filepath = job.data.path
  const url = job.data.url
  const downloadUrl = job.data.downloadUrl
  const format = job.data.format
  const id = job.data.id
  const type = webhook.type

  try {
   const response = yield hooks[type](webhook, filepath, downloadUrl)
    // const response = {
    //   type: 'document',
    //   file_id: 'BQADBAADKAADBvYGB6z8dVQdFGNPAg',
    // }

    // assign primary fields
    response.media_id = id
    response.format = format
    response.url = url

    return yield request
      .post(webhook.url)
      .send(response)
  }
  catch(e) {
    throw e
  }

}
