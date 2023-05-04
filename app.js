const { App, LogLevel, ExpressReceiver } = require('@slack/bolt');
const { Configuration, OpenAIApi } = require("openai");
const axios = require('axios');
const tokenizer = require('tokenizer');

function truncateToTokens(text, maxTokens) {
    const tokens = tokenizer.tokenize(text);

    if (tokens.length <= maxTokens) {
        return text;
    }

    return tokens.slice(0, maxTokens).join(' ');
}

require('dotenv').config();

const maxTokensResponse = 4040
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let conversationHistory = [];

const getContent = "https://bombora-partners.atlassian.net/wiki/rest/api/content/{}?expand=body.storage";
const getPages = "https://bombora-partners.atlassian.net/wiki/rest/api/content/search?cql={}";

const temperature =  0.2;

const headers = {
  "Content-Type": "application/json",
};

const promptBeautify = `As an expert communication bot You need to improve the following answer.

Question: {0}
Answer: {1}
Improved answer:
`;

const cqlPrompt = `Given you are a confluence search expert and part of the customer support team,
I want to transform the following user question into a proper cql to find the best result possible,
please extract the most importants keys from the text and ignore formatting requests identifying the important content in the question.
try to reduce the cql as much as possible keeping only the core imformation they want from the API documentation
When keywords are not that important you can use OR operators.
{1}
Ignore specific requests related to formatting, code, programming languages:


Q: How do I create a new surge report?
A: text%20~%20%22create%22%20AND%20text%20~%20%22new%22%20AND%20text%20~%20%22surge%20report%22
Q: How do I create a new surge report? please provide an example in python code
A: text%20~%20%22create%22%20AND%20text%20~%20%22new%22%20AND%20text%20~%20%22surge%20report%22
Q: How do I create a new surge report? please provide an example in curl
A: text%20~%20%22create%22%20AND%20text%20~%20%22new%22%20AND%20text%20~%20%22surge%20report%22
Q: how can I get the results of an existing surge report
A: text%20~%20%22surge%22%20AND%20text%20~%20%22results%22
Q: can you give me a curl request to get the results of an existing surge report
A: text%20~%20%22surge%22%20AND%20text%20~%20%22results%22
Q: {0}
A: `;

const choosePage = `As a customer support expert you need to choose the confluence page that is more likely to provide the correct answer.
You need to do the selection by title, from the array with json objects which represents confluence pages.
You have to answer the id for the given question on the following pages list:

{0}

Q: {1}
ID: `;

const responsePrompt = `given you are a customer success expert, I want to respond the following question '{0}',
using the following information:

{1}

`;

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  logLevel: LogLevel.DEBUG,
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
});

// Log when the app is starting

app.message(async ({ message, say }) => {
  say(`<@${message.user}> Give me just one second...`)
  let response = '';
  const q = message.text;
  try {

    conversationHistory.push({ role: "user", content: cqlPrompt.replace('{0}', q).replace('{1}', '') });

    const cqlQueryResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0301",
      messages: conversationHistory,
      max_tokens: 150,
      temperature,
    });
    const cqlQuery = cqlQueryResponse.data.choices[0].message.content.trim();
    conversationHistory.push(cqlQueryResponse.data.choices[0].message);
    let responsePages = await axios.get(getPages.replace('{}', cqlQuery), { headers });

    if (!responsePages.data.results.length) {
      conversationHistory.pop();
      conversationHistory.pop();
      conversationHistory.push({ role: "user", content: cqlPrompt.replace('{0}', q).replace('{1}', `Consider the following "${cqlQuery}" FAILED so it has to be more concise. Remove any programming language from the CQL like(nodejs, python, C#, java, ruby)`) });
      const cqlQueryResponseRetry = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-0301",
        messages: conversationHistory,
        max_tokens: 150,
        temperature,
      });

      const cqlQueryRetry = cqlQueryResponseRetry.data.choices[0].message.content.trim();
      conversationHistory.push(cqlQueryResponseRetry.data.choices[0].message);

      responsePages = await axios.get(getPages.replace('{}', cqlQueryRetry), { headers });

    }
    conversationHistory.push({ role: "user", content: choosePage.replace('{0}', JSON.stringify(responsePages.data.results, null, 4)).replace('{1}', q) });
    const pageIdResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0301",
      messages: conversationHistory,
      max_tokens: 150,
      temperature,
    });
    const pageId = pageIdResponse.data.choices[0].message.content.trim();
    conversationHistory.push(pageIdResponse.data.choices[0].message);
    const responsePage = await axios.get(getContent.replace('{}', pageId), { headers });
    try {
      conversationHistory = [];
      conversationHistory.push({ role: "user", content: truncateToTokens(responsePrompt.replace('{0}', q).replace('{1}', responsePage.data.body.storage.value), maxTokensResponse) });
      response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-0301",
        messages: conversationHistory,
        max_tokens: 500,
        temperature,
      });

      conversationHistory.push(response.data.choices[0].message);
    } catch (e) {
      conversationHistory.pop();
      conversationHistory.push({ role: "user", content: truncateToTokens(`Reply to <@${message.user}> that his question '${q}', can find an answer in the following documentation link https://bombora-partners.atlassian.net/wiki/spaces/DOC/pages/${pageId}`, maxTokensResponse) });
      response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-0301",
        messages: conversationHistory,
        max_tokens: 500,
        temperature,
      });
    }

    // Reset the conversation history
  } catch (error) {
    conversationHistory = [];
    response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0301",
      messages: [{ role: "user", content: truncateToTokens(`Reply to <@${message.user}> that his question '${q}', can find an answer in the following documentation link https://bombora-partners.atlassian.net/wiki/spaces/DOC/pages/524307/API+Documentation`, maxTokensResponse) }],
      max_tokens: 500,
      temperature,
    });
  }
  conversationHistory.push(response.data.choices[0].message);
  say(response.data.choices[0].message.content)
  // Reset the conversation history
  conversationHistory = [];
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
