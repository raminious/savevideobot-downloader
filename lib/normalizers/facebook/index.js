const _ = require('underscore')

exports.normalize = function(response) {
  const { formats } = response
  const format = _.find(formats, f => f.format_id.includes('dash_sd'))

  return Object.assign(response, {
    formats: 'best',
    url: format.url
  })
}
