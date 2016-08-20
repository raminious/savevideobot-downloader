'use strict'

const Promise = require('bluebird')
const shell = require('shelljs')
const util = require('util')
const fs = require('fs')
const url = require('url')
const request = require('request')
const _ = require('underscore')
const config = require('../../config.json')
const ip = require('ip')
const parse = require('url-parse')

// promisify
shell.execAsync = Promise.promisify(shell.exec)

let Engine = {

  addresses: [],
  proxies: [],
  getExecutable: () => {
    return 'youtube-dl'
  },
  getLocalAddress: function() {
    this.addresses.push(this.addresses.shift())
    return this.addresses[0]
  },
  getProxyAddress: function() {
    this.proxies.push(this.proxies.shift())
    return 'http://' + this.proxies[0]
  },
  getMediaInfo: function* (url, params, options) {

    // merge default arguments with user args
    let args = Object.assign({
      '--dump-json': '',
      '--no-warnings': '',
      '--format': 'best'
    }, params || {})

    // get domain name of url
    //const domain = parse(url, true).hostname.replace('www.', '')

    // check domain is belongs to proxy need websites or not
    // proxies deprecated after moving servers from Germany to England
    //if (config.proxy.indexOf(domain) != -1)
      //args['--proxy'] = this.getProxyAddress()

    // set source address
    if (process.env.NODE_ENV == 'production')
      args['--source-address'] = this.getLocalAddress();

    args = _.map(args, (val, key) => {
      return (val === '') ? key : key + '=' + val
    })
    .join(' ')

    let info = yield shell.execAsync(util.format('%s %s "%s"', this.getExecutable(), args, url),
      { silent: true, async: true })

    try {
      return JSON.parse(info)
    }
    catch(e) {
      throw new Error(e.message)
    }
  },
  download: function* (url, format, destination) {

    let args = {
      '--no-warnings': '',
      '--format': format,
      '--output': '"' + destination + '"'
    }

    args = _.map(args, (val, key) => {
      return (val === '') ? key : key + '=' + val
    })
    .join(' ')

    try {
      yield shell.execAsync(util.format('%s %s "%s"', this.getExecutable(), args, url),
        { silent: true, async: true })
    }
    catch(e) {
      throw e
    }

    /*
    return new Promise((resolve, reject) => {

      let options = {
        uri: url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11 Linux x86_64 rv:10.0) Gecko/20150101 Firefox/20.0 (Chrome)'
        }
      }

      if (process.env.NODE_ENV === 'production')
        options.localAddress = this.getLocalAddress()

      let stream = fs.createWriteStream(destination)
      let req = request(options).pipe(stream)

      req.on('error', reject)
      stream.on('error', reject)
      stream.on('finish', resolve)
    })
  */
  }
}

//set local addresses
Engine.addresses = config.localAddress
Engine.proxies = config.proxyAddress

module.exports = Engine
