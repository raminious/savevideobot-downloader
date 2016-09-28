const responseTime = require('koa-response-time')
const ratelimit = require('koa-ratelimit')
const compress = require('koa-compress')
const mount = require('koa-mount')
const koa = require('koa')
const log = require('./log')

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
    this.log = log
    yield* next
  })

  // handle application errors
  app.use(function* (next) {
    try {
      yield next
    } catch(e) {

      if (process.env.NODE_ENV != 'production')
        console.log(e, e.stack)

      // check application fatal errors
      if (e instanceof TypeError || e instanceof ReferenceError)
        return this.log('fatal', 'downloader_bug', { description: e.message, stack: e.stack })

      this.status = e.status || 500
      this.body = e.message || ''
    }
  })

  //routes
  app.use(mount(require('./lib/explore')))
  app.use(mount(require('./lib/send')))
  app.use(mount(require('./lib/stream')))
  app.use(mount(require('./lib/download')))

  return app
}
