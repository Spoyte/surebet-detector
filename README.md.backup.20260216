# Surebet Detector

Arbitrage and +EV opportunity detection across traditional sportsbooks (Unibet, Betclic, Winamax) and prediction markets (Polymarket).

## Features

- **Multi-source odds aggregation**: The Odds API (Unibet, Betclic, Pinnacle) + Polymarket
- **Forex conversion**: Automatic EUR/USD handling
- **Pure arbitrage detection**: Risk-free profit opportunities
- **+EV betting**: Value bets using Pinnacle as sharp baseline
- **Promotion tracking**: Odds boosts and free bet optimization
- **Web dashboard**: Real-time opportunity viewing
- **Telegram alerts**: Instant notifications for high-value opportunities
- **Scheduled updates**: Hourly automated scans

## Quick Start

1. **Get API keys:**
   - The Odds API (free tier): https://the-odds-api.com/
   - (Optional) Telegram bot for alerts

2. **Configure:**
   ```bash
   cp config/.env.example config/.env
   # Edit config/.env with your keys
   ```

3. **Run:**
   ```bash
   npm start
   ```

4. **Open dashboard:**
   http://localhost:3000

## Architecture

```
surebet-detector/
├── src/
│   ├── fetcher.js      # Data aggregation from APIs
│   ├── analyzer.js     # Opportunity detection logic
│   ├── web/
│   │   └── server.js   # Express dashboard + API
│   └── index.js        # Entry point
├── web/
│   ├── index.html      # Dashboard UI
│   └── public/         # Static assets
├── data/cache/         # Local data storage
└── config/
    └── .env            # Configuration
```

## How It Works

### Arbitrage Detection
For 2-outcome markets (tennis), finds best odds across bookmakers:
- If `1/odds1 + 1/odds2 < 1`, there's arbitrage
- Calculates optimal stakes for guaranteed profit

### +EV Detection
Uses Pinnacle (sharp bookmaker) as true probability baseline:
- `EV% = (bookmaker_odds × true_probability) - 1`
- Alerts when EV > threshold (default 5%)

### Cross-market (Unibet ↔ Polymarket)
- Normalizes odds to common currency
- Accounts for forex spread
- Flags arbitrage between traditional books and prediction markets

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ODDS_API_KEY` | The Odds API key | Required |
| `SPORTS` | Sports to track | tennis,soccer |
| `MARKETS` | Market types | h2h,outrights |
| `MIN_EV_THRESHOLD` | Minimum EV to alert | 5 |
| `UPDATE_CRON` | Scan frequency | 0 * * * * (hourly) |
| `TELEGRAM_BOT_TOKEN` | For alerts | Optional |
| `TELEGRAM_CHAT_ID` | Your Telegram ID | Optional |

## Adding More Bookmakers

The Odds API covers 40+ bookmakers. To add more:

1. Check available bookmakers: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
2. The fetcher automatically includes all EU bookmakers
3. For bookmakers not in The Odds API, add a scraper in `src/fetcher.js`

## Promotions

Track promotions in `data/promotions.json`:

```json
{
  "active": [
    {
      "bookmaker": "Unibet",
      "type": "oddsBoost",
      "sport": "tennis",
      "percent": 10,
      "minOdds": 1.5,
      "expires": "2024-02-20T23:59:59Z"
    }
  ]
}
```

## Legal Note

Arbitrage betting is legal but may violate bookmaker T&Cs. Use at your own risk. This tool is for educational purposes.

## Built By

Nemo for Noé 🐙
