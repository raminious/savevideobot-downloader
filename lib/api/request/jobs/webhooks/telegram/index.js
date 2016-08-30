'use strict'

const Promise = require('bluebird')
const agent = require('superagent')
const _ = require('underscore')
const request = Promise.promisifyAll(require('request'))
const fs = require('fs')
const path = require('path')

// make bot url global
let botUrl = ''

module.exports = function* (webhook, file, downloadUrl) {

  // set bot url
  botUrl = 'https://api.telegram.org/bot' + webhook.bot_token

  // get file stats
  const stat = fs.statSync(file)
  const size = stat['size'] / 1000000.0

  /*
  * https://core.telegram.org/bots/api#senddocument
  * Bots can currently send audio files of up to 50 MB in size,
  * this limit may be changed in the future.
  */
  if (size > 49.9) {

    const text = [
      'Bots can currently send media files of up to <b>50 MB</b> in size\n',
      'This limit may be changed in the future.\n',
      'You can download video by direct link\n\n',
      downloadUrl,
      '\n\n<b>Download link is available for 3 hours</b>'

    ].join('')

    return yield sendMessage(webhook.user_id, text, 'HTML')
  }

  // send file to user
  const response = yield sendFile(webhook.user_id, file)

  // remove files lower than 50mb
  fs.unlink(file)

  return response
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

/*
* Send file to user
*/
function* sendFile (chat_id, file) {

  const formats = {
    '.mp3': 'Audio',
    '.mp4': 'Video',
    '.ogg': 'Voice',
  }

  // find file extension
  const file_ext = path.extname(file).toLowerCase()
  const method = formats[file_ext] != null? formats[file_ext]: 'Document'

  // send action
  yield _action(chat_id, method)

  // send file
  return yield _send(chat_id, file, method)
}


/**
* Send File
*/
function* _send(chat_id, file, method) {

  //read file
  file = fs.createReadStream(file)

  const response = yield request
    .postAsync({
      url: botUrl + '/send' + method,
      json: true,
      formData: {
        chat_id: chat_id,
        [method.toLowerCase()]: file
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
function* _action(chat_id, method) {
  method = method == 'Voice'? 'Audio': method
  const action = 'upload_' + method.toLowerCase()

  return yield agent
    .get(botUrl + '/sendChatAction')
    .query({ chat_id, action })
}


