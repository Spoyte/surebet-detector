/**
 * @fileoverview Live Match Tracker
 * @description Tracks in-play matches and detects live arbitrage opportunities
 *              as odds fluctuate during games. Supports multiple sports with
 *              different live scoring APIs.
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

/**
 * Live match data structure
 * @typedef {Object} LiveMatch
 * @property {string} id - Unique match identifier
 * @property {string} sport - Sport type
 * @property {string} eventName - Match name (Team A vs Team B)
 * @property {Date} commenceTime - Original start time
 * @property {string} status - Match status (LIVE, HALFTIME, BREAK, etc.)
 * @property {Object} score - Current score
 * @property {number} elapsedTime - Minutes elapsed (if applicable)
 * @property {string} period - Current period (1H, 2H, Q1, Q2, etc.)
 * @property {Array} bookmakers - Active bookmakers offering live odds
 * @property {Date} lastUpdated - Last data update timestamp
 */

/**
 * Live arbitrage opportunity
 * @typedef {Object} LiveArbitrageOpportunity
 * @property {string} matchId - Match identifier
 * @property {string} sport - Sport type
 * @property {string} eventName - Match name
 * @property {string} status - Current match status
 * @property {Object} score - Current score
 * @property {string} market - Betting market type
 * @property {number} profitPercent - Guaranteed profit percentage
 * @property {Array} legs - Individual bets to place
 * @property {number} timeRemaining - Estimated time remaining in match
 * @property {string} urgency - Opportunity urgency (HIGH, MEDIUM, LOW)
 * @property {Date} detectedAt - Detection timestamp
 */

