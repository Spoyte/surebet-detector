/**
 * @fileoverview Bookmaker Limit Optimizer
 * @description Optimizes stake distribution considering individual bookmaker bet limits,
 * preventing partial fills that break arbitrage profitability
 * @module surebet-detector/bookmaker-limit-optimizer
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Bookmaker limit configuration per market
 */
export interface BookmakerLimit {
  bookmakerId: string;
  bookmakerName: string;
  market: string;
  minStake: number;
  maxStake: number;
  currency: string;
  lastUpdated: number;
  source: 'api' | 'manual' | 'inferred';
  confidence: number; // 0-1, how confident we are in this limit
}

/**
 * Dynamic limit adjustment after wins/losses
 */
export interface DynamicLimitAdjustment {
  bookmakerId: string;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalProfit: number;
  lastAdjustmentTime: number;
  adjustmentFactor: number; // Multiplier applied to base limits
  isLimited: boolean;
}

/**
 * User account state for a bookmaker
 */
export interface BookmakerAccount {
  bookmakerId: string;
  bookmakerName: string;
  balance: number;
  currency: string;
  isActive: boolean;
  limits: Map<string, BookmakerLimit>; // market -> limit
  dynamicAdjustment: DynamicLimitAdjustment;
  limitHistory: BookmakerLimit[];
  gubbingRisk: number; // 0-1, likelihood of account restrictions
}

/**
 * Arbitrage leg with stake requirements
 */
export interface StakeLeg {
  bookmakerId: string;
  bookmakerName: string;
  market: string;
  selection: string;
  odds: number;
  idealStake: number; // The theoretically optimal stake
  minStake: number;
  maxStake: number;
  currency: string;
}

/**
 * Optimized stake distribution result
 */
export interface OptimizedStakes {
  opportunityId: string;
  totalStake: number;
  legs: OptimizedLeg[];
  expectedProfit: number;
  profitPercent: number;
  isOptimal: boolean; // True if all legs at ideal stake
  constraintsApplied: Constraint[];
  partialFillRisk: PartialFillRisk;
  alternativeSuggestions: AlternativeCombination[];
  fallbackStrategy?: FallbackStrategy;
}

/**
 * Optimized leg with final stake
 */
export interface OptimizedLeg {
  bookmakerId: string;
  bookmakerName: string;
  market: string;
  selection: string;
  odds: number;
  idealStake: number;
  actualStake: number;
  stakeLimit: number;
  isConstrained: boolean;
  constraintReason?: string;
  fillProbability: number; // 0-1, likelihood of getting this stake filled
}

/**
 * Constraint that was applied
 */
export interface Constraint {
  type: 'max_stake' | 'min_stake' | 'insufficient_funds' | 'dynamic_limit' | 'market_limit';
  bookmakerId: string;
  market?: string;
  requested: number;
  allowed: number;
  message: string;
}

/**
 * Risk of partial fill breaking arbitrage
 */
export interface PartialFillRisk {
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  probability: number;
  impact: number; // Profit loss if partial fill occurs
  scenarios: PartialFillScenario[];
}

/**
 * Partial fill scenario
 */
export interface PartialFillScenario {
  description: string;
  probability: number;
  profitImpact: number;
  affectedLegs: string[];
}

/**
 * Alternative bookmaker combination
 */
export interface AlternativeCombination {
  combinationId: string;
  legs: AlternativeLeg[];
  totalStake: number;
  expectedProfit: number;
  profitPercent: number;
  feasibility: number; // 0-1, how likely this can be executed
  reason: string;
}

/**
 * Alternative leg suggestion
 */
export interface AlternativeLeg {
  bookmakerId: string;
  bookmakerName: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  availableLimit: number;
}

/**
 * Fallback strategy when optimal stakes exceed limits
 */
export interface FallbackStrategy {
  type: 'reduce_all' | 'skip_constrained' | 'use_alternative' | 'partial_arbitrage' | 'abort';
  description: string;
  adjustedStakes?: OptimizedLeg[];
  expectedProfit: number;
  profitPercent: number;
  recommendation: string;
}

/**
 * Limit update event
 */
export interface LimitUpdateEvent {
  bookmakerId: string;
  market: string;
  oldLimit: BookmakerLimit;
  newLimit: BookmakerLimit;
  reason: 'api_update' | 'manual_update' | 'dynamic_adjustment' | 'fill_observation';
  timestamp: number;
}

// ============================================================================
// BOOKMAKER LIMIT MANAGER
// ============================================================================

/**
 * Manages bookmaker bet limits per user account
 */
export class BookmakerLimitManager extends EventEmitter {
  private accounts: Map<string, BookmakerAccount> = new Map();
  private globalDefaults: Map<string, BookmakerLimit> = new Map();
  private limitHistory: LimitUpdateEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor() {
    super();
    this.initializeDefaultLimits();
  }

