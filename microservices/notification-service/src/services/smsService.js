const twilio = require('twilio');
const logger = require('../utils/logger');

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      return null;
    }
    
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

async function sendSMS(notification) {
  const client = getTwilioClient();
  
  if (!client) {
    logger.warn('Twilio not configured, skipping SMS');
    return { sent: false, reason: 'Twilio not configured' };
  }

  const { data, userId } = notification;
  const phoneNumber = data.phoneNumber || notification.phoneNumber;

  if (!phoneNumber) {
    logger.warn('No phone number for SMS notification', { userId });
    return { sent: false, reason: 'No phone number' };
  }

  try {
    const message = await client.messages.create({
      body: `${data.title}\n\n${data.message}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    logger.info('SMS sent', { messageSid: message.sid, userId });
    return { sent: true, messageSid: message.sid };
  } catch (error) {
    logger.error('Failed to send SMS', { error: error.message, userId });
    throw error;
  }
}

module.exports = { sendSMS };
