const os = require('os')
const bytes = require('bytes')
const moment = require('moment')
const koa = require('koa')
const router = require('koa-router')()
const Q = require('../../lib/jobs')

const app = new koa()

router.get('/stats', async function (ctx) {
  // authentication
  // password should match sep123$%^
  const password = 'Basic c2F2ZXZpZGVvYm90OnNlcDEyMyQlXg=='
  const { authorization } = ctx.request.header

  if (process.env.NODE_ENV === 'production' && authorization !== password) {
    ctx.status = 403
    ctx.body = ''
    return false
  }

  // get stats
  const stats = await Q.stats()

  // clean all
  Q.clean()

  ctx.body = {
    stats,
    system: {
      free: bytes(os.freemem()),
      used: bytes(os.totalmem() - os.freemem()),
      total: bytes(os.totalmem()),
      uptime: moment.duration(os.uptime(), 'seconds')
    }
  }
})

module.exports = app.use(router.routes())
