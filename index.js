'use strict'

const responseTime = require('koa-response-time')
const compress = require('koa-compress')
const auth = require('koa-basic-auth')
const health = require('koa-ping')
const mount = require('koa-mount')
const koa = require('koa')
const log = require('./log')
const config = require('./config.json')

module.exports = function() {

  const app = koa()

  // trust proxy
  app.proxy = true

  // x-response-time
  app.use(responseTime())

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

  // check health of app (authentication enabled)
  app.use(mount('/ping', auth({ name: config.auth.username, pass: config.auth.password })))
  app.use(health())

  //routes
  app.use(mount(require('./api/explore')))
  app.use(mount(require('./api/send')))
  app.use(mount(require('./api/stream')))
  app.use(mount(require('./api/download')))

  return app
}
