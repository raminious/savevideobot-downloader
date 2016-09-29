'use strict'

const _ = require('underscore')
const config = require('../../../config.json')
const words = config.download.restrict.words

module.exports = function (site, title, url) {

  let find = false
  const inputs = [site, title]

  for (let i in inputs) {

    // prepare input
    let input = inputs[i].toLowerCase()

    find = _.some(words, w => {
      return input.match(w) != null
    })

    if (find) break
  }

  // log porn requests
  if (find) {
    throw {
      type: 'prn',
      message: 'We are so sorry, You are not able to download pornographic contents.',
      site,
      title,
      url
    }
  }
}
