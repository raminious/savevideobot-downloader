'use strict'

const moment = require('moment')
const path = require('path')
const mkdirp = require('mkdirp')
const engine = require('../../../../util/engine')
const config = require('../../../../config.json')
const _ = require('underscore')

/*
* list of abort message responsing by downloader
* for example if media size is larger than allowedSize, downloader will abort
* but downloder not throwing error, and error should find and throw manually
*/
const errors = {
  'is larger than': 'You are not allowed to download files larger than ' + config.download.maxSize
}

// processor for downloading media
module.exports = function* (job) {

  // create path for downloading media
  const destination = (() => {
    let now = moment()

    let fullpath = path.join(path.normalize(config.basepath),
      now.year().toString(), (now.month() + 1).toString(), now.date().toString(), now.hour().toString())

    mkdirp.sync(fullpath)

    let name = now.unix().toString().substr(-6) + '_' +
      job.data.filename.replace(/[&\/\\#,+()$~%'":*?<>{}\s+]/g, '')

    return path.join(fullpath, name)
  })()

  // download video
  try {
    const response = yield engine.download(job.data.url, job.data.format, destination)

    // check download is aborted or not
    const r = response.toLowerCase()
    const hasError = r.indexOf('aborting') > -1 || r.indexOf('error') > -1

    // find aborted message by aborts key
    if (hasError) {
      let text = _.find(errors, (text, e) => r.indexOf(e) > -1)
      throw { aborted: true, text }
    }
  }
  catch (e) {
    throw JSON.stringify(e)
  }

  return {
    url: 'http://' + config.localAddress[0] + '/get/' + job.data.id,
    path: destination
  }
}
