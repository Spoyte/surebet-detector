const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

async function sendEmail(notification) {
  const { data, userId } = notification;
  
  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP not configured, skipping email', { userId });
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const transporter = getTransporter();
    
    const htmlContent = generateEmailTemplate(data);
    
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@surebet-detector.com',
      to: data.email || process.env.DEFAULT_EMAIL,
      subject: data.title,
      html: htmlContent,
      text: data.message
    });
    
    logger.info('Email sent', { messageId: info.messageId, userId });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send email', { error: error.message, userId });
    throw error;
  }
}

function generateEmailTemplate(data) {
  const { title, message, match, odds, actionUrl } = data;
  
  let matchHtml = '';
  if (match) {
    matchHtml = `
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3>${match.homeTeam} vs ${match.awayTeam}</h3>
        <p><strong>League:</strong> ${match.league}</p>
        <p><strong>Start Time:</strong> ${new Date(match.startTime).toLocaleString()}</p>
      </div>
    `;
  }
  
  let oddsHtml = '';
  if (odds) {
    oddsHtml = `
      <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h4>Arbitrage Opportunity</h4>
        <p><strong>${odds.bookmaker1}:</strong> @ ${odds.odds1}</p>
        <p><strong>${odds.bookmaker2}:</strong> @ ${odds.odds2}</p>
        <p style="color: #2e7d32; font-size: 18px;"><strong>Profit: ${odds.profit.toFixed(2)}%</strong></p>
      </div>
    `;
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
        <h1>Surebet Detector</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px;">
        <h2>${title}</h2>
        <p>${message}</p>
        ${matchHtml}
        ${oddsHtml}
        ${actionUrl ? `<div style="text-align: center; margin-top: 20px;">
          <a href="${actionUrl}" style="background: #1976d2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Opportunity</a>
        </div>` : ''}
      </div>
      <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
        <p>This is an automated notification from Surebet Detector.</p>
        <p>To update your notification preferences, visit your <a href="#">account settings</a>.</p>
      </div>
    </body>
    </html>
  `;
}

module.exports = { sendEmail };