  /**
   * Initialize default limits for known bookmakers
   */
  private initializeDefaultLimits(): void {
    const defaults: Array<{ bookmaker: string; market: string; min: number; max: number }> = [
      { bookmaker: 'pinnacle', market: 'default', min: 1, max: 100000 },
      { bookmaker: 'betfair', market: 'default', min: 2, max: 50000 },
      { bookmaker: 'unibet', market: 'default', min: 1, max: 5000 },
      { bookmaker: 'betclic', market: 'default', min: 0.5, max: 3000 },
      { bookmaker: 'winamax', market: 'default', min: 0.5, max: 4000 },
      { bookmaker: 'fdj', market: 'default', min: 0.5, max: 2000 },
      { bookmaker: 'parionsport', market: 'default', min: 0.5, max: 2500 },
      { bookmaker: 'zebet', market: 'default', min: 0.5, max: 2000 },
      { bookmaker: 'cloudbet', market: 'default', min: 5, max: 10000 },
      { bookmaker: 'smarkets', market: 'default', min: 1, max: 25000 },
    ];

    for (const def of defaults) {
      const limit: BookmakerLimit = {
        bookmakerId: def.bookmaker,
        bookmakerName: def.bookmaker,
        market: def.market,
        minStake: def.min,
        maxStake: def.max,
        currency: 'EUR',
        lastUpdated: Date.now(),
        source: 'inferred',
        confidence: 0.5
      };
      this.globalDefaults.set(`${def.bookmaker}:${def.market}`, limit);
    }
  }

  /**
   * Register a bookmaker account
   */
  public registerAccount(
    bookmakerId: string,
    bookmakerName: string,
    balance: number,
    currency: string = 'EUR'
  ): BookmakerAccount {
    const account: BookmakerAccount = {
      bookmakerId,
      bookmakerName,
      balance,
      currency,
      isActive: true,
      limits: new Map(),
      dynamicAdjustment: {
        bookmakerId,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        totalProfit: 0,
        lastAdjustmentTime: Date.now(),
        adjustmentFactor: 1.0,
        isLimited: false
      },
      limitHistory: [],
      gubbingRisk: 0.1
    };

    this.accounts.set(bookmakerId, account);
    logger.info(`Registered bookmaker account: ${bookmakerName}`, { bookmakerId, balance, currency });
    
    this.emit('accountRegistered', { account });
    return account;
  }

  /**
   * Get or create account
   */
  public getAccount(bookmakerId: string): BookmakerAccount | undefined {
    return this.accounts.get(bookmakerId);
  }

  /**
   * Set limit for a specific market
   */
  public setLimit(
    bookmakerId: string,
    market: string,
    minStake: number,
    maxStake: number,
    source: 'api' | 'manual' | 'inferred' = 'manual',
    confidence: number = 0.9
  ): BookmakerLimit {
    let account = this.accounts.get(bookmakerId);
    
    if (!account) {
      account = this.registerAccount(bookmakerId, bookmakerId, 0);
    }

    const oldLimit = account.limits.get(market);
    
    const newLimit: BookmakerLimit = {
      bookmakerId,
      bookmakerName: account.bookmakerName,
      market,
      minStake,
      maxStake,
      currency: account.currency,
      lastUpdated: Date.now(),
      source,
      confidence
    };

    // Store in history
    if (oldLimit) {
      account.limitHistory.push(oldLimit);
      if (account.limitHistory.length > 100) {
        account.limitHistory.shift();
      }

      this.recordLimitUpdate({
        bookmakerId,
        market,
        oldLimit,
        newLimit,
        reason: source === 'api' ? 'api_update' : 'manual_update',
        timestamp: Date.now()
      });
    }

    account.limits.set(market, newLimit);
    
    logger.info(`Updated limit for ${bookmakerId} - ${market}`, { minStake, maxStake, source });
    this.emit('limitUpdated', { bookmakerId, market, limit: newLimit });
    
    return newLimit;
  }

  /**
   * Get effective limit for a bookmaker/market
   */
  public getEffectiveLimit(bookmakerId: string, market: string): BookmakerLimit {
    const account = this.accounts.get(bookmakerId);
    
    if (account) {
      // Check for specific market limit
      const specificLimit = account.limits.get(market);
      if (specificLimit) return specificLimit;
      
      // Check for default limit on account
      const defaultLimit = account.limits.get('default');
      if (defaultLimit) return defaultLimit;
    }
    
    // Fall back to global defaults
    const globalSpecific = this.globalDefaults.get(`${bookmakerId}:${market}`);
    if (globalSpecific) return globalSpecific;
    
    const globalDefault = this.globalDefaults.get(`${bookmakerId}:default`);
    if (globalDefault) return globalDefault;
    
    // Ultimate fallback
    return {
      bookmakerId,
      bookmakerName: bookmakerId,
      market,
      minStake: 1,
      maxStake: 1000,
      currency: 'EUR',
      lastUpdated: Date.now(),
      source: 'inferred',
      confidence: 0.3
    };
  }

