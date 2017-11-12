const koa = require('koa')
const router = require('koa-router')()
const engine = require('../../lib/engine')
const request = require('request')
const redis = require('../../lib/redis')
const cache = require('../../lib/cache')
const uri = require('url')
const path = require('path')
const PassThrough = require('stream').PassThrough

const app = new koa()

app.use(require('koa-cash')({
  get: async (key) => {
    const page = JSON.parse(await cache.get(key))

    if (page) {
      return {
        ...page,
        body: new Buffer(page.body, 'hex')
      }
    }

    return null
  },
  set: (key, value) => {
    try {
      cache.set(
        key,
        JSON.stringify({
          ...value,
          body: value.body.toString('hex')
        }),
        15 * 60
      )
    } catch(e) { /* nothing */ }
  }
}))

router.get('/thumbnail/:id', async function (ctx, next) {
  const id = ctx.params.id
  ctx.assert(id != null, 400, 'Id is required')
  ctx.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  if ( await ctx.cashed()) {
    return
  }

  // get media object
  const thumbnail = await engine.getMediaThumbnail(id)

  const filename = path.basename(uri.parse(thumbnail).pathname)
  const extension = path.extname(filename) || '.jpg'

  ctx.set('Content-Type', 'image/' + extension.replace('.', ''))
  ctx.set('Content-Disposition', 'inline; filename="' + filename + '"')

  ctx.body = request({ uri: thumbnail }).pipe(PassThrough())
})

module.exports = app.use(router.routes())
