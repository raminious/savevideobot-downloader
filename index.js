const responseTime = require('koa-response-time')
const compress = require('koa-compress')
const auth = require('koa-basic-auth')
const mount = require('koa-mount')
const koa = require('koa')
const log = require('./log')
const config = require('./config.json')
const Q = require('./lib/jobs')

module.exports = function() {

  const app = new koa()

  // trust proxy
  app.proxy = true

  // x-response-time
  app.use(responseTime())

  // compression
  app.use(compress())

  // define logger
  app.use(async function (ctx, next) {
    ctx.log = log
    await next()
  })

  // handle application errors
  app.use(async function (ctx, next) {
    try {
      await next()
    } catch(e) {

      if (process.env.NODE_ENV != 'production')
        console.log(e, e.stack)

      // check application fatal errors
      if (e instanceof TypeError || e instanceof ReferenceError)
        return ctx.log('fatal', 'downloader_bug', { description: e.message, stack: e.stack })

      ctx.status = e.status || 500
      ctx.body = e.message || ''
    }
  })

  //routes
  app.use(mount(require('./api/stats')))
  app.use(mount(require('./api/explore')))
  app.use(mount(require('./api/send')))
  app.use(mount(require('./api/download')))
  app.use(mount(require('./api/thumbnail')))
  app.use(mount(require('./api/stream')))

  // jobs
  Q.jobs[Q.SEND_JOB].process(2, require('./api/send/jobs/send'))
  Q.jobs[Q.DUMP_JOB].process(4, require('./api/explore/jobs/dump'))

  return app
}
