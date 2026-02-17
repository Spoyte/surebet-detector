/**
 * Dutching Calculator
 * 
 * Dutch betting (or Dutching) is a betting strategy where you back multiple outcomes
 * in the same event across different bookmakers to guarantee a profit or minimize loss.
 * Unlike arbitrage which requires finding odds that guarantee profit, Dutching involves
 * calculating optimal stakes to distribute risk across multiple outcomes.
 * 
 * Key concepts:
 * - Equal Profit Dutching: Distribute stakes so all outcomes yield the same profit
 * - Variable Profit Dutching: Allow different profits per outcome based on confidence
 * - Underround Detection: Find when combined implied probability < 100% (guaranteed profit)
 * - Stake Optimization: Minimize total stake while achieving target profit
 */

const logger = require('./logger.js');

class DutchingCalculator {
    constructor(config = {}) {
        this.config = {
            // Minimum profit percentage to consider a Dutching opportunity
            minProfitPercent: config.minProfitPercent || 0.5,
            
            // Maximum number of outcomes to consider (to limit complexity)
            maxOutcomes: config.maxOutcomes || 5,
            
            // Default total stake for calculations
            defaultTotalStake: config.defaultTotalStake || 100,
            
            // Minimum stake per bookmaker (to avoid tiny stakes)
            minStakePerBookmaker: config.minStakePerBookmaker || 5,
            
            // Maximum stake per bookmaker
            maxStakePerBookmaker: config.maxStakePerBookmaker || 10000,
            
            // Round stakes to nearest (for practical betting)
            stakeRounding: config.stakeRounding || 0.5,
            
            // Enable commission calculation for exchanges
            enableCommission: config.enableCommission !== false,
            
            // Default commission rate for exchanges (e.g., Betfair = 5%)
            defaultCommissionRate: config.defaultCommissionRate || 0.05,
            
            // Data directory for persistence
            dataDir: config.dataDir || './data'
        };
        
        this.historicalDutches = [];
    }
    
    /**
     * Initialize the calculator
     */
    async init() {
        logger.info('Initializing DutchingCalculator...');
        logger.info('DutchingCalculator initialized');
        return this;
    }
    
    /**
     * Calculate Dutching stakes for equal profit across all outcomes
     * @param {Array} outcomes - Array of {bookmaker, outcome, odds, commission?}
     * @param {number} totalStake - Total amount to stake across all outcomes
     * @returns {Object} Dutching calculation result
     */
    calculateEqualProfitDutch(outcomes, totalStake = this.config.defaultTotalStake) {
        // Validate inputs
        if (!outcomes || outcomes.length < 2) {
            return { error: 'At least 2 outcomes required for Dutching' };
        }
        
        if (outcomes.length > this.config.maxOutcomes) {
            return { error: `Maximum ${this.config.maxOutcomes} outcomes allowed` };
        }
        
        // Calculate implied probabilities with commission
        const processedOutcomes = outcomes.map(o => {
            const commission = o.commission || 0;
            const effectiveOdds = o.odds * (1 - commission);
            const impliedProb = 1 / effectiveOdds;
            
            return {
                ...o,
                effectiveOdds,
                impliedProb
            };
        });
        
        // Calculate total implied probability (book percentage)
        const totalImpliedProb = processedOutcomes.reduce((sum, o) => sum + o.impliedProb, 0);
        
        // Check if this is an underround (guaranteed profit)
        const isUnderround = totalImpliedProb < 1;
        const bookPercentage = totalImpliedProb * 100;
        
        // Calculate stakes for equal profit
        // stake_i = (totalStake * impliedProb_i) / totalImpliedProb
        const stakes = processedOutcomes.map(o => {
            const rawStake = (totalStake * o.impliedProb) / totalImpliedProb;
            const roundedStake = this.roundStake(rawStake);
            
            return {
                ...o,
                stake: roundedStake,
                potentialReturn: roundedStake * o.odds,
                profit: roundedStake * o.odds - totalStake
            };
        });
        
        // Calculate actual total stake (may differ due to rounding)
        const actualTotalStake = stakes.reduce((sum, s) => sum + s.stake, 0);
        
        // Calculate profit/loss for each outcome (should be equal for equal profit Dutching)
        const profitPerOutcome = stakes[0].potentialReturn - actualTotalStake;
        
        // Calculate profit percentage
        const profitPercent = (profitPerOutcome / actualTotalStake) * 100;
        
        return {
            type: 'equalProfitDutch',
            outcomes: stakes,
            totalStake: actualTotalStake,
            bookPercentage: parseFloat(bookPercentage.toFixed(2)),
            isUnderround,
            profitPerOutcome: parseFloat(profitPerOutcome.toFixed(2)),
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            isProfitable: profitPerOutcome > 0,
            recommendation: this.generateDutchRecommendation(profitPercent, isUnderround)
        };
    }
    
