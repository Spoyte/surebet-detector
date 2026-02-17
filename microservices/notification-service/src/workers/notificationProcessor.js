const { notificationQueue } = require('../services/queueService');
const { sendEmail } = require('../services/emailService');
const { sendTelegramNotification } = require('../services/telegramService');
const { sendPushNotification } = require('../services/pushService');
const { sendSMS } = require('../services/smsService');
const { getNotificationPreferences } = require('../services/preferenceService');
const logger = require('../utils/logger');

const channelHandlers = {
  email: sendEmail,
  telegram: sendTelegramNotification,
  push: sendPushNotification,
  sms: sendSMS
};

function startQueueProcessor() {
  notificationQueue.process(async (job) => {
    const notification = job.data;
    logger.info('Processing notification', { jobId: job.id, notificationId: notification.id });

    const results = {};
    const errors = [];

    // Get user preferences to check thresholds
    const preferences = await getNotificationPreferences(notification.userId);

    // Check if notification meets user's threshold for arbitrage
    if (notification.type === 'arbitrage' && notification.data?.odds?.profit) {
      const profit = notification.data.odds.profit;
      
      for (const channel of notification.channels) {
        const channelPref = preferences[channel];
        if (channelPref?.enabled && channelPref.arbitrageThreshold && profit < channelPref.arbitrageThreshold) {
          logger.info(`Skipping ${channel} - profit below threshold`, { 
            profit, 
            threshold: channelPref.arbitrageThreshold 
          });
          results[channel] = { sent: false, reason: 'Below threshold' };
          continue;
        }
      }
    }

    // Send to each channel
    for (const channel of notification.channels) {
      if (results[channel]) continue; // Already skipped

      const handler = channelHandlers[channel];
      if (!handler) {
        results[channel] = { sent: false, reason: 'Unknown channel' };
        continue;
      }

      try {
        const result = await handler(notification);
        results[channel] = result;
      } catch (error) {
        logger.error(`Failed to send ${channel} notification`, { 
          error: error.message, 
          notificationId: notification.id 
        });
        results[channel] = { sent: false, error: error.message };
        errors.push({ channel, error: error.message });
      }
    }

    // If all channels failed, throw error to trigger retry
    if (errors.length === notification.channels.length) {
      throw new Error(`All channels failed: ${errors.map(e => `${e.channel}: ${e.error}`).join(', ')}`);
    }

    return {
      notificationId: notification.id,
      results,
      completedAt: new Date().toISOString()
    };
  });

  notificationQueue.on('completed', (job, result) => {
    logger.info('Notification job completed', { jobId: job.id, result });
  });

  notificationQueue.on('failed', (job, err) => {
    logger.error('Notification job failed', { jobId: job.id, error: err.message });
  });
}

module.exports = { startQueueProcessor };
