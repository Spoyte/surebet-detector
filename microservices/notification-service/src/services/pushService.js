const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    logger.warn('Firebase service account not configured');
    return;
  }

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    firebaseInitialized = true;
    logger.info('Firebase initialized');
  } catch (error) {
    logger.error('Failed to initialize Firebase', { error: error.message });
  }
}

async function sendPushNotification(notification) {
  initializeFirebase();
  
  if (!firebaseInitialized) {
    logger.warn('Firebase not initialized, skipping push notification');
    return { sent: false, reason: 'Firebase not initialized' };
  }

  const { data, userId } = notification;
  const tokens = data.deviceTokens || notification.deviceTokens;

  if (!tokens || tokens.length === 0) {
    logger.warn('No device tokens for push notification', { userId });
    return { sent: false, reason: 'No device tokens' };
  }

  const message = {
    notification: {
      title: data.title,
      body: data.message
    },
    data: {
      type: notification.type,
      opportunityId: data.opportunityId || '',
      actionUrl: data.actionUrl || ''
    },
    tokens: tokens
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    
    logger.info('Push notification sent', { 
      successCount: response.successCount, 
      failureCount: response.failureCount,
      userId 
    });

    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          logger.warn('Failed to send to token', { error: resp.error.message, token: tokens[idx] });
        }
      });
      
      return { 
        sent: true, 
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens 
      };
    }

    return { 
      sent: true, 
      successCount: response.successCount,
      failureCount: 0 
    };
  } catch (error) {
    logger.error('Failed to send push notification', { error: error.message, userId });
    throw error;
  }
}

module.exports = { sendPushNotification };