class LiveMatchTracker extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.dataDir = path.join(__dirname, '../data');
        this.liveDir = path.join(this.dataDir, 'live');
        
        // Configuration
        this.updateIntervalMs = config.LIVE_UPDATE_INTERVAL_MS || 5000; // 5 seconds default
        this.minProfitThreshold = config.LIVE_MIN_PROFIT || 1.0; // 1% minimum
        this.maxTimeRemaining = config.LIVE_MAX_TIME_MIN || 90; // 90 minutes max
        
        // State
        this.activeMatches = new Map(); // matchId -> LiveMatch
        this.opportunities = new Map(); // opportunityId -> LiveArbitrageOpportunity
        this.isRunning = false;
        this.updateTimer = null;
        
        // Match status mappings by sport
        this.statusMappings = {
            soccer: {
                LIVE: ['1H', '2H', 'ET', 'PEN'],
                HALFTIME: ['HT'],
                BREAK: ['BREAK'],
                FINISHED: ['FT', 'AET', 'PEN']
            },
            tennis: {
                LIVE: ['SET1', 'SET2', 'SET3', 'SET4', 'SET5', 'TB'],
                BREAK: ['CHANGEOVER', 'BREAK'],
                FINISHED: ['FINISHED']
            },
            basketball: {
                LIVE: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'],
                BREAK: ['Q1_END', 'HALFTIME', 'Q3_END'],
                FINISHED: ['FINISHED']
            }
        };
    }

    /**
     * Initialize the tracker
     */
    async init() {
        try {
            await fs.mkdir(this.liveDir, { recursive: true });
            console.log('📡 Live Match Tracker initialized');
        } catch (e) {
            console.error('Failed to initialize live tracker:', e.message);
        }
    }

    /**
     * Start live tracking
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('▶️  Live Match Tracker started');
        
        // Immediate first update
        this.update();
        
        // Schedule regular updates
        this.updateTimer = setInterval(() => this.update(), this.updateIntervalMs);
        
        this.emit('started');
    }

    /**
     * Stop live tracking
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
        console.log('⏹️  Live Match Tracker stopped');
        this.emit('stopped');
    }

    /**
     * Main update loop - fetch live data and detect opportunities
     */
    async update() {
        try {
            // Fetch live matches from all sources
            const liveMatches = await this.fetchLiveMatches();
            
            // Update internal state
            this.updateMatchState(liveMatches);
            
            // Detect arbitrage opportunities
            const newOpportunities = this.detectLiveArbitrage();
            
            // Process new opportunities
            for (const opp of newOpportunities) {
                if (!this.opportunities.has(opp.id)) {
                    this.opportunities.set(opp.id, opp);
                    this.emit('opportunity', opp);
                }
            }
            
            // Clean up expired opportunities
            this.cleanupExpiredOpportunities();
            
            // Persist state
            await this.saveState();
            
            this.emit('update', {
                matches: this.activeMatches.size,
                opportunities: this.opportunities.size
            });
            
        } catch (e) {
            console.error('Live update error:', e.message);
            this.emit('error', e);
        }
    }

    /**
     * Fetch live matches from configured sources
     * @returns {Array} Array of live match data
     */
    async fetchLiveMatches() {
        const matches = [];
        
        // Fetch from The Odds API live endpoint
        const oddsMatches = await this.fetchFromOddsAPI();
        matches.push(...oddsMatches);
        
        // Could add more sources here:
        // - SportRadar
        // - Bet365 API
        // - Pinnacle API
        // - Custom scrapers
        
        return matches;
    }

    /**
     * Fetch live matches from The Odds API
     * @returns {Array} Live matches
     */
    async fetchFromOddsAPI() {
        const matches = [];
        
        if (!this.config.ODDS_API_KEY) {
            return matches;
        }
        
        const sports = (this.config.SPORTS || 'soccer,tennis,basketball').split(',');
        
        for (const sport of sports) {
            try {
                const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${this.config.ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal&live=true`;
                
                const response = await fetch(url);
                if (!response.ok) continue;
                
                const data = await response.json();
                
                for (const match of data) {
                    matches.push({
                        id: match.id,
                        sport: sport,
                        eventName: `${match.home_team} vs ${match.away_team}`,
                        commenceTime: new Date(match.commence_time),
                        status: this.normalizeStatus(sport, match.status),
                        score: match.scores || {},
                        elapsedTime: this.calculateElapsedTime(match),
                        period: match.status,
                        bookmakers: match.bookmakers.map(bm => ({
                            name: bm.title,
                            lastUpdate: new Date(bm.last_update),
                            markets: bm.markets.map(m => ({
                                type: m.key,
                                outcomes: m.outcomes.map(o => ({
                                    name: o.name,
                                    odds: o.price,
                                    impliedProbability: 1 / o.price
                                }))
                            }))
                        })),
                        lastUpdated: new Date()
                    });
                }
            } catch (e) {
                console.warn(`Failed to fetch live ${sport}:`, e.message);
            }
        }
        
        return matches;
    }

    /**
     * Normalize status across different APIs
     * @param {string} sport - Sport type
     * @param {string} apiStatus - Raw API status
     * @returns {string} Normalized status
     */
    normalizeStatus(sport, apiStatus) {
        const mappings = this.statusMappings[sport];
        if (!mappings) return 'UNKNOWN';
        
        const status = apiStatus?.toUpperCase();
        
        for (const [normalized, variants] of Object.entries(mappings)) {
            if (variants.includes(status)) return normalized;
        }
        
        return 'UNKNOWN';
    }

    /**
     * Calculate elapsed time from match data
     * @param {Object} match - Match data
     * @returns {number} Minutes elapsed
     */
    calculateElapsedTime(match) {
        if (!match.commence_time) return 0;
        
        const start = new Date(match.commence_time);
        const now = new Date();
        const elapsed = Math.floor((now - start) / (1000 * 60));
        
        return Math.max(0, elapsed);
    }

    /**
     * Update internal match state
     * @param {Array} matches - New match data
     */
    updateMatchState(matches) {
        const currentIds = new Set();
        
        for (const match of matches) {
            currentIds.add(match.id);
            
            const existing = this.activeMatches.get(match.id);
            if (existing) {
                // Update existing match
                match.firstSeen = existing.firstSeen;
                match.oddsHistory = existing.oddsHistory || [];
                
                // Track odds changes
                if (existing.bookmakers) {
                    const changes = this.detectOddsChanges(existing, match);
                    if (changes.length > 0) {
                        match.oddsHistory.push({
                            timestamp: new Date(),
                            changes
                        });
                        this.emit('oddsChange', { matchId: match.id, changes });
                    }
                }
            } else {
                // New match
                match.firstSeen = new Date();
                match.oddsHistory = [];
                this.emit('matchStarted', match);
            }
            
            this.activeMatches.set(match.id, match);
        }
        
        // Remove finished matches
        for (const [id, match] of this.activeMatches) {
            if (!currentIds.has(id) || match.status === 'FINISHED') {
                this.activeMatches.delete(id);
                this.emit('matchEnded', match);
            }
        }
    }

    /**
     * Detect odds changes between two match states
     * @param {Object} previous - Previous match state
     * @param {Object} current - Current match state
     * @returns {Array} Array of odds changes
     */
    detectOddsChanges(previous, current) {
        const changes = [];
        
        for (const currBm of current.bookmakers) {
            const prevBm = previous.bookmakers.find(bm => bm.name === currBm.name);
            if (!prevBm) continue;
            
            for (const currMarket of currBm.markets) {
                const prevMarket = prevBm.markets.find(m => m.type === currMarket.type);
                if (!prevMarket) continue;
                
                for (const currOutcome of currMarket.outcomes) {
                    const prevOutcome = prevMarket.outcomes.find(o => o.name === currOutcome.name);
                    if (!prevOutcome) continue;
                    
                    const change = ((currOutcome.odds - prevOutcome.odds) / prevOutcome.odds);
                    
                    if (Math.abs(change) > 0.05) { // 5% threshold
                        changes.push({
                            bookmaker: currBm.name,
                            market: currMarket.type,
                            outcome: currOutcome.name,
                            previousOdds: prevOutcome.odds,
                            currentOdds: currOutcome.odds,
                            changePercent: change * 100
                        });
                    }
                }
            }
        }
        
        return changes;
    }

    /**
     * Detect live arbitrage opportunities
     * @returns {Array} Array of opportunities
     */
    detectLiveArbitrage() {
        const opportunities = [];
        
        for (const [matchId, match] of this.activeMatches) {
            // Skip if match is not live
            if (match.status !== 'LIVE' && match.status !== 'HALFTIME') continue;
            
            // Get all available markets
            const markets = this.extractMarkets(match);
            
            for (const [marketKey, outcomes] of markets) {
                const opp = this.findArbitrageForMarket(match, marketKey, outcomes);
                if (opp) {
                    opportunities.push(opp);
                }
            }
        }
        
        return opportunities;
    }

    /**
     * Extract all markets from a match
     * @param {Object} match - Match data
     * @returns {Map} Market key -> outcomes map
     */
    extractMarkets(match) {
        const markets = new Map();
        
        for (const bm of match.bookmakers) {
            for (const market of bm.markets) {
                const key = market.type;
                
                if (!markets.has(key)) {
                    markets.set(key, new Map());
                }
                
                const marketOutcomes = markets.get(key);
                
                for (const outcome of market.outcomes) {
                    if (!marketOutcomes.has(outcome.name)) {
                        marketOutcomes.set(outcome.name, []);
                    }
                    
                    marketOutcomes.get(outcome.name).push({
                        bookmaker: bm.name,
                        odds: outcome.odds,
                        lastUpdate: bm.lastUpdate
                    });
                }
            }
        }
        
        return markets;
    }

    /**
     * Find arbitrage for a specific market
     * @param {Object} match - Match data
     * @param {string} marketKey - Market identifier
     * @param {Map} outcomes - Outcomes map
     * @returns {LiveArbitrageOpportunity|null}
     */
    findArbitrageForMarket(match, marketKey, outcomes) {
        const outcomeEntries = Array.from(outcomes.entries());
        
        // Need at least 2 outcomes for arbitrage
        if (outcomeEntries.length < 2) return null;
        
        // Find best combination
        let bestCombo = null;
        let lowestTotalImplied = Infinity;
        
        if (outcomeEntries.length === 2) {
            // Two-outcome market (e.g., tennis, basketball)
            const [out1Name, out1Bookmakers] = outcomeEntries[0];
            const [out2Name, out2Bookmakers] = outcomeEntries[1];
            
            for (const bm1 of out1Bookmakers) {
                for (const bm2 of out2Bookmakers) {
                    const implied1 = 1 / bm1.odds;
                    const implied2 = 1 / bm2.odds;
                    const totalImplied = implied1 + implied2;
                    
                    if (totalImplied < lowestTotalImplied) {
                        lowestTotalImplied = totalImplied;
                        bestCombo = {
                            legs: [
                                { outcome: out1Name, bookmaker: bm1.bookmaker, odds: bm1.odds },
                                { outcome: out2Name, bookmaker: bm2.bookmaker, odds: bm2.odds }
                            ],
                            totalImplied
                        };
                    }
                }
            }
        } else if (outcomeEntries.length === 3) {
            // Three-outcome market (e.g., soccer 1X2)
            const [out1Name, out1Bookmakers] = outcomeEntries[0];
            const [out2Name, out2Bookmakers] = outcomeEntries[1];
            const [out3Name, out3Bookmakers] = outcomeEntries[2];
            
            for (const bm1 of out1Bookmakers) {
                for (const bm2 of out2Bookmakers) {
                    for (const bm3 of out3Bookmakers) {
                        const implied1 = 1 / bm1.odds;
                        const implied2 = 1 / bm2.odds;
                        const implied3 = 1 / bm3.odds;
                        const totalImplied = implied1 + implied2 + implied3;
                        
                        if (totalImplied < lowestTotalImplied) {
                            lowestTotalImplied = totalImplied;
                            bestCombo = {
                                legs: [
                                    { outcome: out1Name, bookmaker: bm1.bookmaker, odds: bm1.odds },
                                    { outcome: out2Name, bookmaker: bm2.bookmaker, odds: bm2.odds },
                                    { outcome: out3Name, bookmaker: bm3.bookmaker, odds: bm3.odds }
                                ],
                                totalImplied
                            };
                        }
                    }
                }
            }
        }
        
        // Check if arbitrage exists
        if (!bestCombo || lowestTotalImplied >= 1) return null;
        
        const profitPercent = (1 - lowestTotalImplied) * 100;
        
        // Check minimum profit threshold
        if (profitPercent < this.minProfitThreshold) return null;
        
        // Calculate urgency based on time remaining
        const timeRemaining = this.estimateTimeRemaining(match);
        const urgency = this.calculateUrgency(timeRemaining, profitPercent);
        
        return {
            id: `${match.id}:${marketKey}:${Date.now()}`,
            matchId: match.id,
            sport: match.sport,
            eventName: match.eventName,
            status: match.status,
            score: match.score,
            period: match.period,
            market: marketKey,
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            legs: bestCombo.legs,
            timeRemaining,
            urgency,
            detectedAt: new Date(),
            expiresAt: new Date(Date.now() + 30000) // 30 second validity
        };
    }

    /**
     * Estimate time remaining in match
     * @param {Object} match - Match data
     * @returns {number} Estimated minutes remaining
     */
    estimateTimeRemaining(match) {
        const sportDefaults = {
            soccer: { total: 90, halves: 2 },
            tennis: { total: 120, variable: true },
            basketball: { total: 48, quarters: 4 }
        };
        
        const defaults = sportDefaults[match.sport];
        if (!defaults) return 45; // Default fallback
        
        if (match.elapsedTime) {
            return Math.max(0, defaults.total - match.elapsedTime);
        }
        
        // Estimate based on period
        if (match.period) {
            const period = match.period.toUpperCase();
            if (period.includes('2H') || period.includes('Q3') || period.includes('Q4')) {
                return Math.floor(defaults.total / 2);
            }
        }
        
        return defaults.total;
    }

    /**
     * Calculate opportunity urgency
     * @param {number} timeRemaining - Minutes remaining
     * @param {number} profitPercent - Profit percentage
     * @returns {string} Urgency level
     */
    calculateUrgency(timeRemaining, profitPercent) {
        if (timeRemaining < 10 || profitPercent > 5) return 'HIGH';
        if (timeRemaining < 30 || profitPercent > 2) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Clean up expired opportunities
     */
    cleanupExpiredOpportunities() {
        const now = new Date();
        
        for (const [id, opp] of this.opportunities) {
            if (opp.expiresAt && now > new Date(opp.expiresAt)) {
                this.opportunities.delete(id);
                this.emit('opportunityExpired', opp);
            }
        }
    }

    /**
     * Save current state to disk
     */
    async saveState() {
        try {
            const state = {
                timestamp: new Date().toISOString(),
                matches: Array.from(this.activeMatches.values()),
                opportunities: Array.from(this.opportunities.values())
            };
            
            const filepath = path.join(this.liveDir, `live_state_${Date.now()}.json`);
            await fs.writeFile(filepath, JSON.stringify(state, null, 2));
            
            // Keep only last 10 state files
            const files = await fs.readdir(this.liveDir);
            const stateFiles = files
                .filter(f => f.startsWith('live_state_'))
                .sort()
                .reverse();
            
            for (const file of stateFiles.slice(10)) {
                await fs.unlink(path.join(this.liveDir, file)).catch(() => {});
            }
        } catch (e) {
            console.warn('Failed to save live state:', e.message);
        }
    }

    /**
     * Get current active matches
     * @returns {Array} Active matches
     */
    getActiveMatches() {
        return Array.from(this.activeMatches.values());
    }

    /**
     * Get current opportunities
     * @returns {Array} Active opportunities
     */
    getOpportunities() {
        return Array.from(this.opportunities.values());
    }

    /**
     * Get tracker statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            activeMatches: this.activeMatches.size,
            activeOpportunities: this.opportunities.size,
            updateIntervalMs: this.updateIntervalMs,
            minProfitThreshold: this.minProfitThreshold
        };
    }

    /**
     * Get match by ID
     * @param {string} matchId - Match identifier
     * @returns {LiveMatch|null}
     */
    getMatch(matchId) {
        return this.activeMatches.get(matchId) || null;
    }

    /**
     * Get opportunity by ID
     * @param {string} opportunityId - Opportunity identifier
     * @returns {LiveArbitrageOpportunity|null}
     */
    getOpportunity(opportunityId) {
        return this.opportunities.get(opportunityId) || null;
    }
}

module.exports = LiveMatchTracker;
