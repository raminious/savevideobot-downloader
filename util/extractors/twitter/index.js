'use strict'

const twitter = require('twitter')
const bluebird = require('bluebird')
const _ = require('underscore')
const config = require('./config.json')
const tokens = config.tokens

const clients = []
let currentClient = 0

_.each(tokens, (token, key) => {
  clients.push(new twitter(token))
  bluebird.promisifyAll(clients[key])
})

exports.dump = function(url) {

  // remove query string
  url = url.split('?')[0]

  const match = url.match(/(\d{10,30})$/gi)
  const id = match != null? match[0]: null

  return new Promise((resolve, reject) => {

    if (id == null)
      return reject({ target: 'twitter', code: 0, description: 'Twitter said: invalid url.'})

    // round robin client
    currentClient = (currentClient + 1) % clients.length
    clients[currentClient].getAsync('statuses/show/' + id, {})
    .then(tweet => {

      const entities = tweet.extended_entities

      if (entities == null)
        return reject({ target: 'twitter', code: 1, description: 'Twitter said: The link has not any video.'})

      // get video from entities
      const video = getVideo(entities.media)

      if (video == null)
        return reject({ target: 'twitter', code: 2, description: 'Twitter said: The link has not any video.'})

      // find video link
      const download = getDownloadLink(video.video_info.variants)

      // get video dimension
      const dimension = getDimension(download)

      return resolve({
        extractor: 'twitter',
        url: download,
        thumbnail: video.media_url_https,
        duration: Math.floor(video.video_info.duration_millis / 1000),
        filesize: null,
        title: tweet.text.replace(/https.*/i, '').trim(),
        ext: 'mp4',
        width: dimension[0],
        height: dimension[1],
        worker: 'native',
        formats: {}
      })
    }, reject)
  })
}


/**
* get video
*/
const getVideo = function(entities) {
  return _.find(entities, entity => {
    return entity.type == 'video' || entity.type == 'animated_gif'
  })
}


/**
* get media download link
*/
const getDownloadLink = function(links) {

  const link =  _.find(links, link => {
    return link.content_type == 'video/mp4'
  })

  return link != null? link.url: null
}

/**
* get media dimensions
*/
const getDimension = function(url) {
  const match = url.match(/\d+x\d+/i)
  return match != null? match[0].split('x'): [0, 0]
}
