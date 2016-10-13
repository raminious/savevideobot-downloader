'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const pug = require('pug')
const bytes = require('bytes')
const engine = require('../../lib/engine')
const config = require('../../config.json')

// pre-render view
const render = pug.compileFile(__dirname + '/view.pug')

// get download max size
const maxSize = bytes.parse(config.download.maxSize)

router.get('/download/:id/:format?/:type?', bodyParser(), function* () {

	const id = this.params.id
  const format = this.params.format || 'best'
  const type = this.params.type

  this.assert(/^[0-9a-fA-F]{24}$/.test(id), 400, 'Invalid media id')

  // get media object
  let media

  try {
    media = yield engine.getMedia(id, format)
  }
  catch (e) {
    this.assert(e == null, 400, e.message)
  }

  if (type == 'direct')
    return this.redirect(media.download)

  if (type == 'stream')
    return this.redirect(media.stream)

  if (media.size > maxSize) {
    media.stream = "javascript:alert('You are not allowed to download files larger than " + config.download.maxSize +
      ". \nUse direct download link instead.')"
  }

  // convert media size to human readable
  media.size = bytes(media.size)

  this.body = render({ media })
})

module.exports = require('koa')().use(router.routes())
