'use strict'

const app = require('./app');

(async () => {
    app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running!');
})();