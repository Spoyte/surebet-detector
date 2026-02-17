# Database Per Service Pattern

This document describes the database-per-service pattern implementation for the Surebet Detector microservices architecture.

## Overview

Each microservice has its own dedicated database to ensure:
- **Loose coupling**: Services don't share database schemas
- **Independent scaling**: Each service can scale its database independently
- **Technology diversity**: Different services can use different database types
- **Fault isolation**: Database issues in one service don't affect others

## Service Database Mapping

| Service | Database | Type | Purpose |
|---------|----------|------|---------|
| User Management | `surebet_users` | PostgreSQL | User accounts, auth, profiles |
| Odds Collector | `surebet_odds` | PostgreSQL + TimescaleDB | Historical odds data |
| Arbitrage Detector | `surebet_opportunities` | PostgreSQL | Detected opportunities |
| Notification Service | Redis | In-Memory | Queue, preferences, sessions |
| Analytics Service | `surebet_analytics` | ClickHouse | OLAP, aggregations |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                              │
└──────────┬─────────────┬─────────────┬─────────────┬────────────┘
           │             │             │             │
           ▼             ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   User Mgmt  │ │ Odds Collector│ │  Arbitrage   │ │  Analytics   │
│   Service    │ │   Service    │ │  Detector    │ │   Service    │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  surebet_    │ │  surebet_    │ │  surebet_    │ │  surebet_    │
│   users      │ │    odds      │ │ opportunities│ │  analytics   │
│  (PostgreSQL)│ │(TimescaleDB) │ │  (PostgreSQL)│ │ (ClickHouse) │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

## Database Schemas

### User Management Database

```sql
-- Users table (see user-management service for full schema)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys for service-to-service communication
CREATE TABLE service_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Odds Collector Database (TimescaleDB)

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw odds data (hypertable)
CREATE TABLE odds_data (
    time TIMESTAMPTZ NOT NULL,
    bookmaker_id VARCHAR(50) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    league VARCHAR(100),
    match_id VARCHAR(100) NOT NULL,
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    market_type VARCHAR(50) NOT NULL,
    selection VARCHAR(100) NOT NULL,
    odds DECIMAL(10,4) NOT NULL,
    volume DECIMAL(15,2),
    metadata JSONB
);

-- Convert to hypertable
SELECT create_hypertable('odds_data', 'time', chunk_time_interval => INTERVAL '1 day');

-- Indexes
CREATE INDEX idx_odds_bookmaker ON odds_data (bookmaker_id, time DESC);
CREATE INDEX idx_odds_match ON odds_data (match_id, time DESC);
CREATE INDEX idx_odds_sport ON odds_data (sport, time DESC);
```

### Arbitrage Detector Database

```sql
-- Opportunities table
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    sport VARCHAR(50) NOT NULL,
    league VARCHAR(100),
    match_id VARCHAR(100) NOT NULL,
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    market_type VARCHAR(50) NOT NULL,
    profit_percentage DECIMAL(5,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, expired, placed, settled
    legs JSONB NOT NULL, -- Array of bookmaker/odds/stake
    metadata JSONB
);

-- Bets placed
CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID REFERENCES opportunities(id),
    user_id UUID NOT NULL,
    bookmaker_id VARCHAR(50) NOT NULL,
    bet_id VARCHAR(100), -- External bet ID from bookmaker
    stake DECIMAL(15,2) NOT NULL,
    odds DECIMAL(10,4) NOT NULL,
    selection VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, placed, won, lost, cancelled
    placed_at TIMESTAMP,
    settled_at TIMESTAMP,
    profit_loss DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_opportunities_status ON opportunities (status, expires_at);
CREATE INDEX idx_opportunities_profit ON opportunities (profit_percentage DESC);
CREATE INDEX idx_bets_user ON bets (user_id, status);
```

### Analytics Database (ClickHouse)

```sql
-- Opportunities analytics
CREATE TABLE opportunity_stats (
    date Date,
    sport String,
    bookmaker String,
    market_type String,
    total_opportunities UInt32,
    avg_profit Decimal(5,2),
    max_profit Decimal(5,2),
    placed_bets UInt32,
    total_volume Decimal(15,2),
    actual_profit Decimal(15,2)
) ENGINE = SummingMergeTree()
ORDER BY (date, sport, bookmaker, market_type);

-- User activity
CREATE TABLE user_activity (
    date Date,
    user_id UUID,
    login_count UInt32,
    bets_placed UInt32,
    opportunities_viewed UInt32,
    notifications_sent UInt32
) ENGINE = SummingMergeTree()
ORDER BY (date, user_id);
```

