'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const ratelimit = require('koa-ratelimit')
const koa = require('koa')
const redis = require('../../lib/redis')
const PassThrough = require('stream').PassThrough
const bytes = require('bytes')
const engine = require('../../lib/engine')
const config = require('../../config.json')

const workers = ['native', 'spawn']

// get download max size
const maxSize = bytes.parse(config.download.maxSize)

const app = koa()

// apply rate limit
app.use(ratelimit({
  db: redis,
  duration: 60000,
  max: 5,
  id: function (context) {
    // do not ratelimit localhost requests
    return context.ip == '127.0.0.1'? context.request.url: context.ip
  },
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  }
}))

router.get('/stream/:id/:format?/:worker?', bodyParser(), function* () {

  const id = this.params.id
  const format = this.params.format || 'best'

  this.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  // get media object
  let media

  try {
    media = yield engine.getMedia(id, format)
  }
  catch (e) {
    this.assert(e == null, 400, e.message)
  }

  // media expected worker has more priority on user request or default worker
  const worker = media.worker || this.params.worker || config.download.defaultWorker
  this.assert(workers.indexOf(worker) != -1, 400, 'Invalid stream worker')

  // check max size
  this.assert(media.size < maxSize, 413,
    'You are not allowed to download files larger than ' + config.download.maxSize)

  //set headers to force download by browser
  this.set('Content-Disposition', 'attachment')
  this.set('Content-length', media.size)

  if (~~media.duration > 0)
    this.set('X-Content-Duration', media.duration)

  this.attachment(media.filename)

  /*
  * supporting for pause/resume downloading
  */
  if (this.request.headers.range && worker == 'native') {
    let rangeParts = this.request.headers.range.replace(/bytes=/, '').split('-') // 0:start 1:end
    let startBytes = parseInt(rangeParts[0], 10)
    let endBytes = rangeParts[1]? parseInt(rangeParts[1], 10): media.size - 1

    this.set('Content-Range', 'bytes ' + startBytes + '-' + endBytes + '/' + media.size)
    this.set('Accept-Ranges', 'bytes')
    this.set('Content-Length', (endBytes - startBytes) + 1)
    this.set('Accept-Ranges', 'bytes')

    this.status = 206
  }

  const stream = yield engine.stream(media, worker, this.request)
  this.body = stream.pipe(PassThrough())
})

module.exports = app.use(router.routes())
