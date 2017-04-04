module.exports = function () {
  const filters = arguments
  const fn = {}

  for (let f in filters)
    fn[filters[f]] = require('./' + filters[f])

  return fn
}