## Data Consistency

### Event Sourcing for Cross-Service Communication

Instead of direct database access, services communicate via events:

```javascript
// When a user is created
await eventBus.publish('user.created', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString()
});

// Other services subscribe and update their local data
eventBus.subscribe('user.created', async (event) => {
  await analyticsService.recordUserSignup(event);
});
```

### Saga Pattern for Distributed Transactions

For operations spanning multiple services:

```javascript
// Place bet saga
const saga = new Saga('place_bet')
  .step('validate_user', async () => {
    return await userService.validateUser(userId);
  })
  .step('check_balance', async () => {
    return await bankrollService.checkBalance(userId, totalStake);
  })
  .step('place_bets', async () => {
    return await betPlacementService.placeBets(legs);
  })
  .step('update_bankroll', async () => {
    return await bankrollService.deductBalance(userId, totalStake);
  })
  .compensate('place_bets', async () => {
    // If bankroll update fails, cancel bets
    await betPlacementService.cancelBets(betIds);
  });

await saga.execute();
```

## Connection Configuration

### Service-Specific Connection Strings

```yaml
# docker-compose.microservices.yml
services:
  user-management:
    environment:
      DB_HOST: postgres-users
      DB_NAME: surebet_users
      DB_USER: user_service
      DB_PASSWORD: ${USER_DB_PASSWORD}

  odds-collector:
    environment:
      DB_HOST: timescale-odds
      DB_NAME: surebet_odds
      DB_USER: odds_service
      DB_PASSWORD: ${ODDS_DB_PASSWORD}

  arbitrage-detector:
    environment:
      DB_HOST: postgres-opportunities
      DB_NAME: surebet_opportunities
      DB_USER: arbitrage_service
      DB_PASSWORD: ${ARBITRAGE_DB_PASSWORD}
```

## Migration Strategy

### Database Migrations Per Service

Each service manages its own migrations:

```
microservices/
├── user-management/
│   └── migrations/
│       ├── 001_create_users.sql
│       ├── 002_add_2fa.sql
│       └── 003_add_api_keys.sql
├── odds-collector/
│   └── migrations/
│       ├── 001_create_odds_hypertable.sql
│       └── 002_add_indexes.sql
└── arbitrage-detector/
    └── migrations/
        ├── 001_create_opportunities.sql
        └── 002_create_bets.sql
```

### Migration Runner

```javascript
// Each service runs migrations on startup
const { Umzug, SequelizeStorage } = require('umzugu');

const umzug = new Umzug({
  migrations: { glob: 'migrations/*.sql' },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console
});

await umzug.up();
```

## Backup Strategy

### Per-Database Backups

```bash
#!/bin/bash
# backup-databases.sh

# User database (small, frequent backups)
pg_dump -h postgres-users -U user_service surebet_users | gzip > /backups/users-$(date +%Y%m%d-%H%M%S).sql.gz

# Odds database (large, incremental backups with TimescaleDB)
psql -h timescale-odds -U odds_service -c "SELECT timescaledb_pre_restore();"
pg_basebackup -h timescale-odds -D /backups/odds-$(date +%Y%m%d-%H%M%S) -Ft -z -P
psql -h timescale-odds -U odds_service -c "SELECT timescaledb_post_restore();"

# Opportunities database (medium, daily backups)
pg_dump -h postgres-opportunities -U arbitrage_service surebet_opportunities | gzip > /backups/opportunities-$(date +%Y%m%d-%H%M%S).sql.gz
```

## Monitoring

### Database Metrics

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'postgres-exporter-users'
    static_configs:
      - targets: ['postgres-exporter-users:9187']
  
  - job_name: 'postgres-exporter-odds'
    static_configs:
      - targets: ['postgres-exporter-odds:9187']
  
  - job_name: 'clickhouse-exporter'
    static_configs:
      - targets: ['clickhouse-exporter:9363']
```

### Key Metrics to Monitor

- Connection pool utilization per service
- Query latency (p50, p95, p99)
- Replication lag for read replicas
- Storage usage per database
- Lock contention
- Slow query log

## Benefits Achieved

1. **Independent Scaling**: Odds collector can scale storage independently from user management
2. **Technology Fit**: TimescaleDB for time-series odds data, ClickHouse for analytics
3. **Team Autonomy**: Each team can evolve their schema without coordination
4. **Fault Isolation**: Analytics queries can't impact real-time odds collection
5. **Security**: Services only have access to their own data
