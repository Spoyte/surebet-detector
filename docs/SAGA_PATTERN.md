# Saga Pattern for Distributed Transactions

This document describes the Saga pattern implementation for managing distributed transactions across Surebet Detector microservices.

## Overview

The Saga pattern manages long-running transactions that span multiple services by breaking them into a sequence of local transactions. If a step fails, compensating transactions are executed to undo completed steps.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Saga Orchestrator                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Saga 1    │  │   Saga 2    │  │        Saga 3           │  │
│  │  (Running)  │  │ (Completed) │  │     (Compensating)      │  │
│  └──────┬──────┘  └─────────────┘  └───────────┬─────────────┘  │
└─────────┼───────────────────────────────────────┼────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────┐                     ┌─────────────────┐
│  Step 1: Place  │                     │  Step 1: Deduct │
│  Bet (Complete) │                     │  Funds (Undo)   │
└────────┬────────┘                     └─────────────────┘
         │
┌────────▼────────┐
│  Step 2: Track  │
│  Bet (Complete) │
└────────┬────────┘
         │
┌────────▼────────┐
│  Step 3: Deduct │◀── Failed
│  Funds (Failed) │
└─────────────────┘
```

## Patterns

### 1. Choreography Saga
Services react to events from other services. Each service performs its local transaction and publishes an event.

### 2. Orchestration Saga (Implemented)
A central orchestrator coordinates all steps, calling services in sequence and handling failures.

## Core Components

### Saga
The main transaction coordinator:

```javascript
import { Saga } from './saga-pattern.js';

const saga = new Saga({
  name: 'bet-placement',
  parallel: false,
  compensateOnFailure: true
});

saga
  .addStep({
    name: 'validate',
    execute: async (ctx) => { /* validation */ }
  })
  .addStep({
    name: 'place-bet',
    execute: async (ctx) => { /* place bet */ },
    compensate: async (ctx, result) => { /* cancel bet */ }
  });

const result = await saga.execute();
```

### SagaStep
Individual steps with compensation support:

```javascript
{
  id: 'unique-id',           // Optional, auto-generated
  name: 'step-name',         // Human-readable name
  execute: async (ctx) => {}, // Main action
  compensate: async (ctx, result) => {}, // Undo action
  retryPolicy: {             // Retry configuration
    maxRetries: 3,
    delayMs: 1000
  },
  timeoutMs: 30000,          // Timeout
  dependsOn: ['step1']       // Dependencies for ordering
}
```

### SagaOrchestrator
Manages multiple sagas with persistence:

```javascript
import { SagaOrchestrator, InMemorySagaStorage } from './saga-pattern.js';

const orchestrator = new SagaOrchestrator({
  storage: new InMemorySagaStorage(),
  messageBroker: rabbitMQClient // Optional
});

const saga = await orchestrator.createSaga({ name: 'my-saga' });
const result = await orchestrator.executeSaga(saga.id);
```

## Pre-built Sagas

### Bet Placement Saga

Manages the complete bet placement workflow:

```javascript
import { createBetPlacementSaga } from './saga-pattern.js';

const saga = createBetPlacementSaga({
  userId: 'user-123',
  bet: {
    id: 'bet-456',
    bookmakerId: 'unibet',
    eventId: 'evt-789',
    market: '1X2',
    selection: 'home',
    odds: 2.0,
    amount: 100,
    expectedProfit: 5
  },
  services: {
    userManagement: userService,
    bookmaker: bookmakerService,
    betTracker: trackerService
  }
});

const result = await saga.execute();
```

**Steps:**
1. Validate bet parameters
2. Check user balance
3. Reserve funds
4. Place bet with bookmaker
5. Confirm bet placement
6. Update bet tracker
7. Deduct funds (release reservation)

**Compensation:**
- Cancel bet placement
- Release fund reservation
- Refund deducted funds

### Opportunity Execution Saga

Executes all legs of an arbitrage opportunity:

```javascript
import { createOpportunityExecutionSaga } from './saga-pattern.js';

