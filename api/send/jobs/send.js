const engine = require('../../../lib/engine')
const config = require('../../../config.json')

// webhooks
const hooks = {
  telegram: require('./webhooks/telegram')
}

// processor for downloading media
module.exports = async function (job) {
  const worker = config.download.defaultWorker
  const webhook = job.data.webhook
  const media = job.data.media
  const callback = job.data.callback

  try {
    const response = await hooks[webhook.type](job, media, webhook)

    // assign primary fields
    response.media_id = media.id
    response.format = media.format
    response.url = media.url

    return { webhook, callback, media, response }
  }
  catch(error) {
    error = {
      message: 'Can not download your requested url',
      description: error.response ? callback.url + ': ' + error.response.text : error.message,
      stack: error.stack
    }

    return { webhook, callback, media, error }
  }
}
