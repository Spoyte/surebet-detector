/**
 * Accumulator/Parlay Arbitrage Detector
 * 
 * Accumulator arbitrage (also known as parlay arbitrage or multi-leg arbitrage)
 * involves finding combinations of accumulator bets across different bookmakers
 * where the combined odds create a guaranteed profit situation.
 * 
 * Key Concepts:
 * - Leg Matching: Finding the same events/legs across different bookmaker accumulators
 * - Odds Accumulation: Calculating combined odds for multiple legs
 * - Cross-Book Arbitrage: Combining legs from different bookmakers
 * - Partial Arbitrage: Some legs match, creating reduced-risk opportunities
 * 
 * Types of Accumulator Arbitrage:
 * 1. Full Cross-Book: All legs from different bookmakers with arbitrage
 * 2. Partial Match: Some legs overlap, creating complex arbitrage
 * 3. Exchange Hedging: Using betting exchanges to lay off accumulator legs
 * 4. Price Boost Exploitation: Taking advantage of enhanced accumulator odds
 */

const { createLogger } = require('./logger.js');
const logger = createLogger({ level: 2 });

class AccumulatorArbitrageDetector {
    constructor(config = {}) {
        this.config = {
            // Minimum profit percentage to consider an opportunity
            minProfitPercent: config.minProfitPercent || 1.0,
            
            // Maximum number of legs in an accumulator
            maxLegs: config.maxLegs || 5,
            
            // Minimum number of legs
            minLegs: config.minLegs || 2,
            
            // Maximum total odds for an accumulator
            maxTotalOdds: config.maxTotalOdds || 100,
            
            // Minimum stake for accumulator bets
            minStake: config.minStake || 5,
            
            // Maximum stake for accumulator bets
            maxStake: config.maxStake || 1000,
            
            // Enable exchange lay calculations
            enableExchangeLay: config.enableExchangeLay !== false,
            
            // Commission rate for exchanges
            exchangeCommission: config.exchangeCommission || 0.05,
            
            // Time window for event matching (in hours)
            eventTimeWindow: config.eventTimeWindow || 24,
            
            // Enable partial leg matching
            enablePartialMatching: config.enablePartialMatching !== false,
            
            // Minimum match confidence for leg matching (0-1)
            minMatchConfidence: config.minMatchConfidence || 0.85,
            
            // Data directory
            dataDir: config.dataDir || './data'
        };
        
        this.opportunityHistory = [];
    }
    
    /**
     * Initialize the detector
     */
    async init() {
        logger.info('Initializing AccumulatorArbitrageDetector...');
        logger.info('AccumulatorArbitrageDetector initialized');
        return this;
    }
    
    /**
     * Find accumulator arbitrage opportunities
     * @param {Array} accumulatorData - Array of accumulator offers from bookmakers
     * @param {Array} singleOddsData - Single event odds for leg matching
     * @returns {Array} Array of arbitrage opportunities
     */
    findAccumulatorArbitrage(accumulatorData, singleOddsData) {
        const opportunities = [];
        
        // Build leg index for quick lookup
        const legIndex = this.buildLegIndex(singleOddsData);
        
        // Process each accumulator
        for (const acc of accumulatorData) {
            // Validate accumulator
            if (!this.isValidAccumulator(acc)) continue;
            
            // Find matching legs across bookmakers
            const matchedLegs = this.matchLegs(acc.legs, legIndex);
            
            // Check for full arbitrage
            const fullArb = this.checkFullArbitrage(acc, matchedLegs);
            if (fullArb) {
                opportunities.push(fullArb);
                continue;
            }
            
            // Check for partial arbitrage if enabled
            if (this.config.enablePartialMatching) {
                const partialArb = this.checkPartialArbitrage(acc, matchedLegs);
                if (partialArb) {
                    opportunities.push(partialArb);
                }
            }
            
            // Check for exchange hedging opportunities
            if (this.config.enableExchangeLay) {
                const exchangeArb = this.checkExchangeHedging(acc, matchedLegs);
                if (exchangeArb) {
                    opportunities.push(exchangeArb);
                }
            }
        }
        
        // Sort by profit percentage
        opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
        
        // Save to history
        this.saveOpportunities(opportunities);
        
        return opportunities;
    }
    
    /**
     * Build an index of legs for quick matching
     */
    buildLegIndex(singleOddsData) {
        const index = new Map();
        
        for (const event of singleOddsData) {
            const key = this.generateLegKey(event);
            
            if (!index.has(key)) {
                index.set(key, []);
            }
            
            index.get(key).push({
                eventId: event.id,
                eventName: event.name,
                sport: event.sport,
                commenceTime: event.commenceTime,
                odds: event.odds,
                bookmaker: event.bookmaker
            });
        }
        
        return index;
    }
    