const saga = createOpportunityExecutionSaga({
  userId: 'user-123',
  opportunityId: 'opp-456',
  minProfitPercent: 1.0,
  expectedProfit: 25,
  legs: [
    { bookmakerId: 'unibet', eventId: 'e1', market: '1X2', selection: 'home', odds: 2.1, stake: 100 },
    { bookmakerId: 'betclic', eventId: 'e1', market: '1X2', selection: 'away', odds: 2.0, stake: 105 }
  ],
  services: { /* ... */ }
});
```

**Features:**
- Parallel execution of legs
- Individual leg compensation
- Atomic success/failure

### Withdrawal Saga

Handles withdrawal workflow:

```javascript
import { createWithdrawalSaga } from './saga-pattern.js';

const saga = createWithdrawalSaga({
  userId: 'user-123',
  withdrawalId: 'wd-456',
  amount: 500,
  paymentMethod: 'bank_transfer',
  services: { /* ... */ }
});
```

**Steps:**
1. Validate request
2. Check available balance
3. Lock funds
4. Create withdrawal record
5. Process payment
6. Complete withdrawal

## Execution Modes

### Sequential (Default)
Steps execute one after another:

```javascript
const saga = new Saga({ parallel: false });
```

### Parallel
Independent steps execute concurrently:

```javascript
const saga = new Saga({ parallel: true });
```

### Mixed with Dependencies
Use `dependsOn` to control ordering:

```javascript
saga
  .addStep({ id: 'a', name: 'Step A', execute: async () => {} })
  .addStep({ id: 'b', name: 'Step B', dependsOn: ['a'], execute: async () => {} })
  .addStep({ id: 'c', name: 'Step C', dependsOn: ['a'], execute: async () => {} })
  .addStep({ id: 'd', name: 'Step D', dependsOn: ['b', 'c'], execute: async () => {} });
```

```
A ──┬── B ──┐
    │       D
    └── C ──┘
```

## Error Handling

### Retry Policy

```javascript
{
  retryPolicy: {
    maxRetries: 3,      // Number of retries
    delayMs: 1000       // Delay between retries
  }
}
```

### Timeout

```javascript
{
  timeoutMs: 30000  // 30 second timeout
}
```

### Compensation

When a step fails:
1. Saga status changes to `COMPENSATING`
2. Completed steps are compensated in reverse order
3. Saga status becomes `COMPENSATED`

```javascript
{
  execute: async (ctx) => {
    // Do something
    return { id: 'resource-123' };
  },
  compensate: async (ctx, result) => {
    // Undo using result from execute
    await deleteResource(result.id);
  }
}
```

## Events

Sagas emit events during execution:

```javascript
saga.on(SagaEventType.SAGA_STARTED, (event) => {
  console.log('Saga started:', event.sagaId);
});

saga.on(SagaEventType.STEP_COMPLETED, (event) => {
  console.log('Step completed:', event.stepName);
});

saga.on(SagaEventType.SAGA_FAILED, (event) => {
  console.log('Saga failed:', event.error);
});
```

### Event Types

- `saga.started`
- `step.started`
- `step.completed`
- `step.failed`
- `step.compensating`
- `step.compensated`
- `saga.completed`
- `saga.failed`
- `saga.compensated`

## Persistence

### In-Memory Storage

For development/testing:

```javascript
import { InMemorySagaStorage } from './saga-pattern.js';

const storage = new InMemorySagaStorage();
```

### Custom Storage

Implement the storage interface:

```javascript
class DatabaseSagaStorage {
  async save(saga) {
    await db.sagas.upsert({
      id: saga.id,
      data: saga.toJSON()
    });
  }

  async load(sagaId) {
    const record = await db.sagas.findById(sagaId);
    return record?.data;
  }

  async saveEvent(sagaId, event) {
    await db.sagaEvents.create({
      sagaId,
      ...event
    });
  }

