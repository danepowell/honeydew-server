# Honeydew Server

Serves the Honeydew backend application using the [parse-server](https://github.com/ParsePlatform/parse-server) module on Express.

Originally based on parse-server-example.

Read the full Parse Server guide here: https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide

### For remote deployment

Install Serverless:
`npm install -g serverless`

Create .env.yml with credentials and environment variables.

Run `serverless deploy –stage development`

Logs `serverless logs –stage development –function api -t`

### For Local Development

* Make sure you are using the node and npm versions defined in package.json.
* Clone this repo and change directory to it.
* `npm install`
* Create .env file with environmental variables
* Run `npm run start-dev`

To use local mongo:
* Install mongo locally using http://docs.mongodb.org/master/tutorial/install-mongodb-on-os-x/
* Run `mongo` to connect to your database, just to make sure it's working. Once you see a mongo prompt, exit with Control-D

## Other Honeydew components

You can build the Android client, but it won't be super interesting on its own. The real magic is in the syncing with other devices and services, which require other components:

- [Honeydew Android](https://github.com/danepowell/honeydew-android)
- [Honeydew Server](https://github.com/danepowell/honeydew-server)
- [Honeydew for Google Assistant](https://github.com/danepowell/honeydew-google)
- [Honeydew for Alexa](https://github.com/danepowell/honeydew-alexa)

## Contributions

Contributions are welcome! Sorry, the documentation is pretty poor, I never intended this to be open source. PRs welcome!