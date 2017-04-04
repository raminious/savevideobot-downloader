const _ = require('underscore')
const engine = require('../../../lib/engine')

// const delay = () => new Promise(res => setTimeout(res, 20000))

// processor for dumping media
module.exports = async function (job) {

  const id = job.data.id
  const url = job.data.url
  const callback = job.data.callback

  let info

  try {
    info = await engine.dump(url)
  }
  catch(error) {
    return { id, url, callback, error }
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

  return { id, callback, media }
}
