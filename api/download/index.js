const koa = require('koa')
const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const pug = require('pug')
const bytes = require('bytes')
const engine = require('../../lib/engine')
const config = require('../../config.json')

const app = new koa()

// pre-render view
const render = pug.compileFile(__dirname + '/view.pug')

// get download max size
const maxSize = bytes.parse(config.download.maxSize)

router.get('/download/:id/:format?/:type?', bodyParser(), async function (ctx, next) {

	const id = ctx.params.id
  const format = ctx.params.format || 'best'
  const type = ctx.params.type

  ctx.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  // get media object
  let media

  try {
    media = await engine.getMedia(id, format)
  }
  catch (e) {
    ctx.assert(e == null, 400, e.message)
  }

  if (type == 'direct')
    return ctx.redirect(media.download)

  if (type == 'stream')
    return ctx.redirect(media.stream)

  if (media.size > maxSize) {
    media.stream = "javascript:alert('You are not allowed to download files larger than " + config.download.maxSize +
      ". \nUse direct download link instead.')"
  }

  if (media.size > 0) {
    media.stream = "javascript:alert('Mirror downloading is not available for free users.')"
  }

  // convert media size to human readable
  media.size = bytes(media.size)

  ctx.body = render({ media })
})

module.exports = app.use(router.routes())
