/**
 * @fileoverview Hedge Calculator Module
 * @description Calculate optimal hedge bets when you already have a position 
 *              and odds have moved favorably or you want to lock in profit/reducer risk.
 * @module surebet-detector/hedge-calculator
 */

const { createLoggerWithAudit, LogLevel } = require('./logger.js');

/**
 * @typedef {Object} ExistingPosition
 * @property {string} id - Unique position identifier
 * @property {string} eventId - Event identifier
 * @property {string} eventName - Event name
 * @property {string} sport - Sport key
 * @property {string} market - Market type (h2h, spreads, totals)
 * @property {string} outcome - Outcome bet on
 * @property {number} stake - Amount staked
 * @property {number} odds - Odds when bet was placed
 * @property {string} bookmaker - Bookmaker used
 * @property {Date} placedAt - When the bet was placed
 * @property {Date} commenceTime - Event start time
 * @property {string} status - Position status (open, partial_hedged, fully_hedged, settled)
 */

/**
 * @typedef {Object} HedgeOpportunity
 * @property {string} positionId - ID of the existing position
 * @property {string} hedgeOutcome - Outcome to hedge on
 * @property {number} hedgeStake - Recommended stake for hedge bet
 * @property {number} hedgeOdds - Current odds for hedge outcome
 * @property {string} hedgeBookmaker - Recommended bookmaker for hedge
 * @property {number} guaranteedProfit - Profit if hedge is placed (guaranteed)
 * @property {number} profitImprovement - Improvement over original position
 * @property {number} hedgeRatio - Ratio of hedge stake to original stake
 * @property {string} strategy - Hedge strategy used
 * @property {Object} scenarios - Profit/loss in different scenarios
 */

/**
 * Hedge Calculator - Calculates optimal hedge bets for existing positions
 */
class HedgeCalculator {
    /**
     * @param {Object} options - Configuration options
     * @param {number} options.minGuaranteedProfit - Minimum guaranteed profit to suggest hedge (default: 0)
     * @param {number} options.maxHedgeRatio - Maximum hedge stake as ratio of original (default: 2.0)
     * @param {number} options.targetProfitLock - Target % of max profit to lock in (default: 0.7)
     * @param {string} options.dataDir - Directory for data storage
     * @param {Object} options.logger - Logger instance
     */
    constructor(options = {}) {
        this.minGuaranteedProfit = options.minGuaranteedProfit || 0;
        this.maxHedgeRatio = options.maxHedgeRatio || 2.0;
        this.targetProfitLock = options.targetProfitLock || 0.70;
        this.dataDir = options.dataDir || './data';
        this.logger = options.logger || console;
        
        // Track open positions
        this.positions = new Map();
        
        // Hedge strategies
        this.strategies = {
            FULL_HEDGE: 'full_hedge',           // Hedge for guaranteed equal profit
            PARTIAL_HEDGE: 'partial_hedge',     // Hedge for reduced risk, higher upside
            PROFIT_LOCK: 'profit_lock',         // Lock in X% of current profit
            RISK_REDUCTION: 'risk_reduction',   // Reduce exposure without guaranteeing profit
            ARBITRAGE_ESCAPE: 'arbitrage_escape' // Escape a position when arbitrage appears
        };
        
        this.initialized = false;
    }

    /**
     * Initialize the calculator
     */
    async init() {
        if (this.initialized) return;
        
        this.logger.info('Initializing Hedge Calculator...', { 
            category: 'hedge-calculator',
            minGuaranteedProfit: this.minGuaranteedProfit,
            maxHedgeRatio: this.maxHedgeRatio,
            targetProfitLock: this.targetProfitLock
        });
        
        // Load existing positions from storage
        await this.loadPositions();
        
        this.initialized = true;
        this.logger.info('Hedge Calculator initialized', { category: 'hedge-calculator' });
    }

    /**
     * Load positions from storage
     */
    async loadPositions() {
        // In a real implementation, load from database/file
        // For now, positions are added programmatically
        this.positions.clear();
    }

