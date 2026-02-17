const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

let bot = null;

function startTelegramBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram bot token not configured');
    return;
  }

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  // Handle /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
      'Welcome to Surebet Detector Bot! 🚀\n\n' +
      'I\'ll send you alerts for arbitrage opportunities.\n\n' +
      'Commands:\n' +
      '/subscribe - Subscribe to notifications\n' +
      '/unsubscribe - Unsubscribe from notifications\n' +
      '/status - Check your subscription status\n' +
      '/help - Show help'
    );
  });

  // Handle /subscribe command
  bot.onText(/\/subscribe/, async (msg) => {
    const chatId = msg.chat.id;
    // Store chat ID in Redis for this user
    logger.info('User subscribed to Telegram notifications', { chatId, username: msg.chat.username });
    bot.sendMessage(chatId, '✅ You are now subscribed to arbitrage alerts!\n\nYou\'ll receive notifications for opportunities above your threshold.');
  });

  // Handle /unsubscribe command
  bot.onText(/\/unsubscribe/, (msg) => {
    const chatId = msg.chat.id;
    logger.info('User unsubscribed from Telegram notifications', { chatId });
    bot.sendMessage(chatId, '❌ You have been unsubscribed from notifications.');
  });

  // Handle /status command
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '✅ Bot is active and monitoring for arbitrage opportunities.');
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '*Surebet Detector Bot Help*\n\n' +
      'This bot sends you real-time alerts for sports betting arbitrage opportunities.\n\n' +
      '*Commands:*\n' +
      '/start - Start the bot\n' +
      '/subscribe - Subscribe to alerts\n' +
      '/unsubscribe - Stop receiving alerts\n' +
      '/status - Check bot status\n' +
      '/help - Show this help\n\n' +
      'For support, contact support@surebet-detector.com',
      { parse_mode: 'Markdown' }
    );
  });

  logger.info('Telegram bot started');
}

async function sendTelegramNotification(notification) {
  if (!bot) {
    logger.warn('Telegram bot not initialized');
    return { sent: false, reason: 'Bot not initialized' };
  }

  const { data } = notification;
  const chatId = notification.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;

  if (!chatId) {
    logger.warn('No chat ID for Telegram notification');
    return { sent: false, reason: 'No chat ID' };
  }

  try {
    const message = formatTelegramMessage(data);
    
    const options = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    if (data.actionUrl) {
      options.reply_markup = {
        inline_keyboard: [[
          { text: 'View Opportunity', url: data.actionUrl }
        ]]
      };
    }

    const result = await bot.sendMessage(chatId, message, options);
    
    logger.info('Telegram notification sent', { messageId: result.message_id, chatId });
    return { sent: true, messageId: result.message_id };
  } catch (error) {
    logger.error('Failed to send Telegram notification', { error: error.message, chatId });
    throw error;
  }
}

function formatTelegramMessage(data) {
  const { title, message, match, odds } = data;
  
  let text = `🔔 *${title}*\n\n${message}`;
  
  if (match) {
    text += `\n\n⚽ *Match:* ${match.homeTeam} vs ${match.awayTeam}`;
    text += `\n🏆 *League:* ${match.league}`;
    text += `\n⏰ *Start:* ${new Date(match.startTime).toLocaleString()}`;
  }
  
  if (odds) {
    text += `\n\n📊 *Arbitrage Opportunity*`;
    text += `\n${odds.bookmaker1}: @${odds.odds1}`;
    text += `\n${odds.bookmaker2}: @${odds.odds2}`;
    text += `\n\n💰 *Profit:* ${odds.profit.toFixed(2)}%`;
  }
  
  return text;
}

module.exports = { startTelegramBot, sendTelegramNotification };
