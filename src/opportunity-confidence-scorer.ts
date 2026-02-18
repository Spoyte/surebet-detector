/**
 * Opportunity Confidence Scorer - Refactored
 * 
 * Clean separation of concerns:
 * - Domain types (pure data)
 * - Factor calculators (single responsibility)
 * - Scoring engine (orchestration only)
 * 
 * Reference: Go team's interface design + DHH's readable code philosophy
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';

// ============================================================================
// CONSTANTS - Named, not magic numbers
// ============================================================================

const WEIGHTS = {
  profit: 0.25,
  timing: 0.20,
  bookmaker: 0.20,
  market: 0.20,
  historical: 0.15
} as const;

const THRESHOLDS = {
  excellent: 85,
  good: 70,
  fair: 55,
  poor: 40
} as const;

const PROFIT_TIERS = [
  { min: 5.0, score: 1.0 },
  { min: 3.0, score: 0.9 },
  { min: 2.0, score: 0.8 },
  { min: 1.0, score: 0.7 },
  { min: 0.5, score: 0.6 }
] as const;

const TIMING = {
  sweetSpotHours: { min: 1, max: 24 },
  extendedWindowHours: 72,
  urgentThresholdMinutes: 60,
  peakHours: [18, 19, 20, 21],
  weekendDays: [0, 6]
} as const;

const EMA_ALPHA = 0.1;
const BASELINE_LIMIT = 100;

// ============================================================================
// DOMAIN TYPES - Pure data structures
// ============================================================================

export interface OpportunityFeatures {
  profitPercent: number;
  expectedValue: number;
  timeToEventMinutes: number;
  timeOfDay: number;
  dayOfWeek: number;
  bookmakers: string[];
  bookmakerReliabilityScores: number[];
  bookmakerAvgFillRates: number[];
  bookmakerLimitHistory: number[];
  sport: string;
  league: string;
  market: string;
  liquidityScore: number;
  oddsMovementVolatility: number;
  historicalSuccessRate: number;
  similarOpportunitiesCount: number;
  avgTimeToFillMinutes: number;
  competitorCount: number;
  marketEfficiency: number;
}

export interface FactorScores {
  profit: number;
  timing: number;
  bookmaker: number;
  market: number;
  historical: number;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Action = 'execute' | 'monitor' | 'skip';

export interface ConfidenceScore {
  score: number;
  confidence: number;
  probability: number;
  grade: Grade;
  factors: FactorScores;
  explanation: string[];
  recommendedAction: Action;
  estimatedFillTimeMinutes: number;
}

export interface ScoringModel {
  weights: typeof WEIGHTS;
  thresholds: typeof THRESHOLDS;
}

export interface BookmakerProfile {
  reliabilityScore: number;
  avgFillRate: number;
  avgLimit: number;
  gubbingRisk: number;
}

export interface SportProfile {
  successRate: number;
  avgFillTime: number;
  bestTimeOfDay: number;
  bestDayOfWeek: number;
  topBookmakers: string[];
}

export interface Outcome {
  success: boolean;
  fillTimeMinutes: number;
  actualProfit: number;
}

// ============================================================================
// UTILITIES - Small, testable functions
// ============================================================================

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const hoursFromMinutes = (minutes: number): number => minutes / 60;

// ============================================================================
// FACTOR CALCULATORS - Each does one thing well
// ============================================================================

interface FactorCalculator {
  calculate(features: OpportunityFeatures): number;
}

class ProfitFactorCalculator implements FactorCalculator {
  calculate(features: OpportunityFeatures): number {
    const tier = PROFIT_TIERS.find(t => features.profitPercent >= t.min);
    if (tier) return tier.score;
    
    // Linear interpolation below lowest tier
    return 0.4 + (features.profitPercent / 0.5) * 0.2;
  }
}

class TimingFactorCalculator implements FactorCalculator {
  calculate(features: OpportunityFeatures): number {
    let score = 0.5;
    const hoursToEvent = hoursFromMinutes(features.timeToEventMinutes);

    // Sweet spot: 1-24 hours before event
    if (hoursToEvent >= TIMING.sweetSpotHours.min && hoursToEvent <= TIMING.sweetSpotHours.max) {
      score += 0.3;
    } else if (hoursToEvent > TIMING.sweetSpotHours.max && hoursToEvent <= TIMING.extendedWindowHours) {
      score += 0.2;
    } else if (hoursToEvent < TIMING.sweetSpotHours.min) {
      score -= 0.2;
    }

    // Peak hours bonus
    if ([18, 19, 20, 21].includes(features.timeOfDay)) {
      score += 0.1;
    }

    // Weekend bonus
    if ([0, 6].includes(features.dayOfWeek)) {
      score += 0.1;
    }

    return clamp(score, 0, 1);
  }
}

class BookmakerFactorCalculator implements FactorCalculator {
  calculate(features: OpportunityFeatures): number {
    const reliabilities = features.bookmakerReliabilityScores;
    const fillRates = features.bookmakerAvgFillRates;
    const limits = features.bookmakerLimitHistory;

    if (reliabilities.length === 0) return 0.5;

    const avgReliability = average(reliabilities);
    const avgFillRate = average(fillRates);
    const avgLimit = average(limits);
    const limitScore = Math.min(1, avgLimit / BASELINE_LIMIT);

    return avgReliability * 0.4 + avgFillRate * 0.4 + limitScore * 0.2;
  }
}

class MarketFactorCalculator implements FactorCalculator {
  constructor(private sportProfiles: ProfileRepository<SportProfile>) {}

  calculate(features: OpportunityFeatures): number {
    let score = 0.5;

    // Liquidity contribution
    score += features.liquidityScore * 0.3;

    // Volatility penalty
    const volatilityPenalty = Math.min(0.3, features.oddsMovementVolatility * 0.1);
    score -= volatilityPenalty;

    // Sport-specific adjustment
    const sportProfile = this.sportProfiles.get(features.sport);
    if (sportProfile) {
      score += (sportProfile.successRate - 0.5) * 0.2;
    }

    return clamp(score, 0, 1);
  }
}

class HistoricalFactorCalculator implements FactorCalculator {
  calculate(features: OpportunityFeatures): number {
    if (features.similarOpportunitiesCount === 0) return 0.5;

    // Sample size confidence
    const sampleConfidence = Math.min(1, features.similarOpportunitiesCount / 100);
    let score = features.historicalSuccessRate * sampleConfidence + 0.5 * (1 - sampleConfidence);

    // Fill time adjustment
    if (features.avgTimeToFillMinutes < 5) {
      score += 0.1;
    } else if (features.avgTimeToFillMinutes > 30) {
      score -= 0.1;
    }

    return clamp(score, 0, 1);
  }
}

// ============================================================================
// COMPOSITE SCORE CALCULATOR - Orchestrates factor calculators
// ============================================================================

class CompositeScoreCalculator {
  private calculators: Record<keyof FactorScores, FactorCalculator>;

  constructor(sportProfiles: ProfileRepository<SportProfile>) {
    this.calculators = {
      profit: new ProfitFactorCalculator(),
      timing: new TimingFactorCalculator(),
      bookmaker: new BookmakerFactorCalculator(),
      market: new MarketFactorCalculator(sportProfiles),
      historical: new HistoricalFactorCalculator()
    };
  }

  calculate(features: OpportunityFeatures): { factors: FactorScores; composite: number } {
    const factors: FactorScores = {
      profit: this.calculators.profit.calculate(features),
      timing: this.calculators.timing.calculate(features),
      bookmaker: this.calculators.bookmaker.calculate(features),
      market: this.calculators.market.calculate(features),
      historical: this.calculators.historical.calculate(features)
    };

    const composite =
      factors.profit * WEIGHTS.profit +
      factors.timing * WEIGHTS.timing +
      factors.bookmaker * WEIGHTS.bookmaker +
      factors.market * WEIGHTS.market +
      factors.historical * WEIGHTS.historical;

    return { factors, composite };
  }
}

// ============================================================================
// GRADE & ACTION DETERMINERS - Pure functions, no side effects
// ============================================================================

const scoreToGrade = (score: number): Grade => {
  if (score >= THRESHOLDS.excellent) return 'A';
  if (score >= THRESHOLDS.good) return 'B';
  if (score >= THRESHOLDS.fair) return 'C';
  if (score >= THRESHOLDS.poor) return 'D';
  return 'F';
};

const determineAction = (score: number, profitPercent: number): Action => {
  if (score >= 80) return 'execute';
  if (score >= 60) return 'monitor';
  if (profitPercent > 3 && score >= 50) return 'monitor';
  return 'skip';
};

// ============================================================================
// EXPLANATION GENERATOR - Declarative rule-based system
// ============================================================================

interface ExplanationRule {
  condition: (features: OpportunityFeatures, factors: FactorScores) => boolean;
  message: (features: OpportunityFeatures, factors: FactorScores) => string;
}

const EXPLANATION_RULES: ExplanationRule[] = [
  {
    condition: (_, factors) => factors.profit > 0.8,
    message: (features) => `Strong profit potential (${features.profitPercent.toFixed(2)}%)`
  },
  {
    condition: (_, factors) => factors.profit < 0.5,
    message: (features) => `Low profit margin (${features.profitPercent.toFixed(2)}%)`
  },
  {
    condition: (_, factors) => factors.timing > 0.8,
    message: () => 'Optimal timing - good window for execution'
  },
  {
    condition: (features) => features.timeToEventMinutes < 60,
    message: () => 'Urgent - event starts soon'
  },
  {
    condition: (_, factors) => factors.bookmaker > 0.8,
    message: () => 'Reliable bookmakers with good fill rates'
  },
  {
    condition: (_, factors) => factors.bookmaker < 0.5,
    message: () => 'Bookmaker reliability concerns'
  },
  {
    condition: (_, factors) => factors.market > 0.8,
    message: () => 'High market liquidity'
  },
  {
    condition: (features) => features.liquidityScore < 0.3,
    message: () => 'Low liquidity - may be difficult to fill'
  },
  {
    condition: (features, factors) => 
      factors.historical > 0.7 && features.similarOpportunitiesCount > 10,
    message: (features) => `Strong historical track record (${features.historicalSuccessRate.toFixed(1)}% success)`
  }
];

const generateExplanations = (
  features: OpportunityFeatures,
  factors: FactorScores
): string[] =>
  EXPLANATION_RULES
    .filter(rule => rule.condition(features, factors))
    .map(rule => rule.message(features, factors));

// ============================================================================
// FILL TIME ESTIMATOR - Encapsulated estimation logic
// ============================================================================

class FillTimeEstimator {
  estimate(features: OpportunityFeatures, score: number): number {
    let baseTime = features.avgTimeToFillMinutes || 10;

    // Score adjustment
    if (score >= 80) baseTime *= 0.7;
    if (score <= 40) baseTime *= 1.5;

    // Liquidity adjustment
    baseTime /= (0.5 + features.liquidityScore * 0.5);

    // Urgency adjustment
    if (features.timeToEventMinutes < 60) {
      baseTime *= 0.5;
    }

    return Math.round(baseTime);
  }
}

// ============================================================================
// MODEL CONFIDENCE CALCULATOR
// ============================================================================

class ModelConfidenceCalculator {
  constructor(private bookmakerProfiles: ProfileRepository<BookmakerProfile>) {}

  calculate(features: OpportunityFeatures): number {
    let confidence = 0.5;

    // Historical data confidence
    confidence += Math.min(0.3, features.similarOpportunitiesCount / 100);

    // Known bookmaker confidence
    const knownBookmakers = features.bookmakers.filter(b =>
      this.bookmakerProfiles.has(b)
    ).length;
    confidence += (knownBookmakers / features.bookmakers.length) * 0.2;

    return Math.min(0.95, confidence);
  }
}

// ============================================================================
// PROFILE REPOSITORIES - Data access layer
// ============================================================================

const DEFAULT_BOOKMAKER_PROFILES: Record<string, BookmakerProfile> = {
  pinnacle: { reliabilityScore: 0.95, avgFillRate: 0.98, avgLimit: 10000, gubbingRisk: 0.1 },
  betfair: { reliabilityScore: 0.92, avgFillRate: 0.95, avgLimit: 5000, gubbingRisk: 0.15 },
  unibet: { reliabilityScore: 0.85, avgFillRate: 0.88, avgLimit: 500, gubbingRisk: 0.3 },
  betclic: { reliabilityScore: 0.82, avgFillRate: 0.85, avgLimit: 300, gubbingRisk: 0.35 },
  winamax: { reliabilityScore: 0.80, avgFillRate: 0.82, avgLimit: 400, gubbingRisk: 0.4 },
  fdj: { reliabilityScore: 0.78, avgFillRate: 0.80, avgLimit: 200, gubbingRisk: 0.25 },
  parionsport: { reliabilityScore: 0.77, avgFillRate: 0.78, avgLimit: 250, gubbingRisk: 0.3 },
  zebet: { reliabilityScore: 0.75, avgFillRate: 0.75, avgLimit: 200, gubbingRisk: 0.35 },
  cloudbet: { reliabilityScore: 0.88, avgFillRate: 0.90, avgLimit: 2000, gubbingRisk: 0.2 },
  smarkets: { reliabilityScore: 0.90, avgFillRate: 0.92, avgLimit: 3000, gubbingRisk: 0.15 }
};

const DEFAULT_SPORT_PROFILES: Record<string, SportProfile> = {
  soccer: { successRate: 0.72, avgFillTime: 8, bestTimeOfDay: 20, bestDayOfWeek: 6, topBookmakers: ['pinnacle', 'betfair', 'unibet'] },
  tennis: { successRate: 0.68, avgFillTime: 12, bestTimeOfDay: 19, bestDayOfWeek: 0, topBookmakers: ['pinnacle', 'betfair', 'winamax'] },
  basketball: { successRate: 0.70, avgFillTime: 10, bestTimeOfDay: 21, bestDayOfWeek: 5, topBookmakers: ['pinnacle', 'cloudbet', 'unibet'] },
  esports: { successRate: 0.65, avgFillTime: 15, bestTimeOfDay: 22, bestDayOfWeek: 5, topBookmakers: ['cloudbet', 'pinnacle', 'winamax'] },
  baseball: { successRate: 0.71, avgFillTime: 9, bestTimeOfDay: 20, bestDayOfWeek: 3, topBookmakers: ['pinnacle', 'betfair', 'cloudbet'] },
  hockey: { successRate: 0.69, avgFillTime: 11, bestTimeOfDay: 20, bestDayOfWeek: 4, topBookmakers: ['pinnacle', 'unibet', 'betfair'] }
};

class ProfileRepository<T> {
  private profiles: Map<string, T>;

  constructor(defaults: Record<string, T>) {
    this.profiles = new Map(Object.entries(defaults));
  }

  get(key: string): T | undefined {
    return this.profiles.get(key);
  }

  set(key: string, profile: T): void {
    this.profiles.set(key, profile);
  }

  has(key: string): boolean {
    return this.profiles.has(key);
  }

  entries(): IterableIterator<[string, T]> {
    return this.profiles.entries();
  }

  toRecord(): Record<string, T> {
    return Object.fromEntries(this.profiles);
  }

  loadFromRecord(record: Record<string, T>): void {
    this.profiles = new Map(Object.entries(record));
  }
}

// ============================================================================
// HISTORICAL DATA STORE - Encapsulated persistence
// ============================================================================

interface HistoricalEntry {
  outcomes: Array<Outcome & { timestamp: number }>;
  count: number;
}

class HistoricalDataStore {
  private data: Map<string, HistoricalEntry> = new Map();

  get(key: string): HistoricalEntry | undefined {
    return this.data.get(key);
  }

  addOutcome(key: string, outcome: Outcome): void {
    const existing = this.data.get(key) ?? { outcomes: [], count: 0 };
    existing.outcomes.push({ ...outcome, timestamp: Date.now() });
    existing.count++;
    this.data.set(key, existing);
  }

  size(): number {
    return this.data.size;
  }

  toRecord(): Record<string, HistoricalEntry> {
    return Object.fromEntries(this.data);
  }
}

// ============================================================================
// MAIN SCORER CLASS - Orchestration only, minimal logic
// ============================================================================

export class OpportunityConfidenceScorer extends EventEmitter {
  private compositeCalculator: CompositeScoreCalculator;
  private fillTimeEstimator: FillTimeEstimator;
  private confidenceCalculator: ModelConfidenceCalculator;
  private bookmakerProfiles: ProfileRepository<BookmakerProfile>;
  private sportProfiles: ProfileRepository<SportProfile>;
  private historicalData: HistoricalDataStore;

  constructor() {
    super();
    
    this.bookmakerProfiles = new ProfileRepository(DEFAULT_BOOKMAKER_PROFILES);
    this.sportProfiles = new ProfileRepository(DEFAULT_SPORT_PROFILES);
    this.historicalData = new HistoricalDataStore();
    
    this.compositeCalculator = new CompositeScoreCalculator(this.sportProfiles);
    this.fillTimeEstimator = new FillTimeEstimator();
    this.confidenceCalculator = new ModelConfidenceCalculator(this.bookmakerProfiles);
  }

  async scoreOpportunity(features: OpportunityFeatures): Promise<ConfidenceScore> {
    const { factors, composite } = this.compositeCalculator.calculate(features);
    const score = Math.round(composite * 100);

    const result: ConfidenceScore = {
      score,
      confidence: this.confidenceCalculator.calculate(features),
      probability: sigmoid(composite * 2 - 1),
      grade: scoreToGrade(score),
      factors,
      explanation: generateExplanations(features, factors),
      recommendedAction: determineAction(score, features.profitPercent),
      estimatedFillTimeMinutes: this.fillTimeEstimator.estimate(features, score)
    };

    this.emit('opportunityScored', { features, score: result, timestamp: Date.now() });
    
    logger.info('Opportunity scored', {
      score,
      grade: result.grade,
      probability: result.probability.toFixed(3),
      sport: features.sport,
      bookmakers: features.bookmakers
    });

    return result;
  }

  async scoreBatch(opportunities: OpportunityFeatures[]): Promise<ConfidenceScore[]> {
    const scores = await Promise.all(
      opportunities.map(opp => this.scoreOpportunity(opp))
    );

    this.emit('batchScored', {
      count: opportunities.length,
      avgScore: average(scores.map(s => s.score)),
      timestamp: Date.now()
    });

    return scores;
  }

  async updateModel(features: OpportunityFeatures, outcome: Outcome): Promise<void> {
    const key = this.generateFeatureKey(features);
    this.historicalData.addOutcome(key, outcome);

    for (const bookmaker of features.bookmakers) {
      this.updateBookmakerProfile(bookmaker, outcome);
    }

    this.emit('modelUpdated', {
      featureKey: key,
      outcome,
      historicalCount: this.historicalData.size(),
      timestamp: Date.now()
    });

    logger.info('Model updated with outcome', {
      bookmakers: features.bookmakers,
      success: outcome.success,
      fillTime: outcome.fillTimeMinutes
    });
  }

  getBookmakerRanking(): Array<{ bookmaker: string; reliability: number; avgFillRate: number }> {
    return Array.from(this.bookmakerProfiles.entries())
      .map(([bookmaker, profile]) => ({
        bookmaker,
        reliability: profile.reliabilityScore,
        avgFillRate: profile.avgFillRate
      }))
      .sort((a, b) => b.reliability - a.reliability);
  }

  getSportInsights(sport: string): Omit<SportProfile, 'topBookmakers'> & { topBookmakers: string[] } | null {
    const profile = this.sportProfiles.get(sport);
    return profile ?? null;
  }

  exportModel(): {
    bookmakerProfiles: Record<string, BookmakerProfile>;
    sportProfiles: Record<string, SportProfile>;
    historicalDataCount: number;
  } {
    return {
      bookmakerProfiles: this.bookmakerProfiles.toRecord(),
      sportProfiles: this.sportProfiles.toRecord(),
      historicalDataCount: this.historicalData.size()
    };
  }

  importModel(data: {
    bookmakerProfiles?: Record<string, BookmakerProfile>;
    sportProfiles?: Record<string, SportProfile>;
  }): void {
    if (data.bookmakerProfiles) {
      this.bookmakerProfiles.loadFromRecord(data.bookmakerProfiles);
    }
    if (data.sportProfiles) {
      this.sportProfiles.loadFromRecord(data.sportProfiles);
    }

    logger.info('Model imported', {
      bookmakerProfiles: this.bookmakerProfiles.entries.length,
      sportProfiles: this.sportProfiles.entries.length
    });
  }

  private generateFeatureKey(features: OpportunityFeatures): string {
    return `${features.sport}:${features.market}:${features.bookmakers.slice().sort().join(',')}`;
  }

  private updateBookmakerProfile(bookmaker: string, outcome: Outcome): void {
    const profile = this.bookmakerProfiles.get(bookmaker);
    if (!profile) return;

    profile.reliabilityScore = profile.reliabilityScore * (1 - EMA_ALPHA) + (outcome.success ? 1 : 0) * EMA_ALPHA;
    profile.avgFillRate = profile.avgFillRate * (1 - EMA_ALPHA) + (outcome.fillTimeMinutes < 15 ? 1 : 0) * EMA_ALPHA;
  }
}

// ============================================================================
// SINGLETON ACCESSOR
// ============================================================================

let defaultScorer: OpportunityConfidenceScorer | null = null;

export function getOpportunityConfidenceScorer(): OpportunityConfidenceScorer {
  if (!defaultScorer) {
    defaultScorer = new OpportunityConfidenceScorer();
  }
  return defaultScorer;
}

export function resetOpportunityConfidenceScorer(): void {
  defaultScorer = null;
}

export default OpportunityConfidenceScorer;
