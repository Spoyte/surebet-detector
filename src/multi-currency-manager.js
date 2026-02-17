/**
 * Multi-Currency Support Module
 * Handles EUR, GBP, USD accounts with auto-conversion and forex tracking
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class MultiCurrencyManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.currencyFile = path.join(this.dataDir, 'currency-config.json');
    this.ratesFile = path.join(this.dataDir, 'forex-rates.json');
    this.transactionsFile = path.join(this.dataDir, 'currency-transactions.json');
    
    // Default configuration
    this.config = {
      baseCurrency: options.baseCurrency || 'EUR',
      supportedCurrencies: ['EUR', 'GBP', 'USD', 'CHF', 'CAD', 'AUD'],
      autoConvert: options.autoConvert !== false,
      rateRefreshInterval: options.rateRefreshInterval || 3600000, // 1 hour
      rateSource: options.rateSource || 'exchangerate-api',
      rateApiKey: options.rateApiKey || null,
      trackForexImpact: true,
      roundToDecimals: 2
    };
    
    // Exchange rates (base: EUR)
    this.rates = {
      EUR: 1.0,
      GBP: 0.85,
      USD: 1.08,
      CHF: 0.94,
      CAD: 1.47,
      AUD: 1.65
    };
    
    // Currency accounts
    this.accounts = new Map();
    
    // Transaction history
    this.transactions = [];
    
    // Rate refresh interval
    this.rateRefreshInterval = null;
    
    // Rate history for impact tracking
    this.rateHistory = [];
  }
  
  async init() {
    await this.loadConfig();
    await this.loadRates();
    await this.loadTransactions();
    await this.refreshRates();
    
    // Start auto-refresh if enabled
    if (this.config.autoConvert) {
      this.startRateRefresh();
    }
    
    console.log('[CurrencyManager] Initialized with base currency:', this.config.baseCurrency);
    console.log('[CurrencyManager] Supported currencies:', this.config.supportedCurrencies.join(', '));
    return this;
  }
  
  /**
   * Load configuration from disk
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(this.currencyFile, 'utf8');
      const parsed = JSON.parse(data);
      this.config = { ...this.config, ...parsed.config };
      
      for (const [currency, account] of Object.entries(parsed.accounts || {})) {
        this.accounts.set(currency, account);
      }
    } catch (error) {
      // Initialize with defaults
      this.initializeDefaultAccounts();
    }
  }
  
  /**
   * Initialize default currency accounts
   */
  initializeDefaultAccounts() {
    for (const currency of this.config.supportedCurrencies) {
      this.accounts.set(currency, {
        currency,
        balance: 0,
        bookmakers: [],
        enabled: currency === this.config.baseCurrency
      });
    }
  }
  
  /**
   * Load exchange rates from disk
   */
  async loadRates() {
    try {
      const data = await fs.readFile(this.ratesFile, 'utf8');
      const parsed = JSON.parse(data);
      this.rates = parsed.rates || this.rates;
      this.rateHistory = parsed.history || [];
    } catch (error) {
      // Use defaults
    }
  }
  
  /**
   * Load transaction history
   */
  async loadTransactions() {
    try {
      const data = await fs.readFile(this.transactionsFile, 'utf8');
      this.transactions = JSON.parse(data);
    } catch (error) {
      this.transactions = [];
    }
  }
  
  /**
   * Save configuration to disk
   */
  async saveConfig() {
    const data = {
      config: this.config,
      accounts: Object.fromEntries(this.accounts),
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(this.currencyFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Save rates to disk
   */
  async saveRates() {
    const data = {
      rates: this.rates,
      history: this.rateHistory.slice(-168), // Keep last 7 days (hourly)
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(this.ratesFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Save transactions to disk
   */
  async saveTransactions() {
    await fs.writeFile(this.transactionsFile, JSON.stringify(this.transactions, null, 2));
  }
  
  /**
   * Refresh exchange rates from API
   */
  async refreshRates() {
    try {
      let newRates;
      
      switch (this.config.rateSource) {
        case 'exchangerate-api':
          newRates = await this.fetchFromExchangeRateAPI();
          break;
        case 'fixer':
          newRates = await this.fetchFromFixer();
          break;
        case 'manual':
          // Don't refresh, use manual rates
          return;
        default:
          newRates = await this.fetchFromExchangeRateAPI();
      }
      
      // Store old rates for history
      this.rateHistory.push({
        timestamp: new Date().toISOString(),
        rates: { ...this.rates }
      });
      
      // Update rates
      this.rates = { ...this.rates, ...newRates };
      
      // Ensure base currency is always 1.0
      this.rates[this.config.baseCurrency] = 1.0;
      
      await this.saveRates();
      
      this.emit('ratesUpdated', this.rates);
      console.log('[CurrencyManager] Exchange rates refreshed');
      
      return this.rates;
    } catch (error) {
      console.error('[CurrencyManager] Failed to refresh rates:', error.message);
      this.emit('ratesError', error);
      throw error;
    }
  }
  
  /**
   * Fetch rates from ExchangeRate-API
   */
  async fetchFromExchangeRateAPI() {
    const baseUrl = this.config.rateApiKey 
      ? `https://v6.exchangerate-api.com/v6/${this.config.rateApiKey}/latest/${this.config.baseCurrency}`
      : `https://api.exchangerate-api.com/v4/latest/${this.config.baseCurrency}`;
    
    const response = await fetch(baseUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    // Filter only supported currencies
    const rates = {};
    for (const currency of this.config.supportedCurrencies) {
      if (data.rates[currency]) {
        rates[currency] = data.rates[currency];
      }
    }
    
    return rates;
  }
  
  /**
   * Fetch rates from Fixer.io
   */
  async fetchFromFixer() {
    if (!this.config.rateApiKey) {
      throw new Error('Fixer API key required');
    }
    
    const symbols = this.config.supportedCurrencies.join(',');
    const url = `http://data.fixer.io/api/latest?access_key=${this.config.rateApiKey}&symbols=${symbols}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error?.info || 'API error');
    
    // Fixer uses EUR as base by default
    return data.rates;
  }
  
  /**
   * Start automatic rate refresh
   */
  startRateRefresh() {
    if (this.rateRefreshInterval) {
      clearInterval(this.rateRefreshInterval);
    }
    
    this.rateRefreshInterval = setInterval(() => {
      this.refreshRates().catch(console.error);
    }, this.config.rateRefreshInterval);
    
    console.log('[CurrencyManager] Auto-refresh started');
  }
  
  /**
   * Stop automatic rate refresh
   */
  stopRateRefresh() {
    if (this.rateRefreshInterval) {
      clearInterval(this.rateRefreshInterval);
      this.rateRefreshInterval = null;
      console.log('[CurrencyManager] Auto-refresh stopped');
    }
  }
  
  /**
   * Convert amount from one currency to another
   */
  convert(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    const fromRate = this.rates[fromCurrency];
    const toRate = this.rates[toCurrency];
    
    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not available for ${fromCurrency} or ${toCurrency}`);
    }
    
    // Convert to base currency first, then to target
    const baseAmount = amount / fromRate;
    const convertedAmount = baseAmount * toRate;
    
    return this.round(convertedAmount);
  }
  
  /**
   * Convert amount to base currency
   */
  convertToBase(amount, fromCurrency) {
    return this.convert(amount, fromCurrency, this.config.baseCurrency);
  }
  
  /**
   * Round amount to configured decimals
   */
  round(amount) {
    const factor = Math.pow(10, this.config.roundToDecimals);
    return Math.round(amount * factor) / factor;
  }
  
  /**
   * Add a bookmaker account in a specific currency
   */
  async addBookmakerAccount(bookmaker, currency, options = {}) {
    if (!this.config.supportedCurrencies.includes(currency)) {
      throw new Error(`Currency ${currency} not supported`);
    }
    
    const account = this.accounts.get(currency);
    if (!account) {
      throw new Error(`Account for ${currency} not found`);
    }
    
    const bookmakerAccount = {
      bookmaker,
      currency,
      balance: options.balance || 0,
      available: options.available || options.balance || 0,
      exposure: 0,
      pendingBets: 0,
      addedAt: new Date().toISOString(),
      ...options
    };
    
    account.bookmakers.push(bookmakerAccount);
    await this.saveConfig();
    
    this.emit('bookmakerAdded', bookmakerAccount);
    return bookmakerAccount;
  }
  
  /**
   * Update bookmaker balance
   */
  async updateBookmakerBalance(bookmaker, currency, newBalance) {
    const account = this.accounts.get(currency);
    if (!account) throw new Error(`Account for ${currency} not found`);
    
    const bmAccount = account.bookmakers.find(b => b.bookmaker === bookmaker);
    if (!bmAccount) throw new Error(`Bookmaker ${bookmaker} not found in ${currency} account`);
    
    const oldBalance = bmAccount.balance;
    bmAccount.balance = newBalance;
    bmAccount.available = newBalance - bmAccount.exposure;
    bmAccount.updatedAt = new Date().toISOString();
    
    await this.saveConfig();
    
    this.emit('balanceUpdated', {
      bookmaker,
      currency,
      oldBalance,
      newBalance,
      difference: newBalance - oldBalance
    });
    
    return bmAccount;
  }
  
  /**
   * Record a transaction with currency conversion
   */
  async recordTransaction(transaction) {
    const {
      type, // 'deposit', 'withdrawal', 'bet', 'win', 'loss', 'transfer'
      amount,
      currency,
      bookmaker,
      description,
      relatedBets = []
    } = transaction;
    
    // Convert to base currency
    const baseAmount = this.convertToBase(amount, currency);
    
    // Calculate forex impact if applicable
    const forexImpact = await this.calculateForexImpact(currency, amount, baseAmount);
    
    const record = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type,
      amount,
      currency,
      baseAmount,
      baseCurrency: this.config.baseCurrency,
      exchangeRate: this.rates[currency],
      bookmaker,
      description,
      relatedBets,
      forexImpact,
      metadata: transaction.metadata || {}
    };
    
    this.transactions.push(record);
    
    // Keep only last 10000 transactions
    if (this.transactions.length > 10000) {
      this.transactions = this.transactions.slice(-10000);
    }
    
    await this.saveTransactions();
    
    // Update account balance
    const account = this.accounts.get(currency);
    if (account) {
      switch (type) {
        case 'deposit':
        case 'win':
          account.balance += amount;
          break;
        case 'withdrawal':
        case 'bet':
        case 'loss':
          account.balance -= amount;
          break;
      }
    }
    
    await this.saveConfig();
    
    this.emit('transactionRecorded', record);
    return record;
  }
  
  /**
   * Calculate forex impact on a transaction
   */
  async calculateForexImpact(currency, originalAmount, baseAmount) {
    if (!this.config.trackForexImpact || currency === this.config.baseCurrency) {
      return null;
    }
    
    // Find rate from 24 hours ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const oldRateEntry = this.rateHistory
      .filter(h => new Date(h.timestamp) <= oneDayAgo)
      .pop();
    
    if (!oldRateEntry) return null;
    
    const oldRate = oldRateEntry.rates[currency];
    const currentRate = this.rates[currency];
    
    if (!oldRate || !currentRate) return null;
    
    // Calculate what the base amount would have been yesterday
    const oldBaseAmount = (originalAmount / oldRate);
    const impact = baseAmount - oldBaseAmount;
    const impactPercent = (impact / oldBaseAmount) * 100;
    
    return {
      oldRate,
      currentRate,
      rateChange: ((currentRate - oldRate) / oldRate) * 100,
      impact,
      impactPercent,
      direction: impact > 0 ? 'favorable' : 'unfavorable'
    };
  }
  
  /**
   * Calculate optimal stakes across currencies for an arbitrage opportunity
   */
  calculateMultiCurrencyStakes(opportunity, currencyBalances) {
    const { legs } = opportunity;
    const stakes = [];
    
    // Convert all balances to base currency for comparison
    const baseBalances = {};
    for (const [currency, balance] of Object.entries(currencyBalances)) {
      baseBalances[currency] = this.convertToBase(balance, currency);
    }
    
    // Assign stakes based on available balances
    for (const leg of legs) {
      const { bookmaker, currency, impliedStake } = leg;
      
      // Check if we have sufficient balance in this currency
      const available = currencyBalances[currency] || 0;
      
      if (available >= impliedStake) {
        // Use same currency
        stakes.push({
          bookmaker,
          currency,
          stake: impliedStake,
          baseStake: this.convertToBase(impliedStake, currency),
          conversionNeeded: false
        });
      } else {
        // Need to use another currency or convert
        // Find currency with highest available balance
        let bestCurrency = null;
        let bestBalance = 0;
        
        for (const [curr, bal] of Object.entries(baseBalances)) {
          if (bal > bestBalance) {
            bestBalance = bal;
            bestCurrency = curr;
          }
        }
        
        if (bestCurrency) {
          const stakeInBestCurrency = this.convert(impliedStake, currency, bestCurrency);
          stakes.push({
            bookmaker,
            currency: bestCurrency,
            stake: stakeInBestCurrency,
            baseStake: this.convertToBase(impliedStake, currency),
            conversionNeeded: true,
            targetCurrency: currency,
            conversionRate: this.rates[currency] / this.rates[bestCurrency]
          });
        }
      }
    }
    
    return stakes;
  }
  
  /**
   * Get total balance across all currencies in base currency
   */
  getTotalBalance() {
    let total = 0;
    for (const [currency, account] of this.accounts) {
      if (account.enabled) {
        total += this.convertToBase(account.balance, currency);
      }
    }
    return this.round(total);
  }
  
  /**
   * Get balance breakdown by currency
   */
  getBalanceBreakdown() {
    const breakdown = {};
    for (const [currency, account] of this.accounts) {
      if (account.enabled) {
        breakdown[currency] = {
          balance: account.balance,
          baseEquivalent: this.convertToBase(account.balance, currency),
          bookmakers: account.bookmakers.length
        };
      }
    }
    return breakdown;
  }
  
  /**
   * Get forex impact summary
   */
  getForexImpactSummary(timeRange = '30d') {
    const days = this.parseTimeRange(timeRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const relevantTransactions = this.transactions.filter(t => 
      new Date(t.timestamp) >= cutoff && t.forexImpact
    );
    
    const summary = {
      totalImpact: 0,
      favorable: 0,
      unfavorable: 0,
      byCurrency: {}
    };
    
    for (const t of relevantTransactions) {
      const impact = t.forexImpact.impact;
      summary.totalImpact += impact;
      
      if (t.forexImpact.direction === 'favorable') {
        summary.favorable += impact;
      } else {
        summary.unfavorable += Math.abs(impact);
      }
      
      if (!summary.byCurrency[t.currency]) {
        summary.byCurrency[t.currency] = {
          impact: 0,
          transactions: 0
        };
      }
      summary.byCurrency[t.currency].impact += impact;
      summary.byCurrency[t.currency].transactions++;
    }
    
    return summary;
  }
  
  /**
   * Get currency statistics
   */
  getCurrencyStats() {
    const stats = {
      baseCurrency: this.config.baseCurrency,
      supportedCurrencies: this.config.supportedCurrencies,
      currentRates: this.rates,
      lastRateUpdate: this.rateHistory.length > 0 
        ? this.rateHistory[this.rateHistory.length - 1].timestamp 
        : null,
      totalBalance: this.getTotalBalance(),
      breakdown: this.getBalanceBreakdown(),
      transactionCount: this.transactions.length,
      forexImpact: this.getForexImpactSummary()
    };
    
    return stats;
  }
  
  /**
   * Enable/disable a currency
   */
  async setCurrencyEnabled(currency, enabled) {
    const account = this.accounts.get(currency);
    if (!account) throw new Error(`Currency ${currency} not found`);
    
    account.enabled = enabled;
    await this.saveConfig();
    
    this.emit('currencyStatusChanged', { currency, enabled });
  }
  
  /**
   * Add a new supported currency
   */
  async addCurrency(currency, initialRate = null) {
    if (this.config.supportedCurrencies.includes(currency)) {
      throw new Error(`Currency ${currency} already supported`);
    }
    
    this.config.supportedCurrencies.push(currency);
    
    if (initialRate) {
      this.rates[currency] = initialRate;
    }
    
    this.accounts.set(currency, {
      currency,
      balance: 0,
      bookmakers: [],
      enabled: true
    });
    
    await this.saveConfig();
    await this.saveRates();
    
    this.emit('currencyAdded', { currency, rate: initialRate });
  }
  
  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
    
    // Restart rate refresh if interval changed
    if (newConfig.rateRefreshInterval && this.rateRefreshInterval) {
      this.startRateRefresh();
    }
    
    this.emit('configUpdated', this.config);
  }
  
  /**
   * Get configuration
   */
  getConfig() {
    return this.config;
  }
  
  /**
   * Parse time range string
   */
  parseTimeRange(range) {
    const match = range.match(/^(\d+)([dwm])$/);
    if (!match) return 30;
    
    const [, num, unit] = match;
    switch (unit) {
      case 'd': return parseInt(num);
      case 'w': return parseInt(num) * 7;
      case 'm': return parseInt(num) * 30;
      default: return 30;
    }
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Export data
   */
  async exportData(format = 'json') {
    const data = {
      config: this.config,
      accounts: Object.fromEntries(this.accounts),
      rates: this.rates,
      transactions: this.transactions,
      stats: this.getCurrencyStats(),
      exportedAt: new Date().toISOString()
    };
    
    if (format === 'csv') {
      const rows = ['timestamp,type,amount,currency,base_amount,base_currency,exchange_rate,bookmaker,description,forex_impact'];
      for (const t of this.transactions) {
        rows.push(`${t.timestamp},${t.type},${t.amount},${t.currency},${t.baseAmount},${t.baseCurrency},${t.exchangeRate},${t.bookmaker || ''},"${t.description || ''}",${t.forexImpact?.impact || 0}`);
      }
      return rows.join('\n');
    }
    
    return JSON.stringify(data, null, 2);
  }
}

module.exports = { MultiCurrencyManager };
