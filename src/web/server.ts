import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import type OddsAggregationEngine from '../odds-aggregation-engine.js';
import logger from '../utils/logger.js';
import { register } from '../utils/metrics.js';

/**
 * Express server for API endpoints
 */

export function createServer(engine: OddsAggregationEngine): express.Application {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    const stats = engine.getStats();
    res.json({
      status: stats.isRunning ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      stats
    });
  });

  // Metrics endpoint for Prometheus
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Get all active events with aggregated odds
  app.get('/api/events', async (req, res) => {
    try {
      const events = await engine.getAllEvents();
      res.json({
        count: events.length,
        events
      });
    } catch (error) {
      logger.error('Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // Get aggregated odds for a specific event
  app.get('/api/events/:eventId', async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await engine.getEventOdds(eventId);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      res.json(event);
    } catch (error) {
      logger.error('Error fetching event:', error);
      res.status(500).json({ error: 'Failed to fetch event' });
    }
  });

  // Get bookmaker health status
  app.get('/api/bookmakers/health', (req, res) => {
    const health = engine.getBookmakerHealth();
    res.json({
      count: health.length,
      bookmakers: health
    });
  });

  // Get engine statistics
  app.get('/api/stats', (req, res) => {
    const stats = engine.getStats();
    res.json(stats);
  });

  // WebSocket upgrade endpoint for real-time odds streaming
  app.get('/api/stream', (req, res) => {
    res.json({
      message: 'WebSocket streaming available at ws://localhost:3001/stream',
      documentation: 'Connect via WebSocket to receive real-time odds updates'
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
