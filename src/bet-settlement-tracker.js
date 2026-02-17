/**
 * Automated Bet Settlement Tracker
 * Tracks bet outcomes, updates P&L, and reconciles actual vs expected results
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class BetSettlementTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.betsFile = path.join(this.dataDir, 'bets.json');
    this.settlementsFile = path.join(this.dataDir, 'settlements.json');
    this.pendingBets = new Map();
    this.settledBets = new Map();
    this.checkInterval = options.checkInterval || 5 * 60 * 1000; // 5 minutes
    this.intervalId = null;
    this.isRunning = false;
    
    // Settlement sources
    this.sources = {
      api: options.apiSources || [],
      scraper: options.scraperSources || [],
      manual: true // Always allow manual settlement
    };
    
    // Settlement history for analytics
    this.settlementHistory = [];
  }
  
  async init() {
    await this.loadBets();
    await this.loadSettlements();
    console.log(`[Settlement] Loaded ${this.pendingBets.size} pending bets, ${this.settledBets.size} settled`);
    return this;
  }
  
  /**
   * Load bets from storage
   */
  async loadBets() {
    try {
      const data = await fs.readFile(this.betsFile, 'utf8');
      const bets = JSON.parse(data);
      
      for (const bet of bets) {
        if (bet.status === 'pending' || bet.status === 'placed') {
          this.pendingBets.set(bet.id, bet);
        } else if (bet.status === 'settled' || bet.status === 'cancelled') {
          this.settledBets.set(bet.id, bet);
        }
      }
    } catch (error) {
      // No existing bets file
      this.pendingBets = new Map();
      this.settledBets = new Map();
    }
  }
  
  /**
   * Load settlement history
   */
  async loadSettlements() {
    try {
      const data = await fs.readFile(this.settlementsFile, 'utf8');
      this.settlementHistory = JSON.parse(data);
    } catch (error) {
      this.settlementHistory = [];
    }
  }
  
  /**
   * Save bets to storage
   */
  async saveBets() {
    const allBets = [
      ...Array.from(this.pendingBets.values()),
      ...Array.from(this.settledBets.values())
    ];
    await fs.writeFile(this.betsFile, JSON.stringify(allBets, null, 2));
  }
  
  /**
   * Save settlement history
   */
  async saveSettlements() {
    await fs.writeFile(this.settlementsFile, JSON.stringify(this.settlementHistory, null, 2));
  }
  
  /**
   * Register a new bet for tracking
   */
  async registerBet(betData) {
    const bet = {
      id: betData.id || this.generateId(),
      type: betData.type || 'single', // single, arbitrage, ev
      status: 'pending',
      bookmaker: betData.bookmaker,
      sport: betData.sport,
      event: betData.event,
      eventId: betData.eventId,
      market: betData.market,
      selection: betData.selection,
      odds: betData.odds,
      stake: betData.stake,
      currency: betData.currency || 'EUR',
      expectedProfit: betData.expectedProfit || 0,
      expectedROI: betData.expectedROI || 0,
      placedAt: betData.placedAt || new Date().toISOString(),
      settledAt: null,
      actualProfit: null,
      actualROI: null,
      outcome: null, // win, loss, push, void
      settlementSource: null,
      settlementNotes: null,
      metadata: betData.metadata || {},
      tags: betData.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.pendingBets.set(bet.id, bet);
    await this.saveBets();
    
    this.emit('betRegistered', bet);
    console.log(`[Settlement] Registered bet: ${bet.id} - ${bet.event} @ ${bet.bookmaker}`);
    
    return bet;
  }
  
  /**
   * Register an arbitrage bet (multiple legs)
   */
  async registerArbitrageBet(arbitrageData) {
    const groupId = this.generateId();
    const bets = [];
    
    for (const leg of arbitrageData.legs) {
      const bet = await this.registerBet({
        type: 'arbitrage-leg',
        groupId,
        bookmaker: leg.bookmaker,
        sport: arbitrageData.sport,
        event: arbitrageData.event,
        eventId: arbitrageData.eventId,
        market: leg.market || '1X2',
        selection: leg.outcome,
        odds: leg.odds,
        stake: leg.stake,
        expectedProfit: leg.expectedProfit || (arbitrageData.totalExpectedProfit / arbitrageData.legs.length),
        expectedROI: arbitrageData.profitPercent,
        placedAt: arbitrageData.placedAt,
        metadata: {
          arbitrageId: arbitrageData.id,
          totalStake: arbitrageData.totalStake,
          totalExpectedProfit: arbitrageData.totalExpectedProfit,
          profitPercent: arbitrageData.profitPercent
        },
        tags: ['arbitrage', ...arbitrageData.tags || []]
      });
      bets.push(bet);
    }
    
    this.emit('arbitrageRegistered', { groupId, bets, arbitrage: arbitrageData });
    return { groupId, bets };
  }
  
  /**
   * Manually settle a bet
   */
  async settleBet(betId, settlementData) {
    const bet = this.pendingBets.get(betId);
    if (!bet) {
      throw new Error(`Bet not found: ${betId}`);
    }
    
    const settlement = {
      betId,
      outcome: settlementData.outcome, // win, loss, push, void
      actualProfit: settlementData.actualProfit,
      actualROI: settlementData.actualProfit / bet.stake * 100,
      settledAt: new Date().toISOString(),
      source: settlementData.source || 'manual',
      notes: settlementData.notes || null,
      verifiedBy: settlementData.verifiedBy || null
    };
    
    // Update bet
    bet.status = 'settled';
    bet.outcome = settlement.outcome;
    bet.actualProfit = settlement.actualProfit;
    bet.actualROI = settlement.actualROI;
    bet.settledAt = settlement.settledAt;
    bet.settlementSource = settlement.source;
    bet.settlementNotes = settlement.notes;
    bet.updatedAt = new Date().toISOString();
    
    // Move from pending to settled
    this.pendingBets.delete(betId);
    this.settledBets.set(betId, bet);
    
    // Record settlement
    this.settlementHistory.push(settlement);
    
    await this.saveBets();
    await this.saveSettlements();
    
    this.emit('betSettled', { bet, settlement });
    console.log(`[Settlement] Bet settled: ${betId} - ${settlement.outcome} (€${settlement.actualProfit})`);
    
    // Check if this completes an arbitrage group
    if (bet.type === 'arbitrage-leg' && bet.metadata?.arbitrageId) {
      await this.checkArbitrageCompletion(bet.metadata.arbitrageId);
    }
    
    return { bet, settlement };
  }
  
  /**
   * Check if all legs of an arbitrage are settled
   */
  async checkArbitrageCompletion(arbitrageId) {
    const allBets = [...this.pendingBets.values(), ...this.settledBets.values()];
    const legs = allBets.filter(b => b.metadata?.arbitrageId === arbitrageId);
    const settledLegs = legs.filter(b => b.status === 'settled');
    
    if (legs.length > 0 && legs.length === settledLegs.length) {
      const totalActualProfit = settledLegs.reduce((sum, b) => sum + (b.actualProfit || 0), 0);
      const totalExpectedProfit = legs[0].metadata.totalExpectedProfit;
      
      this.emit('arbitrageCompleted', {
        arbitrageId,
        legs: settledLegs,
        totalActualProfit,
        totalExpectedProfit,
        variance: totalActualProfit - totalExpectedProfit,
        variancePercent: totalExpectedProfit > 0 
          ? ((totalActualProfit - totalExpectedProfit) / totalExpectedProfit * 100)
          : 0
      });
      
      console.log(`[Settlement] Arbitrage completed: ${arbitrageId} - Actual: €${totalActualProfit.toFixed(2)}, Expected: €${totalExpectedProfit.toFixed(2)}`);
    }
  }
  
  /**
   * Auto-check pending bets for settlement
   */
  async checkPendingBets() {
    console.log(`[Settlement] Checking ${this.pendingBets.size} pending bets...`);
    
    const now = new Date();
    const checkPromises = [];
    
    for (const [betId, bet] of this.pendingBets) {
      // Skip bets placed recently (give time for API to update)
      const placedAt = new Date(bet.placedAt);
      const hoursSincePlaced = (now - placedAt) / (1000 * 60 * 60);
      
      if (hoursSincePlaced < 1) continue; // Skip bets less than 1 hour old
      
      // Check if event has likely completed
      // This is a simplified check - in production, you'd check actual event status
      checkPromises.push(this.checkBetStatus(bet));
    }
    
    const results = await Promise.allSettled(checkPromises);
    const settled = results.filter(r => r.status === 'fulfilled' && r.value?.settled).length;
    
    console.log(`[Settlement] Auto-checked ${checkPromises.length} bets, ${settled} settled`);
    return { checked: checkPromises.length, settled };
  }
  
  /**
   * Check status of a single bet
   */
  async checkBetStatus(bet) {
    // Try multiple sources in order of reliability
    
    // 1. Try bookmaker API if available
    for (const source of this.sources.api) {
      try {
        const result = await this.checkBookmakerAPI(source, bet);
        if (result?.settled) {
          await this.settleBet(bet.id, {
            outcome: result.outcome,
            actualProfit: result.profit,
            source: `api:${source.name}`,
            notes: `Auto-settled via ${source.name} API`
          });
          return { settled: true, source: source.name };
        }
      } catch (error) {
        console.warn(`[Settlement] API check failed for ${source.name}:`, error.message);
      }
    }
    
    // 2. Try web scraper
    for (const source of this.sources.scraper) {
      try {
        const result = await this.checkScraper(source, bet);
        if (result?.settled) {
          await this.settleBet(bet.id, {
            outcome: result.outcome,
            actualProfit: result.profit,
            source: `scraper:${source.name}`,
            notes: `Auto-settled via ${source.name} scraper`
          });
          return { settled: true, source: source.name };
        }
      } catch (error) {
        console.warn(`[Settlement] Scraper check failed for ${source.name}:`, error.message);
      }
    }
    
    // 3. Check if event time has passed significantly (heuristic)
    const eventTime = bet.metadata?.eventTime;
    if (eventTime) {
      const hoursSinceEvent = (new Date() - new Date(eventTime)) / (1000 * 60 * 60);
      if (hoursSinceEvent > 24) {
        // Event was long ago, flag for manual review
        this.emit('betNeedsReview', { bet, reason: 'event_completed_no_result' });
      }
    }
    
    return { settled: false };
  }
  
  /**
   * Check bookmaker API for bet status
   */
  async checkBookmakerAPI(source, bet) {
    // This would integrate with actual bookmaker APIs
    // Placeholder implementation
    return null;
  }
  
  /**
   * Check scraper for bet status
   */
  async checkScraper(source, bet) {
    // This would integrate with web scrapers
    // Placeholder implementation
    return null;
  }
  
  /**
   * Start automatic settlement checking
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`[Settlement] Auto-checker started (interval: ${this.checkInterval}ms)`);
    
    // Run immediately
    this.checkPendingBets();
    
    // Schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkPendingBets();
    }, this.checkInterval);
  }
  
  /**
   * Stop automatic settlement checking
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[Settlement] Auto-checker stopped');
  }
  
  /**
   * Get settlement statistics
   */
  async getStatistics(timeRange = '30d') {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const settledBets = Array.from(this.settledBets.values())
      .filter(b => new Date(b.settledAt) >= cutoffDate);
    
    const pendingBets = Array.from(this.pendingBets.values())
      .filter(b => new Date(b.placedAt) >= cutoffDate);
    
    if (settledBets.length === 0) {
      return {
        totalSettled: 0,
        totalPending: pendingBets.length,
        winRate: 0,
        totalProfit: 0,
        totalStaked: 0,
        roi: 0,
        evAccuracy: 0,
        avgSettlementTime: 0
      };
    }
    
    const winningBets = settledBets.filter(b => b.actualProfit > 0);
    const totalProfit = settledBets.reduce((sum, b) => sum + (b.actualProfit || 0), 0);
    const totalStaked = settledBets.reduce((sum, b) => sum + (b.stake || 0), 0);
    const totalExpectedProfit = settledBets.reduce((sum, b) => sum + (b.expectedProfit || 0), 0);
    
    // Calculate average settlement time
    const settlementTimes = settledBets
      .filter(b => b.placedAt && b.settledAt)
      .map(b => new Date(b.settledAt) - new Date(b.placedAt));
    const avgSettlementTime = settlementTimes.length > 0 
      ? settlementTimes.reduce((sum, t) => sum + t, 0) / settlementTimes.length 
      : 0;
    
    return {
      totalSettled: settledBets.length,
      totalPending: pendingBets.length,
      winRate: (winningBets.length / settledBets.length * 100),
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 10000) / 100 : 0,
      evAccuracy: totalExpectedProfit > 0 
        ? Math.round((totalProfit / totalExpectedProfit) * 10000) / 100 
        : 0,
      avgSettlementTime: Math.round(avgSettlementTime / (1000 * 60 * 60) * 10) / 10, // hours
      byOutcome: {
        win: settledBets.filter(b => b.outcome === 'win').length,
        loss: settledBets.filter(b => b.outcome === 'loss').length,
        push: settledBets.filter(b => b.outcome === 'push').length,
        void: settledBets.filter(b => b.outcome === 'void').length
      },
      bySource: this.getSettlementsBySource(settledBets)
    };
  }
  
  /**
   * Get settlements grouped by source
   */
  getSettlementsBySource(bets) {
    const bySource = {};
    for (const bet of bets) {
      const source = bet.settlementSource || 'unknown';
      if (!bySource[source]) {
        bySource[source] = { count: 0, profit: 0 };
      }
      bySource[source].count++;
      bySource[source].profit += bet.actualProfit || 0;
    }
    return bySource;
  }
  
  /**
   * Get pending bets that need attention
   */
  getPendingBetsNeedingAttention(maxAgeHours = 24) {
    const now = new Date();
    const attention = [];
    
    for (const [betId, bet] of this.pendingBets) {
      const placedAt = new Date(bet.placedAt);
      const hoursSincePlaced = (now - placedAt) / (1000 * 60 * 60);
      
      if (hoursSincePlaced > maxAgeHours) {
        attention.push({
          ...bet,
          hoursPending: Math.round(hoursSincePlaced * 10) / 10
        });
      }
    }
    
    return attention.sort((a, b) => b.hoursPending - a.hoursPending);
  }
  
  /**
   * Get reconciliation report (actual vs expected)
   */
  async getReconciliationReport(timeRange = '30d') {
    const stats = await this.getStatistics(timeRange);
    const settledBets = Array.from(this.settledBets.values());
    
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentSettled = settledBets.filter(b => new Date(b.settledAt) >= cutoffDate);
    
    // Group by type
    const byType = {};
    for (const bet of recentSettled) {
      const type = bet.type || 'unknown';
      if (!byType[type]) {
        byType[type] = { bets: 0, expected: 0, actual: 0 };
      }
      byType[type].bets++;
      byType[type].expected += bet.expectedProfit || 0;
      byType[type].actual += bet.actualProfit || 0;
    }
    
    // Calculate variance by type
    for (const type of Object.keys(byType)) {
      const data = byType[type];
      data.variance = data.actual - data.expected;
      data.variancePercent = data.expected > 0 
        ? (data.variance / data.expected * 100) 
        : 0;
    }
    
    return {
      summary: {
        totalExpectedProfit: recentSettled.reduce((sum, b) => sum + (b.expectedProfit || 0), 0),
        totalActualProfit: recentSettled.reduce((sum, b) => sum + (b.actualProfit || 0), 0),
        totalVariance: 0,
        variancePercent: 0
      },
      byType,
      accuracy: stats.evAccuracy,
      recommendations: this.generateRecommendations(byType)
    };
  }
  
  /**
   * Generate recommendations based on reconciliation
   */
  generateRecommendations(byType) {
    const recommendations = [];
    
    for (const [type, data] of Object.entries(byType)) {
      if (data.variancePercent < -20) {
        recommendations.push({
          type: 'warning',
          category: type,
          message: `${type} bets underperforming by ${Math.abs(data.variancePercent).toFixed(1)}%. Review expected value calculations.`,
          action: 'review_ev_model'
        });
      } else if (data.variancePercent > 20) {
        recommendations.push({
          type: 'positive',
          category: type,
          message: `${type} bets outperforming by ${data.variancePercent.toFixed(1)}%. Model may be too conservative.`,
          action: 'consider_increasing_stakes'
        });
      }
    }
    
    return recommendations;
  }
  
  /**
   * Export settlements to CSV
   */
  async exportToCSV(timeRange = '30d') {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const settledBets = Array.from(this.settledBets.values())
      .filter(b => new Date(b.settledAt) >= cutoffDate)
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
    
    const headers = [
      'Bet ID', 'Type', 'Bookmaker', 'Sport', 'Event', 'Market', 'Selection',
      'Odds', 'Stake', 'Expected Profit', 'Actual Profit', 'Expected ROI', 'Actual ROI',
      'Outcome', 'Placed At', 'Settled At', 'Settlement Source', 'Variance'
    ];
    
    const rows = settledBets.map(b => [
      b.id,
      b.type,
      b.bookmaker,
      b.sport,
      b.event,
      b.market,
      b.selection,
      b.odds,
      b.stake,
      b.expectedProfit,
      b.actualProfit,
      b.expectedROI,
      b.actualROI,
      b.outcome,
      b.placedAt,
      b.settledAt,
      b.settlementSource,
      (b.actualProfit || 0) - (b.expectedProfit || 0)
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => {
        if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
        return v;
      }).join(','))
    ].join('\n');
    
    return csv;
  }
  
  /**
   * Parse time range string to days
   */
  parseTimeRange(timeRange) {
    const match = timeRange.match(/^(\d+)([dwm])$/);
    if (!match) return 30;
    
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    
    switch (unit) {
      case 'd': return n;
      case 'w': return n * 7;
      case 'm': return n * 30;
      default: return 30;
    }
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get all pending bets
   */
  getPendingBets() {
    return Array.from(this.pendingBets.values());
  }
  
  /**
   * Get all settled bets
   */
  getSettledBets(timeRange = 'all') {
    if (timeRange === 'all') {
      return Array.from(this.settledBets.values());
    }
    
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return Array.from(this.settledBets.values())
      .filter(b => new Date(b.settledAt) >= cutoffDate);
  }
  
  /**
   * Get bet by ID
   */
  getBet(betId) {
    return this.pendingBets.get(betId) || this.settledBets.get(betId);
  }
  
  /**
   * Cancel a pending bet
   */
  async cancelBet(betId, reason = null) {
    const bet = this.pendingBets.get(betId);
    if (!bet) {
      throw new Error(`Bet not found: ${betId}`);
    }
    
    bet.status = 'cancelled';
    bet.cancelledAt = new Date().toISOString();
    bet.cancellationReason = reason;
    bet.updatedAt = new Date().toISOString();
    
    this.pendingBets.delete(betId);
    this.settledBets.set(betId, bet);
    
    await this.saveBets();
    
    this.emit('betCancelled', { bet, reason });
    console.log(`[Settlement] Bet cancelled: ${betId} - ${reason || 'No reason'}`);
    
    return bet;
  }
}

module.exports = { BetSettlementTracker };
