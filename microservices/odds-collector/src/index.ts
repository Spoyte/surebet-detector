/**
 * Odds Collector Service
 * 
 * This microservice is responsible for:
 * - Connecting to bookmaker APIs (REST and WebSocket)
 * - Collecting odds data in real-time
 * - Normalizing and validating odds data
 * - Publishing normalized odds to message queue
 * - Managing bookmaker connections and health
 */

import { createServer } from './server.js';
import { OddsCollector } from './collector.js';
import { MessageQueue } from './queue.js';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';

const PORT = parseInt(process.env.PORT || '3001');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

async function main() {
  logger.info('Starting Odds Collector Service');

  // Initialize message queue
  const queue = new MessageQueue(RABBITMQ_URL);
  await queue.connect();
  logger.info('Connected to message queue');

  // Initialize odds collector
  const collector = new OddsCollector({
    redisUrl: REDIS_URL,
    queue,
    metrics
  });

  // Register bookmakers
  await registerBookmakers(collector);

  // Start collecting
  await collector.start();
  logger.info('Odds collector started');

  // Start HTTP server for health checks and metrics
  const app = createServer(collector, metrics);
  const server = app.listen(PORT, () => {
    logger.info(`Odds Collector API listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    
    server.close(() => {
      logger.info('HTTP server closed');
    });

    await collector.stop();
    await queue.disconnect();
    
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function registerBookmakers(collector: OddsCollector) {
  const bookmakers = [
    {
      id: 'pinnacle',
      name: 'Pinnacle',
      type: 'rest' as const,
      endpoint: 'https://api.pinnacle.com/v2/odds',
      rateLimitMs: 1000,
      apiKey: process.env.API_KEY_PINNACLE,
      weight: 10,
      enabled: !!process.env.API_KEY_PINNACLE
    },
    {
      id: 'betfair',
      name: 'Betfair Exchange',
      type: 'websocket' as const,
      wsEndpoint: 'wss://stream-api.betfair.com',
      restEndpoint: 'https://api.betfair.com/exchange/betting/rest/v1.0/',
      rateLimitMs: 200,
      apiKey: process.env.API_KEY_BETFAIR,
      weight: 9,
      enabled: !!process.env.API_KEY_BETFAIR
    },
    {
      id: 'unibet',
      name: 'Unibet',
      type: 'rest' as const,
      endpoint: 'https://eu-offering-api.kambicdn.com/offering/v2018/ub',
      rateLimitMs: 500,
      apiKey: process.env.API_KEY_UNIBET,
      weight: 7,
      enabled: !!process.env.API_KEY_UNIBET
    },
    {
      id: 'betclic',
      name: 'Betclic',
      type: 'rest' as const,
      endpoint: 'https://www.betclic.fr/api/odds',
      rateLimitMs: 1000,
      apiKey: process.env.API_KEY_BETCLIC,
      weight: 6,
      enabled: !!process.env.API_KEY_BETCLIC
    },
    {
      id: 'winamax',
      name: 'Winamax',
      type: 'rest' as const,
      endpoint: 'https://www.winamax.fr/api/odds',
      rateLimitMs: 1000,
      apiKey: process.env.API_KEY_WINAMAX,
      weight: 6,
      enabled: !!process.env.API_KEY_WINAMAX
    },
    {
      id: 'cloudbet',
      name: 'Cloudbet',
      type: 'rest' as const,
      endpoint: 'https://www.cloudbet.com/api/odds',
      rateLimitMs: 1000,
      apiKey: process.env.API_KEY_CLOUDBET,
      weight: 8,
      enabled: !!process.env.API_KEY_CLOUDBET
    },
    {
      id: 'smarkets',
      name: 'Smarkets',
      type: 'websocket' as const,
      wsEndpoint: 'wss://api.smarkets.com/v3/stream',
      restEndpoint: 'https://api.smarkets.com/v3/',
      rateLimitMs: 200,
      apiKey: process.env.API_KEY_SMARKETS,
      weight: 8,
      enabled: !!process.env.API_KEY_SMARKETS
    }
  ];

  for (const config of bookmakers) {
    if (config.enabled) {
      await collector.registerBookmaker(config);
      logger.info(`Registered bookmaker: ${config.name}`);
    } else {
      logger.debug(`Skipped bookmaker ${config.name} (no API key)`);
    }
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});