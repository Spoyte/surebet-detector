/**
 * Event Sourcing System for Surebet Detector
 * 
 * Provides complete audit trail for all state changes across the application.
 * Tracks bets, opportunities, bankroll changes, and system events.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Event Store - persistent storage for domain events
 * Supports in-memory, file-based, and database storage
 */
export class EventStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storage = options.storage || new InMemoryStorage();
    this.serializer = options.serializer || JSON;
    this.metadataProvider = options.metadataProvider || (() => ({}));
  }

  /**
   * Append events to a stream
   */
  async append(streamId, events, expectedVersion = null) {
    const currentVersion = await this.getStreamVersion(streamId);
    
    // Optimistic concurrency check
    if (expectedVersion !== null && currentVersion !== expectedVersion) {
      throw new ConcurrencyError(
        `Expected version ${expectedVersion} but found ${currentVersion}`,
        { streamId, expectedVersion, currentVersion }
      );
    }

    const metadata = await this.metadataProvider();
    const storedEvents = events.map((event, index) => ({
      id: this._generateId(),
      streamId,
      version: currentVersion + index + 1,
      type: event.type,
      data: event.data,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
        ...event.metadata
      }
    }));

    await this.storage.append(streamId, storedEvents);
    
    // Emit events for subscribers
    for (const event of storedEvents) {
      this.emit('event', event);
      this.emit(`event:${event.type}`, event);
    }

    return storedEvents;
  }

  /**
   * Read events from a stream
   */
  async readStream(streamId, options = {}) {
    const { fromVersion = 1, toVersion = null, limit = null } = options;
    return await this.storage.read(streamId, { fromVersion, toVersion, limit });
  }

  /**
   * Get current version of a stream
   */
  async getStreamVersion(streamId) {
    return await this.storage.getVersion(streamId);
  }

  /**
   * Read all events (for projections)
   */
  async readAll(options = {}) {
    const { fromPosition = 0, limit = null, eventTypes = null } = options;
    return await this.storage.readAll({ fromPosition, limit, eventTypes });
  }

  /**
   * Subscribe to new events
   */
  subscribe(eventTypes = null, handler) {
    if (eventTypes === null) {
      this.on('event', handler);
    } else {
      const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
      for (const type of types) {
        this.on(`event:${type}`, handler);
      }
    }
    
    return () => this.unsubscribe(eventTypes, handler);
  }

  unsubscribe(eventTypes = null, handler) {
    if (eventTypes === null) {
      this.off('event', handler);
    } else {
      const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
      for (const type of types) {
        this.off(`event:${type}`, handler);
      }
    }
  }

  /**
   * Get events by correlation ID
   */
  async getByCorrelationId(correlationId) {
    const allEvents = await this.readAll();
    return allEvents.filter(e => e.metadata?.correlationId === correlationId);
  }

  /**
   * Get events by causation ID (parent event)
   */
  async getByCausationId(causationId) {
    const allEvents = await this.readAll();
    return allEvents.filter(e => e.metadata?.causationId === causationId);
  }

  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * In-memory storage adapter
 */
export class InMemoryStorage {
  constructor() {
    this.streams = new Map();
    this.allEvents = [];
    this.position = 0;
  }

  async append(streamId, events) {
    if (!this.streams.has(streamId)) {
      this.streams.set(streamId, []);
    }
    
    const stream = this.streams.get(streamId);
    
    for (const event of events) {
      stream.push(event);
      this.allEvents.push({ ...event, position: ++this.position });
    }
  }

  async read(streamId, options) {
    const stream = this.streams.get(streamId) || [];
    const { fromVersion, toVersion, limit } = options;
    
    let events = stream.filter(e => e.version >= fromVersion);
    
    if (toVersion !== null) {
      events = events.filter(e => e.version <= toVersion);
    }
    
    if (limit !== null) {
      events = events.slice(0, limit);
    }
    
    return events;
  }

