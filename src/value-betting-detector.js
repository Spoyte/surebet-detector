/**
 * Value Betting Detector (+EV without arbitrage)
 * 
 * Detects +EV bets where the odds are better than true probability,
 * even if no arbitrage exists. This provides higher volume, lower risk profile
 * compared to pure arbitrage betting.
 * 
 * Key concepts:
 * - Uses multiple sharp bookmakers to estimate "true" probabilities
 * - Implements Bayesian probability estimation
 * - Accounts for market efficiency and closing line value
 * - Detects value in soft bookmakers compared to sharp lines
 */

const { createLogger } = require('./logger.js');
const logger = createLogger({ level: 2 }); // INFO level

class ValueBettingDetector {
    constructor(config = {}) {
        this.config = {
            // Minimum EV threshold to report (default 2%)
            minEVThreshold: config.minEVThreshold || 2.0,
            
            // Minimum confidence in true probability estimate (0-1)
            minConfidence: config.minConfidence || 0.7,
            
            // Sharp bookmakers to use as baseline (in order of reliability)
            sharpBookmakers: config.sharpBookmakers || [
                'pinnacle',
                'betfair',
                'smarkets',
                'matchbook',
                'cloudbet'
            ],
            
            // Weights for different sharp bookmakers
            sharpWeights: config.sharpWeights || {
                pinnacle: 0.35,
                betfair: 0.25,
                smarkets: 0.20,
                matchbook: 0.15,
                cloudbet: 0.05
            },
            
            // Market efficiency factors by sport
            marketEfficiency: config.marketEfficiency || {
                soccer: 0.92,
                tennis: 0.90,
                basketball: 0.88,
                'ice-hockey': 0.85,
                baseball: 0.87,
                'american-football': 0.89,
                esports: 0.75,
                default: 0.85
            },
            
            // Time decay for odds (how much weight to give to older odds)
            oddsFreshnessHours: config.oddsFreshnessHours || 24,
            
            // Minimum sample size of sharp bookmakers required
            minSharpSampleSize: config.minSharpSampleSize || 2,
            
            // Maximum acceptable deviation from consensus (filters outliers)
            maxConsensusDeviation: config.maxConsensusDeviation || 0.15,
            
            // Kelly criterion fraction (conservative = 0.25, aggressive = 0.5)
            kellyFraction: config.kellyFraction || 0.25,
            
            // Data directory for persistence
            dataDir: config.dataDir || './data',
            
            // Enable closing line value analysis
            enableCLV: config.enableCLV !== false,
            
            // Enable market movement analysis
            enableMarketMovement: config.enableMarketMovement !== false,
            
            // Minimum odds to consider (avoid heavy favorites where value is hard to find)
            minOdds: config.minOdds || 1.2,
            
            // Maximum odds to consider (avoid extreme longshots with high variance)
            maxOdds: config.maxOdds || 10.0,
            
            // Enable sport-specific adjustments
            sportSpecificAdjustments: config.sportSpecificAdjustments !== false
        };
        
        this.historicalData = new Map();
        this.closingLines = new Map();
        this.marketMovements = new Map();
    }
    
    /**
     * Initialize the detector and load historical data
     */
    async init() {
        logger.info('Initializing ValueBettingDetector...');
        await this.loadHistoricalData();
        logger.info('ValueBettingDetector initialized');
        return this;
    }
    
    /**
     * Load historical data for CLV analysis
     */
    async loadHistoricalData() {
        // In production, this would load from database
        // For now, we'll work with in-memory data
        logger.info('Historical data loading (in-memory mode)');
    }
    
