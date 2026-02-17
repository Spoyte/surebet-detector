"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageDetectionService = void 0;
const arbitrage_detector_js_1 = require("./arbitrage-detector.js");
const logger_js_1 = __importDefault(require("./utils/logger.js"));
/**
 * Arbitrage Detection Service
 *
 * Continuously monitors aggregated odds and detects arbitrage opportunities
 * using advanced algorithms.
 */
class ArbitrageDetectionService {
    detector;
    engine;
    activeOpportunities = new Map();
    checkInterval = null;
    CHECK_INTERVAL_MS = 1000; // Check every second
    constructor(engine) {
        this.engine = engine;
        this.detector = new arbitrage_detector_js_1.ArbitrageDetector();
    }
    /**
     * Start the arbitrage detection service
     */
    async start() {
        logger_js_1.default.info('Starting Arbitrage Detection Service');
        this.checkInterval = setInterval(async () => {
            await this.checkForArbitrage();
        }, this.CHECK_INTERVAL_MS);
    }
    /**
     * Stop the service
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger_js_1.default.info('Arbitrage Detection Service stopped');
    }
    /**
     * Check all events for arbitrage opportunities
     */
    async checkForArbitrage() {
        try {
            const events = await this.engine.getAllEvents();
            for (const event of events) {
                const opportunities = this.detector.detectArbitrage(event);
                for (const opportunity of opportunities) {
                    // Check if this is a new opportunity
                    if (!this.activeOpportunities.has(opportunity.id)) {
                        this.activeOpportunities.set(opportunity.id, opportunity);
                        this.emitOpportunity(opportunity);
                    }
                }
                // Clean up expired opportunities
                this.cleanExpiredOpportunities();
            }
        }
        catch (error) {
            logger_js_1.default.error('Error checking for arbitrage:', error);
        }
    }
    /**
     * Emit a new arbitrage opportunity
     */
    emitOpportunity(opportunity) {
        logger_js_1.default.info(`New arbitrage opportunity detected: ${opportunity.id}`, {
            profit: opportunity.profitPercent,
            type: opportunity.type,
            event: `${opportunity.homeTeam} vs ${opportunity.awayTeam}`
        });
        // Here you would:
        // 1. Send to notification service
        // 2. Store in database
        // 3. Update real-time subscribers via WebSocket
        // 4. Trigger alerts if profit threshold met
    }
    /**
     * Remove expired opportunities
     */
    cleanExpiredOpportunities() {
        const now = Date.now();
        for (const [id, opp] of this.activeOpportunities.entries()) {
            if (opp.expiresAt < now) {
                this.activeOpportunities.delete(id);
            }
        }
    }
    /**
     * Get all active opportunities
     */
    getActiveOpportunities() {
        return Array.from(this.activeOpportunities.values())
            .sort((a, b) => b.profitPercent - a.profitPercent);
    }
    /**
     * Get opportunities filtered by criteria
     */
    getFilteredOpportunities(filters) {
        return this.getActiveOpportunities().filter(opp => {
            if (filters.minProfit && opp.profitPercent < filters.minProfit)
                return false;
            if (filters.maxProfit && opp.profitPercent > filters.maxProfit)
                return false;
            if (filters.type && opp.type !== filters.type)
                return false;
            if (filters.sport && opp.sport !== filters.sport)
                return false;
            return true;
        });
    }
}
exports.ArbitrageDetectionService = ArbitrageDetectionService;
exports.default = ArbitrageDetectionService;
//# sourceMappingURL=arbitrage-detection-service.js.map