  async list(filters) {
    return await db.sagas.find(filters);
  }
}
```

## Integration with Microservices

### API Gateway

```javascript
import { SagaOrchestrator } from '../src/saga-pattern.js';

const orchestrator = new SagaOrchestrator({ storage });

app.post('/api/bets', async (req, res) => {
  const saga = createBetPlacementSaga({
    userId: req.user.id,
    bet: req.body,
    services: serviceClients
  });

  const result = await orchestrator.executeSaga(saga.id);
  
  if (result.success) {
    res.json({ betId: result.results['track-bet'].betId });
  } else {
    res.status(500).json({ error: result.error });
  }
});
```

### Message Queue Integration

```javascript
const orchestrator = new SagaOrchestrator({
  storage,
  messageBroker: {
    publish: async (topic, event) => {
      await mqClient.publish(topic, event);
    }
  }
});

// Other services can listen to saga events
mqClient.subscribe('saga.events', async (event) => {
  if (event.type === 'saga.completed') {
    await sendNotification(event);
  }
});
```

## Best Practices

### 1. Idempotency
All steps should be idempotent - safe to retry:

```javascript
execute: async (ctx) => {
  // Check if already done
  const existing = await getByIdempotencyKey(ctx.idempotencyKey);
  if (existing) return existing;
  
  // Do the work
  return await doWork();
}
```

### 2. Compensation Safety
Compensation should also be idempotent and handle partial completion:

```javascript
compensate: async (ctx, result) => {
  try {
    await cancelOrder(result.orderId);
  } catch (error) {
    // Order might already be cancelled
    if (error.code !== 'ORDER_ALREADY_CANCELLED') {
      throw error;
    }
  }
}
```

### 3. Timeouts
Always set reasonable timeouts:

```javascript
{
  timeoutMs: 30000,  // External API calls
  timeoutMs: 5000    // Database operations
}
```

### 4. Monitoring
Track saga metrics:

```javascript
saga.on('event', (event) => {
  metrics.increment(`saga.${event.type}`);
  
  if (event.type === SagaEventType.SAGA_FAILED) {
    alerting.notify(`Saga ${event.sagaId} failed`);
  }
});
```

### 5. Testing
Test both success and failure scenarios:

```javascript
describe('Bet Placement Saga', () => {
  it('should complete successfully', async () => {
    // Test success path
  });

  it('should compensate on failure', async () => {
    // Mock a failure and verify compensation
  });
});
```

## Troubleshooting

### Saga Stuck in Running State

Check for:
- Infinite loops in step execution
- Missing `end()` calls
- Unhandled promise rejections

### Compensation Failures

- Log all compensation attempts
- Set up alerts for failed compensations
- Implement manual intervention workflow

### Performance Issues

- Use parallel execution where possible
- Set appropriate timeouts
- Monitor step durations

## API Reference

### Saga

```javascript
// Create saga
new Saga(options)

// Add steps
.addStep(stepOptions)
.addSteps(stepOptionsArray)

// Execute
await saga.execute()

// Manual compensation
await saga.compensate()

// Get state
saga.toJSON()
```

### SagaStep

```javascript
new SagaStep(options)
await step.run(context)
await step.runCompensation(context)
step.canRun(completedSteps)
step.toJSON()
```

### SagaOrchestrator

```javascript
await orchestrator.createSaga(definition)
await orchestrator.executeSaga(sagaId)
await orchestrator.getSaga(sagaId)
await orchestrator.listSagas(filters)
await orchestrator.compensateSaga(sagaId)
```

## Further Reading

- [Saga Pattern - Chris Richardson](https://microservices.io/patterns/data/saga.html)
- [Microsoft Azure - Saga Pattern](https://docs.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga)
- [AWS Saga Pattern](https://aws.amazon.com/blogs/compute/building-a-serverless-distributed-application-using-the-saga-pattern/)
