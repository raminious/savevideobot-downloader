'use strict'

const Promise = require('bluebird')
const bytes = require('bytes')
const agent = require('superagent')
const _ = require('underscore')
const request = Promise.promisifyAll(require('request'))
const fs = require('fs')
const path = require('path')
const engine = require('../../../../../lib/engine')
const config = require('../../../../../config.json')

// possible formats
const formats = {
  'mp3': 'Audio',
  'mp4': 'Video',
  'ogg': 'Voice',
}

module.exports = function* (job, media, webhook) {

  // set bot url
  const botUrl = 'https://api.telegram.org/bot' + webhook.bot_token

  // set worker
  const worker = media.worker || config.download.defaultWorker

  // get telegram max size (for now is 50mb)
  const maxTelegramSize = bytes.parse('50mb')

  /*
  * https://core.telegram.org/bots/api#senddocument
  * Bots can currently send audio files of up to 50 MB in size,
  * this limit may be changed in the future.
  */

  // log media size
  job.log('start sending. filesize: %s', bytes(media.size))

  if (media.size > maxTelegramSize) {

    // create download link
    const download = media.stream.replace('/stream/', '/download/')

    const text = [
      'Telegram bots can currently send media files of up to <b>50 MB</b> in size.\n',
      'This limit may be changed in the future.\n\n',
      'You can download your requested media from this link:\n',
      '<a href="' + download + '">[ ' + media.filename +' ]</a>' + '\n\n',
      '<code>Filename : </code>' + media.filename + '\n',
      '<code>Size     : </code>'  + bytes(media.size) + '\n',
      '<code>Download : </code>' + '<a href="' + download + '">' + media.filename + '</a>',
      '\n\n<b>Download links are available for 2 hours</b>'
    ].join('')

    yield sendMessage(botUrl, webhook.user_id, text, 'HTML')
    return {}
  }

  // default is stream sending
  let source = 'http://127.0.0.1:19001/stream/' + media.id + '/' + media.format + '/' + worker

  // download file on disk and then send to client
  if (media.preferStream == false) {
    source = yield engine.save(media, worker)
    job.progress(50, 100)
  }

  // send file to client
  const response = yield send(job, botUrl, media, webhook.user_id, source)

  // remove file after sending
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
function* send(job, botUrl, media, chat_id, source) {

  let response

  response = yield _sendDirect(botUrl, media, chat_id)

  // fallback with mirror send on telegram direct sucks
  if (response.body && response.body.ok == false && response.body.error_code == 400)
    response = yield _sendMirror(job, botUrl, media, chat_id, source)

  // if telegram server timeout
  if (response.body == null || response.body.result == null)
    throw new Error('Telegram media server timeout.')

  const type = _.find(['document', 'video', 'audio', 'voice'], (type) => {
    return response.body.result[type] != null
  })

  if (type == null)
    return {}

  return {
    type,
    file_id: response.body.result[type].file_id || null
  }
}

/**
 * Stream or post media file to telegram server
 * more stable
 */
function* _sendMirror (job, botUrl, media, chat_id, source) {

  let sendType

  if (media.preferStream) {

    sendType = yield getSendType(media.extension)
    source = {
      value: request({ url: source }).on('end', () => {
        job.log('media request stream is done')
        job.progress(50, 100)
        _action(botUrl, chat_id, sendType)
      }),
      options: {
        filename: media.filename,
        knownSize: media.size
      }
    }
  }
  else {
    sendType = yield getSendType(path.extname(source))
    source = fs.createReadStream(source)
    _action(botUrl, chat_id, sendType)
  }

  // form data to send
  const formData = {
    chat_id: chat_id,
    caption: media.title.substr(0, 200),
    [sendType.toLowerCase()]: source
  }

  // set duration time if not document
  if (sendType != 'Document')
    formData.duration = media.duration || 0

  const response = yield request
    .postAsync({
      url: botUrl + '/send' + sendType,
      json: true,
      formData
    })

  return response
}

/**
 * Telegram api now supports direct media url instead posting
 * but sometime sucks
 */
function* _sendDirect (botUrl, media, chat_id) {

  const sendType = yield getSendType(media.extension)

  _action(botUrl, chat_id, sendType)

  const response = yield request
    .postAsync({
      url: botUrl + '/send' + sendType,
      json: true,
      formData: {
        chat_id: chat_id,
        caption: media.title.substr(0, 200),
        [sendType.toLowerCase()]: media.download
      }
    })

  return response
}

/**
* Send Action
*/
function _action(botUrl, chat_id, sendType) {
  sendType = sendType == 'Voice'? 'Audio': sendType
  const action = 'upload_' + sendType.toLowerCase()

  return agent
    .get(botUrl + '/sendChatAction')
    .query({ chat_id, action })
    .end((err, res) => {})
}

/**
* Send message to user on telegram
*/
function* sendMessage (botUrl, chat_id, text, parse_mode, disable_web_page_preview) {

  parse_mode = parse_mode || ''
  disable_web_page_preview = disable_web_page_preview || true

  return yield agent
    .get(botUrl + '/sendMessage')
    .query({chat_id: chat_id})
    .query({text: text})
    .query({parse_mode: parse_mode})
    .query({disable_web_page_preview: disable_web_page_preview})
}

