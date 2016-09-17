'use strict'

const request = require('superagent')
const engine = require('../../../util/engine')
const url = require('./webhooks/url')
const telegram = require('./webhooks/telegram')
const config = require('../../../config.json')

const hooks = { url, telegram }

// processor for downloading media
module.exports = function* (job) {

  const worker = config.download.defaultWorker
  const webhook = job.data.webhook
  const media = job.data.media
  const type = webhook.type

  try {
    const response = yield hooks[type](media, webhook)

    // assign primary fields
    response.status = 1
    response.media_id = media.id
    response.format = media.format
    response.url = media.url

    return yield request
      .post(webhook.url)
      .send(response)
  }
  catch(e) {
    throw new Error(e.response? e.response.error.text: e)
  }
}
