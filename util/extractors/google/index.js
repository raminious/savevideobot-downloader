'use strict'

exports.dump = function(url) {

  return new Promise((resolve, reject) => {

    reject({
      action: 'dump',
      target: 'google',
      description: 'Google said: Indirect link from search engines not supported.'
    })
  })
}

