/**
 * Dynamic Stake Sizing Module
 * 
 * Automatically adjusts stake sizes based on confidence scores.
 * Higher stakes for high-confidence (A-grade) opportunities,
 * lower stakes for lower-confidence opportunities.
 * 
 * Integrates with OpportunityConfidenceScorer and BookmakerLimitOptimizer
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';
import { ConfidenceScore, Grade } from './opportunity-confidence-scorer.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StakeSizingConfig {
  /** Base stake as percentage of bankroll (default: 1%) */
  baseStakePercent: number;
  /** Maximum stake as percentage of bankroll (default: 5%) */
  maxStakePercent: number;
  /** Minimum stake as percentage of bankroll (default: 0.1%) */
  minStakePercent: number;
  /** Grade multipliers for stake sizing */
  gradeMultipliers: Record<Grade, number>;
  /** Kelly Criterion fraction (0-1, default: 0.25 = quarter Kelly) */
  kellyFraction: number;
  /** Maximum absolute stake amount (default: 1000) */
  maxAbsoluteStake: number;
  /** Minimum absolute stake amount (default: 10) */
  minAbsoluteStake: number;
  /** Whether to use Kelly Criterion (default: true) */
  useKellyCriterion: boolean;
  /** Confidence score threshold for maximum stake (default: 85) */
  confidenceThresholdMax: number;
  /** Confidence score threshold for minimum stake (default: 40) */
  confidenceThresholdMin: number;
  /** Risk of ruin protection - max daily loss limit (default: 5% of bankroll) */
  dailyLossLimitPercent: number;
  /** Consecutive loss adjustment - reduce stake after losses (default: true) */
  adjustAfterLosses: boolean;
  /** Stake reduction factor after consecutive losses (default: 0.8) */
  lossReductionFactor: number;
}

export interface SizedStake {
  /** The calculated stake amount */
  stake: number;
  /** Percentage of bankroll */
  stakePercent: number;
  /** Grade-based multiplier applied */
  gradeMultiplier: number;
  /** Confidence score used */
  confidenceScore: number;
  /** Grade of the opportunity */
  grade: Grade;
  /** Kelly fraction used (if applicable) */
  kellyFraction?: number;
  /** Expected value used in calculation */
  expectedValue: number;
  /** Reasoning for the stake size */
  reasoning: string[];
  /** Warnings or cautions */
  warnings: string[];
  /** Whether this stake is within safe limits */
  isSafe: boolean;
}

export interface BankrollState {
  totalBankroll: number;
  availableBankroll: number;
  dailyLoss: number;
  dailyLossLimit: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  lastUpdated: number;
}