    /**
     * Main entry point: detect value bets from odds data
     * @param {Array} oddsData - Array of event data from bookmakers
     * @returns {Object} Detected value bets categorized by confidence
     */
    detectValueBets(oddsData) {
        const results = {
            timestamp: new Date().toISOString(),
            highConfidence: [],    // >90% confidence, strong value
            mediumConfidence: [],  // 70-90% confidence, good value
            lowConfidence: [],     // 50-70% confidence, speculative
            analysis: {
                totalEvents: oddsData.length,
                eventsAnalyzed: 0,
                sharpBookmakersFound: new Set(),
                averageMarketEfficiency: 0
            }
        };
        
        for (const event of oddsData) {
            try {
                const eventValueBets = this.analyzeEvent(event);
                
                if (eventValueBets.length > 0) {
                    for (const bet of eventValueBets) {
                        if (bet.confidence >= 0.9) {
                            results.highConfidence.push(bet);
                        } else if (bet.confidence >= 0.7) {
                            results.mediumConfidence.push(bet);
                        } else if (bet.confidence >= 0.5) {
                            results.lowConfidence.push(bet);
                        }
                    }
                }
                
                results.analysis.eventsAnalyzed++;
            } catch (error) {
                logger.error(`Error analyzing event ${event.eventName}: ${error.message}`);
            }
        }
        
        // Sort by expected value (highest first)
        results.highConfidence.sort((a, b) => b.evPercent - a.evPercent);
        results.mediumConfidence.sort((a, b) => b.evPercent - a.evPercent);
        results.lowConfidence.sort((a, b) => b.evPercent - a.evPercent);
        
        return results;
    }
    
