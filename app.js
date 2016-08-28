const responseTime = require('koa-response-time')
const ratelimit = require('koa-ratelimit')
const compress = require('koa-compress')
const mount = require('koa-mount')
const koa = require('koa')
const request = require('superagent')
const config = require('./config.json')

module.exports = function() {

  const app = koa()

  // trust proxy
  app.proxy = true

  // x-response-time
  app.use(responseTime())

  // add request id to every request
  app.use(require('koa-request-id')())

  // compression
  app.use(compress())

  // define logger
  app.use(function* (next) {

    const log = config.log
    this.log = (level, message, e) => {
      request
      .post(log.url)
      .auth(log.auth.username, log.auth.password, { type: 'auto' })
      .send({
        id: this.id,
        level,
        short_message: message,
        from: 'downloader'
      })
      .send(e)
      .end((err, res) => {})
    }

    yield* next
  })

  //routes
  app.use(mount('/download',require('./lib/api/info')))
  app.use(mount('/download',require('./lib/api/request')))

  return app
}
