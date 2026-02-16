/**
 * @fileoverview Surebet Detector - Main entry point
 * @description Arbitrage and +EV detection across sportsbooks and prediction markets
 * @module surebet-detector/index
 */

require('dotenv').config({ path: './config/.env' });

const WebDashboard = require('./web/server.js');

/**
 * Validates configuration values
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // Required for full functionality
  if (!config.ODDS_API_KEY) {
    warnings.push('ODDS_API_KEY not set - odds fetching will be limited');
  }
  
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    warnings.push('Telegram not configured - notifications disabled');
  }
  
  // Validate numeric values
  if (isNaN(config.MIN_EV_THRESHOLD) || config.MIN_EV_THRESHOLD < 0) {
    errors.push('MIN_EV_THRESHOLD must be a positive number');
  }
  
  if (isNaN(config.PORT) || config.PORT < 1 || config.PORT > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }
  
  // Validate sports/markets format
  if (!config.SPORTS || typeof config.SPORTS !== 'string') {
    errors.push('SPORTS must be a comma-separated string');
  }
  
  if (!config.MARKETS || typeof config.MARKETS !== 'string') {
    errors.push('MARKETS must be a comma-separated string');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Loads and validates configuration from environment
 * @returns {Object} Configuration object
 * @throws {Error} If configuration is invalid
 */
function loadConfig() {
  const config = {
    ODDS_API_KEY: process.env.ODDS_API_KEY,
    FOREX_API_URL: process.env.FOREX_API_URL || 'https://api.exchangerate-api.com/v4/latest/USD',
    POLYMARKET_SUBGRAPH: process.env.POLYMARKET_SUBGRAPH || 'https://api.thegraph.com/subgraphs/name/polymarket/matic-markets',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    UPDATE_CRON: process.env.UPDATE_CRON || '0 * * * *',
    MIN_EV_THRESHOLD: parseFloat(process.env.MIN_EV_THRESHOLD) || 5,
    SPORTS: process.env.SPORTS || 'tennis,soccer',
    MARKETS: process.env.MARKETS || 'h2h',
    PORT: parseInt(process.env.PORT, 10) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  const validation = validateConfig(config);
  
  if (!validation.valid) {
    throw new Error(`Configuration errors:\n${validation.errors.join('\n')}`);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    validation.warnings.forEach(w => console.warn(`   - ${w}`));
  }
  
  return config;
}

// Main execution
async function main() {
  console.log('🎯 Surebet Detector Starting...\n');
  
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('❌ Failed to load configuration:', err.message);
    process.exit(1);
  }
  
  console.log('Configuration:');
  console.log(`  Sports: ${config.SPORTS}`);
  console.log(`  Markets: ${config.MARKETS}`);
  console.log(`  Min EV: ${config.MIN_EV_THRESHOLD}%`);
  console.log(`  Port: ${config.PORT}`);
  console.log(`  Update cron: ${config.UPDATE_CRON}`);
  console.log();
  
  let dashboard;
  try {
    dashboard = new WebDashboard(config);
  } catch (err) {
    console.error('❌ Failed to initialize dashboard:', err.message);
    process.exit(1);
  }
  
  // Start server if not in serverless environment
  if (process.env.VERCEL !== '1') {
    try {
      await dashboard.start();
      console.log('\n✅ Server started successfully');
    } catch (err) {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    }
  } else {
    console.log('\nℹ️  Running in serverless mode (Vercel)');
  }
  
  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    if (dashboard.stop) {
      await dashboard.stop();
    }
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    if (dashboard.stop) {
      await dashboard.stop();
    }
    process.exit(0);
  });
  
  return dashboard;
}

// Run main if not being imported
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}

// Export for Vercel serverless
module.exports = main().then(dashboard => dashboard?.app).catch(err => {
  console.error('Export error:', err);
  return null;
});
