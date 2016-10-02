'use strict'

const config = require('./config.json')
const agent = require('superagent')

module.exports = function (level, message, info) {

  agent
  .post(config.log.url)
  .auth(config.log.auth.username, config.log.auth.password, { type: 'auto' })
  .send({
    level,
    short_message: message,
    from: 'downloader'
  })
  .send(info)
  .end((err, res) => {})
}
