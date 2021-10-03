/*global Parse*/
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL,
  transports: [
    new winston.transports.Console()
  ]
});

// Implements beforeSave hook for items.
Parse.Cloud.beforeSave("Item", async (request) => {
  logger.debug(request);

  // Check if user account is active.
  if (!await isActiveUser(request.user)) {
    throw 'No active subscription';
  }

  // Check that item name is non-empty and unique.
  const itemName = request.object.get("name");
  if (!itemName || !(/\S/.test(itemName))) {
    throw "Item name must not be blank";
  }
  if (request.object.isNew()) {
    const itemQuery = new Parse.Query(Parse.Object.extend("Item"));
    itemQuery.equalTo("name", itemName);
    const item = await itemQuery.first({ sessionToken: request.user.getSessionToken() });
    if (item !== undefined) {
      throw "Item name must be unique";
    }
  }
});

// Item post-save hook.
Parse.Cloud.afterSave("Item", async (request) => {
  const user = request.user;
  const section = request.object.get("section");
  const itemName = request.object.get("name");
  const sessionToken = request.user.getSessionToken();

  // Sends push notifications.
  const pushQuery = new Parse.Query(Parse.Session);
  pushQuery.equalTo("user", user);
  const sessions = await pushQuery.find({ useMasterKey: true });
  await sendPushNotifications(sessions);

  // Guess item category.
  if (section == "Uncategorized") {
    logger.info(`Attempting to guess category for ${itemName}...`)
    const category = await guessItemCategory(itemName, sessionToken);
    if (category !== "Uncategorized") {
      logger.info(`Guessed category ${category} for item ${itemName}`);
      request.object.set("section", category);
      await request.object.save(null, { sessionToken: sessionToken });
    }
  }
});

// Picks a section for an item based on the current user's existing
// sections and correlation with other users' sections.
// Returns 'Uncategorized' if no match is found.
async function guessItemCategory(itemName, sessionToken) {
  const Item = Parse.Object.extend("Item");

  const userSectionsQuery = new Parse.Query(Item);
  const userSections = await userSectionsQuery.distinct("section");
  logger.debug(`Checking if item name contains any of ${userSections}`);
  for (let i = 0; i < userSections.length; i++) {
    const section = userSections[i];
    if (itemName.indexOf(section) > -1) {
      return section;
    }
  }

  const itemQuery = new Parse.Query(Item);
  itemQuery.matches("name", new RegExp(itemName), "i");
  itemQuery.notEqualTo("section", "Uncategorized");
  itemQuery.notEqualTo("state", 0);
  itemQuery.select("section");
  const items = await itemQuery.find({ useMasterKey: true });
  logger.debug(`Found ${items.length} instances of ${itemName} among all users`);
  const sections = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    sections.push(item.get("section"));
  }
  const uniqueSections = [...new Set(sections)];
  // TODO: trim whitespace from section names in the db and app.
  const countQuery = new Parse.Query(Item);
  countQuery.containedIn("section", uniqueSections);
  const itemCounts = await countQuery.find({ useMasterKey: true });
  logger.debug(`Found ${itemCounts.length} items in categories similar to ${itemName} among all users`);
  if (itemCounts == 0) {
    return 'Uncategorized';
  }
  const counts = {};
  for (let i = 0; i < itemCounts.length; i++) {
    const name = itemCounts[i].get("name");
    counts[name] = counts[name] ? counts[name] + 1 : 1;
  }
  const sortable = [];
  for (let newname in counts) {
    sortable.push([newname, counts[newname]]);
  }

  sortable.sort(function (a, b) {
    return b[1] - a[1];
  });
  for (let sin = 0; sin < sortable.length; sin++) {
    if (sortable[sin][1] > 1) {
      const query2 = new Parse.Query(Item);
      const candidateItem = sortable[sin][0];
      logger.debug(`Checking candidate item ${candidateItem}`);
      // TODO: If no candidates found here, create a new category for user?
      query2.matches("name", candidateItem);
      query2.notEqualTo("name", itemName);
      query2.notEqualTo("state", 0);
      query2.notEqualTo("section", "Uncategorized");
      const found = await query2.first({ sessionToken: sessionToken });
      if (found !== null && typeof (found) === 'object') {
        logger.info(`Setting section: ${found.get("section")}`);
        return found.get("section")
      }
    }
  }
  return 'Uncategorized';
}

// Sends push notification.
async function sendPushNotifications(sessions) {
  for (let i = 0; i < sessions.length; i++) {
    const install_id = sessions[i].get('installationId');
    logger.debug(`Install id: ${install_id}`);
    const installQuery = new Parse.Query(Parse.Installation);
    installQuery.equalTo("installationId", sessions[i].get('installationId'));
    const pushData = { where: installQuery, data: { event: "sync" } };
    const options = { useMasterKey: true };
    try {
      await Parse.Push.send(pushData, options);
      logger.debug('Sent push notification');
    }
    catch (error) {
      logger.error('Failed to send push notification');
      logger.error(error);
    }
  }
}

