'use strict'

const router = require('koa-router')();
const bodyParser = require('koa-bodyparser');
const Promise = require('bluebird');
const engine = require('../../../util/engine');
const _ = require('underscore');

router.post('/info', bodyParser(), function* () {

  this.assert(this.is('json'), 415, 'content type should be json');

  const url = this.request.body.url;

  try {

    let info = yield engine.getMediaInfo(url);

    this.body = {
      site: info.extractor,
      download: info.url,
      thumbnail: info.thumbnail,
      duration: info.duration,
      title: info.title,
      extension: info.ext,
      age_limit: info.age_limit,
      dimension: (typeof info.width !== 'undefined' && info.width !== null) ? info.width + 'x' + info.height : '',
      filesize: info.filesize,

      formats: (info.extractor !== 'youtube') ? [] :
      _.chain(info.formats)
      .filter(item => {
        const type = item.width == null ? 'Audio' : 'Video';

        if (
          item.format.indexOf('DASH') > -1 ||
          (type == 'Audio' && item.abr < 128) ||
          item.filesize == null
        )
          return false

        return true;
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

    this.status = 406; // not acceptable
    this.body = e
  }

});

module.exports = require('koa')().use(router.routes());
