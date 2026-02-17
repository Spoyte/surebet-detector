/**
 * Event Sourcing Tests for Surebet Detector
 */

import { 
  EventStore, 
  InMemoryStorage, 
  FileStorage,
  AggregateRoot,
  Projection,
  BetAggregate,
  BankrollAggregate,
  OpportunityAggregate,
  AuditLogProjection,
  EventSourcingManager,
  ConcurrencyError
} from './event-sourcing.js';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EventStore', () => {
  let eventStore;

  beforeEach(() => {
    eventStore = new EventStore({ storage: new InMemoryStorage() });
  });

  describe('append', () => {
    it('should append events to a stream', async () => {
      const events = [
        { type: 'BetPlaced', data: { betId: 'bet-1', stake: 100 } }
      ];
      
      const stored = await eventStore.append('stream-1', events);
      
      expect(stored).toHaveLength(1);
      expect(stored[0].type).toBe('BetPlaced');
      expect(stored[0].version).toBe(1);
      expect(stored[0].streamId).toBe('stream-1');
    });

    it('should increment versions for multiple events', async () => {
      const events1 = [{ type: 'BetPlaced', data: { betId: 'bet-1' } }];
      const events2 = [{ type: 'BetConfirmed', data: { betId: 'bet-1' } }];
      
      await eventStore.append('stream-1', events1);
      const stored = await eventStore.append('stream-1', events2);
      
      expect(stored[0].version).toBe(2);
    });

    it('should emit events after appending', async () => {
      const handler = jest.fn();
      eventStore.subscribe('BetPlaced', handler);
      
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('BetPlaced');
    });

    it('should throw ConcurrencyError on version mismatch', async () => {
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      
      await expect(
        eventStore.append('stream-1', [
          { type: 'BetConfirmed', data: { betId: 'bet-1' } }
        ], 0) // Expected version 0, but actual is 1
      ).rejects.toThrow(ConcurrencyError);
    });
  });

  describe('readStream', () => {
    beforeEach(async () => {
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } },
        { type: 'BetConfirmed', data: { betId: 'bet-1' } },
        { type: 'BetSettled', data: { betId: 'bet-1', profit: 10 } }
      ]);
    });

    it('should read all events from a stream', async () => {
      const events = await eventStore.readStream('stream-1');
      
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('BetPlaced');
      expect(events[2].type).toBe('BetSettled');
    });

    it('should filter by version range', async () => {
      const events = await eventStore.readStream('stream-1', { 
        fromVersion: 2, 
        toVersion: 2 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('BetConfirmed');
    });

    it('should limit results', async () => {
      const events = await eventStore.readStream('stream-1', { limit: 2 });
      
      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent stream', async () => {
      const events = await eventStore.readStream('non-existent');
      
      expect(events).toEqual([]);
    });
  });

  describe('readAll', () => {
    beforeEach(async () => {
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      await eventStore.append('stream-2', [
        { type: 'BankrollCreated', data: { bankrollId: 'bank-1' } }
      ]);
    });

    it('should read all events from all streams', async () => {
      const events = await eventStore.readAll();
      
      expect(events).toHaveLength(2);
    });

    it('should filter by event type', async () => {
      const events = await eventStore.readAll({ eventTypes: 'BetPlaced' });
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('BetPlaced');
    });

    it('should filter by multiple event types', async () => {
      const events = await eventStore.readAll({ 
        eventTypes: ['BetPlaced', 'BankrollCreated'] 
      });
      
      expect(events).toHaveLength(2);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to all events', async () => {
      const handler = jest.fn();
      const unsubscribe = eventStore.subscribe(null, handler);
      
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
    });

    it('should subscribe to specific event types', async () => {
      const betHandler = jest.fn();
      const bankrollHandler = jest.fn();
      
      eventStore.subscribe('BetPlaced', betHandler);
      eventStore.subscribe('BankrollCreated', bankrollHandler);
      
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      
      expect(betHandler).toHaveBeenCalledTimes(1);
      expect(bankrollHandler).not.toHaveBeenCalled();
    });

    it('should unsubscribe correctly', async () => {
      const handler = jest.fn();
      const unsubscribe = eventStore.subscribe('BetPlaced', handler);
      
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-1' } }
      ]);
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      await eventStore.append('stream-1', [
        { type: 'BetPlaced', data: { betId: 'bet-2' } }
      ]);
      
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });
});

