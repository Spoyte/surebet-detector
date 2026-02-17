/**
 * @fileoverview Smart Bet Sizing with Risk Limits
 * @description Advanced stake calculation considering multiple risk factors and opportunity quality
 * @module surebet-detector/smart-bet-sizing
 */

/**
 * Smart Bet Sizing Calculator
 * Calculates optimal stakes based on multiple risk factors
 */
class SmartBetSizing {
    constructor(config = {}) {
        this.config = {
            // Bankroll allocation
            maxBankrollPercent: config.maxBankrollPercent || 0.10, // 10% max per bet
            maxDailyExposure: config.maxDailyExposure || 0.25, // 25% max daily
            maxBookmakerExposure: config.maxBookmakerExposure || 0.20, // 20% max per bookmaker
            
            // Kelly settings
            kellyFraction: config.kellyFraction || 0.25, // Quarter Kelly
            minKellyFraction: config.minKellyFraction || 0.05, // Minimum 5% Kelly
            
            // Opportunity quality thresholds
            minProfitPercent: config.minProfitPercent || 1.0, // Minimum 1% for arbitrage
            minEVPercent: config.minEVPercent || 5.0, // Minimum 5% EV
            
            // Time decay (reduce stakes as event approaches)
            timeDecayEnabled: config.timeDecayEnabled !== false,
            timeDecayHours: config.timeDecayHours || 24, // Start decaying 24h before event
            
            // Confidence adjustments
            confidenceEnabled: config.confidenceEnabled !== false,
            
            // Absolute limits
            minStake: config.minStake || 5,
            maxStake: config.maxStake || 1000,
            
            ...config
        };
        
        // Daily tracking
        this.dailyExposure = 0;
        this.dailyLoss = 0;
        this.lastResetDate = new Date().toISOString().split('T')[0];
    }

