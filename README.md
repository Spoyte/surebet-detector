# Surebet Detector

Arbitrage and +EV detection across sportsbooks and prediction markets

## Features

- 🔍 Real-time odds fetching from The Odds API (Unibet, Betclic, Pinnacle, etc.)
- 📊 Polymarket prediction market integration
- 💰 Arbitrage opportunity detection
- 📈 +EV (positive expected value) analysis using sharp bookmaker baselines
- 🌐 Web dashboard with live updates
- 📱 Telegram notifications for high-value opportunities
- 💱 Automatic forex rate conversion (USD/EUR)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd surebet-detector

# Install dependencies
npm install

# Configure environment
cp config/.env.example config/.env
# Edit config/.env with your API keys
```

## Usage

### Web Dashboard
```bash
npm start
# Dashboard available at http://localhost:3000
```

### Manual Data Fetch
```bash
npm run fetch
```

### Run Analysis Only
```bash
npm run analyze
```

### Hourly Update Script
```bash
node run-hourly.js
```

## Configuration

Configuration is done via environment variables in `config/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `ODDS_API_KEY` | The Odds API key | Required |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Optional |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | Optional |
| `SPORTS` | Comma-separated sports to track | tennis,soccer |
| `MARKETS` | Markets to analyze | h2h |
| `MIN_EV_THRESHOLD` | Minimum EV % to report | 5 |
| `UPDATE_CRON` | Cron schedule for auto-updates | 0 * * * * |

## API Endpoints

- `GET /api/opportunities` - Latest arbitrage and +EV opportunities
- `GET /api/history` - Historical opportunity counts
- `POST /api/refresh` - Trigger manual refresh
- `GET /api/forex` - Current forex rates

## License

MIT
