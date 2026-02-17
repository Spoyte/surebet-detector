/**
 * @fileoverview Odds Line Shopping Module
 * @description Automatically finds and compares the best odds across all bookmakers
 *              for a given event to maximize Expected Value (EV).
 * @module surebet-detector/odds-line-shopper
 */

const { createLoggerWithAudit, LogLevel } = require('./logger.js');

/**
 * Represents a single odds line from a bookmaker
 * @typedef {Object} OddsLine
 * @property {string} bookmaker - Bookmaker name
 * @property {string} outcome - Outcome description (e.g., "Team A Win")
 * @property {number} odds - Decimal odds
 * @property {number} impliedProbability - Implied probability (1/odds)
 * @property {number} timestamp - When the odds were recorded
 * @property {string} market - Market type (h2h, spreads, totals, etc.)
 * @property {Object} metadata - Additional bookmaker-specific data
 */

/**
 * Represents the best line for a specific outcome
 * @typedef {Object} BestLine
 * @property {string} outcome - Outcome description
 * @property {OddsLine} bestOdds - The best available odds
 * @property {OddsLine[]} allLines - All available lines sorted by odds
 * @property {number} evImprovement - EV improvement vs worst odds
 * @property {number} profitImprovement - Profit improvement on $100 stake
 */

/**
 * Odds Line Shopper - Finds the best odds across bookmakers
 */
class OddsLineShopper {
    /**
     * @param {Object} options - Configuration options
     * @param {number} options.minEVImprovement - Minimum EV improvement to report (default: 1%)
     * @param {number} options.maxBookmakers - Maximum bookmakers to compare (default: 50)
     * @param {boolean} options.includeExchange - Include betting exchanges (default: true)
     * @param {string} options.dataDir - Directory for caching data
     * @param {Object} options.logger - Logger instance
     */
    constructor(options = {}) {
        this.minEVImprovement = options.minEVImprovement || 1.0;
        this.maxBookmakers = options.maxBookmakers || 50;
        this.includeExchange = options.includeExchange !== false;
        this.dataDir = options.dataDir || './data';
        this.logger = options.logger || console;
        
        // Cache for odds history
        this.oddsCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        
        // Bookmaker reliability scores (0-1)
        this.bookmakerReliability = new Map();
        
        // Exchange commission rates
        this.exchangeCommissions = {
            'betfair': 0.05,
            'smarkets': 0.02,
            'matchbook': 0.01,
            'betdaq': 0.05
        };
        
        this.initialized = false;
    }

    /**
     * Initialize the shopper
     */
    async init() {
        if (this.initialized) return;
        
        this.logger.info('Initializing Odds Line Shopper...', { 
            category: 'odds-shopping',
            minEVImprovement: this.minEVImprovement,
            maxBookmakers: this.maxBookmakers
        });
        
        // Load bookmaker reliability scores
        await this.loadReliabilityScores();
        
        this.initialized = true;
        this.logger.info('Odds Line Shopper initialized', { category: 'odds-shopping' });
    }

    /**
     * Load bookmaker reliability scores from storage
     */
    async loadReliabilityScores() {
        // Default reliability scores based on market reputation
        const defaultScores = {
            'pinnacle': 0.95,
            'betfair': 0.95,
            'smarkets': 0.93,
            'cloudbet': 0.92,
            'matchbook': 0.90,
            'betdaq': 0.88,
            'bet365': 0.85,
            'williamhill': 0.85,
            'betvictor': 0.84,
            'unibet': 0.83,
            'betclic': 0.82,
            'winamax': 0.82,
            'fdj': 0.80,
            'parionssport': 0.79,
            'zebet': 0.78,
            'draftkings': 0.82,
            'fanduel': 0.81,
            'pointsbet': 0.78,
            'betmgm': 0.79,
            'caesars': 0.78
        };
        
        for (const [bookmaker, score] of Object.entries(defaultScores)) {
            this.bookmakerReliability.set(bookmaker.toLowerCase(), score);
        }
    }

    /**
     * Get reliability score for a bookmaker
     * @param {string} bookmaker - Bookmaker name
     * @returns {number} Reliability score (0-1)
     */
    getReliabilityScore(bookmaker) {
        return this.bookmakerReliability.get(bookmaker.toLowerCase()) || 0.70;
    }

