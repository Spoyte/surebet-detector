/**
 * @fileoverview Bankroll Management System
 * @description Tracks total bankroll, allocates funds per bookmaker, calculates optimal stakes
 * @module surebet-detector/bankroll-manager
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const SmartBetSizing = require('./smart-bet-sizing');
const { MultiCurrencyManager } = require('./multi-currency-manager');

/**
 * Bankroll Manager - Comprehensive bankroll tracking and stake calculation
 */
class BankrollManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            dataDir: config.dataDir || path.join(__dirname, '../../data'),
            defaultCurrency: config.defaultCurrency || 'EUR',
            maxExposurePerBookmaker: config.maxExposurePerBookmaker || 0.25, // 25% max per bookmaker
            maxExposurePerBet: config.maxExposurePerBet || 0.10, // 10% max per bet
            maxDailyLoss: config.maxDailyLoss || 0.05, // 5% max daily loss
            kellyFraction: config.kellyFraction || 0.25, // Quarter Kelly for safety
            minStake: config.minStake || 5, // Minimum stake amount
            maxStake: config.maxStake || 1000, // Maximum stake amount
            ...config
        };
        
        this.dataFile = path.join(this.config.dataDir, 'bankroll.json');
        this.betsFile = path.join(this.config.dataDir, 'bets.json');
        
        // Initialize smart bet sizing
        this.smartSizing = new SmartBetSizing({
            maxBankrollPercent: this.config.maxExposurePerBet,
            maxDailyExposure: 0.25,
            maxBookmakerExposure: this.config.maxExposurePerBookmaker,
            kellyFraction: this.config.kellyFraction,
            minStake: this.config.minStake,
            maxStake: this.config.maxStake
        });
        
        // In-memory state
        this.bankroll = null;
        this.pendingBets = new Map();
        this.dailyStats = {
            date: new Date().toISOString().split('T')[0],
            totalStaked: 0,
            totalProfit: 0,
            betsPlaced: 0,
            betsWon: 0,
            betsLost: 0
        };
        
        // Initialize multi-currency manager
        this.currencyManager = new MultiCurrencyManager({
            dataDir: this.config.dataDir,
            baseCurrency: this.config.defaultCurrency
        });
    }

    /**
     * Initialize the bankroll manager
     */
    async init() {
        await this.loadBankroll();
        await this.loadPendingBets();
        await this.currencyManager.init();
        this.resetDailyStatsIfNeeded();
        console.log('💰 Bankroll Manager initialized');
    }

    /**
     * Load bankroll data from disk
     */
    async loadBankroll() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            this.bankroll = JSON.parse(data);
        } catch (error) {
            // Initialize default bankroll structure
            this.bankroll = this.getDefaultBankroll();
            await this.saveBankroll();
        }
    }

    /**
     * Load pending bets from disk
     */
    async loadPendingBets() {
        try {
            const data = await fs.readFile(this.betsFile, 'utf8');
            const bets = JSON.parse(data);
            this.pendingBets = new Map(bets.pending || []);
        } catch (error) {
            this.pendingBets = new Map();
        }
    }

    /**
     * Get default bankroll structure
     */
    getDefaultBankroll() {
        return {
            version: 1,
            lastUpdated: new Date().toISOString(),
            totalBankroll: 0,
            currency: this.config.defaultCurrency,
            bookmakers: {},
            allocations: {
                reserved: 0, // Funds reserved for pending bets
                available: 0 // Funds available for new bets
            },
            limits: {
                maxExposurePerBookmaker: this.config.maxExposurePerBookmaker,
                maxExposurePerBet: this.config.maxExposurePerBet,
                maxDailyLoss: this.config.maxDailyLoss,
                kellyFraction: this.config.kellyFraction,
                minStake: this.config.minStake,
                maxStake: this.config.maxStake
            },
            history: []
        };
    }

    /**
     * Save bankroll to disk
     */
    async saveBankroll() {
        try {
            await fs.mkdir(this.config.dataDir, { recursive: true });
            this.bankroll.lastUpdated = new Date().toISOString();
            await fs.writeFile(this.dataFile, JSON.stringify(this.bankroll, null, 2));
        } catch (error) {
            console.error('Failed to save bankroll:', error.message);
        }
    }

    /**
     * Save pending bets to disk
     */
    async savePendingBets() {
        try {
            await fs.mkdir(this.config.dataDir, { recursive: true });
            const data = {
                lastUpdated: new Date().toISOString(),
                pending: Array.from(this.pendingBets.entries())
            };
            await fs.writeFile(this.betsFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save pending bets:', error.message);
        }
    }

    /**
     * Reset daily stats if it's a new day
     */
    resetDailyStatsIfNeeded() {
        const today = new Date().toISOString().split('T')[0];
        if (this.dailyStats.date !== today) {
            // Archive old stats
            if (this.bankroll.history) {
                this.bankroll.history.push({ ...this.dailyStats });
                // Keep only last 90 days
                if (this.bankroll.history.length > 90) {
                    this.bankroll.history = this.bankroll.history.slice(-90);
                }
            }
            
            this.dailyStats = {
                date: today,
                totalStaked: 0,
                totalProfit: 0,
                betsPlaced: 0,
                betsWon: 0,
                betsLost: 0
            };
        }
    }

    // ==================== BANKROLL OPERATIONS ====================

    /**
     * Set total bankroll amount
     */
    async setTotalBankroll(amount, currency = null) {
        if (amount < 0) {
            throw new Error('Bankroll cannot be negative');
        }
        
        this.bankroll.totalBankroll = amount;
        if (currency) {
            this.bankroll.currency = currency;
        }
        
        this.recalculateAllocations();
        await this.saveBankroll();
        
        this.emit('bankrollUpdated', {
            total: amount,
            currency: this.bankroll.currency,
            available: this.bankroll.allocations.available
        });
        
        return this.getBankrollSummary();
    }

    /**
     * Add funds to bankroll
     */
    async addFunds(amount, note = '') {
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        
        this.bankroll.totalBankroll += amount;
        this.recalculateAllocations();
        await this.saveBankroll();
        
        this.emit('fundsAdded', { amount, note, newTotal: this.bankroll.totalBankroll });
        
        return this.getBankrollSummary();
    }

    /**
     * Withdraw funds from bankroll
     */
    async withdrawFunds(amount, note = '') {
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        
        const available = this.bankroll.totalBankroll - this.bankroll.allocations.reserved;
        if (amount > available) {
            throw new Error(`Cannot withdraw ${amount}. Only ${available} available (excluding reserved funds)`);
        }
        
        this.bankroll.totalBankroll -= amount;
        this.recalculateAllocations();
        await this.saveBankroll();
        
        this.emit('fundsWithdrawn', { amount, note, newTotal: this.bankroll.totalBankroll });
        
        return this.getBankrollSummary();
    }

    // ==================== BOOKMAKER MANAGEMENT ====================

    /**
     * Add or update a bookmaker account
     */
    async setBookmaker(name, balance, currency = null, metadata = {}) {
        const normalizedName = this.normalizeBookmakerName(name);
        
        this.bankroll.bookmakers[normalizedName] = {
            name: normalizedName,
            displayName: metadata.displayName || name,
            balance: balance,
            currency: currency || this.bankroll.currency,
            exposure: 0, // Current exposure (pending bets)
            available: balance, // Available for betting
            maxStake: metadata.maxStake || null,
            minStake: metadata.minStake || null,
            isActive: metadata.isActive !== false,
            notes: metadata.notes || '',
            lastUpdated: new Date().toISOString()
        };
        
        this.recalculateAllocations();
        await this.saveBankroll();
        
        this.emit('bookmakerUpdated', { name: normalizedName, balance });
        
        return this.bankroll.bookmakers[normalizedName];
    }

    /**
     * Remove a bookmaker
     */
    async removeBookmaker(name) {
        const normalizedName = this.normalizeBookmakerName(name);
        
        if (!this.bankroll.bookmakers[normalizedName]) {
            throw new Error(`Bookmaker ${name} not found`);
        }
        
        const bookmaker = this.bankroll.bookmakers[normalizedName];
        if (bookmaker.exposure > 0) {
            throw new Error(`Cannot remove ${name} with pending exposure of ${bookmaker.exposure}`);
        }
        
        delete this.bankroll.bookmakers[normalizedName];
        await this.saveBankroll();
        
        this.emit('bookmakerRemoved', { name: normalizedName });
        
        return true;
    }

    /**
     * Update bookmaker balance
     */
    async updateBookmakerBalance(name, newBalance) {
        const normalizedName = this.normalizeBookmakerName(name);
        
        if (!this.bankroll.bookmakers[normalizedName]) {
            throw new Error(`Bookmaker ${name} not found`);
        }
        
        const bookmaker = this.bankroll.bookmakers[normalizedName];
        const oldBalance = bookmaker.balance;
        bookmaker.balance = newBalance;
        bookmaker.available = newBalance - bookmaker.exposure;
        bookmaker.lastUpdated = new Date().toISOString();
        
        await this.saveBankroll();
        
        this.emit('balanceUpdated', { 
            name: normalizedName, 
            oldBalance, 
            newBalance,
            difference: newBalance - oldBalance
        });
        
        return bookmaker;
    }

    /**
     * Normalize bookmaker name for consistent keys
     */
    normalizeBookmakerName(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // ==================== STAKE CALCULATION ====================

    /**
     * Calculate optimal stake for an arbitrage opportunity
     */
    calculateArbitrageStakes(arbOpportunity, options = {}) {
        const {
            totalStake = null, // If null, calculate based on bankroll
            useKelly = false,
            maxStakeOverride = null
        } = options;

        const profitPercent = arbOpportunity.profitPercent / 100;
        
        // Calculate total stake if not provided
        let calculatedTotalStake = totalStake;
        if (!calculatedTotalStake) {
            // Use a percentage of bankroll based on profit opportunity
            // Higher profit = larger stake, but capped
            const baseStakePercent = Math.min(profitPercent * 2, this.config.maxExposurePerBet);
            calculatedTotalStake = this.bankroll.totalBankroll * baseStakePercent;
        }

        // Apply min/max constraints
        calculatedTotalStake = Math.max(this.config.minStake, calculatedTotalStake);
        calculatedTotalStake = Math.min(this.config.maxStake, calculatedTotalStake);
        
        if (maxStakeOverride) {
            calculatedTotalStake = Math.min(calculatedTotalStake, maxStakeOverride);
        }

        // Calculate individual stakes based on odds
        const legs = arbOpportunity.legs;
        const stakes = [];
        let totalCalculatedStake = 0;

        if (legs.length === 2) {
            // Two-outcome arbitrage
            const odds1 = legs[0].odds;
            const odds2 = legs[1].odds;
            
            const implied1 = 1 / odds1;
            const implied2 = 1 / odds2;
            const totalImplied = implied1 + implied2;
            
            const stake1 = (calculatedTotalStake * implied1) / totalImplied;
            const stake2 = (calculatedTotalStake * implied2) / totalImplied;
            
            stakes.push({
                outcome: legs[0].outcome,
                bookmaker: legs[0].bookmaker,
                odds: odds1,
                stake: Math.round(stake1 * 100) / 100,
                normalizedBookmaker: this.normalizeBookmakerName(legs[0].bookmaker)
            });
            
            stakes.push({
                outcome: legs[1].outcome,
                bookmaker: legs[1].bookmaker,
                odds: odds2,
                stake: Math.round(stake2 * 100) / 100,
                normalizedBookmaker: this.normalizeBookmakerName(legs[1].bookmaker)
            });
            
            totalCalculatedStake = stakes[0].stake + stakes[1].stake;
        } else {
            // Multi-outcome arbitrage (simplified)
            const stakePerOutcome = calculatedTotalStake / legs.length;
            for (const leg of legs) {
                stakes.push({
                    outcome: leg.outcome,
                    bookmaker: leg.bookmaker,
                    odds: leg.odds,
                    stake: Math.round(stakePerOutcome * 100) / 100,
                    normalizedBookmaker: this.normalizeBookmakerName(leg.bookmaker)
                });
                totalCalculatedStake += stakePerOutcome;
            }
        }

        // Check bookmaker constraints
        const constraints = this.checkStakeConstraints(stakes);
        
        // Calculate expected profit
        const guaranteedProfit = stakes[0].stake * stakes[0].odds - totalCalculatedStake;
        const profitPercentActual = (guaranteedProfit / totalCalculatedStake) * 100;

        return {
            type: 'arbitrage',
            totalStake: Math.round(totalCalculatedStake * 100) / 100,
            stakes,
            expectedProfit: Math.round(guaranteedProfit * 100) / 100,
            profitPercent: Math.round(profitPercentActual * 100) / 100,
            constraints,
            canPlace: constraints.every(c => c.satisfied)
        };
    }

    /**
     * Calculate optimal stake for +EV bet using Kelly Criterion
     */
    calculateEVStake(evOpportunity, options = {}) {
        const {
            fraction = this.config.kellyFraction,
            maxStakeOverride = null
        } = options;

        const odds = evOpportunity.odds;
        const trueProbability = evOpportunity.trueProbability / 100;
        
        // Kelly formula: f* = (bp - q) / b
        // where b = odds - 1, p = probability of win, q = probability of loss
        const b = odds - 1;
        const p = trueProbability;
        const q = 1 - p;
        
        const kellyFraction = (b * p - q) / b;
        
        // Apply fractional Kelly for safety
        let optimalFraction = kellyFraction * fraction;
        
        // Ensure we don't bet negative (if EV is negative)
        if (optimalFraction <= 0) {
            return {
                type: 'ev',
                stake: 0,
                kellyFraction: 0,
                actualFraction: 0,
                reason: 'Negative Kelly fraction - EV may be overstated',
                canPlace: false
            };
        }

        // Calculate stake amount
        let stake = this.bankroll.totalBankroll * optimalFraction;
        
        // Apply constraints
        stake = Math.max(this.config.minStake, stake);
        stake = Math.min(this.config.maxStake, stake);
        
        if (maxStakeOverride) {
            stake = Math.min(stake, maxStakeOverride);
        }

        // Check bookmaker constraints
        const bookmakerName = this.normalizeBookmakerName(evOpportunity.bookmaker);
        const bookmaker = this.bankroll.bookmakers[bookmakerName];
        
        const constraints = [];
        
        if (bookmaker) {
            if (bookmaker.maxStake && stake > bookmaker.maxStake) {
                constraints.push({
                    type: 'bookmaker_max',
                    bookmaker: bookmakerName,
                    limit: bookmaker.maxStake,
                    requested: stake,
                    satisfied: false,
                    message: `Stake exceeds bookmaker max of ${bookmaker.maxStake}`
                });
                stake = Math.min(stake, bookmaker.maxStake);
            }
            
            if (bookmaker.available < stake) {
                constraints.push({
                    type: 'insufficient_funds',
                    bookmaker: bookmakerName,
                    available: bookmaker.available,
                    requested: stake,
                    satisfied: false,
                    message: `Insufficient funds. Available: ${bookmaker.available}`
                });
                stake = Math.min(stake, bookmaker.available);
            }
        }

        // Check exposure limits
        const maxExposureStake = this.bankroll.totalBankroll * this.config.maxExposurePerBet;
        if (stake > maxExposureStake) {
            constraints.push({
                type: 'exposure_limit',
                limit: maxExposureStake,
                requested: stake,
                satisfied: false,
                message: `Stake exceeds max exposure limit of ${maxExposureStake}`
            });
            stake = Math.min(stake, maxExposureStake);
        }

        return {
            type: 'ev',
            stake: Math.round(stake * 100) / 100,
            kellyFraction: Math.round(kellyFraction * 100) / 100,
            actualFraction: Math.round(optimalFraction * 100) / 100,
            expectedValue: Math.round(stake * (evOpportunity.evPercent / 100) * 100) / 100,
            evPercent: evOpportunity.evPercent,
            constraints,
            canPlace: stake >= this.config.minStake && constraints.every(c => c.satisfied !== false)
        };
    }

    /**
     * Check stake constraints against bookmaker limits
     */
    checkStakeConstraints(stakes) {
        const constraints = [];
        
        for (const stake of stakes) {
            const bookmakerName = stake.normalizedBookmaker;
            const bookmaker = this.bankroll.bookmakers[bookmakerName];
            
            if (!bookmaker) {
                constraints.push({
                    type: 'unknown_bookmaker',
                    bookmaker: bookmakerName,
                    satisfied: true, // Allow but warn
                    message: `Bookmaker ${stake.bookmaker} not in bankroll tracking`
                });
                continue;
            }

            // Check if bookmaker is active
            if (!bookmaker.isActive) {
                constraints.push({
                    type: 'inactive_bookmaker',
                    bookmaker: bookmakerName,
                    satisfied: false,
                    message: `Bookmaker ${stake.bookmaker} is inactive`
                });
                continue;
            }

            // Check available funds
            if (bookmaker.available < stake.stake) {
                constraints.push({
                    type: 'insufficient_funds',
                    bookmaker: bookmakerName,
                    available: bookmaker.available,
                    requested: stake.stake,
                    satisfied: false,
                    message: `Insufficient funds at ${stake.bookmaker}. Available: ${bookmaker.available}, Needed: ${stake.stake}`
                });
            }

            // Check bookmaker stake limits
            if (bookmaker.minStake && stake.stake < bookmaker.minStake) {
                constraints.push({
                    type: 'below_min_stake',
                    bookmaker: bookmakerName,
                    limit: bookmaker.minStake,
                    requested: stake.stake,
                    satisfied: false,
                    message: `Stake below bookmaker minimum of ${bookmaker.minStake}`
                });
            }

            if (bookmaker.maxStake && stake.stake > bookmaker.maxStake) {
                constraints.push({
                    type: 'above_max_stake',
                    bookmaker: bookmakerName,
                    limit: bookmaker.maxStake,
                    requested: stake.stake,
                    satisfied: false,
                    message: `Stake above bookmaker maximum of ${bookmaker.maxStake}`
                });
            }

            // Check exposure limits
            const newExposure = bookmaker.exposure + stake.stake;
            const maxBookmakerExposure = this.bankroll.totalBankroll * this.config.maxExposurePerBookmaker;
            if (newExposure > maxBookmakerExposure) {
                constraints.push({
                    type: 'bookmaker_exposure',
                    bookmaker: bookmakerName,
                    currentExposure: bookmaker.exposure,
                    newExposure,
                    limit: maxBookmakerExposure,
                    satisfied: false,
                    message: `Would exceed max exposure limit for ${stake.bookmaker}`
                });
            }
        }

        return constraints;
    }

    // ==================== BET TRACKING ====================

    /**
     * Record a pending bet (reduces available funds)
     */
    async placeBet(betId, details) {
        const {
            type, // 'arbitrage' or 'ev'
            event,
            stakes, // Array of {bookmaker, stake, odds, outcome}
            expectedProfit,
            timestamp = new Date().toISOString()
        } = details;

        // Validate we have enough funds
        for (const stake of stakes) {
            const bookmakerName = this.normalizeBookmakerName(stake.bookmaker);
            const bookmaker = this.bankroll.bookmakers[bookmakerName];
            
            if (!bookmaker) {
                throw new Error(`Bookmaker ${stake.bookmaker} not found in bankroll`);
            }
            
            if (bookmaker.available < stake.stake) {
                throw new Error(`Insufficient funds at ${stake.bookmaker}. Available: ${bookmaker.available}, Needed: ${stake.stake}`);
            }
        }

        // Reserve funds
        for (const stake of stakes) {
            const bookmakerName = this.normalizeBookmakerName(stake.bookmaker);
            const bookmaker = this.bankroll.bookmakers[bookmakerName];
            
            bookmaker.available -= stake.stake;
            bookmaker.exposure += stake.stake;
        }

        // Store pending bet
        this.pendingBets.set(betId, {
            id: betId,
            type,
            event,
            stakes,
            expectedProfit,
            placedAt: timestamp,
            status: 'pending'
        });

        // Update daily stats
        const totalStaked = stakes.reduce((sum, s) => sum + s.stake, 0);
        this.dailyStats.totalStaked += totalStaked;
        this.dailyStats.betsPlaced += 1;

        this.recalculateAllocations();
        await this.saveBankroll();
        await this.savePendingBets();

        this.emit('betPlaced', { betId, type, event, stakes, expectedProfit });

        return { betId, status: 'placed', stakes };
    }

    /**
     * Settle a bet (update balances based on outcome)
     */
    async settleBet(betId, outcome) {
        const bet = this.pendingBets.get(betId);
        if (!bet) {
            throw new Error(`Bet ${betId} not found`);
        }

        const { result, actualProfit } = outcome;
        
        // Release exposure and update balances
        for (const stake of bet.stakes) {
            const bookmakerName = this.normalizeBookmakerName(stake.bookmaker);
            const bookmaker = this.bankroll.bookmakers[bookmakerName];
            
            bookmaker.exposure -= stake.stake;
            
            if (result === 'win') {
                // For winning bets, add winnings to balance
                const winnings = stake.stake * stake.odds;
                bookmaker.balance += (winnings - stake.stake);
            }
            // For losses, stake was already deducted from available
            // For wins, we need to add net profit
            
            bookmaker.available = bookmaker.balance - bookmaker.exposure;
            bookmaker.lastUpdated = new Date().toISOString();
        }

        // Update daily stats
        this.dailyStats.totalProfit += actualProfit;
        if (actualProfit > 0) {
            this.dailyStats.betsWon += 1;
        } else {
            this.dailyStats.betsLost += 1;
        }

        // Remove from pending
        bet.status = 'settled';
        bet.result = result;
        bet.actualProfit = actualProfit;
        bet.settledAt = new Date().toISOString();
        
        // Archive settled bet
        await this.archiveSettledBet(bet);
        this.pendingBets.delete(betId);

        this.recalculateAllocations();
        await this.saveBankroll();
        await this.savePendingBets();

        this.emit('betSettled', { betId, result, actualProfit });

        return { betId, result, actualProfit };
    }

    /**
     * Archive a settled bet to history
     */
    async archiveSettledBet(bet) {
        const historyFile = path.join(this.config.dataDir, 'bet-history.json');
        
        try {
            let history = [];
            try {
                const data = await fs.readFile(historyFile, 'utf8');
                history = JSON.parse(data);
            } catch (e) {
                // File doesn't exist yet
            }
            
            history.push(bet);
            
            // Keep only last 1000 bets
            if (history.length > 1000) {
                history = history.slice(-1000);
            }
            
            await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('Failed to archive bet:', error.message);
        }
    }

    /**
     * Cancel a pending bet (restore funds)
     */
    async cancelBet(betId) {
        const bet = this.pendingBets.get(betId);
        if (!bet) {
            throw new Error(`Bet ${betId} not found`);
        }

        // Restore funds
        for (const stake of bet.stakes) {
            const bookmakerName = this.normalizeBookmakerName(stake.bookmaker);
            const bookmaker = this.bankroll.bookmakers[bookmakerName];
            
            bookmaker.available += stake.stake;
            bookmaker.exposure -= stake.stake;
        }

        // Update daily stats
        const totalStaked = bet.stakes.reduce((sum, s) => sum + s.stake, 0);
        this.dailyStats.totalStaked -= totalStaked;
        this.dailyStats.betsPlaced -= 1;

        this.pendingBets.delete(betId);

        this.recalculateAllocations();
        await this.saveBankroll();
        await this.savePendingBets();

        this.emit('betCancelled', { betId });

        return { betId, status: 'cancelled' };
    }

    // ==================== RISK MANAGEMENT ====================

    /**
     * Check if we should stop betting (risk limits)
     */
    checkRiskLimits() {
        const limits = [];
        
        // Daily loss limit
        const dailyLossPercent = this.dailyStats.totalProfit < 0 
            ? Math.abs(this.dailyStats.totalProfit) / this.bankroll.totalBankroll 
            : 0;
        
        if (dailyLossPercent >= this.config.maxDailyLoss) {
            limits.push({
                type: 'daily_loss',
                triggered: true,
                current: dailyLossPercent,
                limit: this.config.maxDailyLoss,
                message: `Daily loss limit reached: ${(dailyLossPercent * 100).toFixed(2)}%`
            });
        }

        // Check individual bookmaker exposure
        for (const [name, bookmaker] of Object.entries(this.bankroll.bookmakers)) {
            const exposurePercent = bookmaker.exposure / this.bankroll.totalBankroll;
            if (exposurePercent > this.config.maxExposurePerBookmaker) {
                limits.push({
                    type: 'bookmaker_exposure',
                    bookmaker: name,
                    triggered: true,
                    current: exposurePercent,
                    limit: this.config.maxExposurePerBookmaker,
                    message: `Max exposure reached for ${name}: ${(exposurePercent * 100).toFixed(2)}%`
                });
            }
        }

        return {
            canBet: limits.every(l => !l.triggered),
            limits
        };
    }

    /**
     * Recalculate available/reserved allocations
     */
    recalculateAllocations() {
        let totalReserved = 0;
        
        for (const bookmaker of Object.values(this.bankroll.bookmakers)) {
            totalReserved += bookmaker.exposure;
        }
        
        this.bankroll.allocations.reserved = totalReserved;
        this.bankroll.allocations.available = this.bankroll.totalBankroll - totalReserved;
    }

    // ==================== REPORTING ====================

    /**
     * Get bankroll summary
     */
    getBankrollSummary() {
        const bookmakerList = Object.values(this.bankroll.bookmakers);
        
        return {
            totalBankroll: this.bankroll.totalBankroll,
            currency: this.bankroll.currency,
            allocations: this.bankroll.allocations,
            bookmakerCount: bookmakerList.length,
            bookmakers: bookmakerList.map(b => ({
                name: b.name,
                displayName: b.displayName,
                balance: b.balance,
                available: b.available,
                exposure: b.exposure,
                exposurePercent: this.bankroll.totalBankroll > 0 
                    ? (b.exposure / this.bankroll.totalBankroll * 100).toFixed(2)
                    : 0,
                isActive: b.isActive
            })),
            pendingBets: this.pendingBets.size,
            dailyStats: this.dailyStats,
            riskStatus: this.checkRiskLimits()
        };
    }

    /**
     * Get detailed statistics
     */
    async getStatistics() {
        const historyFile = path.join(this.config.dataDir, 'bet-history.json');
        let history = [];
        
        try {
            const data = await fs.readFile(historyFile, 'utf8');
            history = JSON.parse(data);
        } catch (e) {
            // No history yet
        }

        const totalBets = history.length + this.pendingBets.size;
        const settledBets = history;
        
        const stats = {
            totalBets,
            settledBets: settledBets.length,
            pendingBets: this.pendingBets.size,
            winRate: 0,
            totalProfit: 0,
            totalStaked: 0,
            roi: 0,
            byBookmaker: {},
            bySport: {},
            byMonth: {}
        };

        for (const bet of settledBets) {
            stats.totalProfit += bet.actualProfit || 0;
            const staked = bet.stakes.reduce((sum, s) => sum + s.stake, 0);
            stats.totalStaked += staked;
            
            if (bet.actualProfit > 0) {
                stats.winRate += 1;
            }

            // By bookmaker
            for (const stake of bet.stakes) {
                const bm = this.normalizeBookmakerName(stake.bookmaker);
                if (!stats.byBookmaker[bm]) {
                    stats.byBookmaker[bm] = { bets: 0, profit: 0, staked: 0 };
                }
                stats.byBookmaker[bm].bets += 1;
                stats.byBookmaker[bm].profit += bet.actualProfit || 0;
                stats.byBookmaker[bm].staked += stake.stake;
            }

            // By sport
            if (bet.event?.sport) {
                const sport = bet.event.sport;
                if (!stats.bySport[sport]) {
                    stats.bySport[sport] = { bets: 0, profit: 0 };
                }
                stats.bySport[sport].bets += 1;
                stats.bySport[sport].profit += bet.actualProfit || 0;
            }

            // By month
            const month = bet.settledAt?.split('T')[0].substring(0, 7) || 'unknown';
            if (!stats.byMonth[month]) {
                stats.byMonth[month] = { bets: 0, profit: 0 };
            }
            stats.byMonth[month].bets += 1;
            stats.byMonth[month].profit += bet.actualProfit || 0;
        }

        if (settledBets.length > 0) {
            stats.winRate = (stats.winRate / settledBets.length * 100).toFixed(2);
            stats.roi = stats.totalStaked > 0 
                ? (stats.totalProfit / stats.totalStaked * 100).toFixed(2)
                : 0;
        }

        return stats;
    }

    /**
     * Export data for tax reporting
     */
    async exportForTaxReporting(startDate, endDate) {
        const historyFile = path.join(this.config.dataDir, 'bet-history.json');
        let history = [];
        
        try {
            const data = await fs.readFile(historyFile, 'utf8');
            history = JSON.parse(data);
        } catch (e) {
            return [];
        }

        return history.filter(bet => {
            const settledDate = new Date(bet.settledAt);
            return settledDate >= new Date(startDate) && settledDate <= new Date(endDate);
        }).map(bet => ({
            date: bet.settledAt,
            event: bet.event?.name || bet.event,
            type: bet.type,
            stakes: bet.stakes,
            result: bet.result,
            profit: bet.actualProfit,
            currency: this.bankroll.currency
        }));
    }

    // ==================== SMART BET SIZING ====================

    /**
     * Calculate smart stake for arbitrage using advanced risk management
     */
    calculateSmartArbitrageStakes(arbOpportunity, options = {}) {
        return this.smartSizing.calculateArbitrageStake(arbOpportunity, this.bankroll, options);
    }

    /**
     * Calculate smart stake for +EV using Kelly Criterion with risk limits
     */
    calculateSmartEVStake(evOpportunity, options = {}) {
        return this.smartSizing.calculateEVStake(evOpportunity, this.bankroll, options);
    }

    /**
     * Get current risk status from smart sizing
     */
    getSmartRiskStatus() {
        return this.smartSizing.getRiskStatus(this.bankroll);
    }

    /**
     * Update smart sizing configuration
     */
    updateSmartSizingConfig(newConfig) {
        this.smartSizing.updateConfig(newConfig);
    }

    /**
     * Get smart sizing configuration
     */
    getSmartSizingConfig() {
        return this.smartSizing.getConfig();
    }

    /**
     * Record bet placement with smart sizing tracker
     */
    recordSmartBet(stake) {
        this.smartSizing.recordBet(stake);
    }

    /**
     * Record bet settlement with smart sizing tracker
     */
    recordSmartSettlement(profit) {
        this.smartSizing.recordSettlement(profit);
    }
}

module.exports = BankrollManager;
