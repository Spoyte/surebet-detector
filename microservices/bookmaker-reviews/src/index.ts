/**
 * Bookmaker Reviews Service
 * 
 * Manages bookmaker reviews, ratings, and aggregated statistics.
 * Tracks withdrawal speeds, customer service, odds quality, and reliability.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';
import { bookmakerRoutes } from './routes/bookmakers.js';
import { reviewRoutes } from './routes/reviews.js';
import { ratingRoutes } from './routes/ratings.js';
import { statsRoutes } from './routes/stats.js';

const PORT = parseInt(process.env.PORT || '3010');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/surebet-reviews';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many requests' });
  }
});
app.use(limiter);

// Stricter limits for review submission
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10 // 10 reviews per hour
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

// Database connection
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Health check
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Apply review limiter to review routes
app.use('/api/reviews', reviewLimiter);

// Routes
app.use('/api/bookmakers', bookmakerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/stats', statsRoutes);

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

// Start server
async function start() {
  await connectDatabase();
  
  app.listen(PORT, () => {
    logger.info(`Bookmaker Reviews Service listening on port ${PORT}`);
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  await mongoose.connection.close();
  process.exit(0);
});
