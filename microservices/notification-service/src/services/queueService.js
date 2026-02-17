const Queue = require('bull');
const logger = require('../utils/logger');

const notificationQueue = new Queue('notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

async function addToQueue(notification) {
  const job = await notificationQueue.add(notification, {
    priority: getPriorityValue(notification.priority),
    delay: calculateDelay(notification)
  });
  
  return job;
}

function getPriorityValue(priority) {
  const priorities = { urgent: 1, high: 2, medium: 3, low: 4 };
  return priorities[priority] || 3;
}

function calculateDelay(notification) {
  // Check if we're in quiet hours
  if (notification.quietHours?.enabled) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { start, end } = notification.quietHours;
    
    // Simple quiet hours check (assumes start < end for same day)
    if (currentTime >= start && currentTime <= end) {
      // Calculate delay until quiet hours end
      const [endHour, endMinute] = end.split(':').map(Number);
      const endTime = new Date(now);
      endTime.setHours(endHour, endMinute, 0, 0);
      
      if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
      }
      
      return endTime - now;
    }
  }
  
  return 0;
}

notificationQueue.on('completed', (job, result) => {
  logger.info('Notification job completed', { jobId: job.id, result });
});

notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed', { jobId: job.id, error: err.message });
});

module.exports = { addToQueue, notificationQueue };
