const co = require('co')
const kue = require ('kue')
const CronJob = require('cron').CronJob

const agent = require('superagent')
require('superagent-retry')(agent)

const log = require('../../log')

const auth = require('../../config.json').auth

const queue = kue.createQueue({
  disableSearch: false
})

/*
 * Kue currently uses client side job state management and when redis crashes
 * in the middle of that operations, some stuck jobs or index inconsistencies
 * will happen. If you are facing poor redis connections or an unstable redis
 * service you can start Kue's watchdog to fix stuck inactive
 * jobs (if any) by calling
 */
queue.watchStuckJobs()

/*
 * Queue-level events provide access to the job-level events previously mentioned,
 * however scoped to the Queue instance to apply logic at a "global" level.
 */
queue
.on('job complete', id => {
  kue.Job.get(id, (err, job) => {
    if (err) return
    job.remove(e => e)
  })
})
.on('error', e => e)

/**
 * Create a new job.
 * @param name string name of job
 * @param data object params that will pass to processor
 * @param configuration object job configurations
 */
const createJob = co.wrap(function* (name, data, configurations) {

  if (configurations.singleton && data.uniqid) {

    const search = yield agent
      .get('http://127.0.0.1:19300/job/search?q=' + data.uniqid)
      .auth(auth.username, auth.password, { type: 'auto' })

    if (search.body.length > 0) {
      const job = yield findById(~~search.body[0])

      if (['failed', 'inactive'].indexOf(job.state()) != -1)
        job.active()

      return false
    }
  }

  // merge default configurations with user configs
  const config = Object.assign({
    onFailed: e => e,
    onComplete: () => {},
    priority: 'normal',
    attempts: 1,
    searchKeys: [],
    removeOnComplete: true
  }, configurations || {})

  queue.create(name, data)
    .on('complete', config.onComplete)
    .on('failed', config.onFailed)
    .removeOnComplete(config.removeOnComplete)
    .priority(config.priority)
    .ttl(config.ttl)
    .attempts(config.attempts)
    .searchKeys(config.searchKeys)
    .save()
})

/**
 * Process a job.
 * @param name string the name of process name
 * @param concurrency number job concurrency
 * @param processor function* job processor
 */
function processJob(name, concurrency, processor) {

  queue.process(name, concurrency, function (job, done) {

    co(function* () {
      return yield processor(job)
    }).then(result => {
      done(null, result)
    }, done)
  })
}

/*
 * Remove job by id
 */
function removeById(id) {
  return new Promise((resolve, reject) => {
    findById(id).then(job => {
      job.remove(e => reject)
      resolve()
    }, e => reject)
  })
}

/*
 * find job by it's id
 */
function findById(id) {
  return new Promise((resolve, reject) => {
    kue.Job.get(id, function (err, job) {
      if (err) return reject(err)
      return resolve(job)
    })
  })
}

/**
 * crontab for job maintainance
 */
new CronJob({
  cronTime: '00 */2 * * * *',
  onTick: function () {

    // remove completed jobs if stucks in queue
    queue.complete((err, ids) => {
      ids.forEach(id => removeById(id))
    })

    // remove failed jobs
    queue.failed((err, ids) => {
      ids.forEach(id => {

        findById(id).then(job => {

          if (job.error() == 'TTL exceeded') {

            const error = {}

            if (job.type == 'send_job') {

              let media = job.data.media

              error.type = 'send_ttl_exceed'
              error.message =  [
                'Can not send your requested media file, because target server not responsed.',
                'You can download file by yourself via this link:\n',
                '[' + media.filename + '](' + media.stream.replace('/stream/', '/download/') + ')'
              ].join('\n')

              log('warning', 'ytdl_send_ttl_exceed', {
                id: media.id,
                site: media.site,
                url: media.url,
                format: media.format
              })
            }

            if (job.type == 'dump_job') {
              error.type = 'dump_ttl_exceed'
              error.message = 'Can not get media info of requested url, please try again.'
              log('warning', 'ytdl_dump_ttl_exceed', { id: job.data.id, url: job.data.url })
            }

            agent
              .post(job.data.callback.url)
              .send({ id: job.data.callback.id })
              .send({ error })
              .retry(2)
              .end((err, res) => {})
          }

          removeById(id)
        })
      })
    })

    // reactive stuck jobs
    queue.inactive((err, ids) => {
      ids.forEach(id => {
        findById(id).then(job => {
          job.active()
        }, e => e)
      })
    })
  },
  start: process.env.pm_id? (process.env.pm_id == 0? true: false): true
})

exports.kue = kue
exports.queue = queue
exports.create = createJob
exports.process = processJob