describe('FileStorage', () => {
  let storage;
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'event-store-test-'));
    storage = new FileStorage(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should persist events to files', async () => {
    await storage.append('stream-1', [
      { id: '1', type: 'BetPlaced', version: 1, data: {}, metadata: {} }
    ]);
    
    const events = await storage.read('stream-1', { fromVersion: 1 });
    
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('BetPlaced');
  });

  it('should maintain index across instances', async () => {
    await storage.append('stream-1', [
      { id: '1', type: 'BetPlaced', version: 1, data: {}, metadata: {} }
    ]);
    
    // Create new storage instance pointing to same directory
    const storage2 = new FileStorage(tempDir);
    const events = await storage2.read('stream-1', { fromVersion: 1 });
    
    expect(events).toHaveLength(1);
  });

  it('should handle special characters in stream IDs', async () => {
    const streamId = 'bet:user@example.com:123';
    await storage.append(streamId, [
      { id: '1', type: 'BetPlaced', version: 1, data: {}, metadata: {} }
    ]);
    
    const events = await storage.read(streamId, { fromVersion: 1 });
    
    expect(events).toHaveLength(1);
  });
});

describe('BetAggregate', () => {
  let eventStore;

  beforeEach(() => {
    eventStore = new EventStore({ storage: new InMemoryStorage() });
  });

  describe('place', () => {
    it('should create a new bet', async () => {
      const bet = await BetAggregate.place(eventStore, {
        betId: 'bet-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        match: { home: 'Team A', away: 'Team B' },
        selection: 'Team A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR',
        userId: 'user-1'
      });
      
      expect(bet.id).toBe('bet-1');
      expect(bet.status).toBe('placed');
      expect(bet.stake).toBe(100);
      expect(bet.odds).toBe(2.0);
    });

    it('should emit BetPlaced event', async () => {
      const events = [];
      eventStore.subscribe('BetPlaced', (e) => events.push(e));
      
      await BetAggregate.place(eventStore, {
        betId: 'bet-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        match: { home: 'Team A', away: 'Team B' },
        selection: 'Team A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR',
        userId: 'user-1'
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].data.betId).toBe('bet-1');
      expect(events[0].data.bookmaker).toBe('Unibet');
    });
  });

  describe('confirm', () => {
    it('should confirm a placed bet', async () => {
      const bet = await BetAggregate.place(eventStore, {
        betId: 'bet-1',
        bookmaker: 'Unibet',
        match: { home: 'Team A', away: 'Team B' },
        selection: 'Team A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR'
      });
      
      await bet.confirm({ bookmakerBetId: 'unibet-123', screenshotUrl: 'http://img/1' });
      await bet.save(eventStore);
      
      expect(bet.status).toBe('confirmed');
      expect(bet.bookmakerBetId).toBe('unibet-123');
    });
  });

  describe('settle', () => {
    it('should settle a confirmed bet', async () => {
      const bet = await BetAggregate.place(eventStore, {
        betId: 'bet-1',
        bookmaker: 'Unibet',
        match: { home: 'Team A', away: 'Team B' },
        selection: 'Team A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR'
      });
      
      await bet.confirm({ bookmakerBetId: 'unibet-123' });
      await bet.save(eventStore);
      
      await bet.settle('win', 100);
      await bet.save(eventStore);
      
      expect(bet.status).toBe('settled');
      expect(bet.result).toBe('win');
      expect(bet.profit).toBe(100);
    });
  });

  describe('load', () => {
    it('should reconstitute bet from events', async () => {
      // Create and modify bet
      const bet = await BetAggregate.place(eventStore, {
        betId: 'bet-1',
        bookmaker: 'Unibet',
        match: { home: 'Team A', away: 'Team B' },
        selection: 'Team A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR'
      });
      
      await bet.confirm({ bookmakerBetId: 'unibet-123' });
      await bet.save(eventStore);
      
      // Load fresh instance
      const loadedBet = await BetAggregate.load(eventStore, 'bet-1');
      
      expect(loadedBet.id).toBe('bet-1');
      expect(loadedBet.status).toBe('confirmed');
      expect(loadedBet.bookmakerBetId).toBe('unibet-123');
      expect(loadedBet.version).toBe(2);
    });
  });
});

