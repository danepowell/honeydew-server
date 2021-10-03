var express = require('express');
var router = express.Router();
var Parse = require('parse/node');

/* GET home page. */
router.get('/auth', function (req, res) {
  return res.render('index');
});

/* POST home page. */
router.post('/auth', async function (req, res) {
  console.log("Processing pairing request...");
  const username = req.body.username;
  const password = req.body.password;
  const state = req.query.state;
  const redirectUrlBase = req.query.redirect_uri;

  Parse.initialize(req.app.locals.appId);
  Parse.serverURL = req.app.locals.serverUrl;

  let user = null;
  try {
    user = await Parse.User.logIn(username, password);
  }
  catch (error) {
    if (error.code == Parse.Error.OBJECT_NOT_FOUND) {
      // Display a more appropriate error message.
      res.render('index', { error: "Invalid email or password." });
    }
    else {
      res.render('index', { error: error.message });
    }
    switch (error.code) {
      case Parse.Error.USERNAME_MISSING:
      case Parse.Error.PASSWORD_MISSING:
      case Parse.Error.OBJECT_NOT_FOUND:
        console.log("Login attempt failed.");
        break;
      default:
        console.error("Login error: " + error);
    }
  }
  const redirectUrlFinal = redirectUrlBase + "#state=" + state + "&access_token=" + user.getSessionToken() + "&token_type=Bearer";
  res.redirect(redirectUrlFinal);
});

/* GET items page. */
router.get('/items', function (req, res) {
  var MongoClient = require('mongodb').MongoClient, assert = require('assert');

  // Connection URL
  var url = req.app.locals.databaseUri;

  var aggregateItems = function (db, callback) {
    db.collection('Item').aggregate(
      [
        { $group: { _id: { name: "$name" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(function (err, result) {
        assert.equal(err, null);
        console.log(result);
        callback(result);
      });
  };

  // Use connect method to connect to the server
  MongoClient.connect(url, function (err, client) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    var db = client.db(req.app.locals.databaseName);

    aggregateItems(db, function (result) {
      var items = new Array();
      for (var i = 0; i < result.length; i++) {
        items.push(result[i]['_id']['name']);
      }
      console.log(items);
      res.render('items', { items: items });
      client.close();
    });
  });
});

module.exports = router;
