'use strict'

const bluebird = require('bluebird')
const shell = require('shelljs')
const spawn = require('child_process').spawn
const util = require('util')
const agent = require('superagent')
const parseDomain = require('parse-domain')
const request = require('request')
const remote = require('remote-file-size')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const bytes = require('bytes')
const _ = require('underscore')
const cache = require('../cache')
const config = require('../../config.json')

/*
* list of external extractors except ytdl
*/
const extractors = {
  twitter: require('../extractors/twitter')
}

// promisify remote-file-size
const remoteAsync = bluebird.promisify(remote)

const WORKER_NATIVE = 'native'
const WORKER_SPAWN = 'spawn'

// set cache prefix
cache.prefix = 'dl_engine_'

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
const getLogInfo = function(action, args, description) {
  return {
    target: 'ytdl',
    action,
    description,
    args,
    source_address: addresses[0]
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
      media = (yield agent.get(config.api + '/media/status/' + id)).body

      // store media in cache for 3hours
      cache.set(key, media, 10 * 60)
    }
  }
  catch(e) {
    throw new Error('download engine can not connect to api server')
  }

  let url = media.url
  let filename = media.title + '.' + media.extension
  let extension = media.extension
  let download = media.download
  let stream = media.stream
  let worker = media.worker

  // if media has formats, check for requested format
  if (media.formats != null && media.formats.length > 0) {

    // search for required format data
    let fmt = _.findWhere(media.formats, { id: ~~format })

    if (fmt == null)
      throw new Error('Invalid media format')

    filename = media.title + '.' + fmt.ext
    extension = fmt.ext
    download = fmt.download
    stream = fmt.stream
  }

  // get media size
  let size = yield getMediaSize(download)

  // if file is less than 5k, throw error
  if (size < 5 * 1024)
    throw new Error('File is too small or is stream, we can not download stream files' +
      '\nFile size: ' + bytes(size))

  return {
    id,
    format,
    url,
    download,
    stream,
    filename,
    extension,
    size,
    preferStream: true,
    worker
  }
}

/*
* get remote media size by sending http headers
*/
const getMediaSize = function* (url) {

  const options = {
    url,
    headers: { 'User-Agent': userAgent },
  }

  if (process.env.NODE_ENV == 'production')
    options.localAddress = addresses[0]

  // get media file size
  return yield remoteAsync(options)
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
    'source-address:' + sourceAddress
  ])

  return new Promise((resolve, reject) => {

    const command = util.format('%s %s "%s"', getExecutable(), args, url)
    shell.exec(command, { silent, async}, (code, stdout, stderr) => {

      // error happened
      if (~~code > 0)
        return reject(getLogInfo('dump', args, stderr))

      stdout = JSON.parse(stdout)
      stdout.requested_formats = []

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

  worker = media.worker || worker || config.download.defaultWorker
  req = req || null

  if (media.preferStream)
    return stream(media, worker, req)

  return save(media, worker)
}

/*
* save media on disk
*/
const save = function (media, worker) {
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
    'output:' + '"' + destination + '"'
  ])

  return new Promise((resolve, reject) => {
    const command = util.format('%s %s "%s"', getExecutable(), args, url)
    shell.exec(command, { silent: true, async: true }, (code, stdout, stderr) => {

      if (~~code > 0)
        return reject(getLogInfo('download', args, stderr))

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
const _streamNative = function (media) {

  const options = {
    url: media.download,
    headers: { 'User-Agent': userAgent },
  }

  if (process.env.NODE_ENV == 'production')
    options.localAddress = addresses[0]

  const req = request(options)
  .on('error', e => {
    console.log(e)
  })

  return new Promise((resolve, reject) => {
    return resolve(req)
  })
}

module.exports = {
  getMedia,
  dump,
  download
}
