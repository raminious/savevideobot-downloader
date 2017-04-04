const koa = require('koa')
const router = require('koa-router')()
const engine = require('../../lib/engine')
const request = require('request')
const ratelimit = require('koa-ratelimit')
const redis = require('../../lib/redis')
const uri = require('url')
const path = require('path')
const PassThrough = require('stream').PassThrough

const app = new koa()

// apply rate limit
app.use(ratelimit({
  db: redis,
  duration: 60000,
  max: 15,
  id: function (context) {
    return context.ip
  },
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  }
}))

router.get('/thumbnail/:id', async function (ctx) {

  const id = ctx.params.id
  ctx.assert(id != null, 400, 'Id is required')
  ctx.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  // get media object
  const thumbnail = await engine.getMediaThumbnail(id)

  const filename = path.basename(uri.parse(thumbnail).pathname)
  const extension = path.extname(filename) || '.jpg'

  ctx.set('Content-Type', 'image/' + extension.replace('.', ''))
  ctx.set('Content-Disposition', 'inline; filename="' + filename + '"')

  ctx.body = request({ uri: thumbnail }).pipe(PassThrough())
})

module.exports = app.use(router.routes())
