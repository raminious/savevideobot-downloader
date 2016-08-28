'use strict'

const shell = require('shelljs')
const util = require('util')
const request = require('request')
const _ = require('underscore')
const config = require('../../config.json')

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
      '--no-warnings': ''
    }, params || {})

    // set source address
    const sourceAddress = this.getLocalAddress()
    if (process.env.NODE_ENV == 'production')
      args['--source-address'] = sourceAddress

    args = _.map(args, (val, key) => {
      return (val === '') ? key : key + '=' + val
    })
    .join(' ')

    return new Promise((resolve, reject) => {
      const info = shell.exec(util.format('%s %s "%s"', this.getExecutable(), args, url),
        { silent: true, async: true }, (code, stdout, stderr) => {

          if (~~code > 0) {
            return reject({
              target: 'ytdl',
              method: 'fetch',
              description: stderr,
              args,
              source_address: sourceAddress
            })
          }

          return resolve(JSON.parse(stdout))
        })
    })
  },
  /**
  * downloader function
  */
  download: function* (url, format, destination) {

    let args = {
      '--no-warnings': '',
      '--format': format,
      '--max-filesize': config.download.maxSize,
      '--output': '"' + destination + '"'
    }

    // set source address
    const sourceAddress = this.getLocalAddress()
    if (process.env.NODE_ENV == 'production')
      args['--source-address'] = this.getLocalAddress();

    args = _.map(args, (val, key) => {
      return (val === '') ? key : key + '=' + val
    })
    .join(' ')

    return new Promise((resolve, reject) => {
      shell.exec(util.format('%s %s "%s"', this.getExecutable(), args, url),
        { silent: true, async: true }, (code, stdout, stderr) => {

          if (~~code > 0) {
            return reject({
              target: 'ytdl',
              method: 'download',
              description: stderr,
              args,
              source_address: sourceAddress
            })
          }

          return resolve(stdout)
        })
    })
  }
}

//set local addresses
Engine.addresses = config.localAddress
Engine.proxies = config.proxyAddress

module.exports = Engine
