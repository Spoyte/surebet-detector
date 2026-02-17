/**
 * Advanced Arbitrage Detection Algorithms
 *
 * Sophisticated algorithms to detect complex arbitrage scenarios including:
 * - Cross-market arbitrage (e.g., 1X2 vs Double Chance)
 * - Multi-leg arbitrage (accumulators/parlays)
 * - Synthetic arbitrage (creating markets from other markets)
 * - Middle opportunities (win both sides)
 */
import { AggregatedOdds } from '../odds-aggregation-engine.js';
export interface ArbitrageOpportunity {
    id: string;
    type: 'straight' | 'cross_market' | 'multi_leg' | 'synthetic' | 'middle';
    sport: string;
    league: string;
    eventId: string;
    homeTeam: string;
    awayTeam: string;
    startTime: number;
    profitPercent: number;
    confidence: number;
    legs: ArbitrageLeg[];
    totalStake: number;
    expectedProfit: number;
    timestamp: number;
    expiresAt: number;
    metadata: {
        marketTypes: string[];
        bookmakerCount: number;
        detectionMethod: string;
        riskFactors: string[];
    };
}
export interface ArbitrageLeg {
    bookmaker: string;
    market: string;
    selection: string;
    odds: number;
    stake: number;
    impliedProbability: number;
    contribution: number;
}
export interface CrossMarketMapping {
    sourceMarket: string;
    targetMarket: string;
    conversion: (selection: string, odds: number) => {
        selection: string;
        odds: number;
    } | null;
}
export declare class ArbitrageDetector {
    private readonly MIN_PROFIT_PERCENT;
    private readonly MAX_PROFIT_PERCENT;
    private readonly MIN_CONFIDENCE;
    private crossMarketMappings;
    constructor();
    /**
     * Initialize cross-market arbitrage mappings
     */
    private initializeCrossMarketMappings;
    /**
     * Detect all types of arbitrage opportunities from aggregated odds
     */
    detectArbitrage(odds: AggregatedOdds): ArbitrageOpportunity[];
    /**
     * Detect straight arbitrage within a single market
     * Classic arbitrage: bet on all outcomes across different bookmakers
     */
    private detectStraightArbitrage;
    /**
     * Detect cross-market arbitrage opportunities
     * e.g., 1X2 vs Double Chance
     */
    private detectCrossMarketArbitrage;
    /**
     * Detect synthetic arbitrage by creating equivalent markets
     */
    private detectSyntheticArbitrage;
    /**
     * Detect middle opportunities (win both sides)
     * e.g., Over 2.5 @ 2.0 and Under 3.5 @ 2.0
     * If final score is 3, both bets win
     */
    private detectMiddleOpportunities;
    /**
     * Check if cross-market combination creates arbitrage
     */
    private checkCrossMarketArbitrage;
    /**
     * Calculate confidence score for an opportunity
     */
    private calculateConfidence;
    /**
     * Identify risk factors for an opportunity
     */
    private identifyRiskFactors;
    /**
     * Detect multi-leg arbitrage (accumulators/parlays)
     * This is computationally expensive - use sparingly
     */
    detectMultiLegArbitrage(events: AggregatedOdds[], maxLegs?: number): ArbitrageOpportunity[];
    /**
     * Filter opportunities based on user preferences
     */
    filterOpportunities(opportunities: ArbitrageOpportunity[], filters: {
        minProfit?: number;
        maxProfit?: number;
        minConfidence?: number;
        sports?: string[];
        bookmakers?: string[];
        excludeRiskFactors?: string[];
    }): ArbitrageOpportunity[];
}
export default ArbitrageDetector;
//# sourceMappingURL=arbitrage-detector.d.ts.map