    /**
     * Calculate Dutching stakes with weighted preferences
     * Allows different target profits per outcome based on confidence
     * @param {Array} outcomes - Array of {bookmaker, outcome, odds, weight, commission?}
     * @param {number} totalStake - Total amount to stake
     * @returns {Object} Weighted Dutching calculation
     */
    calculateWeightedDutch(outcomes, totalStake = this.config.defaultTotalStake) {
        if (!outcomes || outcomes.length < 2) {
            return { error: 'At least 2 outcomes required for Dutching' };
        }
        
        // Normalize weights
        const totalWeight = outcomes.reduce((sum, o) => sum + (o.weight || 1), 0);
        
        const processedOutcomes = outcomes.map(o => {
            const weight = (o.weight || 1) / totalWeight;
            const commission = o.commission || 0;
            const effectiveOdds = o.odds * (1 - commission);
            
            // Weighted stake calculation
            const rawStake = totalStake * weight;
            const roundedStake = this.roundStake(rawStake);
            
            return {
                ...o,
                weight,
                effectiveOdds,
                stake: roundedStake,
                potentialReturn: roundedStake * o.odds,
                profit: roundedStake * o.odds - totalStake
            };
        });
        
        const actualTotalStake = processedOutcomes.reduce((sum, s) => sum + s.stake, 0);
        
        // Calculate profit range
        const profits = processedOutcomes.map(o => o.profit);
        const minProfit = Math.min(...profits);
        const maxProfit = Math.max(...profits);
        
        return {
            type: 'weightedDutch',
            outcomes: processedOutcomes,
            totalStake: actualTotalStake,
            minProfit: parseFloat(minProfit.toFixed(2)),
            maxProfit: parseFloat(maxProfit.toFixed(2)),
            profitRange: parseFloat((maxProfit - minProfit).toFixed(2)),
            recommendation: this.generateWeightedDutchRecommendation(minProfit, maxProfit)
        };
    }
    
    /**
     * Find Dutching opportunities in event data
     * @param {Array} oddsData - Array of event data from bookmakers
     * @returns {Array} Array of Dutching opportunities
     */
    findDutchingOpportunities(oddsData) {
        const opportunities = [];
        
        for (const event of oddsData) {
            // Only consider events with 3+ outcomes (sports with draws)
            const h2hMarkets = [];
            
            for (const bookmaker of event.bookmakers) {
                const h2h = bookmaker.markets.find(m => m.type === 'h2h');
                if (h2h && h2h.outcomes.length >= 3) {
                    h2hMarkets.push({
                        bookmaker: bookmaker.name,
                        outcomes: h2h.outcomes
                    });
                }
            }
            
            if (h2hMarkets.length < 2) continue;
            
            // Try to find Dutching opportunities by combining different bookmakers
            const dutchOpps = this.findOptimalDutchCombination(
                event.eventName,
                event.sport,
                event.commenceTime,
                h2hMarkets
            );
            
            opportunities.push(...dutchOpps);
        }
        
        // Sort by profit percentage (highest first)
        opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
        
        return opportunities;
    }
    
