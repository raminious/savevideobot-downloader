'use strict'

const _ = require('underscore')
const config = require('../../../config.json')

const words = [
  "porn", "sex", "xxx", "xnxx", "xhamster", "adult", "threesome", "3some",
  "dick", "hot girl", "hot blonde", "boob", "blowjob", "pussy", "milf", "penis",
  "xtube", "redtube", "lesbian", "orgasm", "naked"
]

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
      type: 'filter_p0rn',
      message: 'We are so sorry, You are not able to download pornographic contents.',
      site,
      title,
      url
    }
  }
}
