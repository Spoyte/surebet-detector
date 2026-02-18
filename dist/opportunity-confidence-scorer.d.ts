/**
 * Opportunity Confidence Scorer
 *
 * Machine learning-based scoring system for arbitrage opportunities.
 * Scores opportunities by likelihood of successful execution based on
 * historical fill rates, bookmaker behavior, and market conditions.
 */
import { EventEmitter } from 'events';
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
export interface ConfidenceScore {
    score: number;
    confidence: number;
    probability: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    factors: {
        profitFactor: number;
        timingFactor: number;
        bookmakerFactor: number;
        marketFactor: number;
        historicalFactor: number;
    };
    explanation: string[];
    recommendedAction: 'execute' | 'monitor' | 'skip';
    estimatedFillTimeMinutes: number;
}
export interface ScoringModel {
    weights: {
        profit: number;
        timing: number;
        bookmaker: number;
        market: number;
        historical: number;
    };
    thresholds: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
}
export declare class OpportunityConfidenceScorer extends EventEmitter {
    private model;
    private historicalData;
    private bookmakerProfiles;
    private sportProfiles;
    private featureImportance;
    constructor(model?: Partial<ScoringModel>);
    /**
     * Score an opportunity using ML-based confidence scoring
     */
    scoreOpportunity(features: OpportunityFeatures): Promise<ConfidenceScore>;
    /**
     * Batch score multiple opportunities
     */
    scoreBatch(opportunities: OpportunityFeatures[]): Promise<ConfidenceScore[]>;
    /**
     * Update model with new outcome data (online learning)
     */
    updateModel(features: OpportunityFeatures, outcome: {
        success: boolean;
        fillTimeMinutes: number;
        actualProfit: number;
    }): Promise<void>;
    /**
     * Get bookmaker reliability ranking
     */
    getBookmakerRanking(): Array<{
        bookmaker: string;
        reliability: number;
        avgFillRate: number;
    }>;
    /**
     * Get sport-specific insights
     */
    getSportInsights(sport: string): {
        avgSuccessRate: number;
        avgFillTimeMinutes: number;
        bestTimeOfDay: number;
        bestDayOfWeek: number;
        topBookmakers: string[];
    } | null;
    /**
     * Export model for persistence
     */
    exportModel(): {
        model: ScoringModel;
        bookmakerProfiles: Record<string, BookmakerProfile>;
        sportProfiles: Record<string, SportProfile>;
        historicalDataCount: number;
    };
    /**
     * Import model from persisted data
     */
    importModel(data: {
        model?: ScoringModel;
        bookmakerProfiles?: Record<string, BookmakerProfile>;
        sportProfiles?: Record<string, SportProfile>;
    }): void;
    private calculateProfitFactor;
    private calculateTimingFactor;
    private calculateBookmakerFactor;
    private calculateMarketFactor;
    private calculateHistoricalFactor;
    private sigmoid;
    private scoreToGrade;
    private generateExplanation;
    private determineAction;
    private estimateFillTime;
    private calculateModelConfidence;
    private generateFeatureKey;
    private loadBookmakerProfiles;
    private loadSportProfiles;
    private updateBookmakerProfile;
}
interface BookmakerProfile {
    reliabilityScore: number;
    avgFillRate: number;
    avgLimit: number;
    gubbingRisk: number;
}
interface SportProfile {
    successRate: number;
    avgFillTime: number;
    bestTimeOfDay: number;
    bestDayOfWeek: number;
    topBookmakers: string[];
}
export declare function getOpportunityConfidenceScorer(model?: Partial<ScoringModel>): OpportunityConfidenceScorer;
export declare function resetOpportunityConfidenceScorer(): void;
export default OpportunityConfidenceScorer;
//# sourceMappingURL=opportunity-confidence-scorer.d.ts.map