  async getVersion(streamId) {
    const stream = this.streams.get(streamId);
    return stream ? stream.length : 0;
  }

  async readAll(options) {
    const { fromPosition, limit, eventTypes } = options;
    
    let events = this.allEvents.filter(e => e.position > fromPosition);
    
    if (eventTypes) {
      const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
      events = events.filter(e => types.includes(e.type));
    }
    
    if (limit !== null) {
      events = events.slice(0, limit);
    }
    
    return events;
  }
}

/**
 * File-based storage adapter for persistence
 */
export class FileStorage {
  constructor(basePath = './events') {
    this.basePath = basePath;
    this.streams = new Map();
    this.index = new Map();
    this.position = 0;
    
    // Ensure directory exists
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
    
    this._loadIndex();
  }

  async append(streamId, events) {
    const streamPath = this._getStreamPath(streamId);
    
    // Ensure stream directory exists
    const streamDir = dirname(streamPath);
    if (!existsSync(streamDir)) {
      mkdirSync(streamDir, { recursive: true });
    }

    // Append events to file
    for (const event of events) {
      const line = JSON.stringify(event) + '\n';
      appendFileSync(streamPath, line);
      
      // Update index
      this.position++;
      this.index.set(event.id, {
        streamId,
        position: this.position,
        version: event.version
      });
    }
    
    this._saveIndex();
  }

  async read(streamId, options) {
    const streamPath = this._getStreamPath(streamId);
    
    if (!existsSync(streamPath)) {
      return [];
    }

    const content = readFileSync(streamPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    let events = lines.map(line => JSON.parse(line));
    const { fromVersion, toVersion, limit } = options;
    
    events = events.filter(e => e.version >= fromVersion);
    
    if (toVersion !== null) {
      events = events.filter(e => e.version <= toVersion);
    }
    
    if (limit !== null) {
      events = events.slice(0, limit);
    }
    
    return events;
  }

  async getVersion(streamId) {
    const events = await this.read(streamId, { fromVersion: 1 });
    return events.length;
  }

  async readAll(options) {
    const { fromPosition, limit, eventTypes } = options;
    
    const allEvents = [];
    
    for (const [streamId] of this.index) {
      const events = await this.read(streamId, { fromVersion: 1 });
      allEvents.push(...events.map(e => ({
        ...e,
        position: this.index.get(e.id)?.position || 0
      })));
    }
    
    let events = allEvents
      .filter(e => e.position > fromPosition)
      .sort((a, b) => a.position - b.position);
    
    if (eventTypes) {
      const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
      events = events.filter(e => types.includes(e.type));
    }
    
    if (limit !== null) {
      events = events.slice(0, limit);
    }
    
    return events;
  }

  _getStreamPath(streamId) {
    // Sanitize streamId for filesystem
    const safeId = streamId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return join(this.basePath, `${safeId}.jsonl`);
  }

  _loadIndex() {
    const indexPath = join(this.basePath, 'index.json');
    if (existsSync(indexPath)) {
      const data = JSON.parse(readFileSync(indexPath, 'utf8'));
      this.index = new Map(Object.entries(data.index || {}));
      this.position = data.position || 0;
    }
  }

  _saveIndex() {
    const indexPath = join(this.basePath, 'index.json');
    const data = {
      index: Object.fromEntries(this.index),
      position: this.position,
      updatedAt: new Date().toISOString()
    };
    writeFileSync(indexPath, JSON.stringify(data, null, 2));
  }
}

/**
 * Concurrency error for optimistic locking
 */
export class ConcurrencyError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ConcurrencyError';
    this.details = details;
  }
}

/**
 * Aggregate Root base class
 * Reconstitutes state from events and emits new events
 */
export class AggregateRoot {
  constructor(id) {
    this.id = id;
    this.version = 0;
    this.uncommittedEvents = [];
    this.isReconstituting = false;
  }

