/**
 * @fileoverview Surebet Detector - Main entry point
 * @description Arbitrage and +EV detection across sportsbooks and prediction markets
 * @module surebet-detector/index
 */

require('dotenv').config({ path: './config/.env' });

const WebDashboard = require('./web/server.js');
const { createLoggerWithAudit, LogLevel } = require('./logger.js');
const { ProxyRotationManager, ProxyPoolBuilder, BookmakerProxySelector } = require('./proxy-rotation.js');

// Global logger instance
let logger, audit, debug;

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
  // Initialize logger first
  const logLevel = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : 
                   process.env.LOG_LEVEL === 'trace' ? LogLevel.TRACE :
                   process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
  
  ({ logger, audit, debug } = createLoggerWithAudit({
    level: logLevel,
    logDir: process.env.LOG_DIR || './logs',
    structured: true,
    console: true,
    file: true
  }));

  logger.info('🎯 Surebet Detector Starting...', { category: 'startup' });
  
  let config;
  try {
    config = loadConfig();
    logger.info('Configuration loaded successfully', { 
      category: 'config',
      sports: config.SPORTS,
      markets: config.MARKETS,
      minEv: config.MIN_EV_THRESHOLD,
      port: config.PORT,
      updateCron: config.UPDATE_CRON
    });
  } catch (err) {
    logger.error('Failed to load configuration', { error: err.message, category: 'config' });
    process.exit(1);
  }
  
  // Log configuration
  console.log('Configuration:');
  console.log(`  Sports: ${config.SPORTS}`);
  console.log(`  Markets: ${config.MARKETS}`);
  console.log(`  Min EV: ${config.MIN_EV_THRESHOLD}%`);
  console.log(`  Port: ${config.PORT}`);
  console.log(`  Update cron: ${config.UPDATE_CRON}`);
  console.log();
  
  let dashboard;
  let proxyManager;
  
  try {
    dashboard = new WebDashboard(config, { logger, audit, debug });
    logger.info('Dashboard initialized', { category: 'startup' });
  } catch (err) {
    logger.error('Failed to initialize dashboard', { error: err.message, category: 'startup' });
    process.exit(1);
  }
  
  // Initialize proxy rotation manager
  try {
    proxyManager = new ProxyRotationManager({
      rotationStrategy: process.env.PROXY_ROTATION_STRATEGY || 'round_robin',
      rotationInterval: parseInt(process.env.PROXY_ROTATION_INTERVAL) || 300000,
      healthCheckInterval: parseInt(process.env.PROXY_HEALTH_CHECK_INTERVAL) || 60000,
      maxFailures: parseInt(process.env.PROXY_MAX_FAILURES) || 3,
      enableRotation: process.env.ENABLE_PROXY_ROTATION !== 'false',
      enableHealthChecks: process.env.ENABLE_PROXY_HEALTH_CHECKS !== 'false'
    });
    
    // Load proxies from environment if configured
    if (process.env.PROXY_CONFIG) {
      try {
        const proxyConfigs = JSON.parse(process.env.PROXY_CONFIG);
        proxyManager.loadFromConfig(proxyConfigs);
        logger.info(`Loaded ${proxyConfigs.length} proxies from configuration`, { category: 'proxy' });
      } catch (parseErr) {
        logger.warn('Failed to parse PROXY_CONFIG, starting with empty pool', { 
          error: parseErr.message,
          category: 'proxy' 
        });
      }
    }
    
    // Start proxy manager
    proxyManager.start();
    
    // Log proxy pool status
    const poolSummary = proxyManager.getPoolSummary();
    logger.info('Proxy rotation manager initialized', { 
      category: 'startup',
      proxyCount: poolSummary.total,
      strategy: proxyManager.config.rotationStrategy
    });
    
    console.log(`  Proxy Rotation: ${poolSummary.total} proxies (${proxyManager.config.rotationStrategy})`);
    
    // Attach to dashboard for API access
    dashboard.proxyManager = proxyManager;
    dashboard.bookmakerProxySelector = new BookmakerProxySelector(proxyManager);
    
  } catch (err) {
    logger.warn('Failed to initialize proxy rotation manager', { 
      error: err.message, 
      category: 'startup' 
    });
    console.log('  Proxy Rotation: disabled (error)');
  }
  
  // Start server if not in serverless environment
  if (process.env.VERCEL !== '1') {
    try {
      await dashboard.start();
      logger.info('Server started successfully', { category: 'startup', port: config.PORT });
      console.log('\n✅ Server started successfully');
    } catch (err) {
      logger.error('Failed to start server', { error: err.message, category: 'startup' });
      process.exit(1);
    }
  } else {
    logger.info('Running in serverless mode (Vercel)', { category: 'startup' });
    console.log('\nℹ️  Running in serverless mode (Vercel)');
  }
  
  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...', { category: 'shutdown' });
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    await audit.record('SHUTDOWN', { reason: 'SIGTERM', timestamp: new Date().toISOString() });
    if (proxyManager) {
      proxyManager.stop();
      logger.info('Proxy manager stopped', { category: 'shutdown' });
    }
    if (dashboard.stop) {
      await dashboard.stop();
    }
    await logger.shutdown();
    await audit.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...', { category: 'shutdown' });
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    await audit.record('SHUTDOWN', { reason: 'SIGINT', timestamp: new Date().toISOString() });
    if (proxyManager) {
      proxyManager.stop();
      logger.info('Proxy manager stopped', { category: 'shutdown' });
    }
    if (dashboard.stop) {
      await dashboard.stop();
    }
    await logger.shutdown();
    await audit.shutdown();
    process.exit(0);
  });
  
  // Record startup in audit trail
  await audit.record('STARTUP', { 
    version: require('../package.json').version,
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    timestamp: new Date().toISOString()
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

// Export for Vercel serverless - must export app directly, not a Promise
let appInstance = null;

// Initialize immediately for serverless
main().then(dashboard => {
  appInstance = dashboard?.app;
}).catch(err => {
  console.error('Initialization error:', err);
});

// Export a function that Vercel can call
module.exports = (req, res) => {
  if (appInstance) {
    return appInstance(req, res);
  }
  res.status(503).json({ error: 'Server initializing, please retry' });
};