/**
 * Upserts subscriptions with real-time info from Google Play.
 *
 * Accepts a purchase token and user. Returns nothing.
 *
 * @param request.params.purchaseToken
 */
Parse.Cloud.define("activateSubscription", async (request) => {
  var token = request.params.purchaseToken;
  var user = request.user;
  logger.debug("Received request to activate subscription.");
  await refreshSubscription(token, user);
  logger.debug("END OF ACTIVATE");
});

// Refreshes subscription from Google Play.
async function refreshSubscription(token, user) {
  logger.debug("Getting subscription info...");
  const subscriptionInfo = await getSubscriptionInfo(token);
  logger.debug("Finalizing subscription...");
  await finishActivateSubscription(subscriptionInfo, user, token);
  logger.debug("END OF REFRESH");
}

async function finishActivateSubscription(subscriptionInfo, user, token) {
  logger.debug("Trying to save subscription info to Parse with expiry time:");
  logger.debug(subscriptionInfo.expiryTimeMillis);
  if (!subscriptionInfo) {
    return;
  }
  var Subscription = Parse.Object.extend("Subscription");
  var query = new Parse.Query(Subscription);
  query.equalTo("token", token);
  const querySubscription = await query.first();
  let subscription = new Subscription();
  if (typeof querySubscription === 'object') {
    logger.info("Updating existing subscription...");
    subscription = querySubscription;
  }
  else {
    logger.info("Creating new subscription...");
    subscription.set("user", user);
    subscription.set("token", token);
  }
  var expiryTimeMillis = parseInt(subscriptionInfo.expiryTimeMillis);
  var expiryDate = new Date(expiryTimeMillis);
  subscription.set("expiry", expiryDate);
  await subscription.save();
  logger.debug("END OF FINISH");
}

// Returns subscription info for a token.
async function getSubscriptionInfo(token) {
  var clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL || '';
  var privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY.replace(/\\n/g, '\n') || '';
  if (!clientEmail || !privateKey) {
    logger.error("No Google Play client email or private key set.");
    return;
  }
  const { google } = require('googleapis');

  // Create a new JWT client using the key file downloaded from the Google Developer Console
  logger.debug("Attempting to authorize with Google...");
  const client = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/androidpublisher']
  );
  await client.authorize();

  const androidPublisher = google.androidpublisher({
    version: 'v3',
    auth: client
  });

  var params = {
    packageName: 'com.danepowell.honeydew',
    subscriptionId: 'sync',
    token: token
  };

  logger.debug("Attempting to retrieve subscriptions from Google...");
  const res = await androidPublisher.purchases.subscriptions.get(params);
  logger.debug('Received subscription response.');
  logger.debug(res.data);
  logger.debug("END OF GETSUBINFO");
  return res.data;
}

// Checks if subscription is active for calling user account.
Parse.Cloud.define("isActiveSubscription", async (request) => {
  return await isActiveUser(request.user)
});

// Accepts a user and returns true if the user has an active subscription.
async function isActiveUser(user) {
  logger.debug(user);
  const query = new Parse.Query(Parse.Object.extend("Subscription"));
  const currentDate = new Date();
  const cutoffDate = new Date();
  // Give folks a 2-day grace period, in case they've recently renewed and we don't have the updated info yet.
  cutoffDate.setDate(currentDate.getDate() - 2);
  query.equalTo("user", user);
  query.greaterThan("expiry", cutoffDate);
  const subscription = await query.first();
  if (subscription !== null && typeof subscription === 'object') {
    return true;
  }
  return false;
}

// Find all subscriptions expiring soon and see if they have been renewed.
Parse.Cloud.define("updateSubscriptions", async () => {
  // Find all subscriptions expiring soon.
  var Subscription = Parse.Object.extend("Subscription");
  var query = new Parse.Query(Subscription);
  var firstDate = new Date();
  var lastDate = new Date();
  // Look seven days back, two days ahead.
  // TODO: Test what happens if a long-lapsed user re-subscribes.
  firstDate.setDate(firstDate.getDate() - 7);
  lastDate.setDate(lastDate.getDate() + 2);
  query.greaterThan("expiry", firstDate);
  query.lessThan("expiry", lastDate);
  const subscriptions = await query.find();
  // For each subscription about to expire, refresh it from Google Play.
  for (let i = 0; i < subscriptions.length; i++) {
    const subscription = subscriptions[i];
    logger.info(`Found subscription about to expire: ${subscription.id}`);
    // Check if this subscription has been renewed, and activate if so.
    await refreshSubscription(subscription.get("token"), subscription.get("user"));
  }
});

// TODO: delete old installations? If I really want to do this, maybe query for numSent==0 in push statuses. or look for expired subscriptions, or customers with no subscription.
