/**
 * HTTP Server for Health Checks and Metrics
 */

import express from 'express';
import { OddsCollector } from './collector.js';
import { metrics } from './utils/metrics.js';

export function createServer(collector: OddsCollector, metricsObj: typeof metrics) {
  const app = express();

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    const stats = collector.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats
    });
  });

  // Readiness check
  app.get('/ready', (req, res) => {
    const stats = collector.getStats();
    const isReady = stats.isRunning && stats.bookmakers > 0;
    
    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      stats
    });
  });

  // Metrics endpoint for Prometheus
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsObj.register.contentType);
    res.end(await metricsObj.register.metrics());
  });

  // API endpoints
  app.get('/api/bookmakers', (req, res) => {
    res.json(collector.getBookmakers());
  });

  app.get('/api/stats', (req, res) => {
    res.json(collector.getStats());
  });

  return app;
}