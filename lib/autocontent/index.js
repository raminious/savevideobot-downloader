const agent = require('superagent')
const Q = require('../jobs')

module.exports = function (id, media) {
  if (media.site !== 'instagram') {
    return false
  }

  const callback = {}
  const webhook = {
    type: 'telegram',
    bot_token: '118259322:AAGI0vKf2DGRtwUhrNCM4nRPkWkGJ9kWdDU', //@savevideobot
    user_id: '@instavids'
  }

  // set media title
  media.title = media.url + ' (' + media.title.substr(0, 30) + ')'

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
