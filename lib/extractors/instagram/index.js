const og = require('open-graph')

const error_404 = 'Page not found'
const error_no_file = 'The link has not any video or photo associated.'

exports.dump = async function(url) {
  let meta

  try {
    meta = await extract(url)
  }
  catch(e) {
    throw {
      action: 'dump',
      target: 'instagram',
      description: error_404,
      message: error_404
    }
  }

  const data = {
    extractor: 'instagram',
    thumbnail: meta.image.url,
    title: meta.title,
    worker: 'native',
    formats: {}
  }

  if (meta.type === 'instapp:photo') {
    data.url = meta.image.url
    data.thumbnail = null
    data.ext = 'jpg'
  }
  else if (meta.video) {
    data.url = meta.video.secure_url || meta.video.url,
    data.ext = 'mp4',
    data.width = meta.video.width,
    data.height = meta.video.height
  }
  else {
    throw {
      action: 'dump',
      target: 'instagram',
      description: error_no_file,
      message: error_no_file
    }
  }

  return data
}

function extract(url) {
  return new Promise((resolve, reject) => {
    og(url, function(err, meta){
      if (err) {
        return reject(err)
      }
      return resolve(meta)
    })
  })
}
