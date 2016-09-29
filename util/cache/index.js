'use strict'

const Promise = require('bluebird')
const redis = Promise.promisifyAll(require('redis'))
const client = redis.createClient()

const prefix = 'downloader_'

const get = function (key) {
  return client.getAsync(prefix+key)
}

const set = function (key, value, expire) {
  key = prefix + key
  expire = expire || 1200 // 2min default

  client.set(key, JSON.stringify(value))
  client.expire(key, expire)
}

exports.get = get
exports.set = set

