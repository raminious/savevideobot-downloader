'use strict'

const Promise = require('bluebird')
const agent = require('superagent')
const _ = require('underscore')
const request = Promise.promisifyAll(require('request'))
const fs = require('fs')
const path = require('path')

// set telegram bot base url
let botUrl = 'https://api.telegram.org/bot'

module.exports = function* (webhook, file, downloadUrl) {

  // set bot url
  botUrl += webhook.bot_token

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

  return yield sendFile(webhook.user_id, file)
}

/**
* Send message to user on telegram
*/
function* sendMessage (chat_id, text, parse_mode, disable_web_page_preview) {

  parse_mode = parse_mode || ''
  disable_web_page_preview = disable_web_page_preview || true

  try {
    return yield agent
      .get(botUrl + '/sendMessage')
      .query({chat_id: chat_id})
      .query({text: text})
      .query({parse_mode: parse_mode})
      .query({disable_web_page_preview: disable_web_page_preview})
  }
  catch(e) {
    console.log(e)
  }
}

/*
* Send file to user
*/
function* sendFile (chat_id, file) {

  // const types = {
  //   'video': _sendVideo,
  //   'audio': _sendAudio,
  //   'voice': _sendVideo,
  //   'document': _sendDocument,
  // }

  // const formats = {
  //   '.mp3': _sendAudio,
  //   '.mp4': _sendVideo,
  //   '.ogg': _sendVoice,
  // }

  const formats = {
    '.mp3': 'Audio',
    '.mp4': 'Video',
    '.ogg': 'Voice',
  }

  if (file.resend && file.type != null)
    return yield types[file.type](chat_id, file, true)

  // find file extension
  const file_ext = path.extname(file).toLowerCase()
  const method = formats[file_ext] != null? formats[file_ext]: 'Document'

  return yield _send(chat_id, file, method)
}


/**
* Send Document
*/
function* _send(chat_id, file, method, resend) {

  resend = resend || false

  //read file
  file = resend? file: fs.createReadStream(file)

  try {

    const response = yield request
      .postAsync({
        url: botUrl + '/send' + method,
        json: true,
        formData: {
          chat_id: chat_id,
          [method.toLowerCase()]: file
        }
      })

    if (response.body.ok) {

      // const type = _.find(['document', 'video', 'audio'], (type) => {
      //   return response.body.result[type] != null
      // })

      // type can be one of [document, video, audio, voice]
      const type = method.toLowerCase()

      if (type == null) return null

      return {
        type,
        file_id: response.body.result[type].file_id || null
      }
    }
  }
  catch(e) {
    console.log(e.response.body)
  }
}

/**
* Send Video (mp4 file)
*/
// function* _sendVideo (chat_id, file) {
//   console.log('send video')
// }

/**
* Send Audio (mp3 file)
*/
// function* _sendAudio (chat_id, file) {

// }

/**
* Send Voice (ogg file)
*/
// function* _sendVoice (chat_id, file) {

// }
