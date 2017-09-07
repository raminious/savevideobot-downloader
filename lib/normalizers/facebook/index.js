const _ = require('underscore')

const sort = function(formats) {
  const list = ['dash_sd_src_no_ratelimit', 'dash_sd_src']

  return _.sortBy(formats, f => {
    const order = list.indexOf(f.format_id)
    return order > -1 ? order : list.length + 1
  })
}

exports.normalize = function(response) {
  const { formats } = response
  const sorted = sort(formats)
  const format = _.find(sorted, f => f.format_id.includes('dash_sd'))

  return Object.assign(response, {
    formats: [],
    url: format.url
  })
}
