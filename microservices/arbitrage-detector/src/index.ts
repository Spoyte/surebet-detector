/**
 * Arbitrage Detector Service
 * 
 * This microservice is responsible for:
 * - Consuming odds updates from message queue
 * - Detecting arbitrage opportunities across bookmakers
 * - Calculating optimal stake distribution
 * - Publishing opportunities to notification service
 */

import { createServer } from './server.js';
import { ArbitrageDetector } from './detector.js';
import { MessageQueue } from './queue.js';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';

const PORT = parseInt(process.env.PORT || '3002');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const MIN_PROFIT_PERCENT = parseFloat(process.env.MIN_PROFIT_PERCENT || '1.0');

async function main() {
  logger.info('Starting Arbitrage Detector Service');

  // Initialize message queue
  const queue = new MessageQueue(RABBITMQ_URL);
  await queue.connect();
  logger.info('Connected to message queue');

  // Initialize detector
  const detector = new ArbitrageDetector({
    redisUrl: REDIS_URL,
    queue,
    metrics,
    minProfitPercent: MIN_PROFIT_PERCENT
  });

  await detector.start();
  logger.info('Arbitrage detector started');

  // Start HTTP server
  const app = createServer(detector, metrics);
  const server = app.listen(PORT, () => {
    logger.info(`Arbitrage Detector API listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    
    server.close(() => {
      logger.info('HTTP server closed');
    });

    await detector.stop();
    await queue.disconnect();
    
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});