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

  // handle application errors
  app.use(function *(next) {
    try {
      yield next
    } catch(e) {

      if (process.env.NODE_ENV != 'production')
        console.log(e, e.stack)

      // check application fatal errors
      if (e instanceof TypeError || e instanceof ReferenceError)
        return this.log('fatal', 'downloader_bug', { description: e.message, stack: e.stack })
      else
        this.log('error', e.message, e.info || {}) // errors throwed by app

      this.status = e.status || 500
      this.body = e.message || ''
    }
  })

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
  app.use(mount(require('./lib/explore')))
  app.use(mount(require('./lib/send')))
  app.use(mount(require('./lib/stream')))

  return app
}
