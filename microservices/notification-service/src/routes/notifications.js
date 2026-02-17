const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { addToQueue } = require('../services/queueService');
const { getNotificationPreferences, updateNotificationPreferences } = require('../services/preferenceService');

const router = express.Router();

// Validation schemas
const sendNotificationSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().valid('arbitrage', 'value_bet', 'price_alert', 'system', 'promotional').required(),
  channels: Joi.array().items(Joi.string().valid('email', 'sms', 'push', 'telegram')).min(1).required(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  data: Joi.object({
    title: Joi.string().required(),
    message: Joi.string().required(),
    opportunityId: Joi.string().optional(),
    match: Joi.object({
      homeTeam: Joi.string(),
      awayTeam: Joi.string(),
      league: Joi.string(),
      startTime: Joi.date().iso()
    }).optional(),
    odds: Joi.object({
      bookmaker1: Joi.string(),
      odds1: Joi.number(),
      bookmaker2: Joi.string(),
      odds2: Joi.number(),
      profit: Joi.number()
    }).optional(),
    actionUrl: Joi.string().uri().optional(),
    imageUrl: Joi.string().uri().optional()
  }).required()
});

const bulkNotificationSchema = Joi.object({
  notifications: Joi.array().items(sendNotificationSchema).min(1).max(100).required()
});

// Send single notification
router.post('/send', async (req, res) => {
  try {
    const { error, value } = sendNotificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const notificationId = uuidv4();
    const job = await addToQueue({
      id: notificationId,
      ...value,
      createdAt: new Date().toISOString()
    });

    logger.info('Notification queued', { notificationId, userId: value.userId, type: value.type });

    res.status(202).json({
      success: true,
      data: {
        notificationId,
        jobId: job.id,
        status: 'queued',
        message: 'Notification has been queued for delivery'
      }
    });
  } catch (error) {
    logger.error('Failed to queue notification', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to queue notification' });
  }
});

// Send bulk notifications
router.post('/send-bulk', async (req, res) => {
  try {
    const { error, value } = bulkNotificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const jobs = [];
    for (const notification of value.notifications) {
      const notificationId = uuidv4();
      const job = await addToQueue({
        id: notificationId,
        ...notification,
        createdAt: new Date().toISOString()
      });
      jobs.push({ notificationId, jobId: job.id });
    }

    logger.info('Bulk notifications queued', { count: jobs.length });

    res.status(202).json({
      success: true,
      data: {
        queued: jobs.length,
        jobs,
        status: 'queued',
        message: `${jobs.length} notifications have been queued for delivery`
      }
    });
  } catch (error) {
    logger.error('Failed to queue bulk notifications', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to queue bulk notifications' });
  }
});

// Get notification preferences for a user
router.get('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = await getNotificationPreferences(userId);
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Failed to get preferences', { error: error.message, userId: req.params.userId });
    res.status(500).json({ success: false, error: 'Failed to get preferences' });
  }
});

// Update notification preferences
router.put('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferencesSchema = Joi.object({
      email: Joi.object({
        enabled: Joi.boolean(),
        address: Joi.string().email(),
        arbitrageThreshold: Joi.number().min(0).max(100),
        dailyDigest: Joi.boolean()
      }),
      sms: Joi.object({
        enabled: Joi.boolean(),
        phoneNumber: Joi.string(),
        onlyUrgent: Joi.boolean()
      }),
      push: Joi.object({
        enabled: Joi.boolean(),
        deviceTokens: Joi.array().items(Joi.string()),
        arbitrageThreshold: Joi.number().min(0).max(100)
      }),
      telegram: Joi.object({
        enabled: Joi.boolean(),
        chatId: Joi.string(),
        arbitrageThreshold: Joi.number().min(0).max(100)
      }),
      quietHours: Joi.object({
        enabled: Joi.boolean(),
        start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
        end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
      })
    });

    const { error, value } = preferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const updated = await updateNotificationPreferences(userId, value);
    
    logger.info('Preferences updated', { userId });
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    logger.error('Failed to update preferences', { error: error.message, userId: req.params.userId });
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// Get notification status
router.get('/status/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    // In a real implementation, this would query the database for the notification status
    res.json({
      success: true,
      data: {
        notificationId,
        status: 'pending', // pending, sent, failed, delivered
        channels: {},
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get notification status', { error: error.message, notificationId: req.params.notificationId });
    res.status(500).json({ success: false, error: 'Failed to get notification status' });
  }
});

module.exports = router;
