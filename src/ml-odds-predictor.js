/**
 * @fileoverview ML Odds Predictor - Machine learning for odds movement prediction
 * @description Uses historical data to predict odds movements and identify opportunities
 * @module surebet-detector/ml-odds-predictor
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * ML-based odds prediction engine
 * Uses historical patterns, market dynamics, and statistical models
 * to predict future odds movements
 */
class MLOddsPredictor {
    constructor(config = {}) {
        this.dataDir = config.dataDir || './data';
        this.modelPath = path.join(this.dataDir, 'ml-models');
        this.historyPath = path.join(this.dataDir, 'odds-history');
        this.predictionsPath = path.join(this.dataDir, 'predictions');
        
        // Model parameters
        this.minHistoryPoints = config.minHistoryPoints || 5;
        this.predictionHorizon = config.predictionHorizon || 3600; // 1 hour in seconds
        this.confidenceThreshold = config.confidenceThreshold || 0.7;
        
        // Feature weights for prediction
        this.weights = {
            trend: 0.25,
            volatility: 0.20,
            timeToEvent: 0.20,
            marketPressure: 0.15,
            historicalPattern: 0.20
        };
        
        // In-memory caches
        this.models = new Map();
        this.predictions = new Map();
        this.historicalPatterns = new Map();
    }
    