  /**
   * Apply an event to mutate state
   * Subclasses override applyEventType methods
   */
  apply(event) {
    // Call specific handler if exists
    const handlerName = `apply${this._capitalize(event.type)}`;
    if (typeof this[handlerName] === 'function') {
      this[handlerName](event.data);
    }
    
    // Also call generic handler
    if (typeof this.onEvent === 'function') {
      this.onEvent(event);
    }

    // Track version during reconstitution
    if (this.isReconstituting) {
      this.version = event.version;
    }
  }

  /**
   * Emit a new event (not yet persisted)
   */
  emitEvent(type, data, metadata = {}) {
    const event = {
      type,
      data,
      metadata: {
        aggregateId: this.id,
        aggregateType: this.constructor.name,
        ...metadata
      }
    };
    
    this.uncommittedEvents.push(event);
    this.apply({ ...event, version: this.version + this.uncommittedEvents.length });
  }

  /**
   * Mark events as committed
   */
  markCommitted() {
    this.version += this.uncommittedEvents.length;
    this.uncommittedEvents = [];
  }

  /**
   * Reconstitute aggregate from event stream
   */
  static async load(eventStore, id) {
    const aggregate = new this(id);
    aggregate.isReconstituting = true;
    
    const events = await eventStore.readStream(id);
    
    for (const event of events) {
      aggregate.apply(event);
    }
    
    aggregate.isReconstituting = false;
    return aggregate;
  }

  /**
   * Create new aggregate and persist first event
   */
  static async create(eventStore, id, createFn) {
    const aggregate = new this(id);
    
    // Let subclass define initial state
    if (typeof aggregate.initialize === 'function') {
      aggregate.initialize();
    }
    
    // Apply creation logic
    await createFn(aggregate);
    
    if (aggregate.uncommittedEvents.length === 0) {
      throw new Error('Aggregate must emit at least one event during creation');
    }
    
    await eventStore.append(id, aggregate.uncommittedEvents, 0);
    aggregate.markCommitted();
    
    return aggregate;
  }

