'use strict'

const Promise = require('bluebird')
const bytes = require('bytes')
const agent = require('superagent')
const _ = require('underscore')
const request = Promise.promisifyAll(require('request'))
const fs = require('fs')
const path = require('path')
const engine = require('../../../../../util/engine')
const config = require('../../../../../config.json')

// possible formats
const formats = {
  'mp3': 'Audio',
  'mp4': 'Video',
  'ogg': 'Voice',
}

/**
* @var worker type [native, stream]
*/
let worker

/**
* @var botUrl address of telegram api to send media
*/
let botUrl = ''


module.exports = function* (media, webhook) {

  // set bot url
  botUrl = 'https://api.telegram.org/bot' + webhook.bot_token

  // set worker
  worker = media.worker || config.download.defaultWorker

  // get telegram max size from config
  const maxTelegramSize = bytes.parse(config.webhooks.telegram.maxSize)

  /*
  * https://core.telegram.org/bots/api#senddocument
  * Bots can currently send audio files of up to 50 MB in size,
  * this limit may be changed in the future.
  */
  if (media.size > maxTelegramSize) {

    const text = [
      'Bots can currently send media files of up to <b>50 MB</b> in size\n',
      'This limit may be changed in the future.\n',
      'You can download video by direct link\n\n',
      media.stream,
      '\n\n<b>Download link is available for 3 hours</b>'

    ].join('')

    return yield sendMessage(webhook.user_id, text, 'HTML')
  }

  const source = media.preferStream?
    'http://127.0.0.1:19001/stream/' + media.id + '/' + media.format + '/' + worker:
    (yield engine.download(media))

  // send file to client
  const response = yield send(media, webhook.user_id, source)

  // remove files after sending
  if (media.preferStream == false) {
    fs.unlink(source)
  }

  return response
}

/**
* get method of telegram api depends on file format
*/
function* getSendType (extension) {
  extension = extension.toLowerCase().replace('.', '')
  return formats[extension] != null? formats[extension]: 'Document'
}

/**
* Send File
*/
function* send(media, chat_id, source) {

  let sendType

  if (media.preferStream) {
    sendType = yield getSendType(media.extension)
    source = {
      value: request(source),
      options: {
        filename: media.filename,
        knownSize: media.size
      }
    }
  }
  else {
    sendType = yield getSendType(path.extname(source))
    source = fs.createReadStream(source)
  }

  // send action
  yield _action(chat_id, sendType)

  const response = yield request
    .postAsync({
      url: botUrl + '/send' + sendType,
      json: true,
      formData: {
        chat_id: chat_id,
        [sendType.toLowerCase()]: source
      }
    })

  const type = _.find(['document', 'video', 'audio', 'voice'], (type) => {
    return response.body.result[type] != null
  })

  if (type == null)
    return null

  return {
    type,
    file_id: response.body.result[type].file_id || null
  }
}

/**
* Send Action
*/
function* _action(chat_id, sendType) {
  sendType = sendType == 'Voice'? 'Audio': sendType
  const action = 'upload_' + sendType.toLowerCase()

  return yield agent
    .get(botUrl + '/sendChatAction')
    .query({ chat_id, action })
}

/**
* Send message to user on telegram
*/
function* sendMessage (chat_id, text, parse_mode, disable_web_page_preview) {

  parse_mode = parse_mode || ''
  disable_web_page_preview = disable_web_page_preview || true

  return yield agent
    .get(botUrl + '/sendMessage')
    .query({chat_id: chat_id})
    .query({text: text})
    .query({parse_mode: parse_mode})
    .query({disable_web_page_preview: disable_web_page_preview})
}
