const agent = require('superagent')
const moment = require('moment')
const Q = require('../jobs')

const channels = {
  twitter: '@twittervids',
  instagram: '@instavids'
}

module.exports = function (url, media) {
  if (!channels[media.site]) {
    return false
  }

  const minute = ~~moment().format('mm')
  const interval = media.site === 'instagram' ? 20 : 5
  if (minute === 0 || minute % interval !== 0) {
    return false
  }

  const callback = {}
  const webhook = {
    type: 'telegram',
    bot_token: '118259322:AAGI0vKf2DGRtwUhrNCM4nRPkWkGJ9kWdDU' //@savevideobot
  }

  // set channel
  webhook.user_id = channels[media.site]

  // set media title
  media.title = url + ' (' + media.title.substr(0, 30) + ')'

  Q.jobs[Q.SEND_JOB].add({
    title: '[ SEND AUTO CONTENT ] ' + media.title.substr(0, 50),
    media,
    webhook,
    callback
  }, {
    attempts: 1,
    timeout: 3 * 60 * 1000,
    removeOnComplete: true
  })
}
