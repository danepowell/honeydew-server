'use strict';
const awsServerlessExpress = require('aws-serverless-express');
const warmer = require('lambda-warmer')

exports.handler = (event, context, callback) => {
  warmer(event).then(isWarmer => {
    if (isWarmer) {
      callback(null, 'warmed')
    }
    else {
      const app = require('./app');
      const server = awsServerlessExpress.createServer(app);
      awsServerlessExpress.proxy(server, event, context);
    }
  })
}
