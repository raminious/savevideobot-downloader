'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const PassThrough = require('stream').PassThrough
const engine = require('../../util/engine')
const config = require('../../config.json')

const workers = ['native', 'spawn']

router.get('/stream/:id/:format?/:worker?', bodyParser(), function* () {

  const id = this.params.id
  const format = this.params.format || 'best'

  // get media object
  let media

  try {
    media = yield engine.getMedia(id, format)
  }
  catch (e) {
    this.assert(e == null, 400, e.message)
  }

  const worker = media.worker || this.params.worker || config.download.defaultWorker
  this.assert(workers.indexOf(worker) != -1, 400, 'Invalid stream worker')

  //set headers to force download by browser
  this.set('Content-Disposition', 'attachment')
  this.set('Content-length', media.size)
  this.attachment(media.filename)

  const stream = yield engine.download(media, worker, this.request)
  this.body = stream.pipe(PassThrough())
})

module.exports = require('koa')().use(router.routes())