    /**
     * Analyze a single event for value betting opportunities
     * @param {Object} event - Event data with bookmaker odds
     * @returns {Array} Array of value bet opportunities
     */
    analyzeEvent(event) {
        const valueBets = [];
        
        // Get sharp bookmaker data for this event
        const sharpData = this.extractSharpBookmakerData(event);
        
        if (sharpData.length < this.config.minSharpSampleSize) {
            logger.debug(`Insufficient sharp data for ${event.eventName}: ${sharpData.length} bookmakers`);
            return valueBets;
        }
        
        // Calculate true probabilities from sharp bookmakers
        const trueProbabilities = this.calculateTrueProbabilities(sharpData, event.sport);
        
        if (!trueProbabilities) {
            logger.debug(`Could not calculate true probabilities for ${event.eventName}`);
            return valueBets;
        }
        
        // Analyze each soft bookmaker for value opportunities
        const softBookmakers = this.extractSoftBookmakerData(event);
        
        for (const bookmaker of softBookmakers) {
            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;
            
            for (let i = 0; i < h2h.outcomes.length; i++) {
                const outcome = h2h.outcomes[i];
                const trueProb = trueProbabilities[i];
                
                // Skip if odds outside acceptable range
                if (outcome.odds < this.config.minOdds || outcome.odds > this.config.maxOdds) {
                    continue;
                }
                
                // Calculate expected value
                const ev = this.calculateEV(outcome.odds, trueProb.probability);
                
                if (ev.evPercent >= this.config.minEVThreshold) {
                    // Calculate Kelly criterion stake
                    const kellyStake = this.calculateKellyStake(
                        outcome.odds, 
                        trueProb.probability,
                        this.config.kellyFraction
                    );
                    
                    // Calculate confidence score
                    const confidence = this.calculateConfidence(trueProb, sharpData.length, event.sport);
                    
                    if (confidence >= this.config.minConfidence) {
                        valueBets.push({
                            type: 'valueBet',
                            event: event.eventName,
                            sport: event.sport,
                            commenceTime: event.commenceTime,
                            outcome: outcome.name,
                            bookmaker: bookmaker.name,
                            odds: outcome.odds,
                            trueProbability: parseFloat((trueProb.probability * 100).toFixed(2)),
                            evPercent: parseFloat(ev.evPercent.toFixed(2)),
                            confidence: parseFloat(confidence.toFixed(2)),
                            kellyStake: parseFloat(kellyStake.toFixed(2)),
                            sharpBookmakersUsed: trueProb.sources,
                            marketEfficiency: this.getMarketEfficiency(event.sport),
                            recommendation: this.generateRecommendation(ev.evPercent, confidence, kellyStake),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }
        
        return valueBets;
    }
    
    /**
     * Extract data from sharp bookmakers for an event
     */
    extractSharpBookmakerData(event) {
        const sharpData = [];
        
        for (const bookmaker of event.bookmakers) {
            const key = bookmaker.key?.toLowerCase() || bookmaker.name?.toLowerCase() || '';
            
            if (this.config.sharpBookmakers.some(sb => key.includes(sb))) {
                const h2h = bookmaker.markets.find(m => m.type === 'h2h');
                if (h2h && h2h.outcomes.length > 0) {
                    sharpData.push({
                        name: bookmaker.name,
                        key: key,
                        weight: this.config.sharpWeights[key] || 0.1,
                        outcomes: h2h.outcomes.map(o => ({
                            name: o.name,
                            odds: o.odds,
                            impliedProb: 1 / o.odds
                        }))
                    });
                }
            }
        }
        
        return sharpData;
    }
    
    /**
     * Extract data from soft bookmakers (non-sharp)
     */
    extractSoftBookmakerData(event) {
        return event.bookmakers.filter(bookmaker => {
            const key = bookmaker.key?.toLowerCase() || bookmaker.name?.toLowerCase() || '';
            return !this.config.sharpBookmakers.some(sb => key.includes(sb));
        });
    }
    
    /**
     * Calculate true probabilities using weighted average from sharp bookmakers
     * Implements Bayesian probability estimation with outlier detection
     */
    calculateTrueProbabilities(sharpData, sport) {
        if (sharpData.length === 0) return null;
        
        const numOutcomes = sharpData[0].outcomes.length;
        const probabilities = [];
        
        for (let i = 0; i < numOutcomes; i++) {
            // Collect implied probabilities from all sharp bookmakers
            const impliedProbs = [];
            const sources = [];
            
            for (const bookmaker of sharpData) {
                if (bookmaker.outcomes[i]) {
                    impliedProbs.push({
                        prob: bookmaker.outcomes[i].impliedProb,
                        weight: bookmaker.weight,
                        name: bookmaker.name
                    });
                    sources.push(bookmaker.name);
                }
            }
            
            if (impliedProbs.length === 0) return null;
            
            // Remove outliers using interquartile range method
            const filteredProbs = this.removeOutliers(impliedProbs);
            
            // Calculate weighted average
            let weightedSum = 0;
            let totalWeight = 0;
            
            for (const prob of filteredProbs) {
                weightedSum += prob.prob * prob.weight;
                totalWeight += prob.weight;
            }
            
            const rawProbability = weightedSum / totalWeight;
            
            // Apply market efficiency adjustment
            const efficiency = this.getMarketEfficiency(sport);
            const adjustedProbability = this.adjustForMarketEfficiency(rawProbability, efficiency);
            
            // Calculate confidence based on sample size and variance
            const variance = this.calculateVariance(filteredProbs.map(p => p.prob));
            const confidence = this.calculateProbabilityConfidence(filteredProbs.length, variance);
            
            probabilities.push({
                probability: adjustedProbability,
                rawProbability: rawProbability,
                confidence: confidence,
                sources: sources,
                variance: variance,
                sampleSize: filteredProbs.length
            });
        }
        
        // Normalize probabilities to ensure they sum to 1
        return this.normalizeProbabilities(probabilities);
    }
    
    /**
     * Remove outliers using IQR method
     */
    removeOutliers(probabilities) {
        if (probabilities.length <= 2) return probabilities;
        
        const values = probabilities.map(p => p.prob).sort((a, b) => a - b);
        const q1 = values[Math.floor(values.length * 0.25)];
        const q3 = values[Math.floor(values.length * 0.75)];
        const iqr = q3 - q1;
        
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        return probabilities.filter(p => p.prob >= lowerBound && p.prob <= upperBound);
    }
    
    /**
     * Calculate variance of an array of numbers
     */
    calculateVariance(values) {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }
    
    /**
     * Calculate confidence in probability estimate based on sample size and variance
     */
    calculateProbabilityConfidence(sampleSize, variance) {
        // Base confidence from sample size (diminishing returns after 5+ sources)
        const sampleConfidence = Math.min(0.3 + (sampleSize * 0.15), 0.6);
        
        // Variance penalty (lower variance = higher confidence)
        const variancePenalty = Math.min(variance * 2, 0.3);
        
        return Math.max(0.5, sampleConfidence - variancePenalty);
    }
    
    /**
     * Adjust probability for market efficiency
     * More efficient markets = probabilities closer to true values
     */
    adjustForMarketEfficiency(probability, efficiency) {
        // Move probability towards 0.5 (less confident) based on market inefficiency
        const distanceFromEven = probability - 0.5;
        const adjustment = distanceFromEven * (1 - efficiency);
        return 0.5 + distanceFromEven - adjustment;
    }
    
    /**
     * Get market efficiency for a sport
     */
    getMarketEfficiency(sport) {
        return this.config.marketEfficiency[sport] || this.config.marketEfficiency.default;
    }
    
    /**
     * Normalize probabilities to sum to 1
     */
    normalizeProbabilities(probabilities) {
        const total = probabilities.reduce((sum, p) => sum + p.probability, 0);
        
        return probabilities.map(p => ({
            ...p,
            probability: p.probability / total
        }));
    }
    
    /**
     * Calculate Expected Value (EV)
     * EV = (Odds × True Probability) - 1
     */
    calculateEV(odds, trueProbability) {
        const ev = (odds * trueProbability) - 1;
        return {
            ev: ev,
            evPercent: ev * 100
        };
    }
    
    /**
     * Calculate Kelly Criterion stake as percentage of bankroll
     * f* = (bp - q) / b
     * where b = odds - 1, p = probability of win, q = probability of loss
     */
    calculateKellyStake(odds, probability, fraction = 0.25) {
        const b = odds - 1;  // Decimal odds minus 1
        const p = probability;
        const q = 1 - p;
        
        const kelly = (b * p - q) / b;
        
        // Apply fraction (conservative Kelly)
        return Math.max(0, kelly * fraction * 100);  // Return as percentage
    }
    
    /**
     * Calculate overall confidence score for a value bet
     */
    calculateConfidence(trueProb, sharpSampleSize, sport) {
        // Base confidence from probability estimate
        let confidence = trueProb.confidence;
        
        // Boost for larger sample size
        confidence += Math.min((sharpSampleSize - 2) * 0.05, 0.15);
        
        // Sport-specific adjustment
        if (this.config.sportSpecificAdjustments) {
            const efficiency = this.getMarketEfficiency(sport);
            confidence *= (0.8 + efficiency * 0.2);
        }
        
        return Math.min(confidence, 0.99);
    }
    
    /**
     * Generate betting recommendation based on EV and confidence
     */
    generateRecommendation(evPercent, confidence, kellyStake) {
        if (evPercent >= 10 && confidence >= 0.85) {
            return {
                rating: 'STRONG_BUY',
                action: 'Bet immediately - high value with strong confidence',
                urgency: 'high'
            };
        } else if (evPercent >= 5 && confidence >= 0.7) {
            return {
                rating: 'BUY',
                action: 'Good value bet - consider staking plan',
                urgency: 'medium'
            };
        } else if (evPercent >= 3 && confidence >= 0.6) {
            return {
                rating: 'SPECULATIVE',
                action: 'Moderate value - small stakes only',
                urgency: 'low'
            };
        } else {
            return {
                rating: 'WATCH',
                action: 'Marginal value - monitor for improvement',
                urgency: 'none'
            };
        }
    }
    
    /**
     * Analyze closing line value (CLV) for historical performance tracking
     */
    analyzeClosingLineValue(eventId, initialOdds, closingOdds) {
        if (!this.config.enableCLV) return null;
        
        const clv = {
            eventId,
            initialOdds,
            closingOdds,
            lineMovement: closingOdds - initialOdds,
            clvPercent: ((closingOdds - initialOdds) / initialOdds) * 100,
            beatClosingLine: closingOdds < initialOdds  // If we got better odds than closing
        };
        
        // Store for analysis
        this.closingLines.set(eventId, clv);
        
        return clv;
    }
    
    /**
     * Get statistics on value betting performance
     */
    getPerformanceStats() {
        return {
            totalOpportunitiesAnalyzed: this.historicalData.size,
            closingLineValue: this.calculateCLVStats(),
            marketEfficiency: this.calculateMarketEfficiencyStats()
        };
    }
    
    /**
     * Calculate CLV statistics
     */
    calculateCLVStats() {
        const lines = Array.from(this.closingLines.values());
        if (lines.length === 0) return null;
        
        const beatClosingLine = lines.filter(l => l.beatClosingLine).length;
        
        return {
            totalBets: lines.length,
            beatClosingLine: beatClosingLine,
            beatClosingLinePercent: (beatClosingLine / lines.length * 100).toFixed(2),
            averageLineMovement: (lines.reduce((sum, l) => sum + l.lineMovement, 0) / lines.length).toFixed(3)
        };
    }
    
    /**
     * Calculate market efficiency statistics
     */
    calculateMarketEfficiencyStats() {
        // Implementation would track prediction accuracy vs actual results
        return {
            note: 'Requires outcome data for full calculation'
        };
    }
    
    /**
     * Export value betting data for external analysis
     */
    exportData(format = 'json') {
        const data = {
            config: this.config,
            performance: this.getPerformanceStats(),
            closingLines: Array.from(this.closingLines.entries()),
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        return data;
    }
}

module.exports = ValueBettingDetector;
