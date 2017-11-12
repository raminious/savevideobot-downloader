const _ = require('underscore')
const config = require('../../../config.json')

const words = [
  "porn", "sex", "xxx", "xnxx", "xhamster", "xvideos" , "threesome", "3some",
  "dick", "hot girl", "hot blonde", "boob", "blowjob", "pussy", "milf", "penis",
  "xtube", "redtube", "lesbian", "orgasm", "adult", "shahvani",
  "جنده", "کوص", "گایید", "فیلم سوپر", "خایه", "ساک زدن", "پورن", "فاحشه", "دودول", "کسکش"
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
