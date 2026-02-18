"use strict";
/**
 * Opportunity Confidence Scorer
 *
 * Machine learning-based scoring system for arbitrage opportunities.
 * Scores opportunities by likelihood of successful execution based on
 * historical fill rates, bookmaker behavior, and market conditions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityConfidenceScorer = void 0;
exports.getOpportunityConfidenceScorer = getOpportunityConfidenceScorer;
exports.resetOpportunityConfidenceScorer = resetOpportunityConfidenceScorer;
const events_1 = require("events");
const logger_js_1 = __importDefault(require("./utils/logger.js"));
class OpportunityConfidenceScorer extends events_1.EventEmitter {
    model;
    historicalData = new Map();
    bookmakerProfiles = new Map();
    sportProfiles = new Map();
    // Feature importance from training (simplified ML model)
    featureImportance = {
        profitPercent: 0.25,
        timeToEvent: 0.20,
        bookmakerReliability: 0.20,
        liquidity: 0.15,
        historicalSuccess: 0.12,
        oddsVolatility: 0.08
    };
    constructor(model) {
        super();
        this.model = {
            weights: {
                profit: 0.25,
                timing: 0.20,
                bookmaker: 0.20,
                market: 0.20,
                historical: 0.15
            },
            thresholds: {
                excellent: 85,
                good: 70,
                fair: 55,
                poor: 40
            },
            ...model
        };
        this.loadBookmakerProfiles();
        this.loadSportProfiles();
    }
    /**
     * Score an opportunity using ML-based confidence scoring
     */
    async scoreOpportunity(features) {
        // Calculate individual factor scores
        const profitFactor = this.calculateProfitFactor(features);
        const timingFactor = this.calculateTimingFactor(features);
        const bookmakerFactor = this.calculateBookmakerFactor(features);
        const marketFactor = this.calculateMarketFactor(features);
        const historicalFactor = this.calculateHistoricalFactor(features);
        // Weighted composite score
        const compositeScore = profitFactor * this.model.weights.profit +
            timingFactor * this.model.weights.timing +
            bookmakerFactor * this.model.weights.bookmaker +
            marketFactor * this.model.weights.market +
            historicalFactor * this.model.weights.historical;
        // Convert to 0-100 scale
        const score = Math.round(compositeScore * 100);
        // Calculate probability using logistic function
        const probability = this.sigmoid(compositeScore * 2 - 1);
        // Determine grade
        const grade = this.scoreToGrade(score);
        // Generate explanation
        const explanation = this.generateExplanation(features, {
            profitFactor,
            timingFactor,
            bookmakerFactor,
            marketFactor,
            historicalFactor
        });
        // Determine recommended action
        const recommendedAction = this.determineAction(score, features);
        // Estimate fill time
        const estimatedFillTimeMinutes = this.estimateFillTime(features, score);
        const result = {
            score,
            confidence: this.calculateModelConfidence(features),
            probability,
            grade,
            factors: {
                profitFactor,
                timingFactor,
                bookmakerFactor,
                marketFactor,
                historicalFactor
            },
            explanation,
            recommendedAction,
            estimatedFillTimeMinutes
        };
        // Emit scoring event
        this.emit('opportunityScored', {
            features,
            score: result,
            timestamp: Date.now()
        });
        logger_js_1.default.info('Opportunity scored', {
            score,
            grade,
            probability: probability.toFixed(3),
            sport: features.sport,
            bookmakers: features.bookmakers
        });
        return result;
    }
    /**
     * Batch score multiple opportunities
     */
    async scoreBatch(opportunities) {
        const scores = await Promise.all(opportunities.map(opp => this.scoreOpportunity(opp)));
        this.emit('batchScored', {
            count: opportunities.length,
            avgScore: scores.reduce((a, b) => a + b.score, 0) / scores.length,
            timestamp: Date.now()
        });
        return scores;
    }
    /**
     * Update model with new outcome data (online learning)
     */
    async updateModel(features, outcome) {
        // Store outcome for model refinement
        const key = this.generateFeatureKey(features);
        const existing = this.historicalData.get(key) || { outcomes: [], count: 0 };
        existing.outcomes.push({
            ...outcome,
            timestamp: Date.now()
        });
        existing.count++;
        this.historicalData.set(key, existing);
        // Update bookmaker profiles
        for (const bookmaker of features.bookmakers) {
            this.updateBookmakerProfile(bookmaker, outcome);
        }
        // Emit update event
        this.emit('modelUpdated', {
            featureKey: key,
            outcome,
            historicalCount: existing.count,
            timestamp: Date.now()
        });
        logger_js_1.default.info('Model updated with outcome', {
            bookmakers: features.bookmakers,
            success: outcome.success,
            fillTime: outcome.fillTimeMinutes
        });
    }
    /**
     * Get bookmaker reliability ranking
     */
    getBookmakerRanking() {
        const rankings = [];
        for (const [bookmaker, profile] of this.bookmakerProfiles) {
            rankings.push({
                bookmaker,
                reliability: profile.reliabilityScore,
                avgFillRate: profile.avgFillRate
            });
        }
        return rankings.sort((a, b) => b.reliability - a.reliability);
    }
    /**
     * Get sport-specific insights
     */
    getSportInsights(sport) {
        const profile = this.sportProfiles.get(sport);
        if (!profile)
            return null;
        return {
            avgSuccessRate: profile.successRate,
            avgFillTimeMinutes: profile.avgFillTime,
            bestTimeOfDay: profile.bestTimeOfDay,
            bestDayOfWeek: profile.bestDayOfWeek,
            topBookmakers: profile.topBookmakers
        };
    }
    /**
     * Export model for persistence
     */
    exportModel() {
        return {
            model: this.model,
            bookmakerProfiles: Object.fromEntries(this.bookmakerProfiles),
            sportProfiles: Object.fromEntries(this.sportProfiles),
            historicalDataCount: this.historicalData.size
        };
    }
    /**
     * Import model from persisted data
     */
    importModel(data) {
        if (data.model) {
            this.model = { ...this.model, ...data.model };
        }
        if (data.bookmakerProfiles) {
            this.bookmakerProfiles = new Map(Object.entries(data.bookmakerProfiles));
        }
        if (data.sportProfiles) {
            this.sportProfiles = new Map(Object.entries(data.sportProfiles));
        }
        logger_js_1.default.info('Model imported', {
            bookmakerProfiles: this.bookmakerProfiles.size,
            sportProfiles: this.sportProfiles.size
        });
    }
    // Private methods
    calculateProfitFactor(features) {
        // Higher profit is better, but with diminishing returns
        const profit = features.profitPercent;
        if (profit >= 5)
            return 1.0;
        if (profit >= 3)
            return 0.9;
        if (profit >= 2)
            return 0.8;
        if (profit >= 1)
            return 0.7;
        if (profit >= 0.5)
            return 0.6;
        return 0.4 + (profit / 0.5) * 0.2;
    }
    calculateTimingFactor(features) {
        let score = 0.5;
        // Time to event - sweet spot is 1-24 hours before event
        const hoursToEvent = features.timeToEventMinutes / 60;
        if (hoursToEvent >= 1 && hoursToEvent <= 24) {
            score += 0.3;
        }
        else if (hoursToEvent > 24 && hoursToEvent <= 72) {
            score += 0.2;
        }
        else if (hoursToEvent < 1) {
            score -= 0.2; // Too close to event, risky
        }
        // Time of day factor (based on typical betting volumes)
        const peakHours = [18, 19, 20, 21]; // Evening peak
        if (peakHours.includes(features.timeOfDay)) {
            score += 0.1;
        }
        // Weekend factor
        if (features.dayOfWeek === 0 || features.dayOfWeek === 6) {
            score += 0.1;
        }
        return Math.min(1, Math.max(0, score));
    }
    calculateBookmakerFactor(features) {
        if (features.bookmakerReliabilityScores.length === 0)
            return 0.5;
        // Average reliability
        const avgReliability = features.bookmakerReliabilityScores.reduce((a, b) => a + b, 0)
            / features.bookmakerReliabilityScores.length;
        // Average fill rate
        const avgFillRate = features.bookmakerAvgFillRates.reduce((a, b) => a + b, 0)
            / features.bookmakerAvgFillRates.length;
        // Penalize if limits are too low
        const avgLimit = features.bookmakerLimitHistory.reduce((a, b) => a + b, 0)
            / features.bookmakerLimitHistory.length;
        const limitScore = Math.min(1, avgLimit / 100); // Normalize to 100 EUR baseline
        return (avgReliability * 0.4 + avgFillRate * 0.4 + limitScore * 0.2);
    }
    calculateMarketFactor(features) {
        let score = 0.5;
        // Liquidity score
        score += features.liquidityScore * 0.3;
        // Lower volatility is better
        const volatilityPenalty = Math.min(0.3, features.oddsMovementVolatility * 0.1);
        score -= volatilityPenalty;
        // Sport-specific adjustments
        const sportProfile = this.sportProfiles.get(features.sport);
        if (sportProfile) {
            score += (sportProfile.successRate - 0.5) * 0.2;
        }
        return Math.min(1, Math.max(0, score));
    }
    calculateHistoricalFactor(features) {
        if (features.similarOpportunitiesCount === 0)
            return 0.5;
        // Historical success rate
        let score = features.historicalSuccessRate;
        // Confidence based on sample size
        const sampleConfidence = Math.min(1, features.similarOpportunitiesCount / 100);
        // Blend with neutral score if low confidence
        score = score * sampleConfidence + 0.5 * (1 - sampleConfidence);
        // Factor in average fill time
        if (features.avgTimeToFillMinutes < 5) {
            score += 0.1; // Fast fills are good
        }
        else if (features.avgTimeToFillMinutes > 30) {
            score -= 0.1; // Slow fills are concerning
        }
        return Math.min(1, Math.max(0, score));
    }
    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }
    scoreToGrade(score) {
        if (score >= this.model.thresholds.excellent)
            return 'A';
        if (score >= this.model.thresholds.good)
            return 'B';
        if (score >= this.model.thresholds.fair)
            return 'C';
        if (score >= this.model.thresholds.poor)
            return 'D';
        return 'F';
    }
    generateExplanation(features, factors) {
        const explanations = [];
        if (factors.profitFactor > 0.8) {
            explanations.push(`Strong profit potential (${features.profitPercent.toFixed(2)}%)`);
        }
        else if (factors.profitFactor < 0.5) {
            explanations.push(`Low profit margin (${features.profitPercent.toFixed(2)}%)`);
        }
        if (factors.timingFactor > 0.8) {
            explanations.push('Optimal timing - good window for execution');
        }
        else if (features.timeToEventMinutes < 60) {
            explanations.push('Urgent - event starts soon');
        }
        if (factors.bookmakerFactor > 0.8) {
            explanations.push('Reliable bookmakers with good fill rates');
        }
        else if (factors.bookmakerFactor < 0.5) {
            explanations.push('Bookmaker reliability concerns');
        }
        if (factors.marketFactor > 0.8) {
            explanations.push('High market liquidity');
        }
        else if (features.liquidityScore < 0.3) {
            explanations.push('Low liquidity - may be difficult to fill');
        }
        if (factors.historicalFactor > 0.7 && features.similarOpportunitiesCount > 10) {
            explanations.push(`Strong historical track record (${features.historicalSuccessRate.toFixed(1)}% success)`);
        }
        return explanations;
    }
    determineAction(score, features) {
        if (score >= 80)
            return 'execute';
        if (score >= 60)
            return 'monitor';
        if (features.profitPercent > 3 && score >= 50)
            return 'monitor';
        return 'skip';
    }
    estimateFillTime(features, score) {
        // Base estimate on historical data
        let baseTime = features.avgTimeToFillMinutes || 10;
        // Adjust based on score
        if (score >= 80)
            baseTime *= 0.7;
        if (score <= 40)
            baseTime *= 1.5;
        // Adjust for liquidity
        baseTime /= (0.5 + features.liquidityScore * 0.5);
        // Adjust for time to event (urgency)
        if (features.timeToEventMinutes < 60) {
            baseTime *= 0.5; // Faster fills close to event
        }
        return Math.round(baseTime);
    }
    calculateModelConfidence(features) {
        // Higher confidence with more historical data
        let confidence = 0.5;
        confidence += Math.min(0.3, features.similarOpportunitiesCount / 100);
        // Confidence in bookmaker data
        const knownBookmakers = features.bookmakers.filter(b => this.bookmakerProfiles.has(b)).length;
        confidence += (knownBookmakers / features.bookmakers.length) * 0.2;
        return Math.min(0.95, confidence);
    }
    generateFeatureKey(features) {
        return `${features.sport}:${features.market}:${features.bookmakers.sort().join(',')}`;
    }
    loadBookmakerProfiles() {
        // Initialize with default profiles
        const defaults = {
            'pinnacle': { reliabilityScore: 0.95, avgFillRate: 0.98, avgLimit: 10000, gubbingRisk: 0.1 },
            'betfair': { reliabilityScore: 0.92, avgFillRate: 0.95, avgLimit: 5000, gubbingRisk: 0.15 },
            'unibet': { reliabilityScore: 0.85, avgFillRate: 0.88, avgLimit: 500, gubbingRisk: 0.3 },
            'betclic': { reliabilityScore: 0.82, avgFillRate: 0.85, avgLimit: 300, gubbingRisk: 0.35 },
            'winamax': { reliabilityScore: 0.80, avgFillRate: 0.82, avgLimit: 400, gubbingRisk: 0.4 },
            'fdj': { reliabilityScore: 0.78, avgFillRate: 0.80, avgLimit: 200, gubbingRisk: 0.25 },
            'parionsport': { reliabilityScore: 0.77, avgFillRate: 0.78, avgLimit: 250, gubbingRisk: 0.3 },
            'zebet': { reliabilityScore: 0.75, avgFillRate: 0.75, avgLimit: 200, gubbingRisk: 0.35 },
            'cloudbet': { reliabilityScore: 0.88, avgFillRate: 0.90, avgLimit: 2000, gubbingRisk: 0.2 },
            'smarkets': { reliabilityScore: 0.90, avgFillRate: 0.92, avgLimit: 3000, gubbingRisk: 0.15 }
        };
        for (const [key, profile] of Object.entries(defaults)) {
            this.bookmakerProfiles.set(key, profile);
        }
    }
    loadSportProfiles() {
        // Initialize with default sport profiles
        const defaults = {
            'soccer': { successRate: 0.72, avgFillTime: 8, bestTimeOfDay: 20, bestDayOfWeek: 6, topBookmakers: ['pinnacle', 'betfair', 'unibet'] },
            'tennis': { successRate: 0.68, avgFillTime: 12, bestTimeOfDay: 19, bestDayOfWeek: 0, topBookmakers: ['pinnacle', 'betfair', 'winamax'] },
            'basketball': { successRate: 0.70, avgFillTime: 10, bestTimeOfDay: 21, bestDayOfWeek: 5, topBookmakers: ['pinnacle', 'cloudbet', 'unibet'] },
            'esports': { successRate: 0.65, avgFillTime: 15, bestTimeOfDay: 22, bestDayOfWeek: 5, topBookmakers: ['cloudbet', 'pinnacle', 'winamax'] },
            'baseball': { successRate: 0.71, avgFillTime: 9, bestTimeOfDay: 20, bestDayOfWeek: 3, topBookmakers: ['pinnacle', 'betfair', 'cloudbet'] },
            'hockey': { successRate: 0.69, avgFillTime: 11, bestTimeOfDay: 20, bestDayOfWeek: 4, topBookmakers: ['pinnacle', 'unibet', 'betfair'] }
        };
        for (const [key, profile] of Object.entries(defaults)) {
            this.sportProfiles.set(key, profile);
        }
    }
    updateBookmakerProfile(bookmaker, outcome) {
        const profile = this.bookmakerProfiles.get(bookmaker);
        if (!profile)
            return;
        // Update reliability with exponential moving average
        const alpha = 0.1;
        profile.reliabilityScore = profile.reliabilityScore * (1 - alpha) + (outcome.success ? 1 : 0) * alpha;
        // Update average fill time
        profile.avgFillRate = profile.avgFillRate * (1 - alpha) + (outcome.fillTimeMinutes < 15 ? 1 : 0) * alpha;
    }
}
exports.OpportunityConfidenceScorer = OpportunityConfidenceScorer;
// Singleton instance
let defaultScorer = null;
function getOpportunityConfidenceScorer(model) {
    if (!defaultScorer) {
        defaultScorer = new OpportunityConfidenceScorer(model);
    }
    return defaultScorer;
}
function resetOpportunityConfidenceScorer() {
    defaultScorer = null;
}
exports.default = OpportunityConfidenceScorer;
//# sourceMappingURL=opportunity-confidence-scorer.js.map