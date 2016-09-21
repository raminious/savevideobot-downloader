'use strict'

const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')
const Promise = require('bluebird')
const engine = require('../../util/engine')
const _ = require('underscore')

router.post('/explore', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json')

  const url = this.request.body.url
  this.assert(url != null, 400, 'Url is required')

  try {

    let info = yield engine.dump(url)

    this.body = {
      site: info.extractor,
      download: info.url,
      thumbnail: info.thumbnail,
      duration: info.duration,
      size: info.filesize,
      title: info.title,
      extension: info.ext,
      dimension: (typeof info.width !== 'undefined' && info.width !== null) ? info.width + 'x' + info.height : '',
      worker: info.worker,

      formats: (info.extractor !== 'youtube') ? [] :
      _.chain(info.formats)
      .filter(item => {
        const type = item.width == null ? 'Audio' : 'Video'

        if (
          item.format.indexOf('DASH') != -1 ||
          item.acodec == 'none' ||
          (type == 'Audio' && item.abr < 128)
        )
          return false

        return true
      })
      .map(item => {
        return {
          id: ~~item.format_id,
          abr: item.abr,
          format: item.format,
          size: item.filesize,
          ext: item.ext,
          dimension: (item.width != null) ? item.width + 'x' + item.height : '',
          container: item.container,
          note: item.format_note,
          download: item.url
        }
      })
      .value()
    }
  }
  catch (e) {

    let d = e.description

    //keep full title reason of error to save in logger
    e.reason = d

    // extract error message
    const match = d.match(/said:.*\./) || d.match(/ERROR:[^;|^:|^.]*/)

    e.description = (match != null)? 
      match[0].replace(/ERROR:|said:/, '').trim(): 
      'Can not download your media file'

    this.status = 406 // not acceptable
    this.body = e
  }

})

module.exports = require('koa')().use(router.routes())