describe('BankrollAggregate', () => {
  let eventStore;

  beforeEach(() => {
    eventStore = new EventStore({ storage: new InMemoryStorage() });
  });

  describe('createBankroll', () => {
    it('should create a new bankroll', async () => {
      const bankroll = await BankrollAggregate.createBankroll(eventStore, {
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 1000,
        userId: 'user-1'
      });
      
      expect(bankroll.id).toBe('bank-1');
      expect(bankroll.balance).toBe(1000);
      expect(bankroll.currency).toBe('EUR');
    });
  });

  describe('deposit', () => {
    it('should add funds to bankroll', async () => {
      const bankroll = await BankrollAggregate.createBankroll(eventStore, {
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 1000
      });
      
      await bankroll.deposit(500, 'wire-transfer');
      await bankroll.save(eventStore);
      
      expect(bankroll.balance).toBe(1500);
    });
  });

  describe('withdraw', () => {
    it('should remove funds from bankroll', async () => {
      const bankroll = await BankrollAggregate.createBankroll(eventStore, {
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 1000
      });
      
      await bankroll.withdraw(200, 'bank-account');
      await bankroll.save(eventStore);
      
      expect(bankroll.balance).toBe(800);
    });

    it('should throw on insufficient funds', async () => {
      const bankroll = await BankrollAggregate.createBankroll(eventStore, {
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 100
      });
      
      expect(() => bankroll.withdraw(200, 'bank-account')).toThrow('Insufficient funds');
    });
  });

  describe('reserveForBet', () => {
    it('should reserve funds for a bet', async () => {
      const bankroll = await BankrollAggregate.createBankroll(eventStore, {
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 1000
      });
      
      await bankroll.reserveForBet('bet-1', 100);
      await bankroll.save(eventStore);
      
      expect(bankroll.reserved).toBe(100);
    });
  });
});

describe('OpportunityAggregate', () => {
  let eventStore;

  beforeEach(() => {
    eventStore = new EventStore({ storage: new InMemoryStorage() });
  });

  describe('discover', () => {
    it('should create a new opportunity', async () => {
      const opp = await OpportunityAggregate.discover(eventStore, {
        opportunityId: 'opp-1',
        type: 'arbitrage',
        match: { home: 'Team A', away: 'Team B', league: 'Premier League' },
        legs: [
          { bookmaker: 'Unibet', selection: 'Team A', odds: 2.1 },
          { bookmaker: 'Betclic', selection: 'Team B', odds: 2.0 }
        ],
        profitPercentage: 2.5,
        evPercentage: 0,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });
      
      expect(opp.id).toBe('opp-1');
      expect(opp.status).toBe('active');
      expect(opp.profitPercentage).toBe(2.5);
      expect(opp.legs).toHaveLength(2);
    });
  });

  describe('expire', () => {
    it('should mark opportunity as expired', async () => {
      const opp = await OpportunityAggregate.discover(eventStore, {
        opportunityId: 'opp-1',
        type: 'arbitrage',
        match: { home: 'Team A', away: 'Team B' },
        legs: [],
        profitPercentage: 2.5,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });
      
      await opp.expire('odds-changed');
      await opp.save(eventStore);
      
      expect(opp.status).toBe('expired');
      expect(opp.expirationReason).toBe('odds-changed');
    });
  });

  describe('execute', () => {
    it('should mark opportunity as executed with bets', async () => {
      const opp = await OpportunityAggregate.discover(eventStore, {
        opportunityId: 'opp-1',
        type: 'arbitrage',
        match: { home: 'Team A', away: 'Team B' },
        legs: [],
        profitPercentage: 2.5,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });
      
      await opp.execute([{ betId: 'bet-1' }, { betId: 'bet-2' }]);
      await opp.save(eventStore);
      
      expect(opp.status).toBe('executed');
      expect(opp.bets).toEqual(['bet-1', 'bet-2']);
    });
  });
});