    /**
     * Apply exchange commission to odds
     * @param {number} odds - Decimal odds
     * @param {string} exchange - Exchange name
     * @returns {number} Odds after commission
     */
    applyExchangeCommission(odds, exchange) {
        if (!this.includeExchange) return odds;
        
        const commission = this.exchangeCommissions[exchange.toLowerCase()] || 0.05;
        // Convert to probability, apply commission, convert back to odds
        const probability = 1 / odds;
        const commissionedProbability = probability * (1 + commission);
        return 1 / commissionedProbability;
    }

    /**
     * Extract all odds lines from event data
     * @param {Object} event - Event data from Odds API
     * @returns {OddsLine[]} Array of odds lines
     */
    extractOddsLines(event) {
        const lines = [];
        const timestamp = Date.now();
        
        if (!event.bookmakers) return lines;
        
        for (const bookmaker of event.bookmakers) {
            const bookmakerName = bookmaker.title || bookmaker.key;
            const reliability = this.getReliabilityScore(bookmakerName);
            
            for (const market of bookmaker.markets || []) {
                const marketType = market.key;
                
                for (const outcome of market.outcomes || []) {
                    let odds = outcome.price;
                    
                    // Apply exchange commission if applicable
                    if (this.isExchange(bookmakerName)) {
                        odds = this.applyExchangeCommission(odds, bookmakerName);
                    }
                    
                    lines.push({
                        bookmaker: bookmakerName,
                        outcome: outcome.name,
                        odds: odds,
                        impliedProbability: 1 / odds,
                        timestamp: timestamp,
                        market: marketType,
                        reliability: reliability,
                        metadata: {
                            point: outcome.point,
                            bookmakerKey: bookmaker.key,
                            lastUpdate: bookmaker.last_update
                        }
                    });
                }
            }
        }
        
        return lines;
    }

    /**
     * Check if bookmaker is an exchange
     * @param {string} bookmaker - Bookmaker name
     * @returns {boolean}
     */
    isExchange(bookmaker) {
        const exchanges = ['betfair', 'smarkets', 'matchbook', 'betdaq'];
        return exchanges.includes(bookmaker.toLowerCase());
    }

