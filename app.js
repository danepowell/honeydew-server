// Set up variables.
var express = require('express');
var path = require('path');
var morgan = require('morgan');
var ParseServer = require('parse-server').ParseServer;
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var serverUrl = process.env.PARSE_SERVER_URL || 'http://localhost:5000/parse';
var appId = process.env.PARSE_APP_ID || 'myAppId';
var masterKey = process.env.PARSE_MASTER_KEY || '';
var logLevel = process.env.LOG_LEVEL || '';
var mailgunKey = process.env.MAILGUN_KEY || 'asdf';
var environment = process.env.ENVIRONMENT || 'local';
var basePath = '/honeydew-' + environment;
if (logLevel == 'verbose' || logLevel == 'debug') {
  process.env.VERBOSE = 1;
}

var databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;
var databaseName = process.env.MONGODB_NAME || '';

// TODO: disable push notifications completely if api key not set
var api = new ParseServer({
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: appId,
  masterKey: masterKey,
  serverURL: serverUrl,
  push: {
    android: {
      senderId: process.env.FCM_SENDER_ID || 'asdf',
      apiKey: process.env.FCM_API_KEY || 'asdf'
    }
  },
  publicServerURL: serverUrl,
  appName: 'Honeydew',
  emailAdapter: {
    module: '@parse/simple-mailgun-adapter',
    options: {
      fromAddress: '',
      domain: 'mg.danepowell.com',
      apiKey: mailgunKey,
    }
  },
  accountLockout: {
    duration: 5,
    threshold: 10,
  }
});

var app = express();

// Set up app.
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.locals.basedir = basePath;
app.locals.serverUrl = serverUrl;
app.locals.appId = appId;
app.locals.masterKey = masterKey;
app.locals.databaseUri = databaseUri;

app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(basePath, express.static(path.join(__dirname, 'public')));
app.use(basePath + '/parse', api);

var httpServer = require('http').createServer(app);
httpServer.listen(4040);

app.use(basePath, routes);

module.exports = app;
