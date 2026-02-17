import { ArbitrageOpportunity } from './arbitrage-detector.js';
import OddsAggregationEngine from './odds-aggregation-engine.js';
/**
 * Arbitrage Detection Service
 *
 * Continuously monitors aggregated odds and detects arbitrage opportunities
 * using advanced algorithms.
 */
export declare class ArbitrageDetectionService {
    private detector;
    private engine;
    private activeOpportunities;
    private checkInterval;
    private readonly CHECK_INTERVAL_MS;
    constructor(engine: OddsAggregationEngine);
    /**
     * Start the arbitrage detection service
     */
    start(): Promise<void>;
    /**
     * Stop the service
     */
    stop(): void;
    /**
     * Check all events for arbitrage opportunities
     */
    private checkForArbitrage;
    /**
     * Emit a new arbitrage opportunity
     */
    private emitOpportunity;
    /**
     * Remove expired opportunities
     */
    private cleanExpiredOpportunities;
    /**
     * Get all active opportunities
     */
    getActiveOpportunities(): ArbitrageOpportunity[];
    /**
     * Get opportunities filtered by criteria
     */
    getFilteredOpportunities(filters: {
        minProfit?: number;
        maxProfit?: number;
        type?: string;
        sport?: string;
    }): ArbitrageOpportunity[];
}
export default ArbitrageDetectionService;
//# sourceMappingURL=arbitrage-detection-service.d.ts.map