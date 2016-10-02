const co = require('co')
const kue = require ('kue')
const CronJob = require('cron').CronJob

const queue = kue.createQueue({ jobEvents: false })

/*
 * post processors for complete jobs
 */
const postProcessors = {}

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
.on('job complete', co.wrap(function* (id, result) {

  //find job
  const job = yield findById(id)

  // check for TTL exceed (not done yet)
  if (job._error != null)
    return false

  // run post processor
  if (postProcessors[job.type])
    postProcessors[job.type](result)

  //remove job
  removeById(id)
}))
.on('job failed', co.wrap(function* (id, err) {
  // remove job
  removeById(id)
}))

.on('error', function (err) {

})

/**
 * Create a new job.
 * @param name string name of job
 * @param data object params that will pass to processor
 * @param configuration object job configurations
 */
function createJob(name, data, configurations) {

  // merge default configurations with user configs
  var config = Object.assign({
    priority: 'normal',
    attempts: 1,
  }, configurations || {})

  queue.create(name, data)
    .removeOnComplete(false)
    .priority(config.priority)
    .ttl(config.ttl)
    .attempts(config.attempts)
    .save()
}

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
  findById(id).then(job => {
    job.remove(e => e)
  }, e => e)
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
 * cronjobs
 */
 new CronJob({
  cronTime: '00 */5 * * * *',
  onTick: function () {

    // remove failed jobs
    queue.failed((err, ids) => {
      ids.forEach(id => removeById(id))
    })
  },
  start: true
})

exports.kue = kue
exports.queue = queue
exports.create = createJob
exports.process = processJob
exports.onDone = postProcessors