  /**
   * Save pending events to event store
   */
  async save(eventStore) {
    if (this.uncommittedEvents.length === 0) return;
    
    await eventStore.append(this.id, this.uncommittedEvents, this.version);
    this.markCommitted();
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Projection base class for read models
 */
export class Projection {
  constructor(eventStore) {
    this.eventStore = eventStore;
    this.state = {};
    this.lastProcessedPosition = 0;
    this.handlers = {};
  }

  /**
   * Register event handler
   */
  on(eventType, handler) {
    this.handlers[eventType] = handler;
  }

  /**
   * Process all events from the beginning
   */
  async rebuild() {
    this.state = {};
    this.lastProcessedPosition = 0;
    await this.processNewEvents();
  }

  /**
   * Process new events since last checkpoint
   */
  async processNewEvents() {
    const events = await this.eventStore.readAll({
      fromPosition: this.lastProcessedPosition
    });

    for (const event of events) {
      await this.handle(event);
      this.lastProcessedPosition = event.position;
    }

    return events.length;
  }

  /**
   * Handle a single event
   */
  async handle(event) {
    const handler = this.handlers[event.type];
    if (handler) {
      await handler.call(this, event.data, event);
    }
  }

  /**
   * Start continuous processing
   */
  start(intervalMs = 1000) {
    this._interval = setInterval(() => this.processNewEvents(), intervalMs);
  }

  /**
   * Stop continuous processing
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

/**
 * Snapshot store for aggregate optimization
 */
export class SnapshotStore {
  constructor(storage = new InMemoryStorage()) {
    this.storage = storage;
  }

  async save(aggregateType, aggregateId, snapshot) {
    const key = `${aggregateType}:${aggregateId}`;
    await this.storage.append(key, [{
      type: 'Snapshot',
      data: snapshot,
      metadata: { timestamp: new Date().toISOString() }
    }]);
  }

  async load(aggregateType, aggregateId) {
    const key = `${aggregateType}:${aggregateId}`;
    const snapshots = await this.storage.read(key, { fromVersion: 1 });
    return snapshots.length > 0 ? snapshots[snapshots.length - 1].data : null;
  }
}

/**
 * Event Bus for decoupled communication
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map();
  }

  publish(event) {
    this.emit(event.type, event);
    this.emit('*', event);
  }

  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(handler);
    this.on(eventType, handler);
  }

  unsubscribe(eventType, handler) {
    const handlers = this.subscribers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      this.off(eventType, handler);
    }
  }
}

/**
 * Bet Aggregate - tracks lifecycle of a bet
 */
export class BetAggregate extends AggregateRoot {
  constructor(id) {
    super(id);
    this.status = 'pending';
    this.stake = 0;
    this.odds = 0;
    this.bookmaker = null;
    this.selection = null;
    this.match = null;
    this.placedAt = null;
    this.settledAt = null;
    this.result = null;
    this.profit = 0;
  }

  static async place(eventStore, betData) {
    return await this.create(eventStore, betData.betId, async (bet) => {
      bet.emitEvent('BetPlaced', {
        betId: betData.betId,
        opportunityId: betData.opportunityId,
        bookmaker: betData.bookmaker,
        match: betData.match,
        selection: betData.selection,
        odds: betData.odds,
        stake: betData.stake,
        currency: betData.currency,
        placedAt: new Date().toISOString(),
        userId: betData.userId
      }, {
        correlationId: betData.correlationId,
        causationId: betData.causationId
      });
    });
  }

  applyBetPlaced(data) {
    this.status = 'placed';
    this.bookmaker = data.bookmaker;
    this.match = data.match;
    this.selection = data.selection;
    this.odds = data.odds;
    this.stake = data.stake;
    this.placedAt = data.placedAt;
  }

  confirm(confirmationData) {
    this.emitEvent('BetConfirmed', {
      betId: this.id,
      confirmedAt: new Date().toISOString(),
      bookmakerBetId: confirmationData.bookmakerBetId,
      screenshotUrl: confirmationData.screenshotUrl
    });
  }

  applyBetConfirmed(data) {
    this.status = 'confirmed';
    this.bookmakerBetId = data.bookmakerBetId;
  }

  settle(result, profit) {
    this.emitEvent('BetSettled', {
      betId: this.id,
      result,
      profit,
      settledAt: new Date().toISOString()
    });
  }

  applyBetSettled(data) {
    this.status = 'settled';
    this.result = data.result;
    this.profit = data.profit;
    this.settledAt = data.settledAt;
  }

  cancel(reason) {
    this.emitEvent('BetCancelled', {
      betId: this.id,
      reason,
      cancelledAt: new Date().toISOString()
    });
  }

  applyBetCancelled(data) {
    this.status = 'cancelled';
    this.cancellationReason = data.reason;
  }
}

/**
 * Bankroll Aggregate - tracks bankroll changes
 */
export class BankrollAggregate extends AggregateRoot {
  constructor(id) {
    super(id);
    this.balance = 0;
    this.currency = 'EUR';
    this.bookmaker = null;
    this.transactions = [];
  }

  static async createBankroll(eventStore, bankrollData) {
    return await this.create(eventStore, bankrollData.bankrollId, async (bankroll) => {
      bankroll.emitEvent('BankrollCreated', {
        bankrollId: bankrollData.bankrollId,
        bookmaker: bankrollData.bookmaker,
        currency: bankrollData.currency,
        initialBalance: bankrollData.initialBalance || 0,
        createdAt: new Date().toISOString(),
        userId: bankrollData.userId
      });
    });
  }

  applyBankrollCreated(data) {
    this.bookmaker = data.bookmaker;
    this.currency = data.currency;
    this.balance = data.initialBalance;
  }

  deposit(amount, source) {
    this.emitEvent('FundsDeposited', {
      bankrollId: this.id,
      amount,
      source,
      newBalance: this.balance + amount,
      depositedAt: new Date().toISOString()
    });
  }

  applyFundsDeposited(data) {
    this.balance = data.newBalance;
    this.transactions.push({
      type: 'deposit',
      amount: data.amount,
      timestamp: data.depositedAt
    });
  }

  withdraw(amount, destination) {
    if (amount > this.balance) {
      throw new Error('Insufficient funds');
    }
    
    this.emitEvent('FundsWithdrawn', {
      bankrollId: this.id,
      amount,
      destination,
      newBalance: this.balance - amount,
      withdrawnAt: new Date().toISOString()
    });
  }

  applyFundsWithdrawn(data) {
    this.balance = data.newBalance;
    this.transactions.push({
      type: 'withdrawal',
      amount: data.amount,
      timestamp: data.withdrawnAt
    });
  }

  reserveForBet(betId, amount) {
    if (amount > this.balance) {
      throw new Error('Insufficient funds');
    }
    
    this.emitEvent('FundsReserved', {
      bankrollId: this.id,
      betId,
      amount,
      reservedAt: new Date().toISOString()
    });
  }

  applyFundsReserved(data) {
    this.reserved = (this.reserved || 0) + data.amount;
    this.transactions.push({
      type: 'reserve',
      betId: data.betId,
      amount: data.amount,
      timestamp: data.reservedAt
    });
  }

  releaseReservation(betId, amount) {
    this.emitEvent('ReservationReleased', {
      bankrollId: this.id,
      betId,
      amount,
      releasedAt: new Date().toISOString()
    });
  }

  applyReservationReleased(data) {
    this.reserved = (this.reserved || 0) - data.amount;
    this.transactions.push({
      type: 'release',
      betId: data.betId,
      amount: data.amount,
      timestamp: data.releasedAt
    });
  }
}

/**
 * Opportunity Aggregate - tracks arbitrage/value opportunities
 */
export class OpportunityAggregate extends AggregateRoot {
  constructor(id) {
    super(id);
    this.status = 'pending';
    this.type = null;
    this.profitPercentage = 0;
    this.legs = [];
    this.match = null;
    this.discoveredAt = null;
    this.expiresAt = null;
  }

  static async discover(eventStore, opportunityData) {
    return await this.create(eventStore, opportunityData.opportunityId, async (opp) => {
      opp.emitEvent('OpportunityDiscovered', {
        opportunityId: opportunityData.opportunityId,
        type: opportunityData.type,
        match: opportunityData.match,
        legs: opportunityData.legs,
        profitPercentage: opportunityData.profitPercentage,
        evPercentage: opportunityData.evPercentage,
        discoveredAt: new Date().toISOString(),
        expiresAt: opportunityData.expiresAt
      });
    });
  }

  applyOpportunityDiscovered(data) {
    this.status = 'active';
    this.type = data.type;
    this.match = data.match;
    this.legs = data.legs;
    this.profitPercentage = data.profitPercentage;
    this.discoveredAt = data.discoveredAt;
    this.expiresAt = data.expiresAt;
  }

  updateOdds(legIndex, newOdds) {
    this.emitEvent('OpportunityOddsUpdated', {
      opportunityId: this.id,
      legIndex,
      oldOdds: this.legs[legIndex]?.odds,
      newOdds,
      updatedAt: new Date().toISOString()
    });
  }

  applyOpportunityOddsUpdated(data) {
    if (this.legs[data.legIndex]) {
      this.legs[data.legIndex].odds = data.newOdds;
    }
  }

  expire(reason = 'timeout') {
    this.emitEvent('OpportunityExpired', {
      opportunityId: this.id,
      reason,
      expiredAt: new Date().toISOString()
    });
  }

  applyOpportunityExpired(data) {
    this.status = 'expired';
    this.expirationReason = data.reason;
  }

  execute(bets) {
    this.emitEvent('OpportunityExecuted', {
      opportunityId: this.id,
      bets: bets.map(b => b.betId),
      executedAt: new Date().toISOString()
    });
  }

  applyOpportunityExecuted(data) {
    this.status = 'executed';
    this.bets = data.bets;
  }
}

/**
 * Audit Log Projection - builds audit trail from events
 */
export class AuditLogProjection extends Projection {
  constructor(eventStore) {
    super(eventStore);
    this.auditEntries = [];
    
    // Register handlers for all event types
    this.on('BetPlaced', this.onBetPlaced);
    this.on('BetConfirmed', this.onBetConfirmed);
    this.on('BetSettled', this.onBetSettled);
    this.on('BetCancelled', this.onBetCancelled);
    this.on('BankrollCreated', this.onBankrollCreated);
    this.on('FundsDeposited', this.onFundsDeposited);
    this.on('FundsWithdrawn', this.onFundsWithdrawn);
    this.on('OpportunityDiscovered', this.onOpportunityDiscovered);
    this.on('OpportunityExpired', this.onOpportunityExpired);
    this.on('OpportunityExecuted', this.onOpportunityExecuted);
  }

  onBetPlaced(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'BET_PLACED',
      entityType: 'Bet',
      entityId: data.betId,
      userId: data.userId,
      details: {
        bookmaker: data.bookmaker,
        match: data.match,
        selection: data.selection,
        odds: data.odds,
        stake: data.stake,
        currency: data.currency
      },
      correlationId: event.metadata.correlationId,
      causationId: event.metadata.causationId
    });
  }

  onBetConfirmed(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'BET_CONFIRMED',
      entityType: 'Bet',
      entityId: data.betId,
      details: {
        bookmakerBetId: data.bookmakerBetId
      }
    });
  }

  onBetSettled(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'BET_SETTLED',
      entityType: 'Bet',
      entityId: data.betId,
      details: {
        result: data.result,
        profit: data.profit
      }
    });
  }

  onBetCancelled(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'BET_CANCELLED',
      entityType: 'Bet',
      entityId: data.betId,
      details: {
        reason: data.reason
      }
    });
  }

  onBankrollCreated(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'BANKROLL_CREATED',
      entityType: 'Bankroll',
      entityId: data.bankrollId,
      userId: data.userId,
      details: {
        bookmaker: data.bookmaker,
        currency: data.currency,
        initialBalance: data.initialBalance
      }
    });
  }

  onFundsDeposited(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'FUNDS_DEPOSITED',
      entityType: 'Bankroll',
      entityId: data.bankrollId,
      details: {
        amount: data.amount,
        source: data.source,
        newBalance: data.newBalance
      }
    });
  }

  onFundsWithdrawn(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'FUNDS_WITHDRAWN',
      entityType: 'Bankroll',
      entityId: data.bankrollId,
      details: {
        amount: data.amount,
        destination: data.destination,
        newBalance: data.newBalance
      }
    });
  }

  onOpportunityDiscovered(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'OPPORTUNITY_DISCOVERED',
      entityType: 'Opportunity',
      entityId: data.opportunityId,
      details: {
        type: data.type,
        match: data.match,
        profitPercentage: data.profitPercentage,
        evPercentage: data.evPercentage,
        legs: data.legs.length
      }
    });
  }

  onOpportunityExpired(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'OPPORTUNITY_EXPIRED',
      entityType: 'Opportunity',
      entityId: data.opportunityId,
      details: {
        reason: data.reason
      }
    });
  }

  onOpportunityExecuted(data, event) {
    this.auditEntries.push({
      timestamp: event.metadata.timestamp,
      action: 'OPPORTUNITY_EXECUTED',
      entityType: 'Opportunity',
      entityId: data.opportunityId,
      details: {
        bets: data.bets
      }
    });
  }

  /**
   * Get audit trail for a specific entity
   */
  getAuditTrail(entityType, entityId) {
    return this.auditEntries.filter(
      entry => entry.entityType === entityType && entry.entityId === entityId
    );
  }

  /**
   * Get audit trail for a time range
   */
  getAuditTrailForPeriod(startDate, endDate) {
    return this.auditEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  }

  /**
   * Get audit trail for a user
   */
  getUserAuditTrail(userId) {
    return this.auditEntries.filter(entry => entry.userId === userId);
  }

  /**
   * Export audit trail to JSON
   */
  exportToJson() {
    return JSON.stringify(this.auditEntries, null, 2);
  }

  /**
   * Export audit trail to CSV
   */
  exportToCsv() {
    const headers = ['timestamp', 'action', 'entityType', 'entityId', 'userId', 'details'];
    const rows = this.auditEntries.map(entry => [
      entry.timestamp,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.userId || '',
      JSON.stringify(entry.details)
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

/**
 * Event Sourcing Manager - main entry point
 */
export class EventSourcingManager {
  constructor(options = {}) {
    this.eventStore = new EventStore({
      storage: options.storage || new InMemoryStorage(),
      metadataProvider: options.metadataProvider
    });
    
    this.snapshotStore = new SnapshotStore(options.snapshotStorage);
    this.eventBus = new EventBus();
    this.projections = new Map();
    
    // Wire up event bus to event store
    this.eventStore.subscribe(null, (event) => {
      this.eventBus.publish(event);
    });
  }

  /**
   * Register a projection
   */
  registerProjection(name, projection) {
    this.projections.set(name, projection);
  }

  /**
   * Get a projection
   */
  getProjection(name) {
    return this.projections.get(name);
  }

  /**
   * Start all projections
   */
  startProjections(intervalMs = 1000) {
    for (const projection of this.projections.values()) {
      projection.start(intervalMs);
    }
  }

  /**
   * Stop all projections
   */
  stopProjections() {
    for (const projection of this.projections.values()) {
      projection.stop();
    }
  }

  /**
   * Create a new bet
   */
  async createBet(betData) {
    return await BetAggregate.place(this.eventStore, betData);
  }

  /**
   * Load a bet
   */
  async loadBet(betId) {
    return await BetAggregate.load(this.eventStore, betId);
  }

  /**
   * Create a new bankroll
   */
  async createBankroll(bankrollData) {
    return await BankrollAggregate.createBankroll(this.eventStore, bankrollData);
  }

  /**
   * Load a bankroll
   */
  async loadBankroll(bankrollId) {
    return await BankrollAggregate.load(this.eventStore, bankrollId);
  }

  /**
   * Create a new opportunity
   */
  async createOpportunity(opportunityData) {
    return await OpportunityAggregate.discover(this.eventStore, opportunityData);
  }

  /**
   * Load an opportunity
   */
  async loadOpportunity(opportunityId) {
    return await OpportunityAggregate.load(this.eventStore, opportunityId);
  }

  /**
   * Get audit trail for debugging
   */
  async getAuditTrail(entityType, entityId) {
    const auditProjection = this.getProjection('audit');
    if (auditProjection) {
      return auditProjection.getAuditTrail(entityType, entityId);
    }
    return [];
  }

  /**
   * Replay events to rebuild state
   */
  async replayEvents(eventTypes = null) {
    const events = await this.eventStore.readAll({ eventTypes });
    
    for (const projection of this.projections.values()) {
      await projection.rebuild();
    }
    
    return events.length;
  }

  /**
   * Export all events for backup
   */
  async exportEvents() {
    const events = await this.eventStore.readAll();
    return JSON.stringify(events, null, 2);
  }

  /**
   * Import events from backup
   */
  async importEvents(eventsJson) {
    const events = JSON.parse(eventsJson);
    
    for (const event of events) {
      await this.eventStore.append(event.streamId, [{
        type: event.type,
        data: event.data,
        metadata: event.metadata
      }], event.version - 1);
    }
    
    return events.length;
  }
}

export default EventSourcingManager;