    /**
     * Reset daily tracking if it's a new day
     */
    checkDailyReset() {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastResetDate !== today) {
            this.dailyExposure = 0;
            this.dailyLoss = 0;
            this.lastResetDate = today;
        }
    }

    /**
     * Calculate smart stake for an arbitrage opportunity
     */
    calculateArbitrageStake(arbOpportunity, bankroll, options = {}) {
        this.checkDailyReset();
        
        const {
            totalBankroll = bankroll.totalBankroll || 0,
            availableBankroll = bankroll.allocations?.available || totalBankroll,
            bookmakers = bankroll.bookmakers || {}
        } = bankroll;

        // Base calculation based on profit percentage
        // Higher profit = higher stake, but with diminishing returns
        const profitPercent = arbOpportunity.profitPercent;
        
        // Profit factor: scales from 0.5 to 1.5 based on profit
        // 1% profit = 0.5x, 5% profit = 1.0x, 10%+ profit = 1.5x
        const profitFactor = Math.min(1.5, Math.max(0.5, profitPercent / 5));
        
        // Calculate base stake as percentage of bankroll
        let baseStake = totalBankroll * this.config.maxBankrollPercent * profitFactor;
        
        // Apply time decay if enabled
        if (this.config.timeDecayEnabled && arbOpportunity.commenceTime) {
            const timeFactor = this.calculateTimeFactor(arbOpportunity.commenceTime);
            baseStake *= timeFactor;
        }
        
        // Check bookmaker constraints
        const bookmakerConstraints = this.checkBookmakerConstraints(
            arbOpportunity.legs,
            bookmakers,
            baseStake
        );
        
        // Adjust stake based on most restrictive bookmaker
        let adjustedStake = baseStake;
        for (const constraint of bookmakerConstraints) {
            if (constraint.maxStake && constraint.maxStake < adjustedStake) {
                adjustedStake = constraint.maxStake;
            }
        }
        
        // Check daily exposure limit
        const remainingDailyExposure = (totalBankroll * this.config.maxDailyExposure) - this.dailyExposure;
        if (adjustedStake > remainingDailyExposure) {
            adjustedStake = Math.max(0, remainingDailyExposure);
        }
        
        // Apply absolute limits
        adjustedStake = Math.max(this.config.minStake, adjustedStake);
        adjustedStake = Math.min(this.config.maxStake, adjustedStake);
        adjustedStake = Math.min(availableBankroll, adjustedStake);
        
        // Round to 2 decimal places
        adjustedStake = Math.round(adjustedStake * 100) / 100;
        
        // Calculate individual stakes
        const stakes = this.distributeArbitrageStakes(arbOpportunity, adjustedStake);
        
        return {
            type: 'arbitrage',
            totalStake: adjustedStake,
            stakes,
            profitPercent,
            expectedProfit: Math.round(adjustedStake * (profitPercent / 100) * 100) / 100,
            profitFactor,
            constraints: bookmakerConstraints,
            riskAssessment: this.assessArbitrageRisk(arbOpportunity, bookmakers),
            canPlace: adjustedStake >= this.config.minStake && 
                      bookmakerConstraints.every(c => c.canPlace)
        };
    }

    /**
     * Calculate smart stake for +EV opportunity
     */
    calculateEVStake(evOpportunity, bankroll, options = {}) {
        this.checkDailyReset();
        
        const {
            totalBankroll = bankroll.totalBankroll || 0,
            availableBankroll = bankroll.allocations?.available || totalBankroll,
            bookmakers = bankroll.bookmakers || {}
        } = bankroll;

        const odds = evOpportunity.odds;
        const trueProbability = evOpportunity.trueProbability / 100;
        const evPercent = evOpportunity.evPercent;
        
        // Kelly Criterion calculation
        // f* = (bp - q) / b
        const b = odds - 1;
        const p = trueProbability;
        const q = 1 - p;
        
        let kellyFraction = (b * p - q) / b;
        
        // Don't bet if Kelly is negative
        if (kellyFraction <= 0) {
            return {
                type: 'ev',
                stake: 0,
                kellyFraction: 0,
                reason: 'Negative Kelly fraction',
                canPlace: false
            };
        }
        
        // Apply fractional Kelly (safety factor)
        let adjustedFraction = kellyFraction * this.config.kellyFraction;
        
        // Ensure minimum Kelly fraction
        adjustedFraction = Math.max(adjustedFraction, this.config.minKellyFraction * kellyFraction);
        
        // Cap at max bankroll percent
        adjustedFraction = Math.min(adjustedFraction, this.config.maxBankrollPercent);
        
        // Calculate base stake
        let baseStake = totalBankroll * adjustedFraction;
        
        // Apply time decay
        if (this.config.timeDecayEnabled && evOpportunity.commenceTime) {
            const timeFactor = this.calculateTimeFactor(evOpportunity.commenceTime);
            baseStake *= timeFactor;
        }
        
        // Get bookmaker constraints
        const bookmakerName = this.normalizeBookmakerName(evOpportunity.bookmaker);
        const bookmaker = bookmakers[bookmakerName];
        const constraints = [];
        
        if (bookmaker) {
            // Check bookmaker max stake
            if (bookmaker.maxStake && baseStake > bookmaker.maxStake) {
                constraints.push({
                    type: 'bookmaker_max',
                    limit: bookmaker.maxStake,
                    adjusted: true
                });
                baseStake = Math.min(baseStake, bookmaker.maxStake);
            }
            
            // Check bookmaker min stake
            if (bookmaker.minStake && baseStake < bookmaker.minStake) {
                constraints.push({
                    type: 'bookmaker_min',
                    limit: bookmaker.minStake,
                    canPlace: false
                });
            }
            
            // Check available funds
            if (bookmaker.available < baseStake) {
                constraints.push({
                    type: 'insufficient_funds',
                    available: bookmaker.available,
                    adjusted: true
                });
                baseStake = Math.min(baseStake, bookmaker.available);
            }
            
            // Check bookmaker exposure limit
            const currentExposure = bookmaker.exposure || 0;
            const maxExposure = totalBankroll * this.config.maxBookmakerExposure;
            if (currentExposure + baseStake > maxExposure) {
                const allowedStake = Math.max(0, maxExposure - currentExposure);
                constraints.push({
                    type: 'exposure_limit',
                    currentExposure,
                    maxExposure,
                    adjusted: true
                });
                baseStake = Math.min(baseStake, allowedStake);
            }
        }
        
        // Check daily exposure limit
        const remainingDailyExposure = (totalBankroll * this.config.maxDailyExposure) - this.dailyExposure;
        if (baseStake > remainingDailyExposure) {
            constraints.push({
                type: 'daily_exposure',
                remaining: remainingDailyExposure,
                adjusted: true
            });
            baseStake = Math.max(0, remainingDailyExposure);
        }
        
        // Apply absolute limits
        baseStake = Math.max(this.config.minStake, baseStake);
        baseStake = Math.min(this.config.maxStake, baseStake);
        baseStake = Math.min(availableBankroll, baseStake);
        
        // Round to 2 decimal places
        baseStake = Math.round(baseStake * 100) / 100;
        
        return {
            type: 'ev',
            stake: baseStake,
            kellyFraction: Math.round(kellyFraction * 100) / 100,
            actualFraction: Math.round(adjustedFraction * 100) / 100,
            expectedValue: Math.round(baseStake * (evPercent / 100) * 100) / 100,
            evPercent,
            constraints,
            riskAssessment: this.assessEVRisk(evOpportunity, bookmaker),
            canPlace: baseStake >= this.config.minStake && 
                      !constraints.some(c => c.canPlace === false)
        };
    }

    /**
     * Calculate time decay factor (reduce stakes as event approaches)
     */
    calculateTimeFactor(commenceTime) {
        const now = new Date();
        const eventTime = new Date(commenceTime);
        const hoursUntil = (eventTime - now) / (1000 * 60 * 60);
        
        if (hoursUntil <= 0) {
            return 0; // Event already started
        }
        
        if (hoursUntil >= this.config.timeDecayHours) {
            return 1.0; // Full stake allowed
        }
        
        // Linear decay from 1.0 to 0.5 as event approaches
        const decayFactor = 0.5 + (0.5 * (hoursUntil / this.config.timeDecayHours));
        return Math.round(decayFactor * 100) / 100;
    }

    /**
     * Check bookmaker constraints for arbitrage
     */
    checkBookmakerConstraints(legs, bookmakers, proposedStake) {
        const constraints = [];
        
        for (const leg of legs) {
            const bookmakerName = this.normalizeBookmakerName(leg.bookmaker);
            const bookmaker = bookmakers[bookmakerName];
            
            if (!bookmaker) {
                constraints.push({
                    bookmaker: leg.bookmaker,
                    type: 'unknown',
                    canPlace: true, // Allow but warn
                    warning: 'Bookmaker not in tracking system'
                });
                continue;
            }
            
            const constraint = {
                bookmaker: leg.bookmaker,
                canPlace: true
            };
            
            // Check if bookmaker is active
            if (!bookmaker.isActive) {
                constraint.canPlace = false;
                constraint.type = 'inactive';
                constraint.reason = 'Bookmaker account is inactive';
                constraints.push(constraint);
                continue;
            }
            
            // Calculate this leg's stake
            const legStake = this.calculateLegStake(leg, legs, proposedStake);
            
            // Check available funds
            if (bookmaker.available < legStake) {
                constraint.canPlace = false;
                constraint.type = 'insufficient_funds';
                constraint.available = bookmaker.available;
                constraint.required = legStake;
                constraint.reason = `Insufficient funds: ${bookmaker.available} available, ${legStake} required`;
                constraints.push(constraint);
                continue;
            }
            
            // Check bookmaker stake limits
            if (bookmaker.minStake && legStake < bookmaker.minStake) {
                constraint.canPlace = false;
                constraint.type = 'below_min';
                constraint.minStake = bookmaker.minStake;
                constraint.reason = `Below minimum stake of ${bookmaker.minStake}`;
                constraints.push(constraint);
                continue;
            }
            
            if (bookmaker.maxStake && legStake > bookmaker.maxStake) {
                constraint.maxStake = bookmaker.maxStake;
                constraint.type = 'above_max';
                constraint.adjusted = true;
            }
            
            // Check exposure limit
            const currentExposure = bookmaker.exposure || 0;
            const maxExposure = (bookmaker.balance || 0) * this.config.maxBookmakerExposure;
            if (currentExposure + legStake > maxExposure) {
                constraint.maxStakeFromExposure = Math.max(0, maxExposure - currentExposure);
                constraint.type = 'exposure_limited';
                constraint.adjusted = true;
            }
            
            constraints.push(constraint);
        }
        
        return constraints;
    }

    /**
     * Calculate individual leg stake for arbitrage
     */
    calculateLegStake(leg, allLegs, totalStake) {
        if (allLegs.length === 2) {
            // Two-outcome: proportional to implied probability
            const odds1 = allLegs[0].odds;
            const odds2 = allLegs[1].odds;
            const implied1 = 1 / odds1;
            const implied2 = 1 / odds2;
            const totalImplied = implied1 + implied2;
            
            if (leg === allLegs[0]) {
                return (totalStake * implied1) / totalImplied;
            } else {
                return (totalStake * implied2) / totalImplied;
            }
        }
        
        // Multi-outcome: equal distribution
        return totalStake / allLegs.length;
    }

    /**
     * Distribute total stake across arbitrage legs
     */
    distributeArbitrageStakes(arbOpportunity, totalStake) {
        const legs = arbOpportunity.legs;
        const stakes = [];
        
        if (legs.length === 2) {
            const odds1 = legs[0].odds;
            const odds2 = legs[1].odds;
            const implied1 = 1 / odds1;
            const implied2 = 1 / odds2;
            const totalImplied = implied1 + implied2;
            
            stakes.push({
                outcome: legs[0].outcome,
                bookmaker: legs[0].bookmaker,
                odds: odds1,
                stake: Math.round(((totalStake * implied1) / totalImplied) * 100) / 100
            });
            
            stakes.push({
                outcome: legs[1].outcome,
                bookmaker: legs[1].bookmaker,
                odds: odds2,
                stake: Math.round(((totalStake * implied2) / totalImplied) * 100) / 100
            });
        } else {
            const stakePerLeg = Math.round((totalStake / legs.length) * 100) / 100;
            for (const leg of legs) {
                stakes.push({
                    outcome: leg.outcome,
                    bookmaker: leg.bookmaker,
                    odds: leg.odds,
                    stake: stakePerLeg
                });
            }
        }
        
        return stakes;
    }

    /**
     * Assess risk for arbitrage opportunity
     */
    assessArbitrageRisk(arbOpportunity, bookmakers) {
        const risks = [];
        
        // Check for palpable error risk (too good to be true)
        if (arbOpportunity.profitPercent > 10) {
            risks.push({
                type: 'palpable_error',
                severity: 'high',
                message: 'Profit >10% - possible palpable error risk'
            });
        }
        
        // Check bookmaker reliability
        for (const leg of arbOpportunity.legs) {
            const bookmakerName = this.normalizeBookmakerName(leg.bookmaker);
            const bookmaker = bookmakers[bookmakerName];
            
            if (!bookmaker) {
                risks.push({
                    type: 'unknown_bookmaker',
                    severity: 'medium',
                    bookmaker: leg.bookmaker,
                    message: `Unknown bookmaker: ${leg.bookmaker}`
                });
            }
        }
        
        // Time risk (short time to event)
        if (arbOpportunity.commenceTime) {
            const hoursUntil = (new Date(arbOpportunity.commenceTime) - new Date()) / (1000 * 60 * 60);
            if (hoursUntil < 1) {
                risks.push({
                    type: 'time_pressure',
                    severity: 'medium',
                    message: 'Less than 1 hour to event - time pressure'
                });
            }
        }
        
        return {
            riskLevel: risks.some(r => r.severity === 'high') ? 'high' : 
                      risks.some(r => r.severity === 'medium') ? 'medium' : 'low',
            risks
        };
    }

    /**
     * Assess risk for +EV opportunity
     */
    assessEVRisk(evOpportunity, bookmaker) {
        const risks = [];
        
        // Check for stale odds
        if (evOpportunity.evPercent > 20) {
            risks.push({
                type: 'high_ev',
                severity: 'medium',
                message: 'EV >20% - verify odds are current'
            });
        }
        
        // Check bookmaker reliability
        if (!bookmaker) {
            risks.push({
                type: 'unknown_bookmaker',
                severity: 'medium',
                message: 'Bookmaker not in tracking system'
            });
        } else if (!bookmaker.isActive) {
            risks.push({
                type: 'inactive_bookmaker',
                severity: 'high',
                message: 'Bookmaker account is inactive'
            });
        }
        
        // Variance risk (high odds = higher variance)
        if (evOpportunity.odds > 5) {
            risks.push({
                type: 'high_variance',
                severity: 'low',
                message: 'High odds - expect higher variance'
            });
        }
        
        return {
            riskLevel: risks.some(r => r.severity === 'high') ? 'high' : 
                      risks.some(r => r.severity === 'medium') ? 'medium' : 'low',
            risks
        };
    }

    /**
     * Record placed bet for daily tracking
     */
    recordBet(stake) {
        this.checkDailyReset();
        this.dailyExposure += stake;
    }

    /**
     * Record settled bet
     */
    recordSettlement(profit) {
        this.checkDailyReset();
        if (profit < 0) {
            this.dailyLoss += Math.abs(profit);
        }
        // Exposure is reduced when bet settles
    }

    /**
     * Get current risk status
     */
    getRiskStatus(bankroll) {
        this.checkDailyReset();
        
        const totalBankroll = bankroll.totalBankroll || 0;
        
        return {
            dailyExposure: this.dailyExposure,
            dailyExposurePercent: totalBankroll > 0 ? (this.dailyExposure / totalBankroll * 100).toFixed(2) : 0,
            dailyLoss: this.dailyLoss,
            dailyLossPercent: totalBankroll > 0 ? (this.dailyLoss / totalBankroll * 100).toFixed(2) : 0,
            maxDailyExposure: this.config.maxDailyExposure * 100,
            remainingExposure: (totalBankroll * this.config.maxDailyExposure) - this.dailyExposure,
            canPlaceBets: this.dailyExposure < (totalBankroll * this.config.maxDailyExposure)
        };
    }

    /**
     * Normalize bookmaker name
     */
    normalizeBookmakerName(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}

module.exports = SmartBetSizing;
