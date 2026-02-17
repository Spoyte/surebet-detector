/**
 * Matched Betting Calculator and Tracker
 * 
 * Provides tools for matched betting strategies:
 * - Qualifying bet calculator (for meeting wagering requirements)
 * - Free bet converter (SNR and SR methods)
 * - Risk-free bet tracker
 * - Bookmaker promotion integration
 * - Profit tracking across matched betting activities
 */

const logger = require('./logger');
const { EventEmitter } = require('events');

class MatchedBettingCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      defaultExchangeCommission: 0.05, // 5% commission
      defaultQualifyingLossThreshold: 0.05, // 5% max acceptable loss
      ...options
    };
    this.promotions = new Map();
    this.activeBets = new Map();
    this.completedBets = [];
    this.logger = logger.child({ module: 'matched-betting' });
  }

  /**
   * Calculate qualifying bet (to unlock a bonus/free bet)
   * 
   * @param {Object} params - Calculation parameters
   * @param {number} params.stake - Amount to bet at bookmaker
   * @param {number} params.backOdds - Bookmaker odds (decimal)
   * @param {number} params.layOdds - Exchange lay odds (decimal)
   * @param {number} params.commission - Exchange commission (default 5%)
   * @returns {Object} Calculation result
   */
  calculateQualifyingBet({
    stake,
    backOdds,
    layOdds,
    commission = this.options.defaultExchangeCommission
  }) {
    // Validate inputs
    if (stake <= 0 || backOdds <= 1 || layOdds <= 1) {
      throw new Error('Invalid input: stake must be > 0, odds must be > 1');
    }

    // Calculate lay stake
    const layStake = (stake * backOdds) / layOdds;
    
    // Calculate outcomes
    const backWinProfit = stake * (backOdds - 1); // Profit if back bet wins
    const backWinLiability = -(layStake * (layOdds - 1)); // Loss on exchange if back wins
    const backWinNet = backWinProfit + backWinLiability;
    
    const layWinProfit = stake; // Lose stake at bookmaker
    const layWinCommission = layStake * commission; // Commission on lay win
    const layWinNet = -layWinProfit + layStake - layWinCommission;
    
    // Qualifying loss is the average loss (should be minimal)
    const qualifyingLoss = Math.abs(Math.min(backWinNet, layWinNet));
    const lossPercentage = (qualifyingLoss / stake) * 100;

    const result = {
      type: 'qualifying',
      stake,
      backOdds,
      layOdds,
      commission,
      layStake: Math.round(layStake * 100) / 100,
      outcomes: {
        backWin: {
          bookmakerProfit: Math.round(backWinProfit * 100) / 100,
          exchangeLiability: Math.round(backWinLiability * 100) / 100,
          netProfit: Math.round(backWinNet * 100) / 100
        },
        layWin: {
          bookmakerLoss: -stake,
          exchangeProfit: Math.round((layStake - layWinCommission) * 100) / 100,
          netProfit: Math.round(layWinNet * 100) / 100
        }
      },
      qualifyingLoss: Math.round(qualifyingLoss * 100) / 100,
      lossPercentage: Math.round(lossPercentage * 100) / 100,
      isOptimal: lossPercentage <= (this.options.defaultQualifyingLossThreshold * 100)
    };

    this.logger.debug('Qualifying bet calculated', { 
      stake, 
      backOdds, 
      layOdds, 
      lossPercentage: result.lossPercentage 
    });

    return result;
  }

  /**
   * Calculate free bet conversion (Stake Not Returned - SNR method)
   * Most common for free bets where stake is not returned
   * 
   * @param {Object} params - Calculation parameters
   * @param {number} params.freeBetAmount - Free bet amount
   * @param {number} params.backOdds - Bookmaker odds (decimal)
   * @param {number} params.layOdds - Exchange lay odds (decimal)
   * @param {number} params.commission - Exchange commission
   * @returns {Object} Calculation result
   */
  calculateFreeBetSNR({
    freeBetAmount,
    backOdds,
    layOdds,
    commission = this.options.defaultExchangeCommission
  }) {
    if (freeBetAmount <= 0 || backOdds <= 1 || layOdds <= 1) {
      throw new Error('Invalid input: free bet amount must be > 0, odds must be > 1');
    }

    // For SNR free bets, we want high odds to maximize conversion
    const layStake = (freeBetAmount * (backOdds - 1)) / layOdds;
    
    // If back bet wins: profit = (stake * (odds - 1)) - liability
    const backWinProfit = freeBetAmount * (backOdds - 1);
    const backWinLiability = -(layStake * (layOdds - 1));
    const backWinNet = backWinProfit + backWinLiability;
    
    // If lay bet wins: lose free bet, win lay stake minus commission
    const layWinCommission = layStake * commission;
    const layWinNet = layStake - layWinCommission;
    
    // Profit is the minimum of the two outcomes (guaranteed profit)
    const guaranteedProfit = Math.min(backWinNet, layWinNet);
    const conversionRate = (guaranteedProfit / freeBetAmount) * 100;

    const result = {
      type: 'free-bet-snr',
      freeBetAmount,
      backOdds,
      layOdds,
      commission,
      layStake: Math.round(layStake * 100) / 100,
      outcomes: {
        backWin: {
          bookmakerProfit: Math.round(backWinProfit * 100) / 100,
          exchangeLiability: Math.round(backWinLiability * 100) / 100,
          netProfit: Math.round(backWinNet * 100) / 100
        },
        layWin: {
          bookmakerResult: 0, // Free bet lost, no actual loss
          exchangeProfit: Math.round((layStake - layWinCommission) * 100) / 100,
          netProfit: Math.round(layWinNet * 100) / 100
        }
      },
      guaranteedProfit: Math.round(guaranteedProfit * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      method: 'SNR'
    };

    this.logger.debug('Free bet SNR calculated', { 
      freeBetAmount, 
      conversionRate: result.conversionRate 
    });

    return result;
  }

  /**
   * Calculate free bet conversion (Stake Returned - SR method)
   * For free bets where stake is also returned on win
   * 
   * @param {Object} params - Calculation parameters
   * @param {number} params.freeBetAmount - Free bet amount
   * @param {number} params.backOdds - Bookmaker odds (decimal)
   * @param {number} params.layOdds - Exchange lay odds (decimal)
   * @param {number} params.commission - Exchange commission
   * @returns {Object} Calculation result
   */
  calculateFreeBetSR({
    freeBetAmount,
    backOdds,
    layOdds,
    commission = this.options.defaultExchangeCommission
  }) {
    if (freeBetAmount <= 0 || backOdds <= 1 || layOdds <= 1) {
      throw new Error('Invalid input: free bet amount must be > 0, odds must be > 1');
    }

    // For SR free bets, stake is returned, so we treat it like a normal bet
    const layStake = (freeBetAmount * backOdds) / layOdds;
    
    // If back bet wins: profit includes returned stake
    const backWinProfit = freeBetAmount * backOdds;
    const backWinLiability = -(layStake * (layOdds - 1));
    const backWinNet = backWinProfit + backWinLiability - freeBetAmount; // Subtract original stake
    
    // If lay bet wins
    const layWinCommission = layStake * commission;
    const layWinNet = layStake - layWinCommission - freeBetAmount; // Subtract original stake
    
    const guaranteedProfit = Math.min(backWinNet, layWinNet);
    const conversionRate = (guaranteedProfit / freeBetAmount) * 100;

    const result = {
      type: 'free-bet-sr',
      freeBetAmount,
      backOdds,
      layOdds,
      commission,
      layStake: Math.round(layStake * 100) / 100,
      outcomes: {
        backWin: {
          bookmakerReturn: Math.round(backWinProfit * 100) / 100,
          exchangeLiability: Math.round(backWinLiability * 100) / 100,
          netProfit: Math.round(backWinNet * 100) / 100
        },
        layWin: {
          bookmakerResult: 0,
          exchangeProfit: Math.round((layStake - layWinCommission) * 100) / 100,
          netProfit: Math.round(layWinNet * 100) / 100
        }
      },
      guaranteedProfit: Math.round(guaranteedProfit * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      method: 'SR'
    };

    this.logger.debug('Free bet SR calculated', { 
      freeBetAmount, 
      conversionRate: result.conversionRate 
    });

    return result;
  }

  /**
   * Calculate risk-free bet (refund if bet loses)
   * Common promotion: "Money back if your bet loses"
   * 
   * @param {Object} params - Calculation parameters
   * @param {number} params.stake - Bet stake
   * @param {number} params.backOdds - Bookmaker odds
   * @param {number} params.layOdds - Exchange lay odds
   * @param {number} params.refundAmount - Amount refunded if bet loses
   * @param {number} params.refundType - 'cash' or 'free-bet'
   * @param {number} params.commission - Exchange commission
   * @returns {Object} Calculation result
   */
  calculateRiskFreeBet({
    stake,
    backOdds,
    layOdds,
    refundAmount,
    refundType = 'cash',
    commission = this.options.defaultExchangeCommission
  }) {
    if (stake <= 0 || backOdds <= 1 || layOdds <= 1 || refundAmount < 0) {
      throw new Error('Invalid input parameters');
    }

    const layStake = (stake * backOdds) / layOdds;
    
    // If back bet wins (no refund)
    const backWinProfit = stake * (backOdds - 1);
    const backWinLiability = -(layStake * (layOdds - 1));
    const backWinNet = backWinProfit + backWinLiability;
    
    // If lay bet wins (get refund)
    const layWinCommission = layStake * commission;
    const layWinBase = layStake - layWinCommission - stake;
    
    // Adjust for refund type
    let refundValue = refundAmount;
    if (refundType === 'free-bet') {
      // Free bet refund typically converts at 70-80%
      refundValue = refundAmount * 0.75;
    }
    
    const layWinNet = layWinBase + refundValue;
    
    const result = {
      type: 'risk-free',
      stake,
      backOdds,
      layOdds,
      refundAmount,
      refundType,
      commission,
      layStake: Math.round(layStake * 100) / 100,
      outcomes: {
        backWin: {
          bookmakerProfit: Math.round(backWinProfit * 100) / 100,
          exchangeLiability: Math.round(backWinLiability * 100) / 100,
          netProfit: Math.round(backWinNet * 100) / 100,
          refund: 0
        },
        layWin: {
          bookmakerLoss: -stake,
          exchangeProfit: Math.round((layStake - layWinCommission) * 100) / 100,
          baseLoss: Math.round(layWinBase * 100) / 100,
          refundValue: Math.round(refundValue * 100) / 100,
          netProfit: Math.round(layWinNet * 100) / 100
        }
      },
      worstCase: Math.round(Math.min(backWinNet, layWinNet) * 100) / 100,
      bestCase: Math.round(Math.max(backWinNet, layWinNet) * 100) / 100,
      expectedValue: Math.round(((backWinNet + layWinNet) / 2) * 100) / 100
    };

    this.logger.debug('Risk-free bet calculated', { 
      stake, 
      refundAmount, 
      expectedValue: result.expectedValue 
    });

    return result;
  }

  /**
   * Calculate each-way matched bet (for horse racing)
   * 
   * @param {Object} params - Calculation parameters
   * @param {number} params.stake - Total stake (split between win and place)
   * @param {number} params.winOdds - Win odds
   * @param {number} params.placeOdds - Place odds (usually 1/4 or 1/5 of win odds)
   * @param {number} params.layWinOdds - Exchange lay odds for win
   * @param {number} params.layPlaceOdds - Exchange lay odds for place
   * @param {number} params.commission - Exchange commission
   * @returns {Object} Calculation result
   */
  calculateEachWayBet({
    stake,
    winOdds,
    placeOdds,
    layWinOdds,
    layPlaceOdds,
    commission = this.options.defaultExchangeCommission
  }) {
    // Each-way bet is two bets: win and place, each with half the stake
    const winStake = stake / 2;
    const placeStake = stake / 2;

    // Calculate lay stakes
    const layWinStake = (winStake * winOdds) / layWinOdds;
    const layPlaceStake = (placeStake * placeOdds) / layPlaceOdds;

    // Outcomes: Win (1st), Place (2nd-3rd/4th), Lose (unplaced)
    // Win outcome: both win and place bets win
    const winOutcomeBookmaker = winStake * (winOdds - 1) + placeStake * (placeOdds - 1);
    const winOutcomeExchange = -(layWinStake * (layWinOdds - 1)) - (layPlaceStake * (layPlaceOdds - 1));
    const winOutcomeCommission = 0; // No commission on losing lays
    const winNet = winOutcomeBookmaker + winOutcomeExchange;

    // Place outcome: win bet loses, place bet wins
    const placeOutcomeBookmaker = -winStake + placeStake * (placeOdds - 1);
    const placeOutcomeExchange = layWinStake * (1 - commission) - (layPlaceStake * (layPlaceOdds - 1));
    const placeNet = placeOutcomeBookmaker + placeOutcomeExchange;

    // Lose outcome: both bets lose
    const loseOutcomeBookmaker = -stake;
    const loseOutcomeExchange = (layWinStake + layPlaceStake) * (1 - commission);
    const loseNet = loseOutcomeBookmaker + loseOutcomeExchange;

    return {
      type: 'each-way',
      stake,
      winOdds,
      placeOdds,
      layWinOdds,
      layPlaceOdds,
      commission,
      winStake,
      placeStake,
      layWinStake: Math.round(layWinStake * 100) / 100,
      layPlaceStake: Math.round(layPlaceStake * 100) / 100,
      outcomes: {
        win: {
          bookmaker: Math.round(winOutcomeBookmaker * 100) / 100,
          exchange: Math.round(winOutcomeExchange * 100) / 100,
          net: Math.round(winNet * 100) / 100
        },
        place: {
          bookmaker: Math.round(placeOutcomeBookmaker * 100) / 100,
          exchange: Math.round(placeOutcomeExchange * 100) / 100,
          net: Math.round(placeNet * 100) / 100
        },
        lose: {
          bookmaker: Math.round(loseOutcomeBookmaker * 100) / 100,
          exchange: Math.round(loseOutcomeExchange * 100) / 100,
          net: Math.round(loseNet * 100) / 100
        }
      },
      worstCase: Math.round(Math.min(winNet, placeNet, loseNet) * 100) / 100,
      expectedValue: Math.round(((winNet + placeNet + loseNet) / 3) * 100) / 100
    };
  }

  /**
   * Find optimal odds for free bet conversion
   * Higher odds generally give better conversion rates for SNR free bets
   * 
   * @param {number} freeBetAmount - Free bet amount
   * @param {Array} availableOdds - Array of {backOdds, layOdds} objects
   * @param {number} commission - Exchange commission
   * @returns {Object} Best option
   */
  findOptimalFreeBetOdds(freeBetAmount, availableOdds, commission = this.options.defaultExchangeCommission) {
    if (!Array.isArray(availableOdds) || availableOdds.length === 0) {
      throw new Error('Available odds must be a non-empty array');
    }

    const results = availableOdds.map(odds => {
      try {
        const calc = this.calculateFreeBetSNR({
          freeBetAmount,
          backOdds: odds.backOdds,
          layOdds: odds.layOdds,
          commission
        });
        return {
          ...odds,
          ...calc
        };
      } catch (err) {
        return { ...odds, error: err.message };
      }
    }).filter(r => !r.error);

    // Sort by conversion rate
    results.sort((a, b) => b.conversionRate - a.conversionRate);

    return {
      bestOption: results[0] || null,
      allOptions: results,
      recommendation: results[0] 
        ? `Best conversion: ${results[0].conversionRate}% at odds ${results[0].backOdds}/${results[0].layOdds}`
        : 'No valid options found'
    };
  }

  /**
   * Register a bookmaker promotion
   * 
   * @param {Object} promotion - Promotion details
   */
  registerPromotion(promotion) {
    const id = promotion.id || `promo-${Date.now()}`;
    const promo = {
      id,
      bookmaker: promotion.bookmaker,
      type: promotion.type, // 'free-bet', 'risk-free', 'deposit-bonus', 'enhanced-odds'
      value: promotion.value,
      minOdds: promotion.minOdds || 1.0,
      wageringRequirement: promotion.wageringRequirement || 0,
      expiryDate: promotion.expiryDate,
      terms: promotion.terms || '',
      status: 'active',
      registeredAt: new Date().toISOString(),
      ...promotion
    };

    this.promotions.set(id, promo);
    this.logger.info('Promotion registered', { id, bookmaker: promo.bookmaker, type: promo.type });
    this.emit('promotion:registered', promo);
    
    return promo;
  }

  /**
   * Track a matched bet
   * 
   * @param {Object} bet - Bet details
   * @returns {string} Bet ID
   */
  trackBet(bet) {
    const id = bet.id || `mb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const trackedBet = {
      id,
      type: bet.type, // 'qualifying', 'free-bet-snr', 'free-bet-sr', 'risk-free', 'each-way'
      bookmaker: bet.bookmaker,
      exchange: bet.exchange,
      event: bet.event,
      selection: bet.selection,
      stake: bet.stake,
      backOdds: bet.backOdds,
      layOdds: bet.layOdds,
      layStake: bet.layStake,
      expectedProfit: bet.expectedProfit,
      promotionId: bet.promotionId || null,
      status: 'active',
      createdAt: new Date().toISOString(),
      settledAt: null,
      actualProfit: null,
      notes: bet.notes || '',
      ...bet
    };

    this.activeBets.set(id, trackedBet);
    this.logger.info('Bet tracked', { id, type: trackedBet.type, bookmaker: trackedBet.bookmaker });
    this.emit('bet:tracked', trackedBet);
    
    return id;
  }

  /**
   * Settle a tracked bet
   * 
   * @param {string} betId - Bet ID
   * @param {string} outcome - 'back-win', 'lay-win', 'win', 'place', 'lose'
   * @param {number} actualProfit - Actual profit/loss
   */
  settleBet(betId, outcome, actualProfit = null) {
    const bet = this.activeBets.get(betId);
    if (!bet) {
      throw new Error(`Bet not found: ${betId}`);
    }

    bet.status = 'settled';
    bet.outcome = outcome;
    bet.settledAt = new Date().toISOString();
    
    // Calculate actual profit if not provided
    if (actualProfit === null) {
      // Use expected profit from calculation
      bet.actualProfit = bet.expectedProfit;
    } else {
      bet.actualProfit = actualProfit;
    }

    this.activeBets.delete(betId);
    this.completedBets.push(bet);

    this.logger.info('Bet settled', { 
      id: betId, 
      outcome, 
      actualProfit: bet.actualProfit 
    });
    this.emit('bet:settled', bet);

    return bet;
  }

  /**
   * Get profit/loss summary
   * 
   * @param {Object} filters - Optional filters
   * @returns {Object} Summary statistics
   */
  getProfitSummary(filters = {}) {
    const bets = this.completedBets.filter(bet => {
      if (filters.bookmaker && bet.bookmaker !== filters.bookmaker) return false;
      if (filters.type && bet.type !== filters.type) return false;
      if (filters.fromDate && new Date(bet.settledAt) < new Date(filters.fromDate)) return false;
      if (filters.toDate && new Date(bet.settledAt) > new Date(filters.toDate)) return false;
      return true;
    });

    const totalProfit = bets.reduce((sum, b) => sum + (b.actualProfit || 0), 0);
    const totalStaked = bets.reduce((sum, b) => sum + (b.stake || 0), 0);
    const avgProfit = bets.length > 0 ? totalProfit / bets.length : 0;
    
    const byType = {};
    const byBookmaker = {};

    bets.forEach(bet => {
      // By type
      byType[bet.type] = byType[bet.type] || { count: 0, profit: 0 };
      byType[bet.type].count++;
      byType[bet.type].profit += bet.actualProfit || 0;

      // By bookmaker
      byBookmaker[bet.bookmaker] = byBookmaker[bet.bookmaker] || { count: 0, profit: 0 };
      byBookmaker[bet.bookmaker].count++;
      byBookmaker[bet.bookmaker].profit += bet.actualProfit || 0;
    });

    return {
      totalBets: bets.length,
      activeBets: this.activeBets.size,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 10000) / 100 : 0,
      averageProfitPerBet: Math.round(avgProfit * 100) / 100,
      byType,
      byBookmaker,
      period: filters.fromDate && filters.toDate 
        ? `${filters.fromDate} to ${filters.toDate}`
        : 'all-time'
    };
  }

  /**
   * Get active promotions
   * 
   * @returns {Array} Active promotions
   */
  getActivePromotions() {
    return Array.from(this.promotions.values())
      .filter(p => p.status === 'active')
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }

  /**
   * Get active bets
   * 
   * @returns {Array} Active bets
   */
  getActiveBets() {
    return Array.from(this.activeBets.values());
  }

  /**
   * Export data for tax reporting
   * 
   * @returns {Array} Formatted bet records
   */
  exportForTaxReporting() {
    return this.completedBets.map(bet => ({
      date: bet.settledAt,
      bookmaker: bet.bookmaker,
      exchange: bet.exchange,
      event: bet.event,
      selection: bet.selection,
      stake: bet.stake,
      profit: bet.actualProfit,
      type: bet.type
    }));
  }

  /**
   * Generate matched betting report
   * 
   * @param {Object} options - Report options
   * @returns {Object} Report data
   */
  generateReport(options = {}) {
    const summary = this.getProfitSummary(options);
    const activePromos = this.getActivePromotions();
    const activeBets = this.getActiveBets();

    return {
      generatedAt: new Date().toISOString(),
      summary,
      activePromotions: activePromos,
      activeBets: activeBets.length,
      recentBets: this.completedBets.slice(-10),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate recommendations based on current state
   * 
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.getProfitSummary();

    // Check for expiring promotions
    const expiringSoon = this.getActivePromotions().filter(p => {
      if (!p.expiryDate) return false;
      const daysUntilExpiry = (new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry <= 3 && daysUntilExpiry > 0;
    });

    if (expiringSoon.length > 0) {
      recommendations.push({
        type: 'urgent',
        message: `${expiringSoon.length} promotion(s) expiring soon`,
        promotions: expiringSoon.map(p => p.id)
      });
    }

    // Check for high qualifying losses
    const recentQualifying = this.completedBets
      .filter(b => b.type === 'qualifying')
      .slice(-10);
    
    if (recentQualifying.length > 0) {
      const avgLoss = recentQualifying.reduce((sum, b) => sum + Math.abs(b.actualProfit || 0), 0) 
        / recentQualifying.length;
      if (avgLoss > 5) {
        recommendations.push({
          type: 'warning',
          message: `Average qualifying loss is ${avgLoss.toFixed(2)}. Consider finding better odds matches.`
        });
      }
    }

    // ROI check
    if (summary.roi < 50 && summary.totalBets > 10) {
      recommendations.push({
        type: 'info',
        message: 'Your ROI is below 50%. Review your bet selection strategy.'
      });
    }

    return recommendations;
  }
}

module.exports = MatchedBettingCalculator;
