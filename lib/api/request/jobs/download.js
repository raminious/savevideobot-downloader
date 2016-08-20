'use strict'

const moment = require('moment')
const path = require('path')
const mkdirp = require('mkdirp')
const engine = require('../../../../util/engine')
const config = require('../../../../config.json')

// processor for downloading videos
module.exports = function* (job) {

  // create path for downloading video
  const destination = (() => {
    let now = moment()

    let fullpath = path.join(path.normalize(config.basepath),
      now.year().toString(), (now.month() + 1).toString(), now.date().toString(), now.hour().toString())

    mkdirp.sync(fullpath)

    let name = now.unix().toString().substr(-4) + '_' + job.data.filename.replace(/\s+/g, '_')
    return path.join(fullpath, name)
  })()

  // download video
  try {
    yield engine.download(job.data.url, job.data.format, destination)
  }
  catch(e) {
    throw e
  }

  return {
    url: 'http://' + config.localAddress[0] + '/get/' + job.data.id,
    path: destination
  }
}
