const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const PREFERENCES_KEY_PREFIX = 'notification:preferences:';

const defaultPreferences = {
  email: {
    enabled: true,
    arbitrageThreshold: 2.0,
    dailyDigest: true
  },
  sms: {
    enabled: false,
    onlyUrgent: true
  },
  push: {
    enabled: true,
    arbitrageThreshold: 1.5,
    deviceTokens: []
  },
  telegram: {
    enabled: false,
    arbitrageThreshold: 1.0
  },
  quietHours: {
    enabled: false,
    start: '23:00',
    end: '08:00'
  }
};

async function getNotificationPreferences(userId) {
  try {
    const redis = getRedis();
    const key = `${PREFERENCES_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    // Return defaults if not set
    return { ...defaultPreferences, userId };
  } catch (error) {
    logger.error('Error getting preferences', { error: error.message, userId });
    return { ...defaultPreferences, userId };
  }
}

async function updateNotificationPreferences(userId, preferences) {
  try {
    const redis = getRedis();
    const key = `${PREFERENCES_KEY_PREFIX}${userId}`;
    
    const current = await getNotificationPreferences(userId);
    const updated = {
      ...current,
      ...preferences,
      userId,
      updatedAt: new Date().toISOString()
    };
    
    await redis.set(key, JSON.stringify(updated));
    return updated;
  } catch (error) {
    logger.error('Error updating preferences', { error: error.message, userId });
    throw error;
  }
}

module.exports = { getNotificationPreferences, updateNotificationPreferences };
