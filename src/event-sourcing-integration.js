/**
 * Event Sourcing Integration for Surebet Detector
 * 
 * Integrates the event sourcing system with existing components:
 * - BetSettlementTracker
 * - BankrollManager
 * - Opportunity detection
 * - Alert system
 */

import { EventSourcingManager, AuditLogProjection, FileStorage } from './event-sourcing.js';

/**
 * EventSourcedBetTracker - wraps BetSettlementTracker with event sourcing
 */
export class EventSourcedBetTracker {
  constructor(betSettlementTracker, eventSourcingManager) {
    this.tracker = betSettlementTracker;
    this.esm = eventSourcingManager;
  }

  /**
   * Track a new bet with event sourcing
   */
  async trackBet(betData) {
    // Create correlation ID for this operation
    const correlationId = this._generateCorrelationId();
    
    // Create the bet aggregate
    const bet = await this.esm.createBet({
      ...betData,
      correlationId,
      causationId: betData.causationId
    });

    // Also track in existing system
    await this.tracker.trackBet({
      ...betData,
      eventSourcingId: bet.id
    });

    return bet;
  }

  /**
   * Confirm a bet placement
   */
  async confirmBet(betId, confirmationData) {
    const bet = await this.esm.loadBet(betId);
    
    await bet.confirm({
      bookmakerBetId: confirmationData.bookmakerBetId,
      screenshotUrl: confirmationData.screenshotUrl
    });
    
    await bet.save(this.esm.eventStore);
    
    // Update existing tracker
    await this.tracker.confirmBet(betId, confirmationData);
    
    return bet;
  }

  /**
   * Settle a bet
   */
  async settleBet(betId, result, actualProfit) {
    const bet = await this.esm.loadBet(betId);
    
    await bet.settle(result, actualProfit);
    await bet.save(this.esm.eventStore);
    
    // Update existing tracker
    await this.tracker.settleBet(betId, result, actualProfit);
    
    return bet;
  }

  /**
   * Cancel a bet
   */
  async cancelBet(betId, reason) {
    const bet = await this.esm.loadBet(betId);
    
    await bet.cancel(reason);
    await bet.save(this.esm.eventStore);
    
    // Update existing tracker
    await this.tracker.cancelBet(betId, reason);
    
    return bet;
  }

  /**
   * Get bet with full audit trail
   */
  async getBetWithAuditTrail(betId) {
    const bet = await this.esm.loadBet(betId);
    const auditTrail = await this.esm.getAuditTrail('Bet', betId);
    
    return {
      ...bet,
      auditTrail
    };
  }