  /**
   * Update dynamic adjustment based on bet outcome
   */
  public recordBetOutcome(
    bookmakerId: string,
    profit: number,
    stake: number
  ): DynamicLimitAdjustment {
    const account = this.accounts.get(bookmakerId);
    if (!account) {
      throw new Error(`Account not found: ${bookmakerId}`);
    }

    const adj = account.dynamicAdjustment;
    adj.totalProfit += profit;

    if (profit > 0) {
      adj.consecutiveWins++;
      adj.consecutiveLosses = 0;
    } else {
      adj.consecutiveLosses++;
      adj.consecutiveWins = 0;
    }

    // Calculate adjustment factor
    // Some bookmakers reduce limits after consecutive wins
    if (adj.consecutiveWins >= 3) {
      adj.adjustmentFactor = Math.max(0.5, 1 - (adj.consecutiveWins - 2) * 0.1);
      adj.isLimited = adj.adjustmentFactor < 0.8;
    } else if (adj.consecutiveLosses >= 5) {
      // May increase limits after losses (bookmakers want losing players back)
      adj.adjustmentFactor = Math.min(1.2, 1 + (adj.consecutiveLosses - 4) * 0.05);
      adj.isLimited = false;
    } else {
      adj.adjustmentFactor = 1.0;
      adj.isLimited = false;
    }

    adj.lastAdjustmentTime = Date.now();

    // Update gubbing risk
    if (adj.consecutiveWins >= 5 || adj.totalProfit > 5000) {
      account.gubbingRisk = Math.min(0.9, 0.3 + adj.consecutiveWins * 0.1);
    }

    logger.info(`Recorded outcome for ${bookmakerId}`, {
      profit,
      consecutiveWins: adj.consecutiveWins,
      consecutiveLosses: adj.consecutiveLosses,
      adjustmentFactor: adj.adjustmentFactor
    });

    this.emit('dynamicAdjustmentUpdated', { bookmakerId, adjustment: adj });
    return adj;
  }

  /**
   * Get adjusted limit considering dynamic factors
   */
  public getAdjustedLimit(bookmakerId: string, market: string): BookmakerLimit {
    const baseLimit = this.getEffectiveLimit(bookmakerId, market);
    const account = this.accounts.get(bookmakerId);
    
    if (!account || account.dynamicAdjustment.adjustmentFactor === 1.0) {
      return baseLimit;
    }

    const factor = account.dynamicAdjustment.adjustmentFactor;
    
    return {
      ...baseLimit,
      maxStake: Math.round(baseLimit.maxStake * factor * 100) / 100,
      source: 'inferred',
      confidence: baseLimit.confidence * 0.8
    };
  }

