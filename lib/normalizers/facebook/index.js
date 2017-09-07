const _ = require('underscore')

exports.normalize = function(response) {
  const { formats } = response
  const format = _.find(formats, f => f.format_id === 'dash_sd_src_no_ratelimit')

  return Object.assign(response, {
    formats: [],
    url: format.url
  })
}