    /**
     * Add a new position to track
     * @param {ExistingPosition} position - The position to add
     */
    addPosition(position) {
        const id = position.id || `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        position.id = id;
        position.status = position.status || 'open';
        
        this.positions.set(id, position);
        
        this.logger.info('Position added for hedge tracking', {
            category: 'hedge-calculator',
            positionId: id,
            event: position.eventName,
            stake: position.stake,
            odds: position.odds
        });
        
        return id;
    }

    /**
     * Remove a position
     * @param {string} positionId - Position ID to remove
     */
    removePosition(positionId) {
        const removed = this.positions.delete(positionId);
        if (removed) {
            this.logger.info('Position removed from hedge tracking', {
                category: 'hedge-calculator',
                positionId
            });
        }
        return removed;
    }

    /**
     * Get all tracked positions
     * @returns {ExistingPosition[]}
     */
    getPositions() {
        return Array.from(this.positions.values());
    }

    /**
     * Get a specific position
     * @param {string} positionId 
     * @returns {ExistingPosition|null}
     */
    getPosition(positionId) {
        return this.positions.get(positionId) || null;
    }

    /**
     * Calculate potential profit of original position
     * @param {ExistingPosition} position 
     * @returns {number}
     */
    calculateOriginalProfit(position) {
        return position.stake * (position.odds - 1);
    }

    /**
     * Calculate full hedge - guarantees equal profit regardless of outcome
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds - Current odds for all outcomes
     * @returns {HedgeOpportunity|null}
     */
    calculateFullHedge(position, currentOdds) {
        // For a 2-outcome market (e.g., tennis, basketball without draw)
        const outcomes = Object.keys(currentOdds);
        const hedgeOutcome = outcomes.find(o => o !== position.outcome);
        
        if (!hedgeOutcome) return null;
        
        const hedgeOdds = currentOdds[hedgeOutcome];
        const originalReturn = position.stake * position.odds;
        
        // Calculate hedge stake for equal profit
        // hedgeStake * hedgeOdds = originalReturn - hedgeStake
        // hedgeStake * (hedgeOdds + 1) = originalReturn
        const hedgeStake = originalReturn / (hedgeOdds + 1);
        
        const guaranteedProfit = (originalReturn - hedgeStake) - position.stake;
        
        if (guaranteedProfit < this.minGuaranteedProfit) {
            return null;
        }
        
        const hedgeRatio = hedgeStake / position.stake;
        if (hedgeRatio > this.maxHedgeRatio) {
            return null;
        }
        
        return {
            positionId: position.id,
            hedgeOutcome,
            hedgeStake: parseFloat(hedgeStake.toFixed(2)),
            hedgeOdds,
            hedgeBookmaker: currentOdds.bookmaker || 'Best Available',
            guaranteedProfit: parseFloat(guaranteedProfit.toFixed(2)),
            profitImprovement: parseFloat(((guaranteedProfit / position.stake) * 100).toFixed(2)),
            hedgeRatio: parseFloat(hedgeRatio.toFixed(2)),
            strategy: this.strategies.FULL_HEDGE,
            scenarios: {
                originalWins: {
                    outcome: position.outcome,
                    profit: parseFloat(guaranteedProfit.toFixed(2)),
                    totalReturn: parseFloat((position.stake + guaranteedProfit).toFixed(2))
                },
                hedgeWins: {
                    outcome: hedgeOutcome,
                    profit: parseFloat(guaranteedProfit.toFixed(2)),
                    totalReturn: parseFloat((position.stake + guaranteedProfit).toFixed(2))
                }
            }
        };
    }

    /**
     * Calculate partial hedge - reduces risk while maintaining upside
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds 
     * @param {number} hedgePercent - Percentage of full hedge to apply (0-1)
     * @returns {HedgeOpportunity|null}
     */
    calculatePartialHedge(position, currentOdds, hedgePercent = 0.5) {
        const outcomes = Object.keys(currentOdds).filter(k => k !== 'bookmaker');
        const hedgeOutcome = outcomes.find(o => o !== position.outcome);
        
        if (!hedgeOutcome) return null;
        
        const hedgeOdds = currentOdds[hedgeOutcome];
        const fullHedge = this.calculateFullHedge(position, currentOdds);
        
        if (!fullHedge) return null;
        
        const hedgeStake = fullHedge.hedgeStake * hedgePercent;
        const hedgeRatio = hedgeStake / position.stake;
        
        // Calculate scenarios
        const originalReturn = position.stake * position.odds;
        const hedgeReturn = hedgeStake * hedgeOdds;
        
        const profitIfOriginalWins = (originalReturn - position.stake - hedgeStake);
        const profitIfHedgeWins = (hedgeReturn - position.stake - hedgeStake);
        
        return {
            positionId: position.id,
            hedgeOutcome,
            hedgeStake: parseFloat(hedgeStake.toFixed(2)),
            hedgeOdds,
            hedgeBookmaker: currentOdds.bookmaker || 'Best Available',
            guaranteedProfit: null, // No guaranteed profit with partial hedge
            profitImprovement: null,
            hedgeRatio: parseFloat(hedgeRatio.toFixed(2)),
            strategy: this.strategies.PARTIAL_HEDGE,
            scenarios: {
                originalWins: {
                    outcome: position.outcome,
                    profit: parseFloat(profitIfOriginalWins.toFixed(2)),
                    totalReturn: parseFloat((position.stake + hedgeStake + profitIfOriginalWins).toFixed(2))
                },
                hedgeWins: {
                    outcome: hedgeOutcome,
                    profit: parseFloat(profitIfHedgeWins.toFixed(2)),
                    totalReturn: parseFloat((position.stake + hedgeStake + profitIfHedgeWins).toFixed(2))
                }
            },
            partialHedgePercent: hedgePercent * 100
        };
    }

    /**
     * Calculate profit lock - lock in a percentage of current profit
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds 
     * @returns {HedgeOpportunity|null}
     */
    calculateProfitLock(position, currentOdds) {
        // Calculate current value of position
        const currentValue = this.calculatePositionCurrentValue(position, currentOdds);
        const originalStake = position.stake;
        
        if (currentValue <= originalStake) {
            return null; // No profit to lock
        }
        
        const currentProfit = currentValue - originalStake;
        const targetProfit = currentProfit * this.targetProfitLock;
        
        const outcomes = Object.keys(currentOdds).filter(k => k !== 'bookmaker');
        const hedgeOutcome = outcomes.find(o => o !== position.outcome);
        
        if (!hedgeOutcome) return null;
        
        const hedgeOdds = currentOdds[hedgeOutcome];
        
        // Calculate hedge stake to lock in target profit
        // We want: hedgeStake * hedgeOdds - hedgeStake = targetProfit
        // hedgeStake * (hedgeOdds - 1) = targetProfit
        const hedgeStake = targetProfit / (hedgeOdds - 1);
        const hedgeRatio = hedgeStake / position.stake;
        
        if (hedgeRatio > this.maxHedgeRatio) {
            return null;
        }
        
        const originalReturn = position.stake * position.odds;
        const hedgeReturn = hedgeStake * hedgeOdds;
        
        return {
            positionId: position.id,
            hedgeOutcome,
            hedgeStake: parseFloat(hedgeStake.toFixed(2)),
            hedgeOdds,
            hedgeBookmaker: currentOdds.bookmaker || 'Best Available',
            guaranteedProfit: parseFloat(targetProfit.toFixed(2)),
            profitImprovement: parseFloat(((targetProfit / position.stake) * 100).toFixed(2)),
            hedgeRatio: parseFloat(hedgeRatio.toFixed(2)),
            strategy: this.strategies.PROFIT_LOCK,
            scenarios: {
                originalWins: {
                    outcome: position.outcome,
                    profit: parseFloat((originalReturn - position.stake - hedgeStake).toFixed(2)),
                    totalReturn: parseFloat((originalReturn - hedgeStake).toFixed(2))
                },
                hedgeWins: {
                    outcome: hedgeOutcome,
                    profit: parseFloat((hedgeReturn - position.stake - hedgeStake).toFixed(2)),
                    totalReturn: parseFloat((hedgeReturn - position.stake).toFixed(2))
                }
            },
            profitLockPercent: this.targetProfitLock * 100,
            currentProfit: parseFloat(currentProfit.toFixed(2))
        };
    }

    /**
     * Calculate position's current value based on current odds
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds 
     * @returns {number}
     */
    calculatePositionCurrentValue(position, currentOdds) {
        const currentOddsForOutcome = currentOdds[position.outcome];
        if (!currentOddsForOutcome) return position.stake;
        
        // If odds improved, position has more value
        // If odds worsened, position has less value
        const oddsRatio = currentOddsForOutcome / position.odds;
        return position.stake * oddsRatio;
    }

    /**
     * Calculate all hedge opportunities for a position
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds 
     * @returns {HedgeOpportunity[]}
     */
    calculateHedgeOpportunities(position, currentOdds) {
        const opportunities = [];
        
        // Full hedge
        const fullHedge = this.calculateFullHedge(position, currentOdds);
        if (fullHedge) opportunities.push(fullHedge);
        
        // Partial hedges at different levels
        for (const percent of [0.25, 0.5, 0.75]) {
            const partialHedge = this.calculatePartialHedge(position, currentOdds, percent);
            if (partialHedge) opportunities.push(partialHedge);
        }
        
        // Profit lock
        const profitLock = this.calculateProfitLock(position, currentOdds);
        if (profitLock) opportunities.push(profitLock);
        
        return opportunities.sort((a, b) => {
            // Sort by guaranteed profit (descending), then by hedge ratio (ascending)
            const aProfit = a.guaranteedProfit !== null ? a.guaranteedProfit : -Infinity;
            const bProfit = b.guaranteedProfit !== null ? b.guaranteedProfit : -Infinity;
            
            if (bProfit !== aProfit) return bProfit - aProfit;
            return a.hedgeRatio - b.hedgeRatio;
        });
    }

    /**
     * Find hedge opportunities for all tracked positions
     * @param {Object} allCurrentOdds - Map of eventId -> current odds
     * @returns {Object}
     */
    findHedgeOpportunities(allCurrentOdds) {
        const opportunities = [];
        const positionsAnalyzed = [];
        
        for (const position of this.positions.values()) {
            if (position.status !== 'open') continue;
            
            const currentOdds = allCurrentOdds[position.eventId];
            if (!currentOdds) continue;
            
            const positionOpportunities = this.calculateHedgeOpportunities(position, currentOdds);
            
            if (positionOpportunities.length > 0) {
                opportunities.push({
                    position,
                    opportunities: positionOpportunities,
                    bestOpportunity: positionOpportunities[0]
                });
            }
            
            positionsAnalyzed.push({
                positionId: position.id,
                eventName: position.eventName,
                opportunityCount: positionOpportunities.length
            });
        }
        
        return {
            totalPositions: this.positions.size,
            positionsWithHedges: opportunities.length,
            totalOpportunities: opportunities.reduce((sum, o) => sum + o.opportunities.length, 0),
            opportunities,
            positionsAnalyzed
        };
    }

    /**
     * Calculate hedge for a multi-outcome market (3+ outcomes)
     * @param {ExistingPosition} position 
     * @param {Object} currentOdds 
     * @param {string[]} hedgeOutcomes - Outcomes to hedge on
     * @returns {HedgeOpportunity|null}
     */
    calculateMultiOutcomeHedge(position, currentOdds, hedgeOutcomes) {
        const originalReturn = position.stake * position.odds;
        let totalHedgeStake = 0;
        let totalHedgeReturn = 0;
        
        for (const outcome of hedgeOutcomes) {
            if (outcome === position.outcome) continue;
            
            const odds = currentOdds[outcome];
            if (!odds) continue;
            
            // Calculate stake for this outcome to get equal return
            const stake = originalReturn / (odds + 1);
            totalHedgeStake += stake;
            totalHedgeReturn += stake * odds;
        }
        
        const guaranteedProfit = (originalReturn - totalHedgeStake) - position.stake;
        
        if (guaranteedProfit < this.minGuaranteedProfit) {
            return null;
        }
        
        const hedgeRatio = totalHedgeStake / position.stake;
        if (hedgeRatio > this.maxHedgeRatio) {
            return null;
        }
        
        return {
            positionId: position.id,
            hedgeOutcome: hedgeOutcomes.join(', '),
            hedgeStake: parseFloat(totalHedgeStake.toFixed(2)),
            hedgeOdds: null, // Multiple odds
            hedgeBookmaker: currentOdds.bookmaker || 'Best Available',
            guaranteedProfit: parseFloat(guaranteedProfit.toFixed(2)),
            profitImprovement: parseFloat(((guaranteedProfit / position.stake) * 100).toFixed(2)),
            hedgeRatio: parseFloat(hedgeRatio.toFixed(2)),
            strategy: this.strategies.FULL_HEDGE,
            scenarios: {
                originalWins: {
                    outcome: position.outcome,
                    profit: parseFloat(guaranteedProfit.toFixed(2)),
                    totalReturn: parseFloat((position.stake + guaranteedProfit).toFixed(2))
                },
                hedgeWins: {
                    outcome: `Any of: ${hedgeOutcomes.join(', ')}`,
                    profit: parseFloat(guaranteedProfit.toFixed(2)),
                    totalReturn: parseFloat((position.stake + guaranteedProfit).toFixed(2))
                }
            },
            multiOutcome: true,
            hedgedOutcomes: hedgeOutcomes
        };
    }

    /**
     * Record that a hedge was placed
     * @param {string} positionId 
     * @param {HedgeOpportunity} hedge 
     */
    recordHedgePlaced(positionId, hedge) {
        const position = this.positions.get(positionId);
        if (!position) return false;
        
        position.status = hedge.strategy === this.strategies.FULL_HEDGE ? 
            'fully_hedged' : 'partial_hedged';
        position.hedge = hedge;
        position.hedgedAt = new Date().toISOString();
        
        this.logger.info('Hedge recorded for position', {
            category: 'hedge-calculator',
            positionId,
            hedgeStake: hedge.hedgeStake,
            strategy: hedge.strategy,
            guaranteedProfit: hedge.guaranteedProfit
        });
        
        return true;
    }

    /**
     * Get hedge summary statistics
     * @returns {Object}
     */
    getHedgeSummary() {
        const positions = Array.from(this.positions.values());
        
        const totalPositions = positions.length;
        const openPositions = positions.filter(p => p.status === 'open').length;
        const hedgedPositions = positions.filter(p => 
            p.status === 'partial_hedged' || p.status === 'fully_hedged').length;
        const settledPositions = positions.filter(p => p.status === 'settled').length;
        
        const totalStaked = positions.reduce((sum, p) => sum + p.stake, 0);
        const totalHedged = positions
            .filter(p => p.hedge)
            .reduce((sum, p) => sum + p.hedge.hedgeStake, 0);
        
        const totalGuaranteedProfit = positions
            .filter(p => p.hedge && p.hedge.guaranteedProfit)
            .reduce((sum, p) => sum + p.hedge.guaranteedProfit, 0);
        
        return {
            totalPositions,
            openPositions,
            hedgedPositions,
            settledPositions,
            totalStaked: parseFloat(totalStaked.toFixed(2)),
            totalHedged: parseFloat(totalHedged.toFixed(2)),
            totalGuaranteedProfit: parseFloat(totalGuaranteedProfit.toFixed(2)),
            hedgeCoverage: totalStaked > 0 ? 
                parseFloat(((totalHedged / totalStaked) * 100).toFixed(2)) : 0
        };
    }

    /**
     * Shutdown the calculator
     */
    async shutdown() {
        this.logger.info('Shutting down Hedge Calculator...', { category: 'hedge-calculator' });
        // Save positions to storage
        this.initialized = false;
    }
}

module.exports = { HedgeCalculator };
