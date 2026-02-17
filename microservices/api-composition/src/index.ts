/**
 * API Composition Layer
 * 
 * Aggregates data from multiple microservices to provide
 * unified, client-optimized API endpoints.
 * 
 * This reduces the number of requests clients need to make
 * and provides a more convenient data structure for UI consumption.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';
import { serviceClient } from './utils/service-client.js';
import { compositionRoutes } from './routes/composition.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { analyticsRoutes } from './routes/analytics.js';
import { userRoutes } from './routes/user.js';

const PORT = parseInt(process.env.PORT || '3006');
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '30'); // seconds

// Initialize cache
export const cache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 120,
  useClones: false
});

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(compression());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many requests' });
  }
});
app.use(limiter);

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.httpRequests.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
    metrics.httpDuration.observe({
      method: req.method,
      route: req.route?.path || req.path
    }, duration / 1000);
  });
  next();
});

// Cache middleware
export const cacheMiddleware = (keyPrefix: string, ttl: number = CACHE_TTL) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${keyPrefix}:${req.originalUrl}`;
    const cached = cache.get(key);
    
    if (cached) {
      metrics.cacheHits.inc({ key: keyPrefix });
      res.json(cached);
      return;
    }
    
    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode === 200) {
        cache.set(key, body, ttl);
        metrics.cacheSets.inc({ key: keyPrefix });
      }
      return originalJson(body);
    };
    
    next();
  };
};

// Health check
app.get('/health', async (req, res) => {
  const health = await serviceClient.checkHealth();
  const allHealthy = Object.values(health.services).every(s => s === 'healthy');
  res.status(allHealthy ? 200 : 503).json(health);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Routes
app.use('/api/composite', compositionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/user', userRoutes);

// Cache stats endpoint (admin)
app.get('/admin/cache-stats', (req, res) => {
  res.json({
    keys: cache.keys(),
    stats: cache.getStats(),
    keyCount: cache.keys().length
  });
});

// Clear cache endpoint (admin)
app.post('/admin/clear-cache', (req, res) => {
  cache.flushAll();
  res.json({ message: 'Cache cleared' });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    requestId: req.headers['x-request-id']
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  logger.info(`API Composition Layer listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  cache.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  cache.close();
  process.exit(0);
});
