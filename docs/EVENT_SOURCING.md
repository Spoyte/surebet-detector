# Event Sourcing System for Surebet Detector

## Overview

The Event Sourcing System provides a complete audit trail for all state changes in the Surebet Detector application. Every action (bet placement, bankroll changes, opportunity discovery) is stored as an immutable event, enabling:

- **Complete Audit Trail**: Track every change with full history
- **Temporal Queries**: View system state at any point in time
- **Debugging**: Replay events to reproduce issues
- **Compliance**: Export audit logs for regulatory requirements
- **Analytics**: Analyze patterns from historical data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Surebet Detector                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Bet Tracker │  │  Bankroll   │  │ Opportunity Tracker │ │
│  │   (ES)      │  │   (ES)      │  │       (ES)          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                    │            │
│         └────────────────┼────────────────────┘            │
│                          │                                 │
│         ┌────────────────▼────────────────┐                │
│         │      Event Sourcing Manager      │                │
│         │  ┌──────────────────────────┐   │                │
│         │  │      Event Store         │   │                │
│         │  │  (In-Memory / File / DB) │   │                │
│         │  └──────────────────────────┘   │                │
│         │  ┌──────────────────────────┐   │                │
│         │  │    Audit Projection      │   │                │
│         │  │  (Read Model / Query)    │   │                │
│         │  └──────────────────────────┘   │                │
│         └─────────────────────────────────┘                │
│                          │                                 │
│         ┌────────────────▼────────────────┐                │
│         │         REST API                 │                │
│         │  /api/audit/*, /api/events/*     │                │
│         └─────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Event Store (`event-sourcing.js`)

The core event storage system supporting multiple backends:

- **InMemoryStorage**: Fast, non-persistent (testing/development)
- **FileStorage**: JSONL files with index (production single-node)

#### Key Classes

```javascript
// EventStore - main storage interface
const eventStore = new EventStore({ 
  storage: new InMemoryStorage() 
});

// Append events
await eventStore.append('stream-1', [
  { type: 'BetPlaced', data: { betId: '1', stake: 100 } }
]);

// Read events
const events = await eventStore.readStream('stream-1');

// Subscribe to events
const unsubscribe = eventStore.subscribe('BetPlaced', (event) => {
  console.log('Bet placed:', event.data);
});
```

### 2. Aggregates (`event-sourcing.js`)

Domain aggregates that emit and apply events:

#### BetAggregate

```javascript
// Place a new bet
const bet = await BetAggregate.place(eventStore, {
  betId: 'bet-1',
  bookmaker: 'Unibet',
  match: { home: 'Team A', away: 'Team B' },
  selection: 'Team A',
  odds: 2.0,
  stake: 100,
  currency: 'EUR',
  userId: 'user-1'
});

// Confirm bet placement
await bet.confirm({ 
  bookmakerBetId: 'unibet-123',
  screenshotUrl: 'https://...'
});
await bet.save(eventStore);

// Settle bet
await bet.settle('win', 100);
await bet.save(eventStore);

// Load existing bet
const loadedBet = await BetAggregate.load(eventStore, 'bet-1');
```

#### BankrollAggregate

```javascript
// Create bankroll
const bankroll = await BankrollAggregate.createBankroll(eventStore, {
  bankrollId: 'bank-unibet',
  bookmaker: 'Unibet',
  currency: 'EUR',
  initialBalance: 1000
});

// Deposit
await bankroll.deposit(500, 'wire-transfer');
await bankroll.save(eventStore);

// Withdraw
await bankroll.withdraw(200, 'bank-account');
await bankroll.save(eventStore);

// Reserve for bet
await bankroll.reserveForBet('bet-1', 100);
await bankroll.save(eventStore);

// Release reservation
await bankroll.releaseReservation('bet-1', 100);
await bankroll.save(eventStore);
```

#### OpportunityAggregate

```javascript
// Discover opportunity
const opp = await OpportunityAggregate.discover(eventStore, {
  opportunityId: 'opp-1',
  type: 'arbitrage',
  match: { home: 'Team A', away: 'Team B' },
  legs: [
    { bookmaker: 'Unibet', selection: 'Team A', odds: 2.1 },
    { bookmaker: 'Betclic', selection: 'Team B', odds: 2.0 }
  ],
  profitPercentage: 2.5,
  expiresAt: '2024-12-31T23:59:59Z'
});

// Update odds
await opp.updateOdds(0, 2.2);
await opp.save(eventStore);

// Mark as expired
await opp.expire('odds-changed');
await opp.save(eventStore);

// Mark as executed
await opp.execute([{ betId: 'bet-1' }, { betId: 'bet-2' }]);
await opp.save(eventStore);
```

### 3. Projections (`event-sourcing.js`)

Read models built from events:

#### AuditLogProjection

```javascript
const auditProjection = new AuditLogProjection(eventStore);

// Process new events
await auditProjection.processNewEvents();

// Get audit trail for entity
const trail = auditProjection.getAuditTrail('Bet', 'bet-1');

// Get audit trail for time period
const periodTrail = auditProjection.getAuditTrailForPeriod(
  new Date('2024-01-01'),
  new Date('2024-12-31')
);

// Get user audit trail
const userTrail = auditProjection.getUserAuditTrail('user-1');

// Export
const csv = auditProjection.exportToCsv();
const json = auditProjection.exportToJson();
```

### 4. Integration Layer (`event-sourcing-integration.js`)

Wraps existing components with event sourcing:

```javascript
import { EventSourcingPlugin } from './event-sourcing-integration.js';

// Initialize plugin
const plugin = new EventSourcingPlugin({
  storageType: 'file',        // 'memory' or 'file'
  storagePath: './data/events',
  enableAuditLog: true,
  enableProjections: true
});

await plugin.initialize(surebetDetector);

// Access wrapped components
const { betTracker, bankrollManager, auditAPI } = plugin.getAPI();

// Use event-sourced bet tracker
const bet = await betTracker.trackBet({
  betId: 'bet-1',
  bookmaker: 'Unibet',
  // ...
});

// Get bet with full audit trail
const betWithTrail = await betTracker.getBetWithAuditTrail('bet-1');
```

### 5. REST API (`event-sourcing-api.js`)

#### Audit Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit/trail/:entityType/:entityId` | Get audit trail for entity |
| GET | `/api/audit/period?start=&end=` | Get audit trail for time period |
| GET | `/api/audit/user/:userId` | Get user's audit trail |
| GET | `/api/audit/export?format=json|csv` | Export audit trail |
| GET | `/api/audit/correlation/:correlationId` | Get events by correlation |
| GET | `/api/audit/stats` | Get event statistics |

#### Event Store Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events/stream/:streamId` | Read stream events |
| GET | `/api/events/all` | Read all events |
| POST | `/api/events/replay` | Replay events |
| GET | `/api/events/export` | Export all events |
| POST | `/api/events/import` | Import events |

#### Aggregate Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/aggregates/bet/:betId` | Get bet with audit |
| GET | `/api/aggregates/bankroll/:bankrollId` | Get bankroll with history |
| GET | `/api/aggregates/bankrolls` | Get all bankrolls |
| GET | `/api/aggregates/opportunity/:id` | Get opportunity with history |
| GET | `/api/aggregates/opportunities/active` | Get active opportunities |

## Event Types

### Bet Events

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `BetPlaced` | New bet placed | betId, bookmaker, match, selection, odds, stake, currency |
| `BetConfirmed` | Bet confirmed by bookmaker | betId, bookmakerBetId, screenshotUrl |
| `BetSettled` | Bet settled with result | betId, result, profit |
| `BetCancelled` | Bet cancelled | betId, reason |

### Bankroll Events

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `BankrollCreated` | New bankroll created | bankrollId, bookmaker, currency, initialBalance |
| `FundsDeposited` | Funds added | bankrollId, amount, source, newBalance |
| `FundsWithdrawn` | Funds removed | bankrollId, amount, destination, newBalance |
| `FundsReserved` | Funds reserved for bet | bankrollId, betId, amount |
| `ReservationReleased` | Reservation released | bankrollId, betId, amount |

### Opportunity Events

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `OpportunityDiscovered` | New opportunity found | opportunityId, type, match, legs, profitPercentage |
| `OpportunityOddsUpdated` | Odds changed | opportunityId, legIndex, oldOdds, newOdds |
| `OpportunityExpired` | Opportunity no longer valid | opportunityId, reason |
| `OpportunityExecuted` | Bets placed on opportunity | opportunityId, bets |

## Usage Examples

### Complete Betting Workflow

```javascript
import { EventSourcingManager, AuditLogProjection } from './event-sourcing.js';

// Setup
const esm = new EventSourcingManager({
  storage: new FileStorage('./data/events')
});

const auditProjection = new AuditLogProjection(esm.eventStore);
esm.registerProjection('audit', auditProjection);
esm.startProjections();

// 1. Create bankroll
const bankroll = await esm.createBankroll({
  bankrollId: 'bank-unibet',
  bookmaker: 'Unibet',
  currency: 'EUR',
  initialBalance: 1000,
  userId: 'user-1'
});

// 2. Discover opportunity
const opportunity = await esm.createOpportunity({
  opportunityId: 'opp-1',
  type: 'arbitrage',
  match: { home: 'Team A', away: 'Team B' },
  legs: [
    { bookmaker: 'Unibet', selection: 'Team A', odds: 2.1 },
    { bookmaker: 'Betclic', selection: 'Team B', odds: 2.0 }
  ],
  profitPercentage: 2.5,
  expiresAt: new Date(Date.now() + 3600000).toISOString()
});

// 3. Reserve funds
await bankroll.reserveForBet('bet-1', 100);
await bankroll.save(esm.eventStore);

// 4. Place bet
const bet = await esm.createBet({
  betId: 'bet-1',
  opportunityId: 'opp-1',
  bookmaker: 'Unibet',
  match: { home: 'Team A', away: 'Team B' },
  selection: 'Team A',
  odds: 2.1,
  stake: 100,
  currency: 'EUR',
  userId: 'user-1'
});

// 5. Confirm bet
await bet.confirm({ bookmakerBetId: 'unibet-123' });
await bet.save(esm.eventStore);

// 6. Settle bet
await bet.settle('win', 110);
await bet.save(esm.eventStore);

// 7. Query audit trail
const trail = auditProjection.getAuditTrail('Bet', 'bet-1');
console.log('Bet history:', trail);

// 8. Export for compliance
const csv = auditProjection.exportToCsv();
fs.writeFileSync('audit-2024.csv', csv);
```

### Debugging with Event Replay

```javascript
// Something went wrong - replay events to debug
const esm = new EventSourcingManager();

// Import events from backup
const backup = fs.readFileSync('events-backup.json', 'utf8');
await esm.importEvents(backup);

// Replay to rebuild state
await esm.replayEvents();

// Check specific aggregate
const bet = await esm.loadBet('bet-1');
console.log('Bet state after replay:', bet);
```

### Correlation Tracking

```javascript
// Track related operations with correlation ID
const correlationId = `corr-${Date.now()}`;

// All these events will be linked
await esm.createOpportunity({
  opportunityId: 'opp-1',
  // ...
  correlationId
});

await esm.createBet({
  betId: 'bet-1',
  // ...
  correlationId
});

await esm.createBet({
  betId: 'bet-2',
  // ...
  correlationId
});

// Query all related events
const relatedEvents = await esm.eventStore.getByCorrelationId(correlationId);
```

## Configuration

### Environment Variables

```bash
# Storage configuration
EVENT_STORAGE_TYPE=file          # 'memory' or 'file'
EVENT_STORAGE_PATH=./data/events

# Projection settings
ENABLE_AUDIT_LOG=true
ENABLE_PROJECTIONS=true
PROJECTION_INTERVAL_MS=1000

# Performance
EVENT_SNAPSHOT_FREQUENCY=100     # Create snapshot every N events
```

### Plugin Options

```javascript
const plugin = new EventSourcingPlugin({
  // Storage
  storageType: 'file',              // 'memory' or 'file'
  storagePath: './data/events',     // For file storage
  
  // Features
  enableAuditLog: true,             // Enable audit projection
  enableProjections: true,          // Enable continuous projections
  
  // Metadata
  metadataProvider: () => ({        // Add metadata to all events
    service: 'surebet-detector',
    version: '1.0.0',
    hostname: os.hostname()
  })
});
```

## Testing

```bash
# Run event sourcing tests
npm test -- event-sourcing.test.js

# Run with coverage
npm test -- --coverage event-sourcing.test.js
```

## Performance Considerations

1. **Snapshots**: For aggregates with many events, implement snapshotting
2. **Projection Caching**: Audit projection keeps state in memory
3. **File Storage**: Uses append-only JSONL for fast writes
4. **Batch Reads**: Use `limit` and version ranges for pagination

## Future Enhancements

- [ ] PostgreSQL storage adapter
- [ ] EventStoreDB integration
- [ ] Kafka event bus for distributed systems
- [ ] Snapshot compression
- [ ] Event schema versioning
- [ ] GDPR-compliant event deletion
