/**
 * HTTP Server
 */

import express from 'express';
import { ArbitrageDetector } from './detector.js';
import { metrics } from './utils/metrics.js';

export function createServer(detector: ArbitrageDetector, metricsObj: typeof metrics) {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: detector.getStats()
    });
  });

  app.get('/ready', (req, res) => {
    const stats = detector.getStats();
    res.status(stats.isRunning ? 200 : 503).json({
      ready: stats.isRunning,
      stats
    });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsObj.register.contentType);
    res.end(await metricsObj.register.metrics());
  });

  app.get('/api/opportunities', async (req, res) => {
    const opportunities = await detector.getActiveOpportunities();
    res.json(opportunities);
  });

  return app;
}