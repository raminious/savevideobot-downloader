'use strict'

const bluebird = require('bluebird')
const shell = require('shelljs')
const spawn = require('child_process').spawn
const util = require('util')
const parseDomain = require('parse-domain')
const request = require('request')
const remote = require('remote-file-size')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const bytes = require('bytes')
const _ = require('underscore')
const Media = require('../resources/media')
const cache = require('../cache')
const check = require('../filters')('porn')
const config = require('../../config.json')

/*
* list of external extractors except ytdl
*/
const extractors = {
  twitter : require('../extractors/twitter'),
  google  : require('../extractors/google')
}

const WORKER_NATIVE = 'native'
const WORKER_SPAWN = 'spawn'

// shell exec options
const silent = true
const async = true

let userAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:10.0) Gecko/20150101 Firefox/47.0 (Chrome)'
let addresses = config.localAddress
let proxies = config.proxyAddress

/**
* get executable path of youtube-dl
*/
const getExecutable = function() {
  return '/usr/local/bin/youtube-dl'
}

/**
* turn over local address and get head of list (round robin)
*/
const changeLocalAddress = function() {
  addresses.push(addresses.shift())
  return addresses[0]
}

/**
* return log info
*/
const getLogInfo = function(action, source_address, args, description, message) {
  return {
    target: 'ytdl',
    action,
    description,
    message,
    args,
    source_address
  }
}

/**
* parse and create arguments understandable by youtube-dl
*/
const parseArguments = function(args) {

  return _.chain(args)
  .filter(arg => {
    // disable source-address on development mode
    if (process.env.NODE_ENV != 'production' && arg.match(/source-address/) != null) return false
    return true
  })
  .map(arg => {
    let parts = arg.split(':')
    parts[0] = '--' + parts[0];
    return parts[1] != null? parts[0] + '=' + parts[1]: parts[0]
  })
  .value()
  .join(' ')
}

/*
* get media info from api server
*/
const getMedia = function* (id, format) {

  format = format || 'best'

  let media

  try {
    let key = 'media_' + id

    // get media from cache
    media = yield cache.get(key)
    media = JSON.parse(media)

    if (media == null) {
      // get media from api server
      media = yield Media.status(id)

      // store media in cache for 15minutes
      cache.set(key, media, 15 * 60)
    }
  }
  catch(e) {
    throw {
      message: e.message || 'Internal server error. Downloader engine can not communicate with api server',
      description: e.response.text,
      task: 'engine/getmedia'
    }
  }

  let site = media.site
  let url = media.url
  let title = media.title
  let extension = media.extension
  let filename = title + '.' + extension
  let thumbnail = media.thumbnail
  let duration = ~~media.duration
  let download = media.download
  let stream = media.stream
  let worker = media.worker
  let size = media.size

  // if media has formats, check for requested format
  if (media.formats != null && media.formats.length > 0) {

    // search for required format data
    let fmt = _.findWhere(media.formats, { id: ~~format })

    if (fmt == null) {
      throw {
        type: 'format',
        message: 'Invalid media format'
      }
    }

    filename = media.title + '.' + fmt.ext
    extension = fmt.ext
    download = fmt.download
    stream = fmt.stream
    size = fmt.size
  }

  // get media size
  if (size == null)
    size = yield getMediaSize(download)

  // if file is less than 5k, throw error
  if (size < 5 * 1024) {
    throw {
      type: 'stream',
      message: 'File is too small or is stream (streams not supported)\n' + 'File size: ' + bytes(size)
    }
  }

  // add title parameter to download link
  download = download + '&title=' + encodeURIComponent(filename)

  return {
    preferStream: true,
    id,
    format,
    site,
    title,
    filename,
    duration,
    url,
    thumbnail,
    download,
    stream,
    extension,
    size,
    worker
  }
}

/*
* get remote media size by sending http headers
*/
const getMediaSize = function (url) {

  const options = {
    url,
    timeout: 15000,
    headers: { 'User-Agent': userAgent },
  }

  if (process.env.NODE_ENV == 'production')
    options.localAddress = addresses[0]

  // get media file size
  return new Promise((resolve, reject) => {
    remote(options, function(e, size) {
      if (e != null) return reject(e)
      return resolve(size)
    })
  })
}