    /**
     * Generate a unique key for leg matching
     */
    generateLegKey(event) {
        // Normalize team names for matching
        const normalize = (str) => str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/fc|united|city|club/g, '');
        
        const homeTeam = normalize(event.homeTeam || event.team1 || '');
        const awayTeam = normalize(event.awayTeam || event.team2 || '');
        const sport = event.sport?.toLowerCase() || '';
        const date = event.commenceTime ? event.commenceTime.split('T')[0] : '';
        
        return `${sport}:${homeTeam}:${awayTeam}:${date}`;
    }
    
    /**
     * Validate accumulator structure
     */
    isValidAccumulator(accumulator) {
        if (!accumulator.legs || !Array.isArray(accumulator.legs)) {
            return false;
        }
        
        const legCount = accumulator.legs.length;
        if (legCount < this.config.minLegs || legCount > this.config.maxLegs) {
            return false;
        }
        
        // Check total odds
        const totalOdds = accumulator.legs.reduce((acc, leg) => acc * leg.odds, 1);
        if (totalOdds > this.config.maxTotalOdds) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Match accumulator legs to single event odds
     */
    matchLegs(legs, legIndex) {
        const matchedLegs = [];
        
        for (const leg of legs) {
            const legKey = this.generateLegKey(leg);
            const matches = legIndex.get(legKey) || [];
            
            // Find best odds for this leg across all bookmakers
            const bestMatches = this.findBestOddsForLeg(leg, matches);
            
            matchedLegs.push({
                originalLeg: leg,
                matches: bestMatches,
                matchConfidence: this.calculateMatchConfidence(leg, bestMatches)
            });
        }
        
        return matchedLegs;
    }
    
    /**
     * Find best odds for a specific leg across available matches
     */
    findBestOddsForLeg(leg, matches) {
        const outcomeMap = new Map();
        
        for (const match of matches) {
            for (const outcome of match.odds) {
                const outcomeKey = outcome.outcome || outcome.name;
                
                if (!outcomeMap.has(outcomeKey)) {
                    outcomeMap.set(outcomeKey, []);
                }
                
                outcomeMap.get(outcomeKey).push({
                    bookmaker: match.bookmaker,
                    odds: outcome.odds,
                    eventId: match.eventId,
                    eventName: match.eventName
                });
            }
        }
        
        // Find best odds for each outcome
        const bestOdds = {};
        for (const [outcome, oddsList] of outcomeMap) {
            bestOdds[outcome] = oddsList.reduce((best, current) => 
                current.odds > best.odds ? current : best
            );
        }
        
        return bestOdds;
    }
    
    /**
     * Calculate confidence score for leg matching
     */
    calculateMatchConfidence(leg, matches) {
        if (Object.keys(matches).length === 0) return 0;
        
        // Check if the leg's outcome is available in matches
        const legOutcome = leg.outcome || leg.selection;
        if (!legOutcome) return 0.5;
        
        const normalizedLegOutcome = legOutcome.toLowerCase().replace(/[^a-z]/g, '');
        
        let maxConfidence = 0;
        for (const [outcomeKey, bestOdds] of Object.entries(matches)) {
            const normalizedOutcome = outcomeKey.toLowerCase().replace(/[^a-z]/g, '');
            
            // Simple string similarity
            if (normalizedOutcome === normalizedLegOutcome) {
                maxConfidence = 1;
                break;
            }
            
            // Check for partial matches
            if (normalizedOutcome.includes(normalizedLegOutcome) ||
                normalizedLegOutcome.includes(normalizedOutcome)) {
                maxConfidence = Math.max(maxConfidence, 0.8);
            }
        }
        
        return maxConfidence;
    }
    
    /**
     * Check for full accumulator arbitrage
     */
    checkFullArbitrage(accumulator, matchedLegs) {
        // Check if all legs have sufficient match confidence
        const allMatched = matchedLegs.every(leg => 
            leg.matchConfidence >= this.config.minMatchConfidence
        );
        
        if (!allMatched) return null;
        
        // Calculate best possible accumulator odds by combining best odds for each leg
        let bestCombinedOdds = 1;
        const optimalLegs = [];
        
        for (const leg of matchedLegs) {
            const legOutcome = leg.originalLeg.outcome || leg.originalLeg.selection;
            const bestOdds = leg.matches[legOutcome];
            
            if (!bestOdds) return null;
            
            bestCombinedOdds *= bestOdds.odds;
            optimalLegs.push({
                event: leg.originalLeg.eventName || leg.originalLeg.name,
                selection: legOutcome,
                bookmaker: bestOdds.bookmaker,
                odds: bestOdds.odds,
                originalOdds: leg.originalLeg.odds
            });
        }
        
        // Calculate implied probability
        const impliedProb = 1 / bestCombinedOdds;
        
        // Check if we can find an opposing accumulator
        // This would require finding another accumulator with combined implied probability < 1
        const opposingOdds = this.findOpposingAccumulator(accumulator, matchedLegs);
        
        if (!opposingOdds) return null;
        
        // Calculate arbitrage
        const totalImpliedProb = impliedProb + (1 / opposingOdds.combinedOdds);
        
        if (totalImpliedProb >= 1) return null;
        
        const profitPercent = (1 - totalImpliedProb) * 100;
        
        if (profitPercent < this.config.minProfitPercent) return null;
        
        return {
            type: 'fullAccumulatorArbitrage',
            accumulator1: {
                bookmaker: accumulator.bookmaker,
                legs: optimalLegs,
                combinedOdds: bestCombinedOdds,
                impliedProbability: impliedProb
            },
            accumulator2: opposingOdds,
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            totalImpliedProbability: parseFloat(totalImpliedProb.toFixed(4)),
            recommendedStakes: this.calculateAccumulatorStakes(
                bestCombinedOdds, 
                opposingOdds.combinedOdds,
                this.config.maxStake
            ),
            timestamp: new Date().toISOString(),
            quality: this.calculateOpportunityQuality(profitPercent, optimalLegs.length)
        };
    }
    
    /**
     * Find an opposing accumulator for arbitrage
     */
    findOpposingAccumulator(accumulator, matchedLegs) {
        // For accumulator arbitrage, we need to find an opposing bet
        // This could be:
        // 1. A different accumulator covering opposite outcomes
        // 2. A lay bet on the exchange
        // 3. Individual lay bets on each leg
        
        // For now, calculate what the opposing odds would need to be
        // In practice, this would search through available accumulators
        
        // Calculate combined odds for opposite outcomes
        let opposingCombinedOdds = 1;
        const opposingLegs = [];
        
        for (const leg of matchedLegs) {
            // Find the opposite outcome
            const legOutcome = leg.originalLeg.outcome || leg.originalLeg.selection;
            const oppositeOutcome = this.getOppositeOutcome(legOutcome);
            
            const oppositeOdds = leg.matches[oppositeOutcome];
            if (!oppositeOdds) return null;
            
            opposingCombinedOdds *= oppositeOdds.odds;
            opposingLegs.push({
                event: leg.originalLeg.eventName || leg.originalLeg.name,
                selection: oppositeOutcome,
                bookmaker: oppositeOdds.bookmaker,
                odds: oppositeOdds.odds
            });
        }
        
        return {
            bookmaker: 'Combined (Multiple)',
            legs: opposingLegs,
            combinedOdds: opposingCombinedOdds,
            impliedProbability: 1 / opposingCombinedOdds
        };
    }
    
    /**
     * Get the opposite outcome for a bet
     */
    getOppositeOutcome(outcome) {
        const opposites = {
            'home': 'away',
            'away': 'home',
            '1': '2',
            '2': '1',
            'over': 'under',
            'under': 'over',
            'yes': 'no',
            'no': 'yes',
            'team1': 'team2',
            'team2': 'team1'
        };
        
        const normalized = outcome.toLowerCase().replace(/[^a-z0-9]/g, '');
        return opposites[normalized] || `not-${outcome}`;
    }
    
    /**
     * Check for partial arbitrage opportunities
     */
    checkPartialArbitrage(accumulator, matchedLegs) {
        // Find legs that have high confidence matches
        const highConfidenceLegs = matchedLegs.filter(leg => 
            leg.matchConfidence >= this.config.minMatchConfidence
        );
        
        if (highConfidenceLegs.length < this.config.minLegs) return null;
        
        // Calculate partial arbitrage value
        let partialValue = 0;
        const arbitrageLegs = [];
        
        for (const leg of highConfidenceLegs) {
            const legOutcome = leg.originalLeg.outcome || leg.originalLeg.selection;
            const bestOdds = leg.matches[legOutcome];
            
            if (bestOdds && bestOdds.odds > leg.originalLeg.odds) {
                const value = (bestOdds.odds / leg.originalLeg.odds) - 1;
                partialValue += value;
                arbitrageLegs.push({
                    event: leg.originalLeg.eventName || leg.originalLeg.name,
                    originalBookmaker: accumulator.bookmaker,
                    originalOdds: leg.originalLeg.odds,
                    betterBookmaker: bestOdds.bookmaker,
                    betterOdds: bestOdds.odds,
                    valuePercent: parseFloat((value * 100).toFixed(2))
                });
            }
        }
        
        if (arbitrageLegs.length === 0) return null;
        
        const avgValuePercent = (partialValue / arbitrageLegs.length) * 100;
        
        return {
            type: 'partialAccumulatorArbitrage',
            originalAccumulator: {
                bookmaker: accumulator.bookmaker,
                totalLegs: accumulator.legs.length,
                combinedOdds: accumulator.legs.reduce((acc, leg) => acc * leg.odds, 1)
            },
            arbitrageLegs,
            legsWithBetterOdds: arbitrageLegs.length,
            averageValuePercent: parseFloat(avgValuePercent.toFixed(2)),
            recommendation: avgValuePercent > 5 ? 
                'Consider splitting accumulator into single bets for better value' :
                'Monitor for better odds on remaining legs',
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Check for exchange hedging opportunities
     */
    checkExchangeHedging(accumulator, matchedLegs) {
        if (!this.config.enableExchangeLay) return null;
        
        // Calculate lay odds needed for profitable hedge
        const accOdds = accumulator.legs.reduce((acc, leg) => acc * leg.odds, 1);
        
        // For exchange lay, we need to lay the accumulator
        // Lay odds should be less than accumulator odds for profit
        const requiredLayOdds = accOdds * (1 - this.config.exchangeCommission);
        
        // In practice, we'd check if exchange offers lay markets for this accumulator
        // or if we can construct a lay through individual leg lays
        
        // Calculate individual leg lay approach
        const legLayOdds = [];
        let canHedge = true;
        
        for (const leg of matchedLegs) {
            const legOutcome = leg.originalLeg.outcome || leg.originalLeg.selection;
            const oppositeOutcome = this.getOppositeOutcome(legOutcome);
            const oppositeOdds = leg.matches[oppositeOutcome];
            
            if (!oppositeOdds) {
                canHedge = false;
                break;
            }
            
            // Convert back odds to effective lay odds
            const effectiveLayOdds = oppositeOdds.odds / (oppositeOdds.odds - 1);
            const layOddsWithCommission = effectiveLayOdds * (1 + this.config.exchangeCommission);
            
            legLayOdds.push({
                event: leg.originalLeg.eventName || leg.originalLeg.name,
                selection: oppositeOutcome,
                backOdds: oppositeOdds.odds,
                effectiveLayOdds: parseFloat(layOddsWithCommission.toFixed(3)),
                bookmaker: oppositeOdds.bookmaker
            });
        }
        
        if (!canHedge || legLayOdds.length === 0) return null;
        
        // Calculate combined lay odds
        const combinedLayOdds = legLayOdds.reduce((acc, leg) => acc * leg.effectiveLayOdds, 1);
        
        // Check if hedge is profitable
        if (combinedLayOdds >= accOdds) return null;
        
        const profitPercent = ((accOdds / combinedLayOdds) - 1) * 100;
        
        if (profitPercent < this.config.minProfitPercent) return null;
        
        return {
            type: 'exchangeHedgeArbitrage',
            accumulator: {
                bookmaker: accumulator.bookmaker,
                odds: accOdds,
                legs: accumulator.legs.length
            },
            hedgeApproach: 'individualLegLay',
            layLegs: legLayOdds,
            combinedLayOdds: parseFloat(combinedLayOdds.toFixed(3)),
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            recommendedStakes: this.calculateHedgeStakes(accOdds, combinedLayOdds),
            timestamp: new Date().toISOString(),
            riskLevel: 'low',
            notes: 'Requires laying each leg individually as accumulator lay markets are rare'
        };
    }
    
    /**
     * Calculate stakes for accumulator arbitrage
     */
    calculateAccumulatorStakes(odds1, odds2, totalStake) {
        // Calculate implied probabilities
        const prob1 = 1 / odds1;
        const prob2 = 1 / odds2;
        const totalProb = prob1 + prob2;
        
        // Stake proportional to implied probability
        const stake1 = (prob1 / totalProb) * totalStake;
        const stake2 = (prob2 / totalProb) * totalStake;
        
        // Calculate guaranteed profit
        const return1 = stake1 * odds1;
        const return2 = stake2 * odds2;
        const profit = Math.min(return1, return2) - totalStake;
        
        return {
            stakeAccumulator1: parseFloat(stake1.toFixed(2)),
            stakeAccumulator2: parseFloat(stake2.toFixed(2)),
            totalStake: parseFloat(totalStake.toFixed(2)),
            guaranteedProfit: parseFloat(profit.toFixed(2)),
            profitPercent: parseFloat(((profit / totalStake) * 100).toFixed(2)),
            returnIfAcc1Wins: parseFloat(return1.toFixed(2)),
            returnIfAcc2Wins: parseFloat(return2.toFixed(2))
        };
    }
    
    /**
     * Calculate stakes for hedge arbitrage
     */
    calculateHedgeStakes(accOdds, layOdds, totalStake = this.config.maxStake) {
        // For back accumulator + lay hedge
        // Stake on accumulator: S
        // Lay stake: S * accOdds / layOdds
        
        const accStake = totalStake / (1 + (accOdds / layOdds));
        const layStake = accStake * accOdds / layOdds;
        
        const accReturn = accStake * accOdds;
        const layLiability = layStake * (layOdds - 1);
        
        // If accumulator wins: return from acc - liability from lay
        const profitIfAccWins = accReturn - layLiability - accStake;
        
        // If accumulator loses: keep lay stake - lose acc stake
        const profitIfAccLoses = layStake - accStake;
        
        return {
            accumulatorStake: parseFloat(accStake.toFixed(2)),
            layStake: parseFloat(layStake.toFixed(2)),
            layLiability: parseFloat(layLiability.toFixed(2)),
            totalExposure: parseFloat((accStake + layLiability).toFixed(2)),
            profitIfAccumulatorWins: parseFloat(profitIfAccWins.toFixed(2)),
            profitIfAccumulatorLoses: parseFloat(profitIfAccLoses.toFixed(2)),
            guaranteedProfit: parseFloat(Math.min(profitIfAccWins, profitIfAccLoses).toFixed(2))
        };
    }
    
    /**
     * Calculate opportunity quality score
     */
    calculateOpportunityQuality(profitPercent, numLegs) {
        // Higher profit = higher quality
        // Fewer legs = higher quality (easier to execute)
        
        let score = profitPercent * 10; // Base score from profit
        
        // Leg complexity penalty
        if (numLegs <= 2) score += 20;
        else if (numLegs <= 3) score += 10;
        else if (numLegs <= 4) score += 0;
        else score -= (numLegs - 4) * 10;
        
        // Quality tiers
        if (score >= 80) return { score: Math.round(score), tier: 'EXCELLENT' };
        if (score >= 60) return { score: Math.round(score), tier: 'GOOD' };
        if (score >= 40) return { score: Math.round(score), tier: 'FAIR' };
        return { score: Math.round(score), tier: 'POOR' };
    }
    
    /**
     * Save opportunities to history
     */
    saveOpportunities(opportunities) {
        for (const opp of opportunities) {
            this.opportunityHistory.push({
                ...opp,
                savedAt: new Date().toISOString()
            });
        }
        
        // Keep only last 1000
        if (this.opportunityHistory.length > 1000) {
            this.opportunityHistory = this.opportunityHistory.slice(-1000);
        }
    }
    
    /**
     * Get statistics on accumulator arbitrage opportunities
     */
    getStatistics() {
        if (this.opportunityHistory.length === 0) {
            return { message: 'No historical data available' };
        }
        
        const byType = {};
        const profitableOpps = this.opportunityHistory.filter(o => o.profitPercent > 0);
        
        for (const opp of this.opportunityHistory) {
            const type = opp.type || 'unknown';
            if (!byType[type]) {
                byType[type] = { count: 0, avgProfit: 0, total: 0 };
            }
            byType[type].count++;
            byType[type].total += opp.profitPercent || 0;
        }
        
        // Calculate averages
        for (const type in byType) {
            byType[type].avgProfit = parseFloat(
                (byType[type].total / byType[type].count).toFixed(2)
            );
            delete byType[type].total;
        }
        
        return {
            totalOpportunities: this.opportunityHistory.length,
            profitableOpportunities: profitableOpps.length,
            profitabilityRate: parseFloat(
                (profitableOpps.length / this.opportunityHistory.length * 100).toFixed(2)
            ),
            byType,
            bestProfit: parseFloat(
                Math.max(...this.opportunityHistory.map(o => o.profitPercent || 0)).toFixed(2)
            ),
            averageProfit: parseFloat(
                (profitableOpps.reduce((sum, o) => sum + o.profitPercent, 0) / 
                 profitableOpps.length).toFixed(2)
            ) || 0
        };
    }
    
    /**
     * Export data
     */
    exportData(format = 'json') {
        const data = {
            config: this.config,
            statistics: this.getStatistics(),
            recentOpportunities: this.opportunityHistory.slice(-100),
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        return data;
    }
}

module.exports = AccumulatorArbitrageDetector;
