const _ = require('underscore')
const nude = require('nude')
const engine = require('../../../lib/engine')

async function checkNudity(info) {
  const isImage = ['jpg', 'jpeg', 'png', 'gif'].indexOf(info.ext) > -1
  const imageUrl = isImage ? info.url : info.thumbnail

  if (['twitter', 'instagram'].indexOf(info.extractor) === -1) {
    return false
  }

  try {
    return await nude.scanUrlAsync(imageUrl)
  } catch(e) {
    return false
  }
}

// processor for dumping media
module.exports = async function (job) {
  const { id, url, callback } = job.data

  let info

  try {
    info = await engine.dump(url)
  }
  catch(error) {
    return { id, url, callback, error }
  }

  const tags = []

  if (await checkNudity(info) === true) {
    tags.push('nudity')
  }

  const media = {
    site: info.extractor,
    download: info.url,
    thumbnail: info.thumbnail,
    duration: info.duration,
    size: info.filesize,
    title: info.title,
    extension: info.ext,
    dimension: (typeof info.width !== 'undefined' && info.width !== null) ? info.width + 'x' + info.height : '',
    worker: info.worker,
    status: 'ready',
    tags: tags,
    formats: (info.extractor !== 'youtube') ? [] :
    _.chain(info.formats)
    .filter(item => {
      const type = item.width == null ? 'Audio' : 'Video'

      if (
        item.format.indexOf('DASH') != -1 ||
        item.acodec == 'none' ||
        (type == 'Audio' && item.abr < 128)
      )
        return false

      return true
    })
    .map(item => {
      return {
        id: ~~item.format_id,
        abr: item.abr,
        format: item.format,
        size: item.filesize,
        ext: item.ext,
        dimension: (item.width != null) ? item.width + 'x' + item.height : '',
        container: item.container,
        note: item.format_note,
        download: item.url
      }
    })
    .value()
  }

  return { id, url, callback, media }
}