/**
* create path destination for requested file
*/
const getFileDestination = function (filename) {

  const now = moment()

  let fullpath = path.join(path.normalize(config.basepath),
    now.year().toString(), (now.month() + 1).toString(), now.date().toString(),
    now.hour().toString())

  mkdirp.sync(fullpath, e => e)

  let name = now.unix().toString().substr(-6) + '_' +
    filename.replace(/[&\/\\#,+()$~%'":*?<>{}\s+]/g, '')

  return path.join(fullpath, name)
}

/**
* dump and return info of url with youtube-dl
*/
const dump = function (url) {

  const sourceAddress = changeLocalAddress()
  const domain = parseDomain(url).domain

  const extractor = extractors[domain]

  if (extractor != null)
    return extractor.dump(url)

  let args = parseArguments([
    'dump-json',
    'no-warnings',
    'socket-timeout:10',
    'source-address:' + sourceAddress
  ])

  return new Promise((resolve, reject) => {

    const command = util.format('%s %s "%s"', getExecutable(), args, url)
    const child = shell.exec(command, { silent, async}, (code, stdout, stderr) => {

      // error happened
      if (~~code > 0 || stderr.length > 0) {
        child.kill()

        // get error description
        let description = stderr

        // make error message human readable
        const match = description.match(/said:.*\./) || description.match(/ERROR:[^;|^:|^.]*/)

        description = (match != null)?
          match[0].replace(/ERROR:|said:/, '').trim():
          'Can not download your media file'

        return reject(getLogInfo('dump', sourceAddress, args, stderr, description))
      }

      stdout = JSON.parse(stdout)
      stdout.requested_formats = []

      // filters
      try {
        check.porn(stdout.extractor, stdout.title, url)
      }
      catch(e) {
        return reject(e)
      }

      return resolve(stdout)
    })
  })
}

/**
* Download or stream media depend on format type
*
*                                   | _saveSpawn
*                      Save    ---  |
*                    |              | _saveNative
* flow: Download --- |
*                    |              | _streamSpawn
*                      Stream  ---  |
*                                   | _streamNative

*/
const download = function (media, worker, req) {

  if (media == null)
    return false

  if (media.preferStream)
    return stream(media, worker, req)

  return save(media, worker)
}

/*
* save media on disk
*/
const save = function (media, worker) {

  // change local address (round robin)
  const sourceAddress = changeLocalAddress()

  worker = media.worker || worker || config.download.defaultWorker
  worker = (worker == WORKER_NATIVE)? _saveNative: _saveSpawn

  const destination = getFileDestination(media.filename)
  return worker(media, destination)
}

/*
* save media on disk with youtube-dl and spawn
*/
const _saveSpawn = function (media, destination) {

  const url = media.url
  const format = media.format

  let args = parseArguments([
    'quiet',
    'no-warnings',
    'format:' + format,
    'output:' + '"' + destination + '"',
    'source-address:' + addresses[0]
  ])

  return new Promise((resolve, reject) => {
    const command = util.format('%s %s "%s"', getExecutable(), args, url)
    shell.exec(command, { silent: true, async: true }, (code, stdout, stderr) => {

      if (~~code > 0)
        return reject(getLogInfo('download', sourceAddress, args, stderr))

      return resolve(destination)
    })
  })
}

const _saveNative = function(media, destination) {

  const options = {
    url: media.download,
    headers: { 'User-Agent': userAgent },
  }

  if (process.env.NODE_ENV == 'production')
    options.localAddress = addresses[0]

  return new Promise((resolve, reject) => {
    request(options)
    .on('error', e => {
      return reject(e)
    })
    .on('end', () => {
      return resolve(destination)
    })
    .pipe(fs.createWriteStream(destination))
  })
}

/*
* stream media
*/
const stream = function (media, worker, req) {

  // change local address (round robin)
  const sourceAddress = changeLocalAddress()

  worker = media.worker || worker || config.download.defaultWorker
  worker = (worker == WORKER_NATIVE)? _streamNative: _streamSpawn

  return worker(media, req)
}

/*
* stream media on https protocol via youtube-dl and process spawn
*/
const _streamSpawn = function (media, req) {

  const url = media.url
  const format = media.format

  let args = [
    '--quiet',
    '--no-warnings',
    '--format', format,
    '--output', '-'
  ]

  // enable source address on production machine
  if (process.env.NODE_ENV == 'production') {
    args.push('--source-address')
    args.push(addresses[0])
  }

  // add url
  args.push(url)

  const stream = spawn(getExecutable(), args)

  let stderr = new Buffer(0)
  stream.stderr
  .on('data', d => { stderr = Buffer.concat([stderr, d]) })
  .on('end', () => {
    stderr.toString('utf8')
  })

  // kill process on closing socket
  req.socket.on('close', () => {
    stream.kill()
  })

  return new Promise((resolve, reject) => {
    return resolve(stream.stdout)
  })
}

/*
* stream media on https protocol via nodejs and `request` module
*/
const _streamNative = function (media, req) {

  const headers = {
    'User-Agent': userAgent
  }

  // support pause-reusme downloading
  if (req.headers.range)
    headers.range = req.headers.range

  const options = {
    url: media.download,
    headers
  }

  if (process.env.NODE_ENV == 'production')
    options.localAddress = addresses[0]

  const download = request(options)
  .on('error', e => {})

  // kill downloader on closing socket
  req.socket.on('close', () => {
    download.abort()
  })

  return new Promise((resolve, reject) => {
    return resolve(download)
  })
}

module.exports = {
  getMedia,
  dump,
  download,
  save,
  stream
}