describe('AuditLogProjection', () => {
  let eventStore;
  let auditProjection;

  beforeEach(() => {
    eventStore = new EventStore({ storage: new InMemoryStorage() });
    auditProjection = new AuditLogProjection(eventStore);
  });

  describe('bet events', () => {
    it('should track bet placements', async () => {
      await eventStore.append('bet-1', [
        { 
          type: 'BetPlaced', 
          data: { 
            betId: 'bet-1', 
            bookmaker: 'Unibet',
            match: { home: 'A', away: 'B' },
            selection: 'A',
            odds: 2.0,
            stake: 100,
            currency: 'EUR'
          },
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        }
      ]);
      
      await auditProjection.processNewEvents();
      
      const trail = auditProjection.getAuditTrail('Bet', 'bet-1');
      expect(trail).toHaveLength(1);
      expect(trail[0].action).toBe('BET_PLACED');
      expect(trail[0].details.bookmaker).toBe('Unibet');
    });

    it('should track full bet lifecycle', async () => {
      await eventStore.append('bet-1', [
        { 
          type: 'BetPlaced', 
          data: { betId: 'bet-1', bookmaker: 'Unibet', match: { home: 'A', away: 'B' }, selection: 'A', odds: 2.0, stake: 100, currency: 'EUR' },
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        },
        { 
          type: 'BetConfirmed', 
          data: { betId: 'bet-1', bookmakerBetId: 'ub-123' },
          metadata: { timestamp: '2024-01-01T00:01:00Z' }
        },
        { 
          type: 'BetSettled', 
          data: { betId: 'bet-1', result: 'win', profit: 100 },
          metadata: { timestamp: '2024-01-02T00:00:00Z' }
        }
      ]);
      
      await auditProjection.processNewEvents();
      
      const trail = auditProjection.getAuditTrail('Bet', 'bet-1');
      expect(trail).toHaveLength(3);
      expect(trail[0].action).toBe('BET_PLACED');
      expect(trail[1].action).toBe('BET_CONFIRMED');
      expect(trail[2].action).toBe('BET_SETTLED');
    });
  });

  describe('bankroll events', () => {
    it('should track fund movements', async () => {
      await eventStore.append('bank-1', [
        { 
          type: 'BankrollCreated', 
          data: { bankrollId: 'bank-1', bookmaker: 'Unibet', currency: 'EUR', initialBalance: 1000 },
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        },
        { 
          type: 'FundsDeposited', 
          data: { bankrollId: 'bank-1', amount: 500, source: 'wire', newBalance: 1500 },
          metadata: { timestamp: '2024-01-02T00:00:00Z' }
        },
        { 
          type: 'FundsWithdrawn', 
          data: { bankrollId: 'bank-1', amount: 200, destination: 'bank', newBalance: 1300 },
          metadata: { timestamp: '2024-01-03T00:00:00Z' }
        }
      ]);
      
      await auditProjection.processNewEvents();
      
      const trail = auditProjection.getAuditTrail('Bankroll', 'bank-1');
      expect(trail).toHaveLength(3);
      expect(trail[1].action).toBe('FUNDS_DEPOSITED');
      expect(trail[1].details.amount).toBe(500);
    });
  });

  describe('export', () => {
    it('should export to CSV', async () => {
      await eventStore.append('bet-1', [
        { 
          type: 'BetPlaced', 
          data: { betId: 'bet-1', bookmaker: 'Unibet', match: { home: 'A', away: 'B' }, selection: 'A', odds: 2.0, stake: 100, currency: 'EUR' },
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        }
      ]);
      
      await auditProjection.processNewEvents();
      
      const csv = auditProjection.exportToCsv();
      expect(csv).toContain('timestamp,action,entityType,entityId');
      expect(csv).toContain('BET_PLACED');
    });

    it('should export to JSON', async () => {
      await eventStore.append('bet-1', [
        { 
          type: 'BetPlaced', 
          data: { betId: 'bet-1', bookmaker: 'Unibet', match: { home: 'A', away: 'B' }, selection: 'A', odds: 2.0, stake: 100, currency: 'EUR' },
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        }
      ]);
      
      await auditProjection.processNewEvents();
      
      const json = auditProjection.exportToJson();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('BET_PLACED');
    });
  });
});

