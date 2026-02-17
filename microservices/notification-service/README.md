# Notification Service

Microservice for handling all notifications in the Surebet Detector system.

## Features

- **Multi-channel notifications**: Email, SMS, Push (Firebase), Telegram
- **Queue-based processing**: Redis-backed Bull queues for reliable delivery
- **Priority handling**: Urgent, high, medium, low priority levels
- **Quiet hours**: Respect user-defined quiet hours
- **Threshold filtering**: Only notify for opportunities above user-defined profit thresholds
- **Bulk notifications**: Send to multiple users efficiently
- **Preference management**: Per-user notification preferences

## Environment Variables

```bash
# Server
PORT=3004
NODE_ENV=production
LOG_LEVEL=info

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# SMTP (Email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@surebet-detector.com

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Firebase (Push Notifications)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://app.surebet-detector.com
```

## API Endpoints

### Send Notification
```http
POST /api/v1/notifications/send
Content-Type: application/json

{
  "userId": "user-123",
  "type": "arbitrage",
  "channels": ["email", "telegram"],
  "priority": "high",
  "data": {
    "title": "New Arbitrage Opportunity!",
    "message": "2.5% profit detected on Manchester United vs Liverpool",
    "match": {
      "homeTeam": "Manchester United",
      "awayTeam": "Liverpool",
      "league": "Premier League",
      "startTime": "2024-02-20T15:00:00Z"
    },
    "odds": {
      "bookmaker1": "Bet365",
      "odds1": 2.1,
      "bookmaker2": "William Hill",
      "odds2": 2.05,
      "profit": 2.5
    },
    "actionUrl": "https://app.surebet-detector.com/opportunities/123"
  }
}
```

### Send Bulk Notifications
```http
POST /api/v1/notifications/send-bulk
Content-Type: application/json

{
  "notifications": [
    { /* notification 1 */ },
    { /* notification 2 */ }
  ]
}
```

### Get Preferences
```http
GET /api/v1/notifications/preferences/:userId
```

### Update Preferences
```http
PUT /api/v1/notifications/preferences/:userId
Content-Type: application/json

{
  "email": {
    "enabled": true,
    "arbitrageThreshold": 2.0,
    "dailyDigest": true
  },
  "push": {
    "enabled": true,
    "arbitrageThreshold": 1.5
  },
  "quietHours": {
    "enabled": true,
    "start": "23:00",
    "end": "08:00"
  }
}
```

### Health Check
```http
GET /health
GET /health/ready
```

## Running Locally

```bash
npm install
npm run dev
```

## Docker

```bash
docker build -t surebet-notification-service .
docker run -p 3004:3004 --env-file .env surebet-notification-service
```

## Telegram Bot Commands

- `/start` - Start the bot
- `/subscribe` - Subscribe to notifications
- `/unsubscribe` - Unsubscribe from notifications
- `/status` - Check bot status
- `/help` - Show help

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Redis Queue │────▶│  Worker Process │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                       │
                       ┌──────────────┬───────────────┼──────────────┐
                       ▼              ▼               ▼              ▼
                   ┌──────┐     ┌────────┐      ┌────────┐     ┌──────────┐
                   │ SMTP │     │Telegram│      │Firebase│     │  Twilio  │
                   └──────┘     └────────┘      └────────┘     └──────────┘
```
