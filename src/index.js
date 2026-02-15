require('dotenv').config({ path: './config/.env' });

const WebDashboard = require('./web/server.js');

const config = {
    ODDS_API_KEY: process.env.ODDS_API_KEY,
    FOREX_API_URL: process.env.FOREX_API_URL || 'https://api.exchangerate-api.com/v4/latest/USD',
    POLYMARKET_SUBGRAPH: process.env.POLYMARKET_SUBGRAPH || 'https://api.thegraph.com/subgraphs/name/polymarket/matic-markets',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    UPDATE_CRON: process.env.UPDATE_CRON || '0 * * * *',
    MIN_EV_THRESHOLD: process.env.MIN_EV_THRESHOLD || 5,
    SPORTS: process.env.SPORTS || 'tennis,soccer',
    MARKETS: process.env.MARKETS || 'h2h,outrights',
    PORT: process.env.PORT || 3000
};

console.log('🎯 Surebet Detector Starting...');
console.log('Sports:', config.SPORTS);
console.log('Markets:', config.MARKETS);
console.log('Min EV:', config.MIN_EV_THRESHOLD + '%');

const dashboard = new WebDashboard(config);

// Start server if not in serverless environment
if (process.env.VERCEL !== '1') {
    dashboard.start();
}

// Export for Vercel serverless
module.exports = dashboard.app;