    /**
     * Group odds lines by outcome
     * @param {OddsLine[]} lines - Array of odds lines
     * @returns {Map<string, OddsLine[]>} Map of outcome -> lines
     */
    groupByOutcome(lines) {
        const grouped = new Map();
        
        for (const line of lines) {
            const key = `${line.market}:${line.outcome}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(line);
        }
        
        return grouped;
    }

    /**
     * Find the best odds for each outcome
     * @param {OddsLine[]} lines - Array of odds lines
     * @returns {BestLine[]} Array of best lines
     */
    findBestLines(lines) {
        const grouped = this.groupByOutcome(lines);
        const bestLines = [];
        
        for (const [key, outcomeLines] of grouped) {
            // Sort by odds (descending)
            const sorted = outcomeLines.sort((a, b) => b.odds - a.odds);
            
            if (sorted.length === 0) continue;
            
            const best = sorted[0];
            const worst = sorted[sorted.length - 1];
            
            // Calculate improvements
            const evImprovement = ((best.odds - worst.odds) / worst.odds) * 100;
            const profitImprovement = (best.odds - worst.odds) * 100; // Per $100 stake
            
            // Only include if improvement meets threshold
            if (evImprovement >= this.minEVImprovement) {
                bestLines.push({
                    outcome: best.outcome,
                    market: best.market,
                    bestOdds: best,
                    allLines: sorted,
                    evImprovement: parseFloat(evImprovement.toFixed(2)),
                    profitImprovement: parseFloat(profitImprovement.toFixed(2)),
                    bookmakerCount: sorted.length,
                    reliability: best.reliability
                });
            }
        }
        
        // Sort by EV improvement
        return bestLines.sort((a, b) => b.evImprovement - a.evImprovement);
    }

    /**
     * Calculate the theoretical hold percentage if betting with the best lines
     * @param {BestLine[]} bestLines - Best lines for each outcome
     * @returns {Object} Hold analysis
     */
    calculateTheoreticalHold(bestLines) {
        // Group by market
        const byMarket = new Map();
        
        for (const line of bestLines) {
            if (!byMarket.has(line.market)) {
                byMarket.set(line.market, []);
            }
            byMarket.get(line.market).push(line);
        }
        
        const marketHolds = [];
        
        for (const [market, lines] of byMarket) {
            // Calculate total implied probability
            const totalImpliedProb = lines.reduce((sum, line) => 
                sum + (1 / line.bestOdds.odds), 0);
            
            const holdPercentage = (totalImpliedProb - 1) * 100;
            
            marketHolds.push({
                market,
                holdPercentage: parseFloat(holdPercentage.toFixed(2)),
                totalImpliedProbability: parseFloat(totalImpliedProb.toFixed(4)),
                outcomeCount: lines.length,
                isArbitrage: holdPercentage < 0,
                theoreticalProfit: holdPercentage < 0 ? 
                    Math.abs(holdPercentage) : null
            });
        }
        
        return {
            markets: marketHolds,
            bestMarket: marketHolds.sort((a, b) => a.holdPercentage - b.holdPercentage)[0]
        };
    }

    /**
     * Generate shopping recommendations for an event
     * @param {Object} event - Event data
     * @returns {Object} Shopping recommendations
     */
    shopEvent(event) {
        const lines = this.extractOddsLines(event);
        
        if (lines.length === 0) {
            return {
                eventId: event.id,
                eventName: `${event.away_team} @ ${event.home_team}`,
                sport: event.sport_key,
                commenceTime: event.commence_time,
                recommendations: [],
                summary: {
                    totalLines: 0,
                    bookmakers: 0,
                    markets: 0,
                    bestOpportunities: []
                }
            };
        }
        
        const bestLines = this.findBestLines(lines);
        const holdAnalysis = this.calculateTheoreticalHold(bestLines);
        
        // Get unique bookmakers and markets
        const bookmakers = new Set(lines.map(l => l.bookmaker));
        const markets = new Set(lines.map(l => l.market));
        
        // Find top opportunities
        const topOpportunities = bestLines
            .filter(line => line.evImprovement >= 5)
            .slice(0, 5);
        
        return {
            eventId: event.id,
            eventName: `${event.away_team} @ ${event.home_team}`,
            sport: event.sport_key,
            commenceTime: event.commence_time,
            recommendations: bestLines,
            holdAnalysis,
            summary: {
                totalLines: lines.length,
                bookmakers: bookmakers.size,
                markets: markets.size,
                bestOpportunities: topOpportunities.map(line => ({
                    outcome: line.outcome,
                    market: line.market,
                    bestBookmaker: line.bestOdds.bookmaker,
                    bestOdds: line.bestOdds.odds,
                    evImprovement: line.evImprovement,
                    profitImprovement: line.profitImprovement
                }))
            }
        };
    }

    /**
     * Shop odds for multiple events
     * @param {Object[]} events - Array of event data
     * @returns {Object[]} Shopping results for each event
     */
    shopEvents(events) {
        const results = [];
        
        for (const event of events) {
            try {
                const result = this.shopEvent(event);
                results.push(result);
            } catch (err) {
                this.logger.error('Error shopping event', {
                    category: 'odds-shopping',
                    eventId: event.id,
                    error: err.message
                });
            }
        }
        
        // Sort by best opportunities
        return results.sort((a, b) => {
            const aBest = a.summary.bestOpportunities[0]?.evImprovement || 0;
            const bBest = b.summary.bestOpportunities[0]?.evImprovement || 0;
            return bBest - aBest;
        });
    }

    /**
     * Find line shopping opportunities across all events
     * @param {Object[]} events - Array of event data
     * @param {Object} options - Filter options
     * @returns {Object} Aggregated opportunities
     */
    findShoppingOpportunities(events, options = {}) {
        const minImprovement = options.minImprovement || 2.0;
        const maxResults = options.maxResults || 20;
        
        const allOpportunities = [];
        
        for (const event of events) {
            const result = this.shopEvent(event);
            
            for (const rec of result.recommendations) {
                if (rec.evImprovement >= minImprovement) {
                    allOpportunities.push({
                        eventId: event.id,
                        eventName: result.eventName,
                        sport: result.sport,
                        commenceTime: result.commenceTime,
                        outcome: rec.outcome,
                        market: rec.market,
                        bestBookmaker: rec.bestOdds.bookmaker,
                        bestOdds: rec.bestOdds.odds,
                        worstOdds: rec.allLines[rec.allLines.length - 1].odds,
                        evImprovement: rec.evImprovement,
                        profitImprovement: rec.profitImprovement,
                        bookmakerCount: rec.bookmakerCount,
                        alternativeBookmakers: rec.allLines.slice(1, 4).map(l => ({
                            name: l.bookmaker,
                            odds: l.odds,
                            diff: ((rec.bestOdds.odds - l.odds) / l.odds * 100).toFixed(1) + '%'
                        }))
                    });
                }
            }
        }
        
        // Sort by EV improvement
        allOpportunities.sort((a, b) => b.evImprovement - a.evImprovement);
        
        return {
            totalOpportunities: allOpportunities.length,
            opportunities: allOpportunities.slice(0, maxResults),
            summary: {
                avgImprovement: allOpportunities.length > 0 ?
                    (allOpportunities.reduce((sum, o) => sum + o.evImprovement, 0) / allOpportunities.length).toFixed(2) : 0,
                bestImprovement: allOpportunities[0]?.evImprovement || 0,
                eventsCovered: new Set(allOpportunities.map(o => o.eventId)).size
            }
        };
    }

    /**
     * Compare odds between two specific bookmakers
     * @param {Object[]} events - Array of event data
     * @param {string} bookmaker1 - First bookmaker
     * @param {string} bookmaker2 - Second bookmaker
     * @returns {Object} Comparison results
     */
    compareBookmakers(events, bookmaker1, bookmaker2) {
        const comparisons = [];
        let book1Better = 0;
        let book2Better = 0;
        let equal = 0;
        
        for (const event of events) {
            const lines = this.extractOddsLines(event);
            const grouped = this.groupByOutcome(lines);
            
            for (const [key, outcomeLines] of grouped) {
                const line1 = outcomeLines.find(l => 
                    l.bookmaker.toLowerCase() === bookmaker1.toLowerCase());
                const line2 = outcomeLines.find(l => 
                    l.bookmaker.toLowerCase() === bookmaker2.toLowerCase());
                
                if (line1 && line2) {
                    const diff = line1.odds - line2.odds;
                    const diffPercent = (diff / line2.odds) * 100;
                    
                    if (diff > 0.01) book1Better++;
                    else if (diff < -0.01) book2Better++;
                    else equal++;
                    
                    comparisons.push({
                        eventId: event.id,
                        eventName: `${event.away_team} @ ${event.home_team}`,
                        outcome: line1.outcome,
                        market: line1.market,
                        [bookmaker1]: line1.odds,
                        [bookmaker2]: line2.odds,
                        difference: parseFloat(diffPercent.toFixed(2)),
                        better: diff > 0.01 ? bookmaker1 : diff < -0.01 ? bookmaker2 : 'equal'
                    });
                }
            }
        }
        
        return {
            bookmaker1,
            bookmaker2,
            totalComparisons: comparisons.length,
            summary: {
                [bookmaker1 + 'Better']: book1Better,
                [bookmaker2 + 'Better']: book2Better,
                equal: equal,
                bookmaker1WinRate: comparisons.length > 0 ? 
                    ((book1Better / comparisons.length) * 100).toFixed(1) + '%' : '0%',
                bookmaker2WinRate: comparisons.length > 0 ? 
                    ((book2Better / comparisons.length) * 100).toFixed(1) + '%' : '0%'
            },
            comparisons: comparisons.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
        };
    }

    /**
     * Get a summary of best bookmakers by market
     * @param {Object[]} events - Array of event data
     * @returns {Object} Bookmaker rankings
     */
    getBookmakerRankings(events) {
        const bookmakerStats = new Map();
        
        for (const event of events) {
            const lines = this.extractOddsLines(event);
            const grouped = this.groupByOutcome(lines);
            
            for (const [key, outcomeLines] of grouped) {
                if (outcomeLines.length === 0) continue;
                
                // Sort by odds
                const sorted = outcomeLines.sort((a, b) => b.odds - a.odds);
                const best = sorted[0];
                
                // Update stats for best bookmaker
                if (!bookmakerStats.has(best.bookmaker)) {
                    bookmakerStats.set(best.bookmaker, {
                        bestOddsCount: 0,
                        totalOdds: 0,
                        markets: new Set()
                    });
                }
                
                const stats = bookmakerStats.get(best.bookmaker);
                stats.bestOddsCount++;
                stats.totalOdds += best.odds;
                stats.markets.add(best.market);
            }
        }
        
        // Convert to array and sort
        const rankings = [];
        for (const [bookmaker, stats] of bookmakerStats) {
            rankings.push({
                bookmaker,
                bestOddsCount: stats.bestOddsCount,
                avgOdds: stats.totalOdds / stats.bestOddsCount,
                marketsCovered: stats.markets.size,
                score: stats.bestOddsCount * (stats.totalOdds / stats.bestOddsCount)
            });
        }
        
        return rankings.sort((a, b) => b.score - a.score);
    }

    /**
     * Shutdown the shopper
     */
    async shutdown() {
        this.logger.info('Shutting down Odds Line Shopper...', { category: 'odds-shopping' });
        this.oddsCache.clear();
        this.initialized = false;
    }
}

module.exports = { OddsLineShopper };