export interface StakeSizingResult {
  opportunityId: string;
  match: string;
  totalBankroll: number;
  stakes: SizedStake[];
  totalStake: number;
  totalStakePercent: number;
  profitPotential: number;
  riskAmount: number;
  riskRewardRatio: number;
  recommendation: 'proceed' | 'caution' | 'skip';
  reasoning: string[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: StakeSizingConfig = {
  baseStakePercent: 1.0,        // 1% of bankroll base
  maxStakePercent: 5.0,         // 5% max per opportunity
  minStakePercent: 0.1,         // 0.1% minimum
  gradeMultipliers: {
    'A': 2.5,   // A-grade: 2.5x base stake
    'B': 1.75,  // B-grade: 1.75x base stake
    'C': 1.0,   // C-grade: 1x base stake (standard)
    'D': 0.5,   // D-grade: 0.5x base stake (half)
    'F': 0.0    // F-grade: Skip (0 stake)
  },
  kellyFraction: 0.25,          // Quarter Kelly for safety
  maxAbsoluteStake: 1000,
  minAbsoluteStake: 10,
  useKellyCriterion: true,
  confidenceThresholdMax: 85,   // At 85+ confidence, use max multiplier
  confidenceThresholdMin: 40,   // Below 40, use min stake
  dailyLossLimitPercent: 5.0,   // Stop if daily loss exceeds 5%
  adjustAfterLosses: true,
  lossReductionFactor: 0.8      // Reduce stake by 20% after each loss
};

// ============================================================================
// DYNAMIC STAKE SIZER
// ============================================================================

export class DynamicStakeSizer extends EventEmitter {
  private config: StakeSizingConfig;
  private bankroll: BankrollState;
  private stakeHistory: Array<{ timestamp: number; stake: number; result: 'win' | 'loss' | 'pending' }> = [];

  constructor(
    totalBankroll: number,
    config: Partial<StakeSizingConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bankroll = {
      totalBankroll,
      availableBankroll: totalBankroll,
      dailyLoss: 0,
      dailyLossLimit: totalBankroll * (this.config.dailyLossLimitPercent / 100),
      consecutiveLosses: 0,
      consecutiveWins: 0,
      lastUpdated: Date.now()
    };

    this.startDailyResetTimer();
    logger.info('DynamicStakeSizer initialized', {
      bankroll: totalBankroll,
      config: this.config
    });
  }

  /**
   * Calculate stake size based on confidence score and opportunity details
   */
  public calculateStake(
    opportunityId: string,
    match: string,
    confidenceScore: ConfidenceScore,
    odds: number[],
    profitPercent: number,
    options: {
      legs?: number;
      sport?: string;
      market?: string;
    } = {}
  ): StakeSizingResult {
    this.checkDailyReset();

    const { grade, score, probability } = confidenceScore;
    const { legs = 2 } = options;

    // Calculate base stake from bankroll
    let baseStake = this.bankroll.totalBankroll * (this.config.baseStakePercent / 100);

    // Apply grade multiplier
    const gradeMultiplier = this.config.gradeMultipliers[grade];
    let stake = baseStake * gradeMultiplier;

    // Apply confidence-based scaling (smooth curve between min and max)
    const confidenceMultiplier = this.calculateConfidenceMultiplier(score);
    stake *= confidenceMultiplier;

    // Apply Kelly Criterion if enabled and we have edge information
    if (this.config.useKellyCriterion && profitPercent > 0) {
      const kellyStake = this.calculateKellyStake(odds, probability, profitPercent);
      stake = Math.min(stake, kellyStake * this.config.kellyFraction);
    }

    // Apply consecutive loss adjustment
    if (this.config.adjustAfterLosses && this.bankroll.consecutiveLosses > 0) {
      const lossFactor = Math.pow(
        this.config.lossReductionFactor,
        Math.min(this.bankroll.consecutiveLosses, 5)
      );
      stake *= lossFactor;
    }

    // Apply daily loss limit protection
    if (this.bankroll.dailyLoss >= this.bankroll.dailyLossLimit * 0.8) {
      stake *= 0.5; // Reduce by 50% when approaching daily limit
    }

    // Enforce min/max limits
    const maxStake = Math.min(
      this.bankroll.totalBankroll * (this.config.maxStakePercent / 100),
      this.config.maxAbsoluteStake
    );
    const minStake = Math.max(
      this.bankroll.totalBankroll * (this.config.minStakePercent / 100),
      this.config.minAbsoluteStake
    );

    stake = Math.max(minStake, Math.min(stake, maxStake));

    // Calculate per-leg stakes
    const sizedStakes: SizedStake[] = [];
    const totalStake = stake;
    const stakePerLeg = totalStake / legs;

    for (let i = 0; i < legs; i++) {
      sizedStakes.push({
        stake: stakePerLeg,
        stakePercent: (stakePerLeg / this.bankroll.totalBankroll) * 100,
        gradeMultiplier,
        confidenceScore: score,
        grade,
        kellyFraction: this.config.useKellyCriterion ? this.config.kellyFraction : undefined,
        expectedValue: (confidenceScore as any).expectedValue || 0,
        reasoning: this.buildReasoning(grade, score, gradeMultiplier, confidenceMultiplier),
        warnings: this.buildWarnings(grade, score),
        isSafe: this.isSafeStake(stakePerLeg, grade)
      });
    }

    // Calculate risk/reward
    const riskAmount = totalStake; // In arbitrage, risk is the stake (guaranteed profit)
    const profitPotential = totalStake * (profitPercent / 100);
    const riskRewardRatio = profitPotential / riskAmount;

    // Determine recommendation
    const recommendation = this.determineRecommendation(grade, score, totalStake);

    const result: StakeSizingResult = {
      opportunityId,
      match,
      totalBankroll: this.bankroll.totalBankroll,
      stakes: sizedStakes,
      totalStake,
      totalStakePercent: (totalStake / this.bankroll.totalBankroll) * 100,
      profitPotential,
      riskAmount,
      riskRewardRatio,
      recommendation,
      reasoning: this.buildResultReasoning(grade, score, totalStake, profitPotential)
    };

    this.emit('stakeCalculated', result);
    logger.info('Stake calculated', { opportunityId, grade, totalStake, recommendation });

    return result;
  }

  /**
   * Calculate confidence-based multiplier (smooth curve)
   */
  private calculateConfidenceMultiplier(score: number): number {
    if (score >= this.config.confidenceThresholdMax) {
      return 1.0; // Full multiplier at high confidence
    }
    if (score <= this.config.confidenceThresholdMin) {
      return 0.5; // Half multiplier at low confidence
    }
    
    // Linear interpolation between min and max
    const range = this.config.confidenceThresholdMax - this.config.confidenceThresholdMin;
    const position = score - this.config.confidenceThresholdMin;
    return 0.5 + (0.5 * (position / range));
  }

  /**
   * Calculate Kelly Criterion stake
   * Kelly % = (bp - q) / b
   * where b = odds - 1, p = probability of win, q = probability of loss
   */
  private calculateKellyStake(
    odds: number[],
    probability: number,
    profitPercent: number
  ): number {
    // For arbitrage, we use the implied edge
    const avgOdds = odds.reduce((a, b) => a + b, 0) / odds.length;
    const b = avgOdds - 1; // Net odds
    const p = probability / 100; // Convert to decimal
    const q = 1 - p;

    const kellyPercent = (b * p - q) / b;
    
    if (kellyPercent <= 0) {
      return this.bankroll.totalBankroll * (this.config.minStakePercent / 100);
    }

    return this.bankroll.totalBankroll * kellyPercent;
  }

  /**
   * Build reasoning for stake size
   */
  private buildReasoning(
    grade: Grade,
    score: number,
    gradeMultiplier: number,
    confidenceMultiplier: number
  ): string[] {
    const reasoning: string[] = [];
    
    reasoning.push(`Grade ${grade} opportunity with ${score.toFixed(1)}% confidence`);
    reasoning.push(`Grade multiplier: ${gradeMultiplier}x base stake`);
    reasoning.push(`Confidence multiplier: ${confidenceMultiplier.toFixed(2)}x`);
    
    if (this.bankroll.consecutiveLosses > 0) {
      reasoning.push(`Adjusted for ${this.bankroll.consecutiveLosses} consecutive losses`);
    }
    
    return reasoning;
  }

  /**
   * Build warnings for the stake
   */
  private buildWarnings(grade: Grade, score: number): string[] {
    const warnings: string[] = [];
    
    if (grade === 'F') {
      warnings.push('F-grade opportunity - consider skipping');
    } else if (grade === 'D') {
      warnings.push('D-grade opportunity - reduced stake recommended');
    }
    
    if (score < 50) {
      warnings.push('Low confidence score - higher risk');
    }
    
    if (this.bankroll.dailyLoss >= this.bankroll.dailyLossLimit * 0.8) {
      warnings.push('Approaching daily loss limit - reduced stakes');
    }
    
    return warnings;
  }

  /**
   * Check if stake is within safe limits
   */
  private isSafeStake(stake: number, grade: Grade): boolean {
    const stakePercent = (stake / this.bankroll.totalBankroll) * 100;
    
    if (grade === 'F') return false;
    if (stakePercent > this.config.maxStakePercent) return false;
    if (this.bankroll.dailyLoss >= this.bankroll.dailyLossLimit) return false;
    
    return true;
  }

  /**
   * Determine overall recommendation
   */
  private determineRecommendation(
    grade: Grade,
    score: number,
    totalStake: number
  ): 'proceed' | 'caution' | 'skip' {
    if (grade === 'F') return 'skip';
    if (grade === 'D' || score < 50) return 'caution';
    if (this.bankroll.dailyLoss >= this.bankroll.dailyLossLimit) return 'skip';
    
    const stakePercent = (totalStake / this.bankroll.totalBankroll) * 100;
    if (stakePercent > this.config.maxStakePercent * 0.9) return 'caution';
    
    return 'proceed';
  }

  /**
   * Build result-level reasoning
   */
  private buildResultReasoning(
    grade: Grade,
    score: number,
    totalStake: number,
    profitPotential: number
  ): string[] {
    const reasoning: string[] = [];
    
    reasoning.push(`Total stake: €${totalStake.toFixed(2)} (${((totalStake / this.bankroll.totalBankroll) * 100).toFixed(2)}% of bankroll)`);
    reasoning.push(`Potential profit: €${profitPotential.toFixed(2)}`);
    
    if (grade === 'A') {
      reasoning.push('A-grade opportunity - maximum stake allocated');
    } else if (grade === 'B') {
      reasoning.push('B-grade opportunity - above-average stake');
    } else if (grade === 'C') {
      reasoning.push('C-grade opportunity - standard stake');
    }
    
    return reasoning;
  }

  /**
   * Record bet outcome for tracking
   */
  public recordOutcome(
    opportunityId: string,
    stake: number,
    profit: number,
    result: 'win' | 'loss' | 'push'
  ): void {
    this.checkDailyReset();

    const outcome: 'win' | 'loss' | 'pending' = result === 'push' ? 'win' : result;
    
    this.stakeHistory.push({
      timestamp: Date.now(),
      stake,
      result: outcome
    });

    if (result === 'loss') {
      this.bankroll.dailyLoss += stake;
      this.bankroll.consecutiveLosses++;
      this.bankroll.consecutiveWins = 0;
    } else if (result === 'win') {
      this.bankroll.consecutiveWins++;
      this.bankroll.consecutiveLosses = 0;
    }

    this.bankroll.availableBankroll = this.bankroll.totalBankroll - this.bankroll.dailyLoss;

    this.emit('outcomeRecorded', {
      opportunityId,
      stake,
      profit,
      result,
      bankroll: this.bankroll
    });

    logger.info('Outcome recorded', { opportunityId, result, profit, dailyLoss: this.bankroll.dailyLoss });
  }

  /**
   * Update total bankroll
   */
  public updateBankroll(newBankroll: number): void {
    const oldBankroll = this.bankroll.totalBankroll;
    this.bankroll.totalBankroll = newBankroll;
    this.bankroll.dailyLossLimit = newBankroll * (this.config.dailyLossLimitPercent / 100);
    this.bankroll.availableBankroll = newBankroll - this.bankroll.dailyLoss;

    this.emit('bankrollUpdated', { oldBankroll, newBankroll });
    logger.info('Bankroll updated', { oldBankroll, newBankroll });
  }

  /**
   * Get current bankroll state
   */
  public getBankrollState(): BankrollState {
    this.checkDailyReset();
    return { ...this.bankroll };
  }

  /**
   * Get stake sizing statistics
   */
  public getStats(): {
    totalBets: number;
    wins: number;
    losses: number;
    winRate: number;
    totalStaked: number;
    totalProfit: number;
    roi: number;
    currentStreak: number;
  } {
    const wins = this.stakeHistory.filter(h => h.result === 'win').length;
    const losses = this.stakeHistory.filter(h => h.result === 'loss').length;
    const totalStaked = this.stakeHistory.reduce((sum, h) => sum + h.stake, 0);
    
    return {
      totalBets: this.stakeHistory.length,
      wins,
      losses,
      winRate: this.stakeHistory.length > 0 ? (wins / this.stakeHistory.length) * 100 : 0,
      totalStaked,
      totalProfit: this.bankroll.totalBankroll - (this.bankroll.totalBankroll + this.bankroll.dailyLoss), // Approximation
      roi: totalStaked > 0 ? ((this.bankroll.totalBankroll - (this.bankroll.totalBankroll + this.bankroll.dailyLoss)) / totalStaked) * 100 : 0,
      currentStreak: this.bankroll.consecutiveWins > 0 ? this.bankroll.consecutiveWins : -this.bankroll.consecutiveLosses
    };
  }

  /**
   * Check and perform daily reset
   */
  private checkDailyReset(): void {
    const now = Date.now();
    const lastUpdate = this.bankroll.lastUpdated;
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - lastUpdate > dayInMs) {
      this.bankroll.dailyLoss = 0;
      this.bankroll.availableBankroll = this.bankroll.totalBankroll;
      this.bankroll.lastUpdated = now;
      
      this.emit('dailyReset', { bankroll: this.bankroll });
      logger.info('Daily reset performed');
    }
  }

  /**
   * Start daily reset timer
   */
  private startDailyResetTimer(): void {
    setInterval(() => this.checkDailyReset(), 60000); // Check every minute
  }

  /**
   * Get recommended stake sizes for different confidence levels
   */
  public getStakeRecommendations(profitPercent: number = 1.0): Array<{
    grade: Grade;
    minConfidence: number;
    recommendedStake: number;
    stakePercent: number;
    description: string;
  }> {
    const recommendations = [];
    
    const grades: Grade[] = ['A', 'B', 'C', 'D', 'F'];
    const minConfidences = [85, 70, 55, 40, 0];
    
    for (let i = 0; i < grades.length; i++) {
      const grade = grades[i];
      const multiplier = this.config.gradeMultipliers[grade];
      
      if (multiplier === 0) {
        recommendations.push({
          grade,
          minConfidence: minConfidences[i],
          recommendedStake: 0,
          stakePercent: 0,
          description: 'Skip - insufficient confidence'
        });
        continue;
      }
      
      const baseStake = this.bankroll.totalBankroll * (this.config.baseStakePercent / 100);
      const stake = baseStake * multiplier;
      const cappedStake = Math.min(stake, this.config.maxAbsoluteStake);
      
      recommendations.push({
        grade,
        minConfidence: minConfidences[i],
        recommendedStake: cappedStake,
        stakePercent: (cappedStake / this.bankroll.totalBankroll) * 100,
        description: `${multiplier}x base stake (${this.config.baseStakePercent}% of bankroll)`
      });
    }
    
    return recommendations;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.removeAllListeners();
    logger.info('DynamicStakeSizer disposed');
  }
}

// ============================================================================
// SINGLETON ACCESSOR
// ============================================================================

let defaultSizer: DynamicStakeSizer | null = null;

export function getDynamicStakeSizer(
  totalBankroll?: number,
  config?: Partial<StakeSizingConfig>
): DynamicStakeSizer {
  if (!defaultSizer && totalBankroll) {
    defaultSizer = new DynamicStakeSizer(totalBankroll, config);
  } else if (!defaultSizer) {
    throw new Error('DynamicStakeSizer not initialized - provide totalBankroll');
  }
  return defaultSizer;
}

export function resetDynamicStakeSizer(): void {
  defaultSizer?.dispose();
  defaultSizer = null;
}

export default DynamicStakeSizer;