  /**
   * Record observed fill to validate/invalidate limits
   */
  public recordFillObservation(
    bookmakerId: string,
    market: string,
    requestedStake: number,
    filledStake: number,
    wasRejected: boolean
  ): void {
    if (wasRejected && requestedStake > filledStake) {
      // Bet was rejected - limit may be lower than expected
      const newMaxStake = filledStake * 0.95; // Conservative estimate
      this.setLimit(bookmakerId, market, 1, newMaxStake, 'inferred', 0.7);
      
      this.recordLimitUpdate({
        bookmakerId,
        market,
        oldLimit: this.getEffectiveLimit(bookmakerId, market),
        newLimit: this.getEffectiveLimit(bookmakerId, market),
        reason: 'fill_observation',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record limit update in history
   */
  private recordLimitUpdate(event: LimitUpdateEvent): void {
    this.limitHistory.push(event);
    if (this.limitHistory.length > this.MAX_HISTORY_SIZE) {
      this.limitHistory.shift();
    }
  }

  /**
   * Get limit history for a bookmaker
   */
  public getLimitHistory(bookmakerId: string, market?: string): LimitUpdateEvent[] {
    return this.limitHistory.filter(
      e => e.bookmakerId === bookmakerId && (!market || e.market === market)
    );
  }

  /**
   * Get all accounts
   */
  public getAllAccounts(): BookmakerAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Check if any accounts have limited status
   */
  public getLimitedAccounts(): BookmakerAccount[] {
    return Array.from(this.accounts.values()).filter(a => a.dynamicAdjustment.isLimited);
  }

  /**
   * Reset dynamic adjustments (e.g., after a cooling-off period)
   */
  public resetDynamicAdjustment(bookmakerId: string): void {
    const account = this.accounts.get(bookmakerId);
    if (account) {
      account.dynamicAdjustment = {
        bookmakerId,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        totalProfit: 0,
        lastAdjustmentTime: Date.now(),
        adjustmentFactor: 1.0,
        isLimited: false
      };
      account.gubbingRisk = 0.1;
      
      this.emit('dynamicAdjustmentReset', { bookmakerId });
    }
  }
}

// ============================================================================
// STAKE OPTIMIZATION ENGINE
// ============================================================================

/**
 * Optimizes stake distribution across bookmakers considering limits
 */
export class StakeOptimizationEngine extends EventEmitter {
  private limitManager: BookmakerLimitManager;
  private optimizationCache: Map<string, OptimizedStakes> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  constructor(limitManager: BookmakerLimitManager) {
    super();
    this.limitManager = limitManager;
  }

  /**
   * Optimize stakes for an arbitrage opportunity
   */
  public optimizeStakes(
    opportunityId: string,
    legs: StakeLeg[],
    totalBankroll: number,
    options: {
      maxBankrollPercent?: number;
      minProfitPercent?: number;
      allowPartialFills?: boolean;
      preferOptimalOverSize?: boolean;
    } = {}
  ): OptimizedStakes {
    const {
      maxBankrollPercent = 0.1,
      minProfitPercent = 0.5,
      allowPartialFills = false,
      preferOptimalOverSize = true
    } = options;

    // Calculate ideal stakes
    const maxTotalStake = totalBankroll * maxBankrollPercent;
    const idealTotalStake = Math.min(
      maxTotalStake,
      legs.reduce((sum, leg) => sum + leg.idealStake, 0)
    );

    // Get constraints for each leg
    const constrainedLegs = legs.map(leg => this.applyConstraints(leg));

    // Calculate scale factor to fit within constraints
    const scaleFactor = this.calculateScaleFactor(constrainedLegs, idealTotalStake);

    // Build optimized legs
    const optimizedLegs: OptimizedLeg[] = constrainedLegs.map(leg => {
      const actualStake = preferOptimalOverSize
        ? Math.min(leg.idealStake, leg.maxStake)
        : leg.idealStake * scaleFactor;

      const roundedStake = this.roundStake(actualStake, leg.minStake);
      const isConstrained = roundedStake < leg.idealStake;

      return {
        bookmakerId: leg.bookmakerId,
        bookmakerName: leg.bookmakerName,
        market: leg.market,
        selection: leg.selection,
        odds: leg.odds,
        idealStake: leg.idealStake,
        actualStake: roundedStake,
        stakeLimit: leg.maxStake,
        isConstrained,
        constraintReason: isConstrained ? this.getConstraintReason(leg, roundedStake) : undefined,
        fillProbability: this.calculateFillProbability(roundedStake, leg.maxStake)
      };
    });

    // Calculate totals
    const actualTotalStake = optimizedLegs.reduce((sum, leg) => sum + leg.actualStake, 0);
    const expectedProfit = this.calculateExpectedProfit(optimizedLegs);
    const profitPercent = actualTotalStake > 0 ? (expectedProfit / actualTotalStake) * 100 : 0;

    // Check if optimal (all legs at ideal stake)
    const isOptimal = optimizedLegs.every(leg => !leg.isConstrained);

    // Build constraints list
    const constraints: Constraint[] = optimizedLegs
      .filter(leg => leg.isConstrained)
      .map(leg => ({
        type: leg.actualStake < leg.idealStake ? 'max_stake' : 'min_stake',
        bookmakerId: leg.bookmakerId,
        market: leg.market,
        requested: leg.idealStake,
        allowed: leg.actualStake,
        message: leg.constraintReason || 'Stake constrained by bookmaker limit'
      }));

    // Calculate partial fill risk
    const partialFillRisk = this.calculatePartialFillRisk(optimizedLegs, profitPercent);

    // Generate alternative suggestions if constrained
    const alternativeSuggestions = isOptimal
      ? []
      : this.generateAlternatives(legs, totalBankroll, options);

    // Determine fallback strategy
    const fallbackStrategy = this.determineFallbackStrategy(
      optimizedLegs,
      profitPercent,
      minProfitPercent,
      alternativeSuggestions
    );

    const result: OptimizedStakes = {
      opportunityId,
      totalStake: actualTotalStake,
      legs: optimizedLegs,
      expectedProfit,
      profitPercent,
      isOptimal,
      constraintsApplied: constraints,
      partialFillRisk,
      alternativeSuggestions,
      fallbackStrategy
    };

    // Cache result
    this.cacheResult(opportunityId, result);

    this.emit('stakesOptimized', { opportunityId, result });
    return result;
  }

  /**
   * Apply constraints from limit manager to a leg
   */
  private applyConstraints(leg: StakeLeg): StakeLeg {
    const limit = this.limitManager.getAdjustedLimit(leg.bookmakerId, leg.market);
    const account = this.limitManager.getAccount(leg.bookmakerId);

    // Check balance constraint
    const maxFromBalance = account ? account.balance : Infinity;
    
    return {
      ...leg,
      minStake: Math.max(leg.minStake, limit.minStake),
      maxStake: Math.min(leg.maxStake, limit.maxStake, maxFromBalance)
    };
  }

  /**
   * Calculate scale factor to fit stakes within constraints
   */
  private calculateScaleFactor(legs: StakeLeg[], targetTotal: number): number {
    let scaleFactor = 1.0;
    
    for (const leg of legs) {
      if (leg.idealStake > leg.maxStake) {
        const legScale = leg.maxStake / leg.idealStake;
        scaleFactor = Math.min(scaleFactor, legScale);
      }
    }

    // Ensure total doesn't exceed target
    const currentTotal = legs.reduce((sum, leg) => 
      sum + Math.min(leg.idealStake * scaleFactor, leg.maxStake), 0
    );
    
    if (currentTotal > targetTotal && targetTotal > 0) {
      scaleFactor *= targetTotal / currentTotal;
    }

    return scaleFactor;
  }

  /**
   * Round stake to valid increment
   */
  private roundStake(stake: number, minStake: number): number {
    // Round to 2 decimal places
    const rounded = Math.round(stake * 100) / 100;
    // Ensure at least minStake
    return Math.max(minStake, rounded);
  }

  /**
   * Get human-readable constraint reason
   */
  private getConstraintReason(leg: StakeLeg, actualStake: number): string {
    if (actualStake >= leg.maxStake) {
      return `Max stake limit (${leg.maxStake})`;
    }
    if (actualStake <= leg.minStake) {
      return `Min stake limit (${leg.minStake})`;
    }
    return 'Scaled to maintain arbitrage ratio';
  }

  /**
   * Calculate probability of fill based on stake vs limit
   */
  private calculateFillProbability(stake: number, limit: number): number {
    if (stake >= limit) return 0.5; // At limit - risky
    if (stake <= limit * 0.5) return 0.95; // Well under limit - safe
    // Linear interpolation
    return 0.95 - ((stake - limit * 0.5) / (limit * 0.5)) * 0.45;
  }

  /**
   * Calculate expected profit from optimized legs
   */
  private calculateExpectedProfit(legs: OptimizedLeg[]): number {
    if (legs.length === 0) return 0;
    
    // Calculate profit from first leg (all legs should yield same profit in perfect arb)
    const leg = legs[0];
    const winnings = leg.actualStake * leg.odds;
    const totalStake = legs.reduce((sum, l) => sum + l.actualStake, 0);
    
    return winnings - totalStake;
  }

  /**
   * Calculate partial fill risk
   */
  private calculatePartialFillRisk(legs: OptimizedLeg[], profitPercent: number): PartialFillRisk {
    const scenarios: PartialFillScenario[] = [];
    
    // Check each leg for fill risk
    for (const leg of legs) {
      if (leg.fillProbability < 0.9) {
        // Scenario: This leg doesn't fill
        const otherLegsTotal = legs
          .filter(l => l.bookmakerId !== leg.bookmakerId)
          .reduce((sum, l) => sum + l.actualStake, 0);
        
        scenarios.push({
          description: `${leg.bookmakerName} ${leg.selection} doesn't fill`,
          probability: 1 - leg.fillProbability,
          profitImpact: -otherLegsTotal, // Lose the other stakes
          affectedLegs: [leg.bookmakerId]
        });
      }
    }

    // Calculate overall risk
    const avgFillProb = legs.reduce((sum, l) => sum + l.fillProbability, 0) / legs.length;
    const riskProbability = 1 - avgFillProb;
    
    let riskLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (riskProbability > 0.3) riskLevel = 'high';
    else if (riskProbability > 0.15) riskLevel = 'medium';
    else if (riskProbability > 0.05) riskLevel = 'low';

    const maxImpact = scenarios.length > 0 
      ? Math.max(...scenarios.map(s => Math.abs(s.profitImpact)))
      : 0;

    return {
      riskLevel,
      probability: riskProbability,
      impact: maxImpact,
      scenarios
    };
  }

  /**
   * Generate alternative bookmaker combinations
   */
  private generateAlternatives(
    originalLegs: StakeLeg[],
    totalBankroll: number,
    options: any
  ): AlternativeCombination[] {
    const alternatives: AlternativeCombination[] = [];
    
    // Get all available bookmakers
    const allAccounts = this.limitManager.getAllAccounts().filter(a => a.isActive);
    
    // Try to find alternatives for each constrained leg
    for (let i = 0; i < originalLegs.length; i++) {
      const constrainedLeg = originalLegs[i];
      const limit = this.limitManager.getAdjustedLimit(constrainedLeg.bookmakerId, constrainedLeg.market);
      
      if (constrainedLeg.idealStake <= limit.maxStake) continue; // Not constrained

      // Find alternative bookmakers for this leg
      const alternativesForLeg = allAccounts
        .filter(a => a.bookmakerId !== constrainedLeg.bookmakerId)
        .map(a => {
          const altLimit = this.limitManager.getAdjustedLimit(a.bookmakerId, constrainedLeg.market);
          return {
            bookmakerId: a.bookmakerId,
            bookmakerName: a.bookmakerName,
            availableLimit: altLimit.maxStake,
            odds: constrainedLeg.odds // Assume same odds for simplicity
          };
        })
        .filter(a => a.availableLimit >= constrainedLeg.idealStake * 0.8);

      for (const alt of alternativesForLeg.slice(0, 3)) {
        const altLegs: AlternativeLeg[] = originalLegs.map((leg, idx) => {
          if (idx === i) {
            return {
              bookmakerId: alt.bookmakerId,
              bookmakerName: alt.bookmakerName,
              market: leg.market,
              selection: leg.selection,
              odds: alt.odds,
              stake: leg.idealStake,
              availableLimit: alt.availableLimit
            };
          }
          const l = this.limitManager.getAdjustedLimit(leg.bookmakerId, leg.market);
          return {
            bookmakerId: leg.bookmakerId,
            bookmakerName: leg.bookmakerName,
            market: leg.market,
            selection: leg.selection,
            odds: leg.odds,
            stake: leg.idealStake,
            availableLimit: l.maxStake
          };
        });

        const totalStake = altLegs.reduce((sum, l) => sum + l.stake, 0);
        const expectedProfit = altLegs[0].stake * altLegs[0].odds - totalStake;
        const profitPercent = (expectedProfit / totalStake) * 100;

        alternatives.push({
          combinationId: `alt_${i}_${alt.bookmakerId}`,
          legs: altLegs,
          totalStake,
          expectedProfit,
          profitPercent,
          feasibility: 0.8,
          reason: `Replace ${constrainedLeg.bookmakerName} with ${alt.bookmakerName} for higher limit`
        });
      }
    }

    // Sort by profit
    return alternatives
      .filter(a => a.profitPercent > 0)
      .sort((a, b) => b.profitPercent - a.profitPercent)
      .slice(0, 5);
  }

  /**
   * Determine fallback strategy when optimal stakes exceed limits
   */
  private determineFallbackStrategy(
    legs: OptimizedLeg[],
    profitPercent: number,
    minProfitPercent: number,
    alternatives: AlternativeCombination[]
  ): FallbackStrategy {
    // If profit is still acceptable, suggest reducing all stakes proportionally
    if (profitPercent >= minProfitPercent) {
      return {
        type: 'reduce_all',
        description: 'Reduce all stakes proportionally to fit within limits',
        adjustedStakes: legs,
        expectedProfit: legs.reduce((sum, l) => sum + l.actualStake, 0) * (profitPercent / 100),
        profitPercent,
        recommendation: 'Proceed with reduced stakes - profit still acceptable'
      };
    }

    // If there are good alternatives, suggest using one
    if (alternatives.length > 0 && alternatives[0].profitPercent >= minProfitPercent) {
      return {
        type: 'use_alternative',
        description: `Use alternative combination: ${alternatives[0].reason}`,
        expectedProfit: alternatives[0].expectedProfit,
        profitPercent: alternatives[0].profitPercent,
        recommendation: 'Switch to alternative bookmaker combination'
      };
    }

    // If profit is too low, suggest skipping
    if (profitPercent < minProfitPercent * 0.5) {
      return {
        type: 'abort',
        description: 'Profit margin too low after constraints applied',
        expectedProfit: 0,
        profitPercent: 0,
        recommendation: 'Skip this opportunity - insufficient profit after limits'
      };
    }

    // Default: partial arbitrage
    return {
      type: 'partial_arbitrage',
      description: 'Some legs constrained but still potentially profitable',
      adjustedStakes: legs,
      expectedProfit: legs.reduce((sum, l) => sum + l.actualStake, 0) * (profitPercent / 100),
      profitPercent,
      recommendation: 'Proceed with caution - monitor for partial fills'
    };
  }

  /**
   * Cache optimization result
   */
  private cacheResult(opportunityId: string, result: OptimizedStakes): void {
    this.optimizationCache.set(opportunityId, result);
    
    // Clean old cache entries
    setTimeout(() => {
      this.optimizationCache.delete(opportunityId);
    }, this.CACHE_TTL_MS);
  }

  /**
   * Get cached result
   */
  public getCachedResult(opportunityId: string): OptimizedStakes | undefined {
    return this.optimizationCache.get(opportunityId);
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.optimizationCache.clear();
  }
}

// ============================================================================
// PARTIAL FILL PROTECTION
// ============================================================================

/**
 * Detects and prevents partial fills that break arbitrage
 */
export class PartialFillProtector extends EventEmitter {
  private pendingBets: Map<string, PendingBetGroup> = new Map();
  private readonly FILL_TIMEOUT_MS = 30000; // 30 seconds to fill all legs

  /**
   * Register a group of bets that must all fill together
   */
  public registerBetGroup(
    groupId: string,
    legs: Array<{ bookmakerId: string; betId: string; stake: number }>
  ): void {
    const group: PendingBetGroup = {
      groupId,
      legs: legs.map(l => ({
        ...l,
        status: 'pending',
        filledStake: 0
      })),
      createdAt: Date.now(),
      timeoutAt: Date.now() + this.FILL_TIMEOUT_MS
    };

    this.pendingBets.set(groupId, group);

    // Set timeout for automatic cancellation
    setTimeout(() => {
      this.checkAndCancelPartial(groupId);
    }, this.FILL_TIMEOUT_MS);

    this.emit('betGroupRegistered', { groupId, legCount: legs.length });
  }

  /**
   * Record a fill for a specific leg
   */
  public recordFill(
    groupId: string,
    betId: string,
    filledStake: number,
    status: 'filled' | 'partial' | 'rejected'
  ): FillStatus {
    const group = this.pendingBets.get(groupId);
    if (!group) {
      return { canProceed: false, reason: 'Group not found' };
    }

    const leg = group.legs.find(l => l.betId === betId);
    if (!leg) {
      return { canProceed: false, reason: 'Leg not found' };
    }

    leg.filledStake = filledStake;
    leg.status = status;

    // Check if all legs are filled
    const allFilled = group.legs.every(l => l.status === 'filled');
    const anyRejected = group.legs.some(l => l.status === 'rejected');
    const anyPartial = group.legs.some(l => l.status === 'partial');

    if (allFilled) {
      this.emit('allLegsFilled', { groupId });
      this.pendingBets.delete(groupId);
      return { canProceed: true, reason: 'All legs filled' };
    }

    if (anyRejected) {
      this.emit('legRejected', { groupId, betId });
      return {
        canProceed: false,
        reason: 'One or more legs rejected - arbitrage broken',
        shouldCancel: true
      };
    }

    if (anyPartial) {
      // Check if partial fills still maintain arbitrage
      const canMaintainArbitrage = this.checkPartialArbitrage(group);
      if (!canMaintainArbitrage) {
        return {
          canProceed: false,
          reason: 'Partial fill breaks arbitrage profitability',
          shouldCancel: true
        };
      }
    }

    return { canProceed: false, reason: 'Waiting for remaining legs' };
  }

  /**
   * Check if partial fills can still maintain arbitrage
   */
  private checkPartialArbitrage(group: PendingBetGroup): boolean {
    // Calculate profit with current fills
    let totalStaked = 0;
    let minReturn = Infinity;

    for (const leg of group.legs) {
      const stake = leg.filledStake;
      totalStaked += stake;
      // This is simplified - actual implementation would need odds
      // minReturn = Math.min(minReturn, stake * odds);
    }

    // Simplified check - actual implementation would be more complex
    return totalStaked > 0;
  }

  /**
   * Check and cancel partially filled group
   */
  private checkAndCancelPartial(groupId: string): void {
    const group = this.pendingBets.get(groupId);
    if (!group) return;

    const allFilled = group.legs.every(l => l.status === 'filled');
    if (!allFilled) {
      this.emit('cancelPartialFills', {
        groupId,
        filledLegs: group.legs.filter(l => l.status === 'filled'),
        unfilledLegs: group.legs.filter(l => l.status === 'pending')
      });
    }

    this.pendingBets.delete(groupId);
  }

  /**
   * Get pending bet groups
   */
  public getPendingGroups(): PendingBetGroup[] {
    return Array.from(this.pendingBets.values());
  }

  /**
   * Cancel a bet group
   */
  public cancelGroup(groupId: string): boolean {
    const group = this.pendingBets.get(groupId);
    if (!group) return false;

    this.emit('groupCancelled', { groupId });
    this.pendingBets.delete(groupId);
    return true;
  }
}

interface PendingBetGroup {
  groupId: string;
  legs: PendingLeg[];
  createdAt: number;
  timeoutAt: number;
}

interface PendingLeg {
  bookmakerId: string;
  betId: string;
  stake: number;
  status: 'pending' | 'filled' | 'partial' | 'rejected';
  filledStake: number;
}

interface FillStatus {
  canProceed: boolean;
  reason: string;
  shouldCancel?: boolean;
}

// ============================================================================
// MAIN OPTIMIZER CLASS
// ============================================================================

/**
 * Main bookmaker limit optimizer integrating all components
 */
export class BookmakerLimitOptimizer extends EventEmitter {
  public limitManager: BookmakerLimitManager;
  public optimizationEngine: StakeOptimizationEngine;
  public partialFillProtector: PartialFillProtector;

  constructor() {
    super();
    this.limitManager = new BookmakerLimitManager();
    this.optimizationEngine = new StakeOptimizationEngine(this.limitManager);
    this.partialFillProtector = new PartialFillProtector();

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward events from sub-components
    this.limitManager.on('limitUpdated', (e) => this.emit('limitUpdated', e));
    this.limitManager.on('dynamicAdjustmentUpdated', (e) => this.emit('dynamicAdjustmentUpdated', e));
    this.optimizationEngine.on('stakesOptimized', (e) => this.emit('stakesOptimized', e));
    this.partialFillProtector.on('allLegsFilled', (e) => this.emit('allLegsFilled', e));
    this.partialFillProtector.on('cancelPartialFills', (e) => this.emit('cancelPartialFills', e));
  }

  /**
   * Optimize stakes for an arbitrage opportunity
   */
  public optimizeStakes(
    opportunityId: string,
    legs: StakeLeg[],
    totalBankroll: number,
    options?: {
      maxBankrollPercent?: number;
      minProfitPercent?: number;
      allowPartialFills?: boolean;
      preferOptimalOverSize?: boolean;
    }
  ): OptimizedStakes {
    return this.optimizationEngine.optimizeStakes(opportunityId, legs, totalBankroll, options);
  }

  /**
   * Register a bookmaker account
   */
  public registerAccount(
    bookmakerId: string,
    bookmakerName: string,
    balance: number,
    currency?: string
  ): BookmakerAccount {
    return this.limitManager.registerAccount(bookmakerId, bookmakerName, balance, currency);
  }

  /**
   * Set limit for a bookmaker/market
   */
  public setLimit(
    bookmakerId: string,
    market: string,
    minStake: number,
    maxStake: number,
    source?: 'api' | 'manual' | 'inferred'
  ): BookmakerLimit {
    return this.limitManager.setLimit(bookmakerId, market, minStake, maxStake, source);
  }

  /**
   * Record bet outcome for dynamic limit adjustment
   */
  public recordBetOutcome(bookmakerId: string, profit: number, stake: number): void {
    this.limitManager.recordBetOutcome(bookmakerId, profit, stake);
  }

  /**
   * Register a bet group for partial fill protection
   */
  public registerBetGroup(
    groupId: string,
    legs: Array<{ bookmakerId: string; betId: string; stake: number }>
  ): void {
    this.partialFillProtector.registerBetGroup(groupId, legs);
  }

  /**
   * Record a fill for partial fill protection
   */
  public recordFill(
    groupId: string,
    betId: string,
    filledStake: number,
    status: 'filled' | 'partial' | 'rejected'
  ): FillStatus {
    return this.partialFillProtector.recordFill(groupId, betId, filledStake, status);
  }

  /**
   * Get optimization statistics
   */
  public getStats(): {
    accounts: number;
    limitedAccounts: number;
    pendingGroups: number;
    totalLimitsTracked: number;
  } {
    return {
      accounts: this.limitManager.getAllAccounts().length,
      limitedAccounts: this.limitManager.getLimitedAccounts().length,
      pendingGroups: this.partialFillProtector.getPendingGroups().length,
      totalLimitsTracked: Array.from(this.limitManager.getAllAccounts())
        .reduce((sum, a) => sum + a.limits.size, 0)
    };
  }

  /**
   * Export all limit data
   */
  public exportData(): {
    accounts: BookmakerAccount[];
    limitHistory: LimitUpdateEvent[];
    timestamp: number;
  } {
    return {
      accounts: this.limitManager.getAllAccounts(),
      limitHistory: this.limitManager.getLimitHistory(''),
      timestamp: Date.now()
    };
  }

  /**
   * Import limit data
   */
  public importData(data: { accounts: BookmakerAccount[] }): void {
    for (const account of data.accounts) {
      this.registerAccount(
        account.bookmakerId,
        account.bookmakerName,
        account.balance,
        account.currency
      );
      
      for (const [market, limit] of Array.from(account.limits.entries())) {
        this.setLimit(account.bookmakerId, market, limit.minStake, limit.maxStake, limit.source);
      }
    }
  }
}

// ============================================================================
// SINGLETON ACCESSOR
// ============================================================================

let defaultOptimizer: BookmakerLimitOptimizer | null = null;

export function getBookmakerLimitOptimizer(): BookmakerLimitOptimizer {
  if (!defaultOptimizer) {
    defaultOptimizer = new BookmakerLimitOptimizer();
  }
  return defaultOptimizer;
}

export function resetBookmakerLimitOptimizer(): void {
  defaultOptimizer = null;
}

export default BookmakerLimitOptimizer;
