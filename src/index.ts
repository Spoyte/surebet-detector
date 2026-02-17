import OddsAggregationEngine, { BookmakerConfig } from './odds-aggregation-engine.js';
import { createServer } from './web/server.js';
import logger from './utils/logger.js';
import { metricsMiddleware, register } from './utils/metrics.js';

/**
 * Surebet Detector - Real-time Odds Aggregation Service
 * 
 * This is the main entry point for the high-performance odds aggregation
 * engine that collects and normalizes odds from 50+ bookmakers.
 */

// Bookmaker configurations
const BOOKMAKERS: BookmakerConfig[] = [
  {
    id: 'pinnacle',
    name: 'Pinnacle',
    restEndpoint: 'https://api.pinnacle.com/v2/odds',
    rateLimitMs: 1000,
    weight: 10,
    supportedSports: ['soccer', 'tennis', 'basketball', 'baseball', 'hockey', 'esports'],
    supportedMarkets: ['h2h', 'spreads', 'totals', 'moneyline']
  },
  {
    id: 'betfair',
    name: 'Betfair Exchange',
    wsEndpoint: 'wss://stream-api.betfair.com',
    restEndpoint: 'https://api.betfair.com/exchange/betting/rest/v1.0/',
    rateLimitMs: 200,
    weight: 9,
    supportedSports: ['soccer', 'tennis', 'basketball', 'horse_racing', 'cricket'],
    supportedMarkets: ['h2h', 'lay', 'back']
  },
  {
    id: 'unibet',
    name: 'Unibet',
    restEndpoint: 'https://eu-offering-api.kambicdn.com/offering/v2018/ub',
    rateLimitMs: 500,
    weight: 7,
    supportedSports: ['soccer', 'tennis', 'basketball', 'hockey', 'american_football'],
    supportedMarkets: ['h2h', 'totals', 'spreads']
  },
  {
    id: 'betclic',
    name: 'Betclic',
    restEndpoint: 'https://www.betclic.fr/api/odds',
    rateLimitMs: 1000,
    weight: 6,
    supportedSports: ['soccer', 'tennis', 'basketball', 'rugby'],
    supportedMarkets: ['h2h', 'totals']
  },
  {
    id: 'winamax',
    name: 'Winamax',
    restEndpoint: 'https://www.winamax.fr/api/odds',
    rateLimitMs: 1000,
    weight: 6,
    supportedSports: ['soccer', 'tennis', 'basketball', 'esports'],
    supportedMarkets: ['h2h', 'totals', 'handicap']
  },
  {
    id: 'fdj',
    name: 'Française des Jeux',
    restEndpoint: 'https://www.fdj.fr/api/odds',
    rateLimitMs: 2000,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball'],
    supportedMarkets: ['h2h']
  },
  {
    id: 'parionsport',
    name: 'ParionsSport',
    restEndpoint: 'https://www.parionssport.fdj.fr/api/odds',
    rateLimitMs: 2000,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball', 'rugby'],
    supportedMarkets: ['h2h', 'totals']
  },
  {
    id: 'zebet',
    name: 'ZEbet',
    restEndpoint: 'https://www.zebet.fr/api/odds',
    rateLimitMs: 1500,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball'],
    supportedMarkets: ['h2h', 'handicap']
  },
  {
    id: 'cloudbet',
    name: 'Cloudbet',
    restEndpoint: 'https://www.cloudbet.com/api/odds',
    rateLimitMs: 1000,
    weight: 8,
    supportedSports: ['soccer', 'tennis', 'basketball', 'esports', 'crypto'],
    supportedMarkets: ['h2h', 'totals', 'spreads']
  },
  {
    id: 'smarkets',
    name: 'Smarkets',
    wsEndpoint: 'wss://api.smarkets.com/v3/stream',
    restEndpoint: 'https://api.smarkets.com/v3/',
    rateLimitMs: 200,
    weight: 8,
    supportedSports: ['soccer', 'tennis', 'basketball', 'horse_racing', 'politics'],
    supportedMarkets: ['h2h', 'lay', 'back']
  }
];

async function main() {
  logger.info('Starting Surebet Detector - Odds Aggregation Engine');

  // Initialize the aggregation engine
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const engine = new OddsAggregationEngine(redisUrl);

  // Register event handlers
  engine.on('engine:started', () => {
    logger.info('Odds aggregation engine started');
  });

  engine.on('engine:stopped', () => {
    logger.info('Odds aggregation engine stopped');
  });

  engine.on('bookmaker:registered', (config) => {
    logger.info(`Registered bookmaker: ${config.name} (${config.id})`);
  });

  engine.on('bookmaker:connected', ({ id, type }) => {
    logger.info(`Bookmaker connected: ${id} (${type})`);
  });

  engine.on('bookmaker:disconnected', ({ id, reason }) => {
    logger.warn(`Bookmaker disconnected: ${id} (${reason})`);
  });

  engine.on('odds:updated', ({ bookmaker, count }) => {
    logger.debug(`Received ${count} odds updates from ${bookmaker}`);
  });

  engine.on('odds:aggregated', (data) => {
    logger.debug(`Aggregated odds for event: ${data.eventId}`);
  });

  engine.on('error', ({ source, bookmaker, error }) => {
    logger.error(`Error from ${source}${bookmaker ? ` (${bookmaker})` : ''}:`, error);
  });

  // Register all bookmakers
  for (const config of BOOKMAKERS) {
    // Skip if API key not available (would be set in env)
    if (process.env[`API_KEY_${config.id.toUpperCase()}`]) {
      config.apiKey = process.env[`API_KEY_${config.id.toUpperCase()}`];
    }
    engine.registerBookmaker(config);
  }

  // Start the engine
  await engine.start();

  // Start web server for API access
  const port = parseInt(process.env.PORT || '3000');
  const app = createServer(engine);
  
  app.listen(port, () => {
    logger.info(`API server listening on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await engine.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await engine.stop();
    process.exit(0);
  });

  // Periodic stats logging
  setInterval(() => {
    const stats = engine.getStats();
    logger.info('Engine stats:', stats);
    
    // Update Prometheus metrics
    register.metrics().then((metrics) => {
      // Metrics are automatically updated via the metrics module
    });
  }, 60000); // Every minute
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
