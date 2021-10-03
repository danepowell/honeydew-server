const { startParseServer, stopParseServer, dropDB } = require('parse-server-test-runner');
const Parse = require('parse/node');

describe('Cloud code', () => {
  beforeAll((done) => {
    const appId = 'test';
    const masterKey = 'test';
    const javascriptKey = 'test';

    startParseServer({ appId, masterKey, javascriptKey, cloud: `${__dirname}/../cloud/main.js` })
      .then(() => {
        Parse.initialize(appId, masterKey, javascriptKey);
        Parse.serverURL = 'http://localhost:30001/1';
      })
      .then(done).catch(done.fail);
  }, 100 * 60 * 2);

  afterAll((done) => {
    stopParseServer()
      .then(done).catch(done.fail);
  });

  beforeEach((done) => {
    dropDB()
      .then(done).catch(done.fail);
  });

  it('should work', (done) => {
    const q = new Parse.Query('_Installation')
    q.limit(5)
      .find({ useMasterKey: true })
      .then(console.log)
      .then(done).catch(done.fail);
  });

  it('should reject item saves with inactive subscription', async (done) => {
    const user = new Parse.User();
    user.set("username", "test");
    user.set("password", "test");
    user.set("email", "test@example.com");
    await user.signUp();
    var Subscription = Parse.Object.extend("Subscription");
    let subscription = new Subscription();
    subscription.set("user", user);
    var expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - 100);
    subscription.set("expiry", expiryDate);
    await subscription.save();
    console.log(expiryDate);
    const Item = Parse.Object.extend("Item");
    const item = new Item();
    item.save(null, {sessionToken: user.getSessionToken()})
      .then(console.log)
      .then(done).catch(done.fail);
  });
});
