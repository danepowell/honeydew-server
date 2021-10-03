var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = process.env.MONGODB_URI;
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var count = 0;
  db.collection('Item').find({name: /\n/}).toArray((err, docs) => {
    docs.forEach(doc => {
      db.collection('Item').update({_id: doc._id}, {$set: {'name': doc.name.replace('\n', '')}});
      count++;
    });
    console.log("Updated " + count + " records.");
    db.close();
  });

});
