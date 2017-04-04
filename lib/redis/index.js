const Promise = require('bluebird')
const redis = Promise.promisifyAll(require('redis'))
const client = redis.createClient()

module.exports = client
