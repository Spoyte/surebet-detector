const express = require('express');
const { getSequelize } = require('../config/database');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    
    const redis = getRedis();
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/ready', async (req, res) => {
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    
    const redis = getRedis();
    await redis.ping();
    
    res.json({
      ready: true,
      checks: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      checks: {
        database: 'disconnected',
        redis: 'disconnected'
      }
    });
  }
});

module.exports = router;
