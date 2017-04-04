const error = 'Indirect link from search engines not supported.'

exports.dump = function(url) {

  return new Promise((resolve, reject) => {

    reject({
      action: 'dump',
      target: 'google',
      type: 'google_engine',
      message: error,
      description: error
    })
  })
}

