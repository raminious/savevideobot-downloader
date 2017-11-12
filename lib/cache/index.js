const client = require('../redis')

// cache prefix
const prefix = 'downloader_'

const get = async function (key) {
  const data = await client.getAsync(prefix+key)
  return data == null? null: JSON.parse(data)
}

const set = function (key, value, expire) {
  key = prefix + key
  expire = expire || 120 // 2min default

  client.set(key, JSON.stringify(value))
  client.expire(key, expire)
}

exports.get = get
exports.set = set