    /**
     * Initialize the predictor
     */
    async init() {
        await this.ensureDirectories();
        await this.loadModels();
        await this.loadHistoricalPatterns();
        console.log('🤖 ML Odds Predictor initialized');
    }
    
    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        const dirs = [this.modelPath, this.historyPath, this.predictionsPath];
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (err) {
                // Directory may already exist
            }
        }
    }
    
    /**
     * Load trained models from disk
     */
    async loadModels() {
        try {
            const files = await fs.readdir(this.modelPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const modelName = file.replace('.json', '');
                    const data = await fs.readFile(path.join(this.modelPath, file), 'utf8');
                    this.models.set(modelName, JSON.parse(data));
                }
            }
        } catch (err) {
            // No models yet
        }
    }
    
    /**
     * Load historical patterns
     */
    async loadHistoricalPatterns() {
        try {
            const patternFile = path.join(this.dataDir, 'historical-patterns.json');
            const data = await fs.readFile(patternFile, 'utf8');
            const patterns = JSON.parse(data);
            for (const [key, value] of Object.entries(patterns)) {
                this.historicalPatterns.set(key, value);
            }
        } catch (err) {
            // No patterns yet
        }
    }
    
    /**
     * Record current odds for historical tracking
     */
    async recordOdds(eventId, bookmaker, market, odds, timestamp = Date.now()) {
        const key = `${eventId}_${bookmaker}_${market}`;
        const record = {
            timestamp,
            odds,
            eventId,
            bookmaker,
            market
        };
        
        // Append to history file
        const filePath = path.join(this.historyPath, `${key}.jsonl`);
        const line = JSON.stringify(record) + '\n';
        await fs.appendFile(filePath, line, 'utf8');
        
        // Update in-memory cache
        if (!this.historicalPatterns.has(key)) {
            this.historicalPatterns.set(key, []);
        }
        this.historicalPatterns.get(key).push(record);
        
        // Trim if too large
        const history = this.historicalPatterns.get(key);
        if (history.length > 1000) {
            this.historicalPatterns.set(key, history.slice(-500));
        }
    }
    
    /**
     * Get historical odds for an event/bookmaker/market
     */
    async getHistoricalOdds(eventId, bookmaker, market, limit = 100) {
        const key = `${eventId}_${bookmaker}_${market}`;
        
        // Try memory first
        if (this.historicalPatterns.has(key)) {
            const history = this.historicalPatterns.get(key);
            return history.slice(-limit);
        }
        
        // Load from file
        try {
            const filePath = path.join(this.historyPath, `${key}.jsonl`);
            const data = await fs.readFile(filePath, 'utf8');
            const lines = data.trim().split('\n').filter(Boolean);
            const records = lines.slice(-limit).map(line => JSON.parse(line));
            this.historicalPatterns.set(key, records);
            return records;
        } catch (err) {
            return [];
        }
    }
    
    /**
     * Calculate trend from historical data
     */
    calculateTrend(history) {
        if (history.length < 2) return { direction: 'stable', strength: 0 };
        
        const recent = history.slice(-10);
        const firstOdds = recent[0].odds;
        const lastOdds = recent[recent.length - 1].odds;
        
        const change = (lastOdds - firstOdds) / firstOdds;
        const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
        
        // Normalize to hourly rate
        const hourlyChange = timeSpan > 0 ? change / (timeSpan / 3600000) : 0;
        
        let direction = 'stable';
        if (hourlyChange > 0.02) direction = 'shortening';
        else if (hourlyChange < -0.02) direction = 'drifting';
        
        return {
            direction,
            strength: Math.abs(hourlyChange),
            hourlyChange
        };
    }
    
    /**
     * Calculate volatility from historical data
     */
    calculateVolatility(history) {
        if (history.length < 3) return { value: 0, category: 'low' };
        
        const odds = history.map(h => h.odds);
        const mean = odds.reduce((a, b) => a + b, 0) / odds.length;
        const variance = odds.reduce((sum, o) => sum + Math.pow(o - mean, 2), 0) / odds.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean; // Coefficient of variation
        
        let category = 'low';
        if (cv > 0.15) category = 'high';
        else if (cv > 0.08) category = 'medium';
        
        return { value: cv, category, stdDev };
    }
    
    /**
     * Calculate market pressure (imbalance in betting)
     */
    calculateMarketPressure(event, bookmaker, outcome) {
        // Estimate market pressure based on odds movement patterns
        // Higher pressure = odds moving away from fair value
        
        const market = event.bookmakers?.find(b => b.name === bookmaker)?.markets?.[0];
        if (!market) return { value: 0, direction: 'neutral' };
        
        const outcomes = market.outcomes || [];
        const totalProbability = outcomes.reduce((sum, o) => sum + (1 / o.odds), 0);
        const margin = totalProbability - 1;
        
        // Higher margin suggests more market pressure
        const pressureValue = Math.min(margin * 2, 1);
        
        return {
            value: pressureValue,
            direction: margin > 0.1 ? 'heavy' : margin > 0.05 ? 'moderate' : 'light'
        };
    }
    
    /**
     * Find similar historical patterns
     */
    findSimilarPatterns(event, bookmaker, market, history) {
        if (history.length < this.minHistoryPoints) return null;
        
        const currentPattern = {
            sport: event.sport,
            timeToEvent: event.commence_time ? 
                new Date(event.commence_time).getTime() - Date.now() : null,
            odds: history[history.length - 1]?.odds,
            trend: this.calculateTrend(history)
        };
        
        // Look for similar patterns in historical data
        const similar = [];
        for (const [key, patterns] of this.historicalPatterns) {
            if (patterns.length < this.minHistoryPoints) continue;
            if (!key.includes(market)) continue;
            
            const patternTrend = this.calculateTrend(patterns);
            const patternOdds = patterns[patterns.length - 1]?.odds;
            
            // Check similarity
            const trendSimilarity = patternTrend.direction === currentPattern.trend.direction ? 1 : 0;
            const oddsSimilarity = currentPattern.odds && patternOdds ? 
                1 - Math.abs(currentPattern.odds - patternOdds) / Math.max(currentPattern.odds, patternOdds) : 0;
            
            const similarity = (trendSimilarity + oddsSimilarity) / 2;
            
            if (similarity > 0.7) {
                similar.push({ key, similarity, patterns });
            }
        }
        
        similar.sort((a, b) => b.similarity - a.similarity);
        return similar.slice(0, 5);
    }
    
    /**
     * Predict future odds using ML model
     */
    async predictOdds(event, bookmaker, market, outcome) {
        const eventId = event.id || `${event.sport}_${event.home_team}_${event.away_team}`;
        const history = await this.getHistoricalOdds(eventId, bookmaker, market);
        
        if (history.length < this.minHistoryPoints) {
            return {
                success: false,
                reason: 'insufficient_history',
                confidence: 0,
                prediction: null
            };
        }
        
        // Extract features
        const trend = this.calculateTrend(history);
        const volatility = this.calculateVolatility(history);
        const marketPressure = this.calculateMarketPressure(event, bookmaker, market);
        const similarPatterns = this.findSimilarPatterns(event, bookmaker, market, history);
        
        // Time to event feature
        const timeToEvent = event.commence_time ? 
            Math.max(0, new Date(event.commence_time).getTime() - Date.now()) / 1000 : null;
        const timeFeature = timeToEvent !== null ? 
            Math.exp(-timeToEvent / 86400) : 0.5; // Decay over 24h
        
        // Calculate prediction using weighted features
        const currentOdds = history[history.length - 1].odds;
        let predictedChange = 0;
        
        // Trend contribution
        if (trend.direction === 'shortening') {
            predictedChange -= trend.strength * this.weights.trend;
        } else if (trend.direction === 'drifting') {
            predictedChange += trend.strength * this.weights.trend;
        }
        
        // Volatility contribution (high volatility = more uncertainty)
        predictedChange *= (1 - volatility.value * this.weights.volatility);
        
        // Time to event contribution (odds stabilize closer to event)
        predictedChange *= (1 - timeFeature * this.weights.timeToEvent);
        
        // Market pressure contribution
        if (marketPressure.direction === 'heavy') {
            predictedChange += marketPressure.value * this.weights.marketPressure;
        }
        
        // Historical pattern contribution
        if (similarPatterns && similarPatterns.length > 0) {
            const avgOutcome = similarPatterns.reduce((sum, p) => {
                const lastOdds = p.patterns[p.patterns.length - 1]?.odds;
                const firstOdds = p.patterns[0]?.odds;
                if (lastOdds && firstOdds) {
                    return sum + (lastOdds - firstOdds) / firstOdds;
                }
                return sum;
            }, 0) / similarPatterns.length;
            
            predictedChange += avgOutcome * this.weights.historicalPattern;
        }
        
        // Calculate predicted odds
        const predictedOdds = currentOdds * (1 + predictedChange);
        
        // Calculate confidence based on data quality
        let confidence = 0.5;
        confidence += Math.min(history.length / 50, 0.2); // More history = more confident
        confidence += (1 - volatility.value) * 0.15; // Lower volatility = more confident
        confidence += similarPatterns && similarPatterns.length > 0 ? 0.1 : 0;
        confidence = Math.min(confidence, 0.95);
        
        // Store prediction
        const prediction = {
            timestamp: Date.now(),
            eventId,
            bookmaker,
            market,
            outcome,
            currentOdds,
            predictedOdds,
            predictedChange: predictedChange * 100, // as percentage
            confidence,
            features: {
                trend,
                volatility,
                marketPressure,
                timeToEvent,
                similarPatternsCount: similarPatterns?.length || 0
            },
            validUntil: Date.now() + this.predictionHorizon * 1000
        };
        
        const key = `${eventId}_${bookmaker}_${market}_${outcome}`;
        this.predictions.set(key, prediction);
        
        // Save prediction to disk
        await this.savePrediction(prediction);
        
        return {
            success: true,
            confidence,
            prediction
        };
    }
    
    /**
     * Save prediction to disk
     */
    async savePrediction(prediction) {
        const date = new Date().toISOString().split('T')[0];
        const filePath = path.join(this.predictionsPath, `${date}.jsonl`);
        const line = JSON.stringify(prediction) + '\n';
        await fs.appendFile(filePath, line, 'utf8');
    }
    
    /**
     * Predict arbitrage opportunities before they appear
     */
    async predictArbitrageOpportunities(events) {
        const predictions = [];
        
        for (const event of events) {
            if (!event.bookmakers || event.bookmakers.length < 2) continue;
            
            // Get all outcomes for this event
            const outcomes = new Set();
            for (const bookmaker of event.bookmakers) {
                const market = bookmaker.markets?.find(m => m.type === 'h2h');
                if (market) {
                    for (const outcome of market.outcomes || []) {
                        outcomes.add(outcome.name);
                    }
                }
            }
            
            // Predict odds for each outcome at each bookmaker
            const predictedOdds = {};
            for (const outcomeName of outcomes) {
                predictedOdds[outcomeName] = {};
                
                for (const bookmaker of event.bookmakers) {
                    const market = bookmaker.markets?.find(m => m.type === 'h2h');
                    const outcome = market?.outcomes?.find(o => o.name === outcomeName);
                    
                    if (outcome) {
                        const result = await this.predictOdds(
                            event, 
                            bookmaker.name, 
                            'h2h', 
                            outcomeName
                        );
                        
                        if (result.success && result.confidence >= this.confidenceThreshold) {
                            predictedOdds[outcomeName][bookmaker.name] = {
                                current: result.prediction.currentOdds,
                                predicted: result.prediction.predictedOdds,
                                confidence: result.confidence,
                                change: result.prediction.predictedChange
                            };
                        }
                    }
                }
            }
            
            // Check for predicted arbitrage opportunities
            for (const outcomeName of outcomes) {
                const bookmakerOdds = predictedOdds[outcomeName];
                const bookmakers = Object.keys(bookmakerOdds);
                
                if (bookmakers.length < 2) continue;
                
                // Find best predicted odds
                let bestCurrent = 0;
                let bestPredicted = 0;
                let bestBookmaker = '';
                let avgConfidence = 0;
                
                for (const [bm, data] of Object.entries(bookmakerOdds)) {
                    if (data.predicted > bestPredicted) {
                        bestPredicted = data.predicted;
                        bestCurrent = data.current;
                        bestBookmaker = bm;
                    }
                    avgConfidence += data.confidence;
                }
                
                avgConfidence /= bookmakers.length;
                
                // Check if this could create arbitrage with other outcomes
                for (const otherOutcome of outcomes) {
                    if (otherOutcome === outcomeName) continue;
                    
                    const otherOdds = predictedOdds[otherOutcome];
                    if (!otherOdds || Object.keys(otherOdds).length === 0) continue;
                    
                    const otherBest = Math.max(...Object.values(otherOdds).map(o => o.predicted));
                    const otherConfidence = Object.values(otherOdds)
                        .reduce((sum, o) => sum + o.confidence, 0) / Object.keys(otherOdds).length;
                    
                    // Calculate implied probability
                    const prob1 = 1 / bestPredicted;
                    const prob2 = 1 / otherBest;
                    const totalProb = prob1 + prob2;
                    
                    if (totalProb < 1) {
                        // Predicted arbitrage opportunity!
                        const profitPercent = (1 - totalProb) * 100;
                        
                        predictions.push({
                            type: 'predicted_arbitrage',
                            event: {
                                id: event.id,
                                sport: event.sport,
                                homeTeam: event.home_team,
                                awayTeam: event.away_team,
                                commenceTime: event.commence_time
                            },
                            predictedProfit: profitPercent,
                            confidence: (avgConfidence + otherConfidence) / 2,
                            outcomes: [
                                {
                                    name: outcomeName,
                                    bookmaker: bestBookmaker,
                                    currentOdds: bestCurrent,
                                    predictedOdds: bestPredicted
                                },
                                {
                                    name: otherOutcome,
                                    bookmaker: Object.entries(otherOdds)
                                        .find(([k, v]) => v.predicted === otherBest)?.[0],
                                    currentOdds: Object.values(otherOdds)
                                        .find(o => o.predicted === otherBest)?.current,
                                    predictedOdds: otherBest
                                }
                            ],
                            expectedTime: Date.now() + this.predictionHorizon * 1000,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }
        
        // Sort by confidence and profit
        predictions.sort((a, b) => 
            (b.confidence * b.predictedProfit) - (a.confidence * a.predictedProfit)
        );
        
        return predictions;
    }
    
    /**
     * Get predictions for a specific event
     */
    async getEventPredictions(eventId) {
        const eventPredictions = [];
        
        for (const [key, prediction] of this.predictions) {
            if (key.startsWith(`${eventId}_`)) {
                eventPredictions.push(prediction);
            }
        }
        
        return eventPredictions;
    }
    
    /**
     * Get all active predictions
     */
    getAllPredictions() {
        const now = Date.now();
        const active = [];
        
        for (const [key, prediction] of this.predictions) {
            if (prediction.validUntil > now) {
                active.push(prediction);
            }
        }
        
        return active.sort((a, b) => b.confidence - a.confidence);
    }
    
    /**
     * Evaluate prediction accuracy (for model improvement)
     */
    async evaluateAccuracy() {
        const evaluations = [];
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // Last 7 days
        
        // Load old predictions
        try {
            const files = await fs.readdir(this.predictionsPath);
            for (const file of files) {
                if (!file.endsWith('.jsonl')) continue;
                
                const filePath = path.join(this.predictionsPath, file);
                const data = await fs.readFile(filePath, 'utf8');
                const lines = data.trim().split('\n').filter(Boolean);
                
                for (const line of lines) {
                    const prediction = JSON.parse(line);
                    if (prediction.timestamp < cutoff) continue;
                    
                    // Check if we have actual outcome
                    const history = await this.getHistoricalOdds(
                        prediction.eventId,
                        prediction.bookmaker,
                        prediction.market,
                        10
                    );
                    
                    if (history.length === 0) continue;
                    
                    const actualOdds = history[history.length - 1].odds;
                    const predictedOdds = prediction.predictedOdds;
                    const error = Math.abs(actualOdds - predictedOdds) / actualOdds;
                    
                    evaluations.push({
                        prediction,
                        actualOdds,
                        error: error * 100, // percentage error
                        accurate: error < 0.1 // within 10%
                    });
                }
            }
        } catch (err) {
            console.error('Error evaluating predictions:', err);
        }
        
        if (evaluations.length === 0) {
            return { total: 0, accuracy: 0, avgError: 0 };
        }
        
        const accurate = evaluations.filter(e => e.accurate).length;
        const avgError = evaluations.reduce((sum, e) => sum + e.error, 0) / evaluations.length;
        
        return {
            total: evaluations.length,
            accurate,
            accuracy: accurate / evaluations.length,
            avgError,
            byConfidence: this.groupByConfidence(evaluations)
        };
    }
    
    /**
     * Group evaluations by confidence level
     */
    groupByConfidence(evaluations) {
        const groups = {
            high: [],    // > 0.8
            medium: [],  // 0.6 - 0.8
            low: []      // < 0.6
        };
        
        for (const e of evaluations) {
            const conf = e.prediction.confidence;
            if (conf > 0.8) groups.high.push(e);
            else if (conf > 0.6) groups.medium.push(e);
            else groups.low.push(e);
        }
        
        return {
            high: {
                count: groups.high.length,
                accuracy: groups.high.filter(e => e.accurate).length / Math.max(groups.high.length, 1)
            },
            medium: {
                count: groups.medium.length,
                accuracy: groups.medium.filter(e => e.accurate).length / Math.max(groups.medium.length, 1)
            },
            low: {
                count: groups.low.length,
                accuracy: groups.low.filter(e => e.accurate).length / Math.max(groups.low.length, 1)
            }
        };
    }
    
    /**
     * Get prediction statistics
     */
    getStats() {
        const predictions = this.getAllPredictions();
        const totalPredictions = predictions.length;
        const highConfidence = predictions.filter(p => p.confidence > 0.8).length;
        const arbitragePredictions = predictions.filter(p => p.predictedChange < -5).length;
        
        return {
            totalPredictions,
            highConfidence,
            arbitragePredictions,
            avgConfidence: totalPredictions > 0 ? 
                predictions.reduce((sum, p) => sum + p.confidence, 0) / totalPredictions : 0,
            modelsLoaded: this.models.size,
            historicalPatterns: this.historicalPatterns.size
        };
    }
    
    /**
     * Export predictions to JSON
     */
    async exportPredictions(format = 'json') {
        const predictions = this.getAllPredictions();
        
        if (format === 'json') {
            return JSON.stringify(predictions, null, 2);
        }
        
        if (format === 'csv') {
            const headers = ['timestamp', 'eventId', 'bookmaker', 'market', 'outcome', 
                           'currentOdds', 'predictedOdds', 'predictedChange', 'confidence'];
            const rows = predictions.map(p => [
                new Date(p.timestamp).toISOString(),
                p.eventId,
                p.bookmaker,
                p.market,
                p.outcome,
                p.currentOdds,
                p.predictedOdds,
                p.predictedChange,
                p.confidence
            ]);
            
            return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        
        throw new Error(`Unsupported format: ${format}`);
    }
}

module.exports = { MLOddsPredictor };
