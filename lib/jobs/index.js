const bull = require('bull')
const _ = require('underscore')

const Q = {}

Q.DUMP_JOB = 'dump_job'
Q.SEND_JOB = 'send_job'
Q.AUTOCONTENT_JOB = 'autocontent_job'

Q.jobs = {
  [Q.DUMP_JOB]: new bull(Q.DUMP_JOB),
  [Q.SEND_JOB]: new bull(Q.SEND_JOB),
  [Q.AUTOCONTENT_JOB]: new bull(Q.AUTOCONTENT_JOB)
}

Q.stats = async function() {
  const queues = {}
  for (q in Q.jobs) {
    queues[q] = await Q.jobs[q].getJobCounts()
  }

  const stats = _.reduce(queues, (c, p) => {
    return _.mapObject(c, (value, key) => p[key] + value)
  })

  return stats
}

Q.clean = async function() {
  const time = 8 * 60 * 60
  for (q in Q.jobs) {
    await Q.jobs[q].clean(time, 'completed')
    await Q.jobs[q].clean(time, 'failed')
    await Q.jobs[q].clean(time, 'wait')
  }
}

module.exports = Q