  _generateCorrelationId() {
    return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * EventSourcedBankrollManager - wraps BankrollManager with event sourcing
 */
export class EventSourcedBankrollManager {
  constructor(bankrollManager, eventSourcingManager) {
    this.manager = bankrollManager;
    this.esm = eventSourcingManager;
  }

  /**
   * Create a new bankroll account
   */
  async createBankroll(bankrollData) {
    const bankroll = await this.esm.createBankroll(bankrollData);
    
    // Also create in existing manager
    await this.manager.addAccount({
      bookmaker: bankrollData.bookmaker,
      currency: bankrollData.currency,
      initialBalance: bankrollData.initialBalance
    });

    return bankroll;
  }

  /**
   * Deposit funds
   */
  async deposit(bankrollId, amount, source) {
    const bankroll = await this.esm.loadBankroll(bankrollId);
    
    await bankroll.deposit(amount, source);
    await bankroll.save(this.esm.eventStore);
    
    // Update existing manager
    await this.manager.updateBalance(bankroll.bookmaker, amount);
    
    return bankroll;
  }

  /**
   * Withdraw funds
   */
  async withdraw(bankrollId, amount, destination) {
    const bankroll = await this.esm.loadBankroll(bankrollId);
    
    await bankroll.withdraw(amount, destination);
    await bankroll.save(this.esm.eventStore);
    
    // Update existing manager
    await this.manager.updateBalance(bankroll.bookmaker, -amount);
    
    return bankroll;
  }

  /**
   * Reserve funds for a bet
   */
  async reserveForBet(bankrollId, betId, amount) {
    const bankroll = await this.esm.loadBankroll(bankrollId);
    
    await bankroll.reserveForBet(betId, amount);
    await bankroll.save(this.esm.eventStore);
    
    return bankroll;
  }

  /**
   * Release reservation
   */
  async releaseReservation(bankrollId, betId, amount) {
    const bankroll = await this.esm.loadBankroll(bankrollId);
    
    await bankroll.releaseReservation(betId, amount);
    await bankroll.save(this.esm.eventStore);
    
    return bankroll;
  }

  /**
   * Get bankroll with transaction history
   */
  async getBankrollWithHistory(bankrollId) {
    const bankroll = await this.esm.loadBankroll(bankrollId);
    const auditTrail = await this.esm.getAuditTrail('Bankroll', bankrollId);
    
    return {
      id: bankroll.id,
      bookmaker: bankroll.bookmaker,
      currency: bankroll.currency,
      balance: bankroll.balance,
      reserved: bankroll.reserved || 0,
      available: bankroll.balance - (bankroll.reserved || 0),
      transactions: bankroll.transactions || [],
      auditTrail
    };
  }

  /**
   * Get all bankrolls with summaries
   */
  async getAllBankrolls() {
    // Get from existing manager and enrich with event data
    const accounts = await this.manager.getAllAccounts();
    
    return Promise.all(accounts.map(async (account) => {
      const bankrollId = `bankroll-${account.bookmaker}`;
      try {
        const withHistory = await this.getBankrollWithHistory(bankrollId);
        return withHistory;
      } catch (e) {
        // Bankroll not in event store yet
        return {
          id: bankrollId,
          bookmaker: account.bookmaker,
          currency: account.currency,
          balance: account.balance,
          reserved: 0,
          available: account.balance,
          transactions: [],
          auditTrail: []
        };
      }
    }));
  }
}

/**
 * EventSourcedOpportunityTracker - tracks opportunities with full audit
 */
export class EventSourcedOpportunityTracker {
  constructor(opportunityDetector, eventSourcingManager) {
    this.detector = opportunityDetector;
    this.esm = eventSourcingManager;
    this.activeOpportunities = new Map();
  }

  /**
   * Track a discovered opportunity
   */
  async trackOpportunity(opportunityData) {
    const opportunity = await this.esm.createOpportunity({
      ...opportunityData,
      opportunityId: opportunityData.id || `opp-${Date.now()}`
    });

    this.activeOpportunities.set(opportunity.id, opportunity);
    
    return opportunity;
  }

  /**
   * Update opportunity odds
   */
  async updateOdds(opportunityId, legIndex, newOdds) {
    const opportunity = await this.esm.loadOpportunity(opportunityId);
    
    await opportunity.updateOdds(legIndex, newOdds);
    await opportunity.save(this.esm.eventStore);
    
    this.activeOpportunities.set(opportunityId, opportunity);
    
    return opportunity;
  }

  /**
   * Mark opportunity as expired
   */
  async expireOpportunity(opportunityId, reason = 'timeout') {
    const opportunity = await this.esm.loadOpportunity(opportunityId);
    
    await opportunity.expire(reason);
    await opportunity.save(this.esm.eventStore);
    
    this.activeOpportunities.delete(opportunityId);
    
    return opportunity;
  }

  /**
   * Mark opportunity as executed
   */
  async executeOpportunity(opportunityId, bets) {
    const opportunity = await this.esm.loadOpportunity(opportunityId);
    
    await opportunity.execute(bets);
    await opportunity.save(this.esm.eventStore);
    
    this.activeOpportunities.delete(opportunityId);
    
    return opportunity;
  }

  /**
   * Get opportunity with full history
   */
  async getOpportunityWithHistory(opportunityId) {
    const opportunity = await this.esm.loadOpportunity(opportunityId);
    const auditTrail = await this.esm.getAuditTrail('Opportunity', opportunityId);
    
    return {
      ...opportunity,
      auditTrail
    };
  }

  /**
   * Get all active opportunities
   */
  getActiveOpportunities() {
    return Array.from(this.activeOpportunities.values());
  }

  /**
   * Clean up expired opportunities
   */
  async cleanupExpiredOpportunities() {
    const now = new Date().toISOString();
    const expired = [];
    
    for (const [id, opp] of this.activeOpportunities) {
      if (opp.expiresAt && opp.expiresAt < now) {
        await this.expireOpportunity(id, 'expired');
        expired.push(id);
      }
    }
    
    return expired;
  }
}

/**
 * Audit API - REST endpoints for audit functionality
 */
export class AuditAPI {
  constructor(eventSourcingManager) {
    this.esm = eventSourcingManager;
  }

  /**
   * Get audit trail for an entity
   */
  async getAuditTrail(entityType, entityId) {
    return await this.esm.getAuditTrail(entityType, entityId);
  }

  /**
   * Get audit trail for a time period
   */
  async getAuditTrailForPeriod(startDate, endDate) {
    const auditProjection = this.esm.getProjection('audit');
    if (auditProjection) {
      return auditProjection.getAuditTrailForPeriod(startDate, endDate);
    }
    return [];
  }

  /**
   * Get user audit trail
   */
  async getUserAuditTrail(userId) {
    const auditProjection = this.esm.getProjection('audit');
    if (auditProjection) {
      return auditProjection.getUserAuditTrail(userId);
    }
    return [];
  }

  /**
   * Export audit trail
   */
  async exportAuditTrail(format = 'json') {
    const auditProjection = this.esm.getProjection('audit');
    if (!auditProjection) {
      throw new Error('Audit projection not registered');
    }

    switch (format) {
      case 'csv':
        return auditProjection.exportToCsv();
      case 'json':
      default:
        return auditProjection.exportToJson();
    }
  }

  /**
   * Get events by correlation ID
   */
  async getEventsByCorrelation(correlationId) {
    return await this.esm.eventStore.getByCorrelationId(correlationId);
  }

  /**
   * Replay events (for debugging/recovery)
   */
  async replayEvents(eventTypes = null) {
    return await this.esm.replayEvents(eventTypes);
  }

  /**
   * Get system statistics
   */
  async getStatistics() {
    const allEvents = await this.esm.eventStore.readAll();
    
    const stats = {
      totalEvents: allEvents.length,
      byType: {},
      byStream: {},
      timeRange: {
        first: allEvents.length > 0 ? allEvents[0].metadata.timestamp : null,
        last: allEvents.length > 0 ? allEvents[allEvents.length - 1].metadata.timestamp : null
      }
    };

    for (const event of allEvents) {
      // Count by type
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      
      // Count by stream
      stats.byStream[event.streamId] = (stats.byStream[event.streamId] || 0) + 1;
    }

    return stats;
  }
}

/**
 * EventSourcingPlugin - main plugin class for SurebetDetector
 */
export class EventSourcingPlugin {
  constructor(options = {}) {
    this.options = {
      storageType: options.storageType || 'memory', // 'memory' or 'file'
      storagePath: options.storagePath || './data/events',
      enableAuditLog: options.enableAuditLog !== false,
      enableProjections: options.enableProjections !== false,
      ...options
    };
    
    this.esm = null;
    this.betTracker = null;
    this.bankrollManager = null;
    this.opportunityTracker = null;
    this.auditAPI = null;
  }

  /**
   * Initialize the plugin
   */
  async initialize(surebetDetector) {
    // Create storage
    let storage;
    if (this.options.storageType === 'file') {
      storage = new FileStorage(this.options.storagePath);
    } else {
      const { InMemoryStorage } = await import('./event-sourcing.js');
      storage = new InMemoryStorage();
    }

    // Create event sourcing manager
    this.esm = new EventSourcingManager({
      storage,
      metadataProvider: () => ({
        service: 'surebet-detector',
        hostname: typeof process !== 'undefined' ? process.env.HOSTNAME : 'unknown'
      })
    });

    // Register projections
    if (this.options.enableAuditLog) {
      const auditProjection = new AuditLogProjection(this.esm.eventStore);
      this.esm.registerProjection('audit', auditProjection);
    }

    // Create wrapped components
    if (surebetDetector.betSettlementTracker) {
      this.betTracker = new EventSourcedBetTracker(
        surebetDetector.betSettlementTracker,
        this.esm
      );
    }

    if (surebetDetector.bankrollManager) {
      this.bankrollManager = new EventSourcedBankrollManager(
        surebetDetector.bankrollManager,
        this.esm
      );
    }

    if (surebetDetector.opportunityDetector) {
      this.opportunityTracker = new EventSourcedOpportunityTracker(
        surebetDetector.opportunityDetector,
        this.esm
      );
    }

    // Create audit API
    this.auditAPI = new AuditAPI(this.esm);

    // Start projections
    if (this.options.enableProjections) {
      this.esm.startProjections(1000);
    }

    console.log('Event Sourcing Plugin initialized');
    return this;
  }

  /**
   * Shutdown the plugin
   */
  async shutdown() {
    this.esm.stopProjections();
    console.log('Event Sourcing Plugin shutdown');
  }

  /**
   * Get plugin API for external use
   */
  getAPI() {
    return {
      eventSourcingManager: this.esm,
      betTracker: this.betTracker,
      bankrollManager: this.bankrollManager,
      opportunityTracker: this.opportunityTracker,
      auditAPI: this.auditAPI
    };
  }
}

/**
 * Factory function to create and initialize the plugin
 */
export async function createEventSourcingPlugin(surebetDetector, options = {}) {
  const plugin = new EventSourcingPlugin(options);
  await plugin.initialize(surebetDetector);
  return plugin;
}

export default EventSourcingPlugin;