    /**
     * Find optimal combination of bookmakers for Dutching
     */
    findOptimalDutchCombination(eventName, sport, commenceTime, h2hMarkets) {
        const opportunities = [];
        const numOutcomes = h2hMarkets[0].outcomes.length;
        
        // For 3-outcome events (e.g., soccer 1X2)
        if (numOutcomes === 3) {
            // Try all combinations of different bookmakers for each outcome
            for (const bookmaker1 of h2hMarkets) {
                for (const bookmaker2 of h2hMarkets) {
                    for (const bookmaker3 of h2hMarkets) {
                        // Ensure we're using different bookmakers
                        if (bookmaker1.bookmaker === bookmaker2.bookmaker ||
                            bookmaker2.bookmaker === bookmaker3.bookmaker ||
                            bookmaker1.bookmaker === bookmaker3.bookmaker) {
                            continue;
                        }
                        
                        const outcomes = [
                            {
                                bookmaker: bookmaker1.bookmaker,
                                outcome: bookmaker1.outcomes[0].name,
                                odds: bookmaker1.outcomes[0].odds
                            },
                            {
                                bookmaker: bookmaker2.bookmaker,
                                outcome: bookmaker2.outcomes[1].name,
                                odds: bookmaker2.outcomes[1].odds
                            },
                            {
                                bookmaker: bookmaker3.bookmaker,
                                outcome: bookmaker3.outcomes[2].name,
                                odds: bookmaker3.outcomes[2].odds
                            }
                        ];
                        
                        const dutch = this.calculateEqualProfitDutch(outcomes);
                        
                        if (dutch.isProfitable && dutch.profitPercent >= this.config.minProfitPercent) {
                            opportunities.push({
                                ...dutch,
                                event: eventName,
                                sport,
                                commenceTime,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }
        }
        
        return opportunities;
    }
    
    /**
     * Calculate stakes needed to achieve a target profit
     * @param {Array} outcomes - Array of outcomes with odds
     * @param {number} targetProfit - Desired profit amount
     * @returns {Object} Stake calculation for target profit
     */
    calculateStakesForTargetProfit(outcomes, targetProfit) {
        // For equal profit Dutching: profit = return - totalStake
        // We want: odds_i * stake_i - totalStake = targetProfit
        // And: sum(stake_i) = totalStake
        // 
        // Solving: stake_i = (targetProfit + totalStake) / odds_i
        // And we know: sum((targetProfit + totalStake) / odds_i) = totalStake
        // Let P = targetProfit + totalStake
        // sum(P / odds_i) = totalStake
        // P * sum(1/odds_i) = totalStake
        // P = totalStake / sum(1/odds_i)
        // 
        // So: totalStake = targetProfit / (1 / sum(1/odds_i) - 1)
        
        const sumInverseOdds = outcomes.reduce((sum, o) => {
            const commission = o.commission || 0;
            const effectiveOdds = o.odds * (1 - commission);
            return sum + (1 / effectiveOdds);
        }, 0);
        
        if (sumInverseOdds >= 1) {
            return {
                error: 'Cannot achieve guaranteed profit with these odds (book percentage >= 100%)',
                sumInverseOdds: parseFloat(sumInverseOdds.toFixed(4))
            };
        }
        
        // totalStake = targetProfit * sumInverseOdds / (1 - sumInverseOdds)
        const totalStake = (targetProfit * sumInverseOdds) / (1 - sumInverseOdds);
        const targetReturn = targetProfit + totalStake;
        
        const stakes = outcomes.map(o => {
            const commission = o.commission || 0;
            const effectiveOdds = o.odds * (1 - commission);
            const rawStake = targetReturn / effectiveOdds;
            const roundedStake = this.roundStake(rawStake);
            
            return {
                ...o,
                stake: roundedStake,
                potentialReturn: roundedStake * o.odds,
                profit: roundedStake * o.odds - roundedStake
            };
        });
        
        const actualTotalStake = stakes.reduce((sum, s) => sum + s.stake, 0);
        const actualProfit = stakes[0].potentialReturn - actualTotalStake;
        
        return {
            type: 'targetProfitDutch',
            outcomes: stakes,
            targetProfit,
            actualProfit: parseFloat(actualProfit.toFixed(2)),
            totalStake: parseFloat(actualTotalStake.toFixed(2)),
            profitPercent: parseFloat(((actualProfit / actualTotalStake) * 100).toFixed(2))
        };
    }
    
    /**
     * Calculate Dutching with exchange lay betting
     * Allows mixing back bets at bookmakers with lay bets at exchanges
     * @param {Array} backBets - Array of back bet outcomes
     * @param {Array} layBets - Array of lay bet outcomes (from exchanges)
     * @param {number} totalStake - Total stake amount
     * @returns {Object} Mixed Dutching calculation
     */
    calculateExchangeDutch(backBets, layBets, totalStake = this.config.defaultTotalStake) {
        // Convert lay odds to effective back odds
        // Lay odds of L is equivalent to backing at odds of L/(L-1)
        const convertedLayBets = layBets.map(lay => {
            const commission = lay.commission || this.config.defaultCommissionRate;
            const effectiveLayOdds = lay.odds / (lay.odds - 1);
            const effectiveOddsAfterCommission = effectiveLayOdds * (1 - commission);
            
            return {
                ...lay,
                type: 'lay',
                originalOdds: lay.odds,
                effectiveOdds: effectiveOddsAfterCommission,
                impliedProb: 1 / effectiveOddsAfterCommission
            };
        });
        
        const allOutcomes = [
            ...backBets.map(b => ({ ...b, type: 'back', impliedProb: 1 / b.odds })),
            ...convertedLayBets
        ];
        
        // Calculate stakes using equal profit method
        const totalImpliedProb = allOutcomes.reduce((sum, o) => sum + o.impliedProb, 0);
        
        const stakes = allOutcomes.map(o => {
            const rawStake = (totalStake * o.impliedProb) / totalImpliedProb;
            const roundedStake = this.roundStake(rawStake);
            
            return {
                ...o,
                stake: roundedStake,
                potentialReturn: o.type === 'back' 
                    ? roundedStake * o.odds 
                    : roundedStake * o.effectiveOdds,
                profit: o.type === 'back'
                    ? roundedStake * o.odds - totalStake
                    : roundedStake * o.effectiveOdds - totalStake
            };
        });
        
        const actualTotalStake = stakes.reduce((sum, s) => sum + s.stake, 0);
        const profitPerOutcome = stakes[0].potentialReturn - actualTotalStake;
        
        return {
            type: 'exchangeDutch',
            outcomes: stakes,
            totalStake: actualTotalStake,
            profitPerOutcome: parseFloat(profitPerOutcome.toFixed(2)),
            profitPercent: parseFloat(((profitPerOutcome / actualTotalStake) * 100).toFixed(2)),
            isProfitable: profitPerOutcome > 0,
            includesLayBets: layBets.length > 0
        };
    }
    
    /**
     * Round stake to nearest configured increment
     */
    roundStake(stake) {
        const rounded = Math.round(stake / this.config.stakeRounding) * this.config.stakeRounding;
        return Math.max(this.config.minStakePerBookmaker, 
                       Math.min(rounded, this.config.maxStakePerBookmaker));
    }
    
    /**
     * Generate recommendation for equal profit Dutching
     */
    generateDutchRecommendation(profitPercent, isUnderround) {
        if (isUnderround) {
            if (profitPercent >= 5) {
                return {
                    rating: 'EXCELLENT',
                    action: 'Strong underround - guaranteed profit opportunity',
                    urgency: 'high'
                };
            } else if (profitPercent >= 2) {
                return {
                    rating: 'GOOD',
                    action: 'Underround found - guaranteed profit',
                    urgency: 'medium'
                };
            } else {
                return {
                    rating: 'MARGINAL',
                    action: 'Small guaranteed profit - consider execution costs',
                    urgency: 'low'
                };
            }
        } else {
            if (profitPercent > 0) {
                return {
                    rating: 'SPECULATIVE',
                    action: 'Positive expected value but not guaranteed',
                    urgency: 'low'
                };
            } else {
                return {
                    rating: 'AVOID',
                    action: 'Negative expected value',
                    urgency: 'none'
                };
            }
        }
    }
    
    /**
     * Generate recommendation for weighted Dutching
     */
    generateWeightedDutchRecommendation(minProfit, maxProfit) {
        if (minProfit > 0) {
            return {
                rating: 'PROFITABLE',
                action: 'All outcomes profitable - excellent Dutch',
                urgency: 'high'
            };
        } else if (maxProfit > 0) {
            return {
                rating: 'BALANCED',
                action: 'Some outcomes profitable - risk management Dutch',
                urgency: 'medium'
            };
        } else {
            return {
                rating: 'HEDGE',
                action: 'Loss minimization strategy',
                urgency: 'low'
            };
        }
    }
    
    /**
     * Validate a Dutching setup
     * @param {Object} dutchResult - Result from a Dutching calculation
     * @returns {Object} Validation result
     */
    validateDutch(dutchResult) {
        const issues = [];
        const warnings = [];
        
        if (dutchResult.error) {
            return { valid: false, error: dutchResult.error };
        }
        
        // Check stake limits
        for (const outcome of dutchResult.outcomes) {
            if (outcome.stake < this.config.minStakePerBookmaker) {
                issues.push(`Stake ${outcome.stake} below minimum ${this.config.minStakePerBookmaker} at ${outcome.bookmaker}`);
            }
            if (outcome.stake > this.config.maxStakePerBookmaker) {
                issues.push(`Stake ${outcome.stake} exceeds maximum ${this.config.maxStakePerBookmaker} at ${outcome.bookmaker}`);
            }
        }
        
        // Check for duplicate bookmakers
        const bookmakers = dutchResult.outcomes.map(o => o.bookmaker);
        const duplicates = bookmakers.filter((item, index) => bookmakers.indexOf(item) !== index);
        if (duplicates.length > 0) {
            warnings.push(`Multiple bets at same bookmaker: ${[...new Set(duplicates)].join(', ')}`);
        }
        
        // Check profit consistency for equal profit Dutching
        if (dutchResult.type === 'equalProfitDutch') {
            const profits = dutchResult.outcomes.map(o => o.profit);
            const profitVariance = this.calculateVariance(profits);
            if (profitVariance > 0.01) {
                warnings.push(`Profits not equal across outcomes (variance: ${profitVariance.toFixed(4)}) - may be due to rounding`);
            }
        }
        
        return {
            valid: issues.length === 0,
            issues,
            warnings,
            bookPercentage: dutchResult.bookPercentage
        };
    }
    
    /**
     * Calculate variance of an array
     */
    calculateVariance(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }
    
    /**
     * Save Dutching opportunity to history
     */
    saveToHistory(dutchOpportunity) {
        this.historicalDutches.push({
            ...dutchOpportunity,
            savedAt: new Date().toISOString()
        });
        
        // Keep only last 1000 entries
        if (this.historicalDutches.length > 1000) {
            this.historicalDutches = this.historicalDutches.slice(-1000);
        }
    }
    
    /**
     * Get historical Dutching statistics
     */
    getHistoricalStats() {
        if (this.historicalDutches.length === 0) {
            return { message: 'No historical data' };
        }
        
        const profitable = this.historicalDutches.filter(d => d.isProfitable);
        const avgProfit = profitable.reduce((sum, d) => sum + d.profitPercent, 0) / profitable.length;
        
        return {
            totalOpportunities: this.historicalDutches.length,
            profitableOpportunities: profitable.length,
            profitabilityRate: (profitable.length / this.historicalDutches.length * 100).toFixed(2) + '%',
            averageProfitPercent: avgProfit ? avgProfit.toFixed(2) + '%' : 'N/A',
            bestProfit: Math.max(...this.historicalDutches.map(d => d.profitPercent)).toFixed(2) + '%'
        };
    }
    
    /**
     * Export Dutching data
     */
    exportData(format = 'json') {
        const data = {
            config: this.config,
            historicalStats: this.getHistoricalStats(),
            recentOpportunities: this.historicalDutches.slice(-100),
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        return data;
    }
}

module.exports = DutchingCalculator;
