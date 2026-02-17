/**
 * API Gateway
 * 
 * Entry point for all client requests. Handles:
 * - Authentication and authorization
 * - Rate limiting
 * - Request routing to microservices
 * - Response aggregation
 * - Caching
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';
import { authMiddleware } from './middleware/auth.js';

const PORT = parseInt(process.env.PORT || '3000');

// Service URLs
const SERVICES = {
  oddsCollector: process.env.ODDS_COLLECTOR_URL || 'http://localhost:3001',
  arbitrageDetector: process.env.ARBITRAGE_DETECTOR_URL || 'http://localhost:3002',
  userManagement: process.env.USER_MANAGEMENT_URL || 'http://localhost:3003',
  notificationService: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
  analyticsService: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3005'
};

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many requests' });
  }
});
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

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

// Health check (no auth required)
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {} as Record<string, string>
  };

  // Check all services
  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const response = await fetch(`${url}/health`, { timeout: 5000 } as any);
      health.services[name] = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      health.services[name] = 'unreachable';
    }
  }

  const allHealthy = Object.values(health.services).every(s => s === 'healthy');
  res.status(allHealthy ? 200 : 503).json(health);
});

// Metrics endpoint (no auth required)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Auth routes (stricter rate limit)
app.use('/api/auth', authLimiter, createProxyMiddleware({
  target: SERVICES.userManagement,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/auth' }
}));

// Protected routes
app.use(authMiddleware);

// Odds Collector routes
app.use('/api/odds', createProxyMiddleware({
  target: SERVICES.oddsCollector,
  changeOrigin: true,
  pathRewrite: { '^/api/odds': '/api' }
}));

// Arbitrage Detector routes
app.use('/api/opportunities', createProxyMiddleware({
  target: SERVICES.arbitrageDetector,
  changeOrigin: true,
  pathRewrite: { '^/api/opportunities': '/api/opportunities' }
}));

// User Management routes
app.use('/api/users', createProxyMiddleware({
  target: SERVICES.userManagement,
  changeOrigin: true,
  pathRewrite: { '^/api/users': '/api/users' }
}));

// Notification routes
app.use('/api/notifications', createProxyMiddleware({
  target: SERVICES.notificationService,
  changeOrigin: true,
  pathRewrite: { '^/api/notifications': '/api' }
}));

// Analytics routes
app.use('/api/analytics', createProxyMiddleware({
  target: SERVICES.analyticsService,
  changeOrigin: true,
  pathRewrite: { '^/api/analytics': '/api' }
}));

// Aggregate endpoint - combines data from multiple services
app.get('/api/dashboard', async (req, res) => {
  try {
    const [opportunities, stats] = await Promise.all([
      fetch(`${SERVICES.arbitrageDetector}/api/opportunities`).then(r => r.json()).catch(() => []),
      fetch(`${SERVICES.oddsCollector}/api/stats`).then(r => r.json()).catch(() => ({}))
    ]);

    res.json({
      opportunities,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error aggregating dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
  logger.info('Service URLs:', SERVICES);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});