describe('EventSourcingManager', () => {
  let manager;

  beforeEach(() => {
    manager = new EventSourcingManager();
  });

  describe('bet operations', () => {
    it('should create and load bets', async () => {
      await manager.createBet({
        betId: 'bet-1',
        bookmaker: 'Unibet',
        match: { home: 'A', away: 'B' },
        selection: 'A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR'
      });
      
      const bet = await manager.loadBet('bet-1');
      
      expect(bet.id).toBe('bet-1');
      expect(bet.status).toBe('placed');
    });
  });

  describe('bankroll operations', () => {
    it('should create and load bankrolls', async () => {
      await manager.createBankroll({
        bankrollId: 'bank-1',
        bookmaker: 'Unibet',
        currency: 'EUR',
        initialBalance: 1000
      });
      
      const bankroll = await manager.loadBankroll('bank-1');
      
      expect(bankroll.id).toBe('bank-1');
      expect(bankroll.balance).toBe(1000);
    });
  });

  describe('opportunity operations', () => {
    it('should create and load opportunities', async () => {
      await manager.createOpportunity({
        opportunityId: 'opp-1',
        type: 'arbitrage',
        match: { home: 'A', away: 'B' },
        legs: [],
        profitPercentage: 2.5,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });
      
      const opp = await manager.loadOpportunity('opp-1');
      
      expect(opp.id).toBe('opp-1');
      expect(opp.status).toBe('active');
    });
  });

  describe('projections', () => {
    it('should register and retrieve projections', () => {
      const projection = new AuditLogProjection(manager.eventStore);
      manager.registerProjection('audit', projection);
      
      expect(manager.getProjection('audit')).toBe(projection);
    });
  });

  describe('export/import', () => {
    it('should export and import events', async () => {
      await manager.createBet({
        betId: 'bet-1',
        bookmaker: 'Unibet',
        match: { home: 'A', away: 'B' },
        selection: 'A',
        odds: 2.0,
        stake: 100,
        currency: 'EUR'
      });
      
      const exported = await manager.exportEvents();
      
      // Create new manager and import
      const manager2 = new EventSourcingManager();
      await manager2.importEvents(exported);
      
      const bet = await manager2.loadBet('bet-1');
      expect(bet.status).toBe('placed');
    });
  });
});

describe('Integration', () => {
  let manager;

  beforeEach(() => {
    manager = new EventSourcingManager();
    const auditProjection = new AuditLogProjection(manager.eventStore);
    manager.registerProjection('audit', auditProjection);
  });

  it('should handle complete betting workflow', async () => {
    // Create bankroll
    const bankroll = await manager.createBankroll({
      bankrollId: 'bank-unibet',
      bookmaker: 'Unibet',
      currency: 'EUR',
      initialBalance: 1000,
      userId: 'user-1'
    });
    
    // Create opportunity
    const opportunity = await manager.createOpportunity({
      opportunityId: 'opp-1',
      type: 'arbitrage',
      match: { home: 'Team A', away: 'Team B', league: 'Premier League' },
      legs: [
        { bookmaker: 'Unibet', selection: 'Team A', odds: 2.1 },
        { bookmaker: 'Betclic', selection: 'Team B', odds: 2.0 }
      ],
      profitPercentage: 2.5,
      evPercentage: 0,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    
    // Reserve funds
    await bankroll.reserveForBet('bet-1', 100);
    await bankroll.save(manager.eventStore);
    
    // Place bet
    const bet = await manager.createBet({
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
    
    // Confirm bet
    await bet.confirm({ bookmakerBetId: 'unibet-123' });
    await bet.save(manager.eventStore);
    
    // Settle bet
    await bet.settle('win', 110);
    await bet.save(manager.eventStore);
    
    // Check audit trail
    const auditProjection = manager.getProjection('audit');
    const betTrail = auditProjection.getAuditTrail('Bet', 'bet-1');
    
    expect(betTrail).toHaveLength(3);
    expect(betTrail.map(e => e.action)).toEqual([
      'BET_PLACED',
      'BET_CONFIRMED',
      'BET_SETTLED'
    ]);
  });

  it('should track correlation between events', async () => {
    const correlationId = 'corr-123';
    
    await manager.eventStore.append('bet-1', [
      {
        type: 'BetPlaced',
        data: { betId: 'bet-1' },
        metadata: { correlationId, timestamp: new Date().toISOString() }
      }
    ]);
    
    await manager.eventStore.append('bet-2', [
      {
        type: 'BetPlaced',
        data: { betId: 'bet-2' },
        metadata: { correlationId, timestamp: new Date().toISOString() }
      }
    ]);
    
    const events = await manager.eventStore.getByCorrelationId(correlationId);
    expect(events).toHaveLength(2);
  });
});

// Run tests
console.log('Running Event Sourcing Tests...');
