'use strict'

const moment = require('moment')
const fs = require('fs')
const remove = require('rimraf')
const _ = require('underscore')
const config = require('../../config.json')

const date = moment()

function GC() {

  const expire = 4 // 4hours
  const path = config.basepath + date.format('Y') + '/'
  const month = ~~date.format('M')
  const day = ~~date.format('D')
  const hour = ~~date.format('HH')

  this.run = function() {

    // clean-up old month and old days directories if remained
    this._cleanOldMonthes()
    this._cleanOldDays()

    // clean-up today directories
    const today = path + month + '/' + day + '/'
    if (!fs.existsSync(today)) return

    _.each(fs.readdirSync(today), h => {
      if (hour - expire >= h) remove(today + h, e => e)
    })
  }

  /*
  * clean directories of old monthes
  */
  this._cleanOldMonthes = function() {

    if (!fs.existsSync(path)) return

    // remove directories of old monthes if remained
    _.each(fs.readdirSync(path), m => {
      if (~~m < month) remove(path + m, e => e)
    })
  }

  /*
  * clean directories of old days
  */
  this._cleanOldDays = function() {

    // create current month path
    const currentMonth = path + month + '/'

    // check current month path is exists
    if (!fs.existsSync(currentMonth)) return

    // remove directories of old days if remained
    _.each(fs.readdirSync(currentMonth), d => {
      if (~~d < day) remove(currentMonth + d, e => e)
    })
  }
}

new GC().run()



