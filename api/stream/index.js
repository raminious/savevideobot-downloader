const koa = require('koa')
const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const ratelimit = require('koa-ratelimit')
const redis = require('../../lib/redis')
const PassThrough = require('stream').PassThrough
const bytes = require('bytes')
const engine = require('../../lib/engine')
const config = require('../../config.json')

const workers = ['native', 'spawn']

// get download max size
const maxSize = bytes.parse(config.download.maxSize)

const app = new koa()

// apply rate limit
app.use(ratelimit({
  db: redis,
  duration: 60000,
  max: 5,
  id: function (ctx) {
    // do not ratelimit localhost requests
    return ctx.ip == '127.0.0.1' ? ctx.request.url : ctx.ip
  },
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  }
}))

router.get('/stream/:id/:format?/:worker?', bodyParser(), async function (ctx) {
  const { id } = ctx.params
  const format = ctx.params.format || 'best'

  ctx.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  // get media object
  let media

  try {
    media = await engine.getMedia(id, format)
  }
  catch (e) {
    ctx.assert(e == null, 400, e.message)
  }

  // media expected worker has more priority on user request or default worker
  const worker = media.worker || ctx.params.worker || config.download.defaultWorker
  ctx.assert(workers.indexOf(worker) != -1, 400, 'Invalid stream worker')

  // check max size
  ctx.assert(media.size < maxSize, 413,
    'You are not allowed to download files larger than ' + config.download.maxSize)

  //set headers to force download by browser
  ctx.set('Content-Disposition', 'attachment')
  ctx.set('Content-length', media.size)

  if (~~media.duration > 0) {
    ctx.set('X-Content-Duration', media.duration)
  }

  ctx.attachment(media.filename)

  /*
  * supporting for pause/resume downloading
  */
  if (ctx.request.headers.range && worker == 'native') {
    let rangeParts = ctx.request.headers.range.replace(/bytes=/, '').split('-') // 0:start 1:end
    let startBytes = parseInt(rangeParts[0], 10)
    let endBytes = rangeParts[1]? parseInt(rangeParts[1], 10): media.size - 1

    ctx.set('Content-Range', 'bytes ' + startBytes + '-' + endBytes + '/' + media.size)
    ctx.set('Accept-Ranges', 'bytes')
    ctx.set('Content-Length', (endBytes - startBytes) + 1)
    ctx.set('Accept-Ranges', 'bytes')

    ctx.status = 206
  }

  const stream = await engine.stream(media, worker, ctx.request)
  ctx.body = stream.pipe(PassThrough())
})

module.exports = app.use(router.routes())
