const { App, LogLevel } = require('@slack/bolt');
const { askAnything, whichAction } = require('./controllers/openai.js');
require('dotenv').config();

console.log(askAnything)

const app = new App({
  logLevel: LogLevel.DEBUG,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN
});

app.message(async ({ message, say }) => {
  const action = await whichAction(message.text);
  console.log(action);

  if (action.trim() === 'Ask Anything') {
    const result = await askAnything(message.text);
    await say(result);
  } else {
    await say(`I am here to answer your questions. Please ask me anything.`);
  }
});

app.error(error => {
  console.error(error);
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Slack app is running!');
})();
