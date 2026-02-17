/**
 * @fileoverview Odds Movement Tracker and Alert System
 * @description Tracks odds changes over time and alerts on significant movements
 *              that may create new arbitrage or +EV opportunities
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Tracks odds movements and generates alerts
 */
class OddsMovementTracker {
    constructor(config) {
        this.config = config;
        this.dataDir = path.join(__dirname, '../data');
        this.cacheDir = path.join(this.dataDir, 'cache');
        this.movementThreshold = config.ODDS_MOVEMENT_THRESHOLD || 0.15; // 15% change
        this.arbitrageTriggerThreshold = config.ARBITRAGE_TRIGGER_THRESHOLD || 0.95; // 95% implied probability
        this.historyWindow = config.HISTORY_WINDOW_HOURS || 24; // Compare against 24h history
    }

    /**
     * Load historical odds data from cache files
     * @param {number} hoursBack - How many hours back to look
     * @returns {Array} Array of historical data snapshots
     */
    async loadHistoricalData(hoursBack = 24) {
        try {
            const files = await fs.readdir(this.cacheDir);
            const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
            
            const dataFiles = files
                .filter(f => f.startsWith('data_') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(this.cacheDir, f),
                    time: parseInt(f.match(/data_(\d+)\.json/)?.[1] || 0)
                }))
                .filter(f => f.time > cutoffTime)
                .sort((a, b) => a.time - b.time);

            const historicalData = [];
            for (const file of dataFiles) {
                try {
                    const content = await fs.readFile(file.path, 'utf8');
                    const data = JSON.parse(content);
                    historicalData.push({
                        timestamp: data.timestamp,
                        time: file.time,
                        oddsData: data.oddsData || []
                    });
                } catch (e) {
                    console.warn(`Failed to load ${file.name}:`, e.message);
                }
            }

