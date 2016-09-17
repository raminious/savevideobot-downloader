'use strict'

const Promise = require('bluebird')
const redis = require('redis')

Promise.promisifyAll(redis.RedisClient.prototype)
Promise.promisifyAll(redis.Multi.prototype)

const client = redis.createClient()

exports.prefix = ''

const get = function (key) {
  return client.getAsync(this.prefix+key)
}

const set = function (key, value, expire) {
  key = this.prefix + key
  expire = expire || 1200 // 2min default

  client.set(key, JSON.stringify(value))
  client.expire(key, expire)
}

exports.get = get
exports.set = set

