const responseTime = require('koa-response-time');
const ratelimit = require('koa-ratelimit');
const compress = require('koa-compress');
const mount = require('koa-mount');
const koa = require('koa');

module.exports = function() {

  const app = koa();

  // trust proxy
  app.proxy = true;

  // x-response-time
  app.use(responseTime());

  // compression
  app.use(compress());

  //routes
  app.use(mount('/download',require('./lib/api/info')));
  app.use(mount('/download',require('./lib/api/request')));

  return app;
}
