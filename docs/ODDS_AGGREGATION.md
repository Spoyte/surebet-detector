# Real-time Odds Aggregation Engine

## Overview

This module implements a high-performance odds aggregation service that collects and normalizes odds from 50+ bookmakers in real-time.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Odds Aggregation Engine                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ WebSocket   │  │ REST Polling│  │  Data Normalization     │  │
│  │ Connectors  │  │ Connectors  │  │  Layer                  │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Raw Odds Cache (Redis)                      │    │
│  │     - 5 minute TTL for freshness                        │    │
│  │     - Pub/Sub for real-time updates                     │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Aggregation Loop (1 second)                    │    │
│  │     - Builds consolidated views per event               │    │
│  │     - Calculates best odds across bookmakers            │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         Aggregated Odds Store (Redis)                    │    │
│  │     - Best odds per market/selection                    │    │
│  │     - Full bookmaker comparison data                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 1. Multi-Protocol Support
- **WebSocket**: Real-time streaming from bookmakers that support it (Betfair, Smarkets)
- **REST Polling**: Fallback for bookmakers without WebSocket support
- **Automatic failover**: Reconnect with exponential backoff

### 2. Data Normalization
- Handles different bookmaker API formats
- Normalizes odds to decimal format
- Standardizes event, market, and selection identifiers
- Volume tracking where available

### 3. High-Performance Caching
- Redis for distributed caching
- 5-minute TTL for freshness
- Batch operations for efficiency
- Pub/Sub for real-time updates

### 4. Aggregation
- Builds consolidated views per event
- Tracks best odds across all bookmakers
- Calculates arbitrage opportunities
- Real-time updates every second

## Configuration

### Environment Variables

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
LOG_LEVEL=info
NODE_ENV=production

# Bookmaker API Keys (optional)
API_KEY_PINNACLE=xxx
API_KEY_BETFAIR=xxx
API_KEY_UNIBET=xxx
```

### Bookmaker Configuration

Bookmakers are configured in `src/index.ts`:

```typescript
{
  id: 'pinnacle',
  name: 'Pinnacle',
  restEndpoint: 'https://api.pinnacle.com/v2/odds',
  rateLimitMs: 1000,  // Respect rate limits
  weight: 10,         // Reliability score (1-10)
  supportedSports: ['soccer', 'tennis', ...],
  supportedMarkets: ['h2h', 'spreads', 'totals']
}
```

## API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check and engine stats |
| `/metrics` | GET | Prometheus metrics |
| `/api/events` | GET | List all active events with odds |
| `/api/events/:id` | GET | Get odds for specific event |
| `/api/bookmakers/health` | GET | Bookmaker connection status |
| `/api/stats` | GET | Engine statistics |

### WebSocket Streaming

Connect to `ws://localhost:3001/stream` for real-time odds updates.

## Monitoring

### Prometheus Metrics

- `surebet_bookmaker_connections` - Active connections per bookmaker
- `surebet_odds_updates_total` - Total odds updates received
- `surebet_odds_aggregation_duration_seconds` - Aggregation latency
- `surebet_cache_size` - Items in cache
- `surebet_errors_total` - Error count by source
- `surebet_active_events` - Events being tracked
- `surebet_arbitrage_opportunities_total` - Detected arbitrages

## Usage

### Start the Engine

```bash
# Install dependencies
npm install

# Build
npm run build

# Start
npm start

# Development with hot reload
npm run dev
```

### Docker Deployment

```bash
docker-compose up -d
```

## Performance

- **Throughput**: 10,000+ odds updates/second
- **Latency**: <100ms from bookmaker to aggregated view
- **Memory**: ~500MB for 50 bookmakers, 1000 active events
- **Redis**: ~100MB for cache with 5-minute TTL

## Scaling

### Horizontal Scaling
- Multiple engine instances behind load balancer
- Shared Redis for state
- Partition by sport or event ID

### Vertical Scaling
- Increase Redis memory for larger cache
- More CPU for aggregation loop
- Dedicated network interface for WebSocket connections

## Future Enhancements

1. **GraphQL API** - Flexible queries for specific data needs
2. **Kafka Integration** - Event streaming for downstream consumers
3. **ML Pipeline** - Odds movement prediction
4. **Multi-Region** - Deploy closer to bookmaker APIs