            return historicalData;
        } catch (e) {
            console.error('Error loading historical data:', e.message);
            return [];
        }
    }

    /**
     * Build a map of current odds by event and bookmaker
     * @param {Array} oddsData - Current odds data
     * @returns {Map} Map of eventKey -> bookmaker -> outcome -> odds
     */
    buildOddsMap(oddsData) {
        const oddsMap = new Map();
        
        for (const event of oddsData) {
            const eventKey = `${event.sport}:${event.eventName}`;
            if (!oddsMap.has(eventKey)) {
                oddsMap.set(eventKey, {
                    sport: event.sport,
                    eventName: event.eventName,
                    commenceTime: event.commenceTime,
                    bookmakers: new Map()
                });
            }
            
            const eventData = oddsMap.get(eventKey);
            
            for (const bookmaker of event.bookmakers) {
                if (!eventData.bookmakers.has(bookmaker.name)) {
                    eventData.bookmakers.set(bookmaker.name, {
                        name: bookmaker.name,
                        lastUpdate: bookmaker.lastUpdate,
                        markets: new Map()
                    });
                }
                
                const bmData = eventData.bookmakers.get(bookmaker.name);
                
                for (const market of bookmaker.markets) {
                    if (!bmData.markets.has(market.type)) {
                        bmData.markets.set(market.type, {
                            type: market.type,
                            outcomes: new Map()
                        });
                    }
                    
                    const marketData = bmData.markets.get(market.type);
                    
                    for (const outcome of market.outcomes) {
                        marketData.outcomes.set(outcome.name, {
                            name: outcome.name,
                            odds: outcome.odds,
                            impliedProbability: outcome.impliedProbability
                        });
                    }
                }
            }
        }
        
        return oddsMap;
    }

    /**
     * Calculate percentage change between two odds values
     * @param {number} oldOdds - Previous odds
     * @param {number} newOdds - Current odds
     * @returns {number} Percentage change (positive = odds went up)
     */
    calculateOddsChange(oldOdds, newOdds) {
        if (!oldOdds || !newOdds || oldOdds === 0) return 0;
        return (newOdds - oldOdds) / oldOdds;
    }

    /**
     * Calculate implied probability from decimal odds
     * @param {number} odds - Decimal odds
     * @returns {number} Implied probability (0-1)
     */
    impliedProbability(odds) {
        if (!odds || odds <= 0) return 0;
        return 1 / odds;
    }

    /**
     * Detect significant odds movements
     * @param {Map} currentOdds - Current odds map
     * @param {Map} previousOdds - Previous odds map
     * @returns {Array} Array of movement alerts
     */
    detectMovements(currentOdds, previousOdds) {
        const movements = [];
        
        for (const [eventKey, currentEvent] of currentOdds) {
            const previousEvent = previousOdds.get(eventKey);
            if (!previousEvent) continue;
            
            for (const [bookmakerName, currentBm] of currentEvent.bookmakers) {
                const previousBm = previousEvent.bookmakers.get(bookmakerName);
                if (!previousBm) continue;
                
                for (const [marketType, currentMarket] of currentBm.markets) {
                    const previousMarket = previousBm.markets.get(marketType);
                    if (!previousMarket) continue;
                    
                    for (const [outcomeName, currentOutcome] of currentMarket.outcomes) {
                        const previousOutcome = previousMarket.outcomes.get(outcomeName);
                        if (!previousOutcome) continue;
                        
                        const change = this.calculateOddsChange(
                            previousOutcome.odds, 
                            currentOutcome.odds
                        );
                        
                        // Check if movement exceeds threshold
                        if (Math.abs(change) >= this.movementThreshold) {
                            movements.push({
                                type: 'odds_movement',
                                eventKey,
                                sport: currentEvent.sport,
                                eventName: currentEvent.eventName,
                                commenceTime: currentEvent.commenceTime,
                                bookmaker: bookmakerName,
                                market: marketType,
                                outcome: outcomeName,
                                previousOdds: previousOutcome.odds,
                                currentOdds: currentOutcome.odds,
                                change: change,
                                changePercent: (change * 100).toFixed(2),
                                direction: change > 0 ? 'up' : 'down',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }
        }
        
        return movements;
    }

    /**
     * Check if movements create new arbitrage opportunities
     * @param {Array} movements - Detected movements
     * @param {Map} currentOdds - Current odds map
     * @returns {Array} Array of new arbitrage opportunities
     */
    findArbitrageFromMovements(movements, currentOdds) {
        const arbitrageOpportunities = [];
        
        // Group movements by event
        const eventMovements = new Map();
        for (const movement of movements) {
            if (!eventMovements.has(movement.eventKey)) {
                eventMovements.set(movement.eventKey, []);
            }
            eventMovements.get(movement.eventKey).push(movement);
        }
        
        // Check each event with movements for potential arbitrage
        for (const [eventKey, eventMovementsList] of eventMovements) {
            const eventData = currentOdds.get(eventKey);
            if (!eventData) continue;
            
            // Get all bookmakers and their current odds for this event
            const allOutcomes = new Map(); // outcome -> [{bookmaker, odds}]
            
            for (const [bookmakerName, bmData] of eventData.bookmakers) {
                for (const [marketType, marketData] of bmData.markets) {
                    if (marketType !== 'h2h') continue; // Focus on h2h for now
                    
                    for (const [outcomeName, outcomeData] of marketData.outcomes) {
                        if (!allOutcomes.has(outcomeName)) {
                            allOutcomes.set(outcomeName, []);
                        }
                        allOutcomes.get(outcomeName).push({
                            bookmaker: bookmakerName,
                            odds: outcomeData.odds
                        });
                    }
                }
            }
            
            // Check if we have at least 2 outcomes (for tennis, etc.)
            if (allOutcomes.size >= 2) {
                const outcomes = Array.from(allOutcomes.entries());
                
                // Find best odds for each outcome across different bookmakers
                let bestCombo = null;
                let lowestTotalImplied = Infinity;
                
                // For 2-outcome events
                if (outcomes.length === 2) {
                    const [outcome1Name, outcome1Bookmakers] = outcomes[0];
                    const [outcome2Name, outcome2Bookmakers] = outcomes[1];
                    
                    for (const bm1 of outcome1Bookmakers) {
                        for (const bm2 of outcome2Bookmakers) {
                            const implied1 = this.impliedProbability(bm1.odds);
                            const implied2 = this.impliedProbability(bm2.odds);
                            const totalImplied = implied1 + implied2;
                            
                            if (totalImplied < lowestTotalImplied) {
                                lowestTotalImplied = totalImplied;
                                bestCombo = {
                                    legs: [
                                        { outcome: outcome1Name, bookmaker: bm1.bookmaker, odds: bm1.odds },
                                        { outcome: outcome2Name, bookmaker: bm2.bookmaker, odds: bm2.odds }
                                    ],
                                    totalImplied,
                                    profitPercent: (1 - totalImplied) * 100
                                };
                            }
                        }
                    }
                }
                
                // Check if this creates an arbitrage opportunity
                if (bestCombo && bestCombo.totalImplied < 1) {
                    // Check if this was triggered by recent movements
                    const triggeredByMovement = eventMovementsList.some(m => 
                        bestCombo.legs.some(leg => 
                            leg.bookmaker === m.bookmaker && leg.outcome === m.outcome
                        )
                    );
                    
                    if (triggeredByMovement) {
                        arbitrageOpportunities.push({
                            type: 'movement_arbitrage',
                            eventKey,
                            sport: eventData.sport,
                            eventName: eventData.eventName,
                            commenceTime: eventData.commenceTime,
                            profitPercent: parseFloat(bestCombo.profitPercent.toFixed(2)),
                            legs: bestCombo.legs,
                            triggeredBy: eventMovementsList.filter(m => 
                                bestCombo.legs.some(leg => 
                                    leg.bookmaker === m.bookmaker && leg.outcome === m.outcome
                                )
                            ),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }
        
        return arbitrageOpportunities;
    }

    /**
     * Check for +EV opportunities created by movements
     * @param {Array} movements - Detected movements
     * @param {Map} currentOdds - Current odds map
     * @param {string} sharpBookmaker - Name of sharp bookmaker (e.g., 'Pinnacle')
     * @returns {Array} Array of new +EV opportunities
     */
    findEVFromMovements(movements, currentOdds, sharpBookmaker = 'Pinnacle') {
        const evOpportunities = [];
        
        for (const movement of movements) {
            // Only consider odds that moved UP (became more valuable)
            if (movement.direction !== 'up') continue;
            
            const eventData = currentOdds.get(movement.eventKey);
            if (!eventData) continue;
            
            // Find sharp bookmaker odds for this outcome
            let sharpOdds = null;
            for (const [bmName, bmData] of eventData.bookmakers) {
                if (bmName !== sharpBookmaker) continue;
                
                for (const [marketType, marketData] of bmData.markets) {
                    if (marketType !== movement.market) continue;
                    
                    const outcomeData = marketData.outcomes.get(movement.outcome);
                    if (outcomeData) {
                        sharpOdds = outcomeData.odds;
                        break;
                    }
                }
            }
            
            if (!sharpOdds) continue;
            
            // Calculate EV
            const trueProbability = 1 / sharpOdds;
            const ev = (movement.currentOdds * trueProbability) - 1;
            const evPercent = ev * 100;
            
            if (evPercent > (this.config.MIN_EV_THRESHOLD || 5)) {
                evOpportunities.push({
                    type: 'movement_ev',
                    eventKey: movement.eventKey,
                    sport: movement.sport,
                    eventName: movement.eventName,
                    commenceTime: movement.commenceTime,
                    outcome: movement.outcome,
                    bookmaker: movement.bookmaker,
                    odds: movement.currentOdds,
                    sharpOdds: sharpOdds,
                    evPercent: parseFloat(evPercent.toFixed(2)),
                    previousOdds: movement.previousOdds,
                    movementChange: movement.changePercent,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        return evOpportunities;
    }

    /**
     * Main analysis function - compare current data with historical
     * @param {Object} currentData - Current odds data
     * @returns {Object} Analysis results with movements and opportunities
     */
    async analyze(currentData) {
        const startTime = Date.now();
        
        // Load historical data
        const historicalData = await this.loadHistoricalData(this.historyWindow);
        
        if (historicalData.length < 1) {
            console.log('Not enough historical data for movement analysis');
            return {
                timestamp: new Date().toISOString(),
                movements: [],
                arbitrageFromMovements: [],
                evFromMovements: [],
                summary: {
                    totalMovements: 0,
                    significantMovements: 0,
                    newArbitrage: 0,
                    newEV: 0
                }
            };
        }
        
        // Build odds maps
        const currentOdds = this.buildOddsMap(currentData.oddsData);
        const previousData = historicalData[historicalData.length - 1]; // Most recent historical
        const previousOdds = this.buildOddsMap(previousData.oddsData);
        
        // Detect movements
        const movements = this.detectMovements(currentOdds, previousOdds);
        
        // Find opportunities created by movements
        const arbitrageFromMovements = this.findArbitrageFromMovements(movements, currentOdds);
        const evFromMovements = this.findEVFromMovements(movements, currentOdds);
        
        // Count significant movements
        const significantMovements = movements.filter(m => Math.abs(m.change) >= this.movementThreshold);
        
        const result = {
            timestamp: new Date().toISOString(),
            previousTimestamp: previousData.timestamp,
            movements: significantMovements,
            allMovements: movements,
            arbitrageFromMovements,
            evFromMovements,
            summary: {
                totalMovements: movements.length,
                significantMovements: significantMovements.length,
                newArbitrage: arbitrageFromMovements.length,
                newEV: evFromMovements.length,
                analysisTimeMs: Date.now() - startTime
            }
        };
        
        // Save analysis results
        await this.saveAnalysis(result);
        
        return result;
    }

    /**
     * Save analysis results to disk
     * @param {Object} result - Analysis results
     */
    async saveAnalysis(result) {
        try {
            const analysisFile = path.join(this.dataDir, 'movement-analysis.json');
            await fs.writeFile(analysisFile, JSON.stringify(result, null, 2));
            
            // Also append to history
            const historyFile = path.join(this.dataDir, 'movement-history.json');
            let history = [];
            try {
                const existing = await fs.readFile(historyFile, 'utf8');
                history = JSON.parse(existing);
            } catch (e) {
                // File doesn't exist yet
            }
            
            // Keep only last 1000 entries
            history.push({
                timestamp: result.timestamp,
                summary: result.summary
            });
            if (history.length > 1000) {
                history = history.slice(-1000);
            }
            
            await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
        } catch (e) {
            console.error('Error saving movement analysis:', e.message);
        }
    }

    /**
     * Generate alert messages for significant movements
     * @param {Object} analysis - Analysis results
     * @returns {Array} Array of alert messages
     */
    generateAlerts(analysis) {
        const alerts = [];
        
        // Alert on new arbitrage opportunities from movements
        for (const arb of analysis.arbitrageFromMovements) {
            alerts.push({
                priority: 'high',
                type: 'movement_arbitrage',
                message: `🚨 NEW ARBITRAGE from odds movement!\n` +
                         `${arb.eventName}\n` +
                         `Profit: ${arb.profitPercent.toFixed(2)}%\n` +
                         `Legs: ${arb.legs.map(l => `${l.bookmaker} ${l.outcome} @ ${l.odds}`).join(' vs ')}`,
                data: arb
            });
        }
        
        // Alert on significant +EV from movements
        for (const ev of analysis.evFromMovements.slice(0, 5)) { // Top 5 only
            alerts.push({
                priority: 'medium',
                type: 'movement_ev',
                message: `📈 +EV Opportunity from odds movement!\n` +
                         `${ev.eventName} - ${ev.outcome}\n` +
                         `${ev.bookmaker}: ${ev.odds} (was ${ev.previousOdds})\n` +
                         `EV: ${ev.evPercent.toFixed(2)}%`,
                data: ev
            });
        }
        
        // Alert on major individual movements (>30%)
        const majorMovements = analysis.movements.filter(m => Math.abs(m.change) > 0.30);
        for (const movement of majorMovements.slice(0, 3)) { // Top 3 only
            alerts.push({
                priority: 'low',
                type: 'major_movement',
                message: `📊 Major odds movement!\n` +
                         `${movement.eventName}\n` +
                         `${movement.bookmaker} - ${movement.outcome}\n` +
                         `${movement.previousOdds} → ${movement.currentOdds} ` +
                         `(${movement.changePercent}%)`,
                data: movement
            });
        }
        
        return alerts;
    }

    /**
     * Get movement statistics for dashboard
     * @returns {Object} Statistics object
     */
    async getStats() {
        try {
            const historyFile = path.join(this.dataDir, 'movement-history.json');
            const content = await fs.readFile(historyFile, 'utf8');
            const history = JSON.parse(content);
            
            // Calculate stats from last 24h
            const cutoff = Date.now() - (24 * 60 * 60 * 1000);
            const recent = history.filter(h => new Date(h.timestamp).getTime() > cutoff);
            
            return {
                totalAnalyses: history.length,
                analyses24h: recent.length,
                avgMovementsPerAnalysis: recent.length > 0 
                    ? recent.reduce((sum, h) => sum + (h.summary?.significantMovements || 0), 0) / recent.length 
                    : 0,
                totalArbitrageFromMovements: recent.reduce((sum, h) => sum + (h.summary?.newArbitrage || 0), 0),
                totalEVFromMovements: recent.reduce((sum, h) => sum + (h.summary?.newEV || 0), 0),
                lastAnalysis: history[history.length - 1]?.timestamp
            };
        } catch (e) {
            return {
                totalAnalyses: 0,
                analyses24h: 0,
                avgMovementsPerAnalysis: 0,
                totalArbitrageFromMovements: 0,
                totalEVFromMovements: 0,
                lastAnalysis: null
            };
        }
    }
}

module.exports = OddsMovementTracker;
