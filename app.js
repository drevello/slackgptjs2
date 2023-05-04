const { App, LogLevel, ExpressReceiver } = require('@slack/bolt');
const { askAnything, whichAction } = require('./controllers/openai.js');
require('dotenv').config();

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  logLevel: LogLevel.DEBUG,
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
});

// Log when the app is starting
console.log('Starting the app...');

app.message(async ({ message, say }) => {
  console.log("Received message: ", message);
  const action = await whichAction(message.text);
  console.log("Action: ", action);

  if (action.trim() === 'Ask Anything') {
    const result = await askAnything(message.text);
    console.log("Result: ", result);
    await say(result);
  } else {
    console.log("Default message");
    await say(`I am here to answer your questions. Please ask me anything.`);
  }
});

app.error(error => {
  console.error(error);
});

// Add these lines at the end of your app.js
const port = process.env.PORT || 3000;
expressReceiver.app.listen(port, () => {
  console.log(`Slack app is running on port ${port}!`);
});

// Log when the app has started
console.log('App has started!');
module.exports = app;
