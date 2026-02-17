/**
 * Sharp Bookmaker Integration
 * 
 * Integrates with sharp bookmakers (Pinnacle, Cloudbet, etc.) that don't limit winners.
 * Uses their odds as 'true line' reference for value betting calculations.
 * 
 * Sharp bookmakers are characterized by:
 * - High betting limits
 * - Fast odds adjustment to market efficiency
 * - Don't restrict winning players (no "gubbing")
 * - Lower margins (typically 2-3% vs 5-8% for recreational bookmakers)
 * - Serve as good approximation of "true" probabilities
 */

const axios = require('axios');
const { createLogger } = require('./logger');

class SharpBookmakerIntegration {
  constructor(options = {}) {
    this.options = {
      pinnacleApiKey: options.pinnacleApiKey || process.env.PINNACLE_API_KEY,
      cloudbetApiKey: options.cloudbetApiKey || process.env.CLOUDBET_API_KEY,
      maxwellApiKey: options.maxwellApiKey || process.env.MAXWELL_API_KEY,
      requestTimeout: options.requestTimeout || 30000,
      cacheTtlMs: options.cacheTtlMs || 60000, // 1 minute cache for sharp lines
      ...options
    };
    
    this.cache = new Map();
    this.logger = createLogger({ module: 'sharp-bookmakers', level: 2 });
    
    // Sharp bookmaker configurations
    this.bookmakers = {
      pinnacle: {
        name: 'Pinnacle',
        baseUrl: 'https://api.pinnacle.com',
        enabled: !!this.options.pinnacleApiKey,
        weight: 1.0, // Highest confidence
        marginEstimate: 0.025, // ~2.5% margin
        features: ['high_limits', 'fast_adjustment', 'no_restrictions']
      },
      cloudbet: {
        name: 'Cloudbet',
        baseUrl: 'https://sports-api.cloudbet.com',
        enabled: !!this.options.cloudbetApiKey,
        weight: 0.9,
        marginEstimate: 0.03,
        features: ['crypto_friendly', 'high_limits', 'no_restrictions']
      },
      maxwell: {
        name: 'Maxwell',
        baseUrl: 'https://api.maxwellbet.com',
        enabled: !!this.options.maxwellApiKey,
        weight: 0.85,
        marginEstimate: 0.035,
        features: ['asian_focus', 'high_limits']
      }
    };
  }

  /**
   * Get true line (fair odds) for a specific event
   * Aggregates odds from available sharp bookmakers
   * 
   * @param {string} sport - Sport key (e.g., 'soccer', 'tennis')
   * @param {string} eventId - Unique event identifier
   * @param {string} market - Market type (h2h, spreads, totals)
   * @returns {Promise<Object>} True line odds and confidence
   */
  async getTrueLine(sport, eventId, market = 'h2h') {
    const cacheKey = `${sport}:${eventId}:${market}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const results = await Promise.allSettled([
      this.fetchPinnacleOdds(sport, eventId, market),
      this.fetchCloudbetOdds(sport, eventId, market),
      this.fetchMaxwellOdds(sport, eventId, market)
    ]);

    const validOdds = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    if (validOdds.length === 0) {
      this.logger.warn(`No sharp odds available for ${cacheKey}`);
      return null;
    }

    // Calculate weighted average (removing vig)
    const trueLine = this.calculateTrueLine(validOdds);
    
    const result = {
      eventId,
      sport,
      market,
      trueOdds: trueLine.odds,
      confidence: trueLine.confidence,
      sources: validOdds.map(o => o.bookmaker),
      timestamp: new Date().toISOString(),
      marginRemoved: trueLine.marginRemoved
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Calculate true line from multiple sharp bookmaker odds
   * Removes vig and weights by bookmaker reliability
   * 
   * @param {Array} oddsArray - Array of odds from different bookmakers
   * @returns {Object} True odds and confidence metrics
   */
  calculateTrueLine(oddsArray) {
    // Remove vig from each bookmaker's odds
    const dewiggedOdds = oddsArray.map(odds => ({
      ...odds,
      fairOdds: this.removeVig(odds.rawOdds, odds.marginEstimate),
      weight: odds.weight || this.bookmakers[odds.bookmaker]?.weight || 0.5
    }));

    // Calculate weighted harmonic mean for probabilities
    const totalWeight = dewiggedOdds.reduce((sum, o) => sum + o.weight, 0);
    
    const trueProbabilities = {};
    const outcomes = Object.keys(dewiggedOdds[0].fairOdds);
    
    for (const outcome of outcomes) {
      let weightedProb = 0;
      
      for (const odds of dewiggedOdds) {
        const prob = 1 / odds.fairOdds[outcome];
        weightedProb += prob * (odds.weight / totalWeight);
      }
      
      trueProbabilities[outcome] = weightedProb;
    }

    // Normalize to ensure sum = 1
    const probSum = Object.values(trueProbabilities).reduce((a, b) => a + b, 0);
    
    const normalizedOdds = {};
    for (const [outcome, prob] of Object.entries(trueProbabilities)) {
      normalizedOdds[outcome] = 1 / (prob / probSum);
    }

    // Calculate confidence based on agreement between sources
    const confidence = this.calculateConfidence(dewiggedOdds, normalizedOdds);

    return {
      odds: normalizedOdds,
      confidence,
      marginRemoved: true,
      sourceCount: oddsArray.length
    };
  }

  /**
   * Remove vig (bookmaker margin) from odds
   * 
   * @param {Object} odds - Raw odds with margin
   * @param {number} marginEstimate - Estimated margin (e.g., 0.025 for 2.5%)
   * @returns {Object} Fair odds without margin
   */
  removeVig(odds, marginEstimate) {
    const fairOdds = {};
    
    // Calculate implied probabilities
    const impliedProbs = {};
    for (const [outcome, oddsValue] of Object.entries(odds)) {
      impliedProbs[outcome] = 1 / oddsValue;
    }

    // Remove margin proportionally (assuming proportional margin distribution)
    const totalImpliedProb = Object.values(impliedProbs).reduce((a, b) => a + b, 0);
    const fairProbSum = 1; // Fair probabilities sum to 1
    
    for (const [outcome, impliedProb] of Object.entries(impliedProbs)) {
      const fairProb = impliedProb / totalImpliedProb;
      fairOdds[outcome] = 1 / fairProb;
    }

    return fairOdds;
  }

  /**
   * Calculate confidence score based on agreement between sharp bookmakers
   * 
   * @param {Array} dewiggedOdds - Dewigged odds from multiple sources
   * @param {Object} trueOdds - Calculated true odds
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(dewiggedOdds, trueOdds) {
    if (dewiggedOdds.length < 2) return 0.5;

    let totalVariance = 0;
    let count = 0;

    for (const [outcome, trueOddsValue] of Object.entries(trueOdds)) {
      const deviations = dewiggedOdds.map(o => {
        const sourceOdds = o.fairOdds[outcome];
        return Math.abs(sourceOdds - trueOddsValue) / trueOddsValue;
      });

      const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      totalVariance += avgDeviation;
      count++;
    }

    const avgVariance = totalVariance / count;
    
    // Higher agreement = higher confidence
    // Variance of 0 = 1.0 confidence, variance of 0.1 = 0.5 confidence
    const confidence = Math.max(0, Math.min(1, 1 - (avgVariance * 5)));
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Fetch odds from Pinnacle API
   * 
   * @param {string} sport - Sport key
   * @param {string} eventId - Event identifier
   * @param {string} market - Market type
   * @returns {Promise<Object>} Normalized odds data
   */
  async fetchPinnacleOdds(sport, eventId, market) {
    if (!this.bookmakers.pinnacle.enabled) {
      return null;
    }

    try {
      // Pinnacle API v2
      const url = `${this.bookmakers.pinnacle.baseUrl}/v2/odds`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.options.pinnacleApiKey}`,
          'Accept': 'application/json'
        },
        params: {
          sportId: this.getPinnacleSportId(sport),
          eventId,
          oddsFormat: 'DECIMAL'
        },
        timeout: this.options.requestTimeout
      });

      return this.normalizePinnacleOdds(response.data, market);
    } catch (error) {
      this.logger.debug(`Pinnacle fetch failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch odds from Cloudbet API
   * 
   * @param {string} sport - Sport key
   * @param {string} eventId - Event identifier
   * @param {string} market - Market type
   * @returns {Promise<Object>} Normalized odds data
   */
  async fetchCloudbetOdds(sport, eventId, market) {
    if (!this.bookmakers.cloudbet.enabled) {
      return null;
    }

    try {
      const url = `${this.bookmakers.cloudbet.baseUrl}/v3/events/${eventId}`;
      const response = await axios.get(url, {
        headers: {
          'X-API-Key': this.options.cloudbetApiKey,
          'Accept': 'application/json'
        },
        timeout: this.options.requestTimeout
      });

      return this.normalizeCloudbetOdds(response.data, market);
    } catch (error) {
      this.logger.debug(`Cloudbet fetch failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch odds from Maxwell API
   * 
   * @param {string} sport - Sport key
   * @param {string} eventId - Event identifier
   * @param {string} market - Market type
   * @returns {Promise<Object>} Normalized odds data
   */
  async fetchMaxwellOdds(sport, eventId, market) {
    if (!this.bookmakers.maxwell.enabled) {
      return null;
    }

    try {
      const url = `${this.bookmakers.maxwell.baseUrl}/v1/odds`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.options.maxwellApiKey}`,
          'Accept': 'application/json'
        },
        params: { sport, eventId, market },
        timeout: this.options.requestTimeout
      });

      return this.normalizeMaxwellOdds(response.data, market);
    } catch (error) {
      this.logger.debug(`Maxwell fetch failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Normalize Pinnacle API response
   * 
   * @param {Object} data - Raw API response
   * @param {string} market - Market type
   * @returns {Object} Normalized odds
   */
  normalizePinnacleOdds(data, market) {
    // Implementation depends on actual Pinnacle API response structure
    const odds = {};
    
    if (market === 'h2h' && data.moneyline) {
      odds.home = data.moneyline.home;
      odds.away = data.moneyline.away;
      if (data.moneyline.draw) odds.draw = data.moneyline.draw;
    }

    return {
      bookmaker: 'pinnacle',
      rawOdds: odds,
      marginEstimate: this.bookmakers.pinnacle.marginEstimate,
      weight: this.bookmakers.pinnacle.weight,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Normalize Cloudbet API response
   * 
   * @param {Object} data - Raw API response
   * @param {string} market - Market type
   * @returns {Object} Normalized odds
   */
  normalizeCloudbetOdds(data, market) {
    const odds = {};
    
    if (market === 'h2h' && data.markets?.matchWinner) {
      const outcomes = data.markets.matchWinner.outcomes;
      outcomes.forEach(outcome => {
        odds[outcome.name.toLowerCase()] = outcome.price;
      });
    }

    return {
      bookmaker: 'cloudbet',
      rawOdds: odds,
      marginEstimate: this.bookmakers.cloudbet.marginEstimate,
      weight: this.bookmakers.cloudbet.weight,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Normalize Maxwell API response
   * 
   * @param {Object} data - Raw API response
   * @param {string} market - Market type
   * @returns {Object} Normalized odds
   */
  normalizeMaxwellOdds(data, market) {
    const odds = {};
    
    if (data.odds) {
      Object.assign(odds, data.odds);
    }

    return {
      bookmaker: 'maxwell',
      rawOdds: odds,
      marginEstimate: this.bookmakers.maxwell.marginEstimate,
      weight: this.bookmakers.maxwell.weight,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get Pinnacle sport ID from sport key
   * 
   * @param {string} sport - Sport key
   * @returns {number} Pinnacle sport ID
   */
  getPinnacleSportId(sport) {
    const sportMap = {
      'soccer': 29,
      'tennis': 33,
      'basketball': 4,
      'baseball': 3,
      'hockey': 19,
      'football': 15,
      'boxing': 9,
      'mma': 22,
      'esports': 44
    };
    return sportMap[sport] || 29;
  }

  /**
   * Detect value bets by comparing recreational bookmaker odds to true line
   * 
   * @param {Object} recreationalOdds - Odds from recreational bookmaker
   * @param {Object} trueLine - True line from sharp bookmakers
   * @returns {Object} Value bet analysis
   */
  detectValueBet(recreationalOdds, trueLine) {
    const valueBets = [];

    for (const [outcome, recOdds] of Object.entries(recreationalOdds)) {
      const trueOdds = trueLine.trueOdds[outcome];
      if (!trueOdds) continue;

      const recProb = 1 / recOdds;
      const trueProb = 1 / trueOdds;
      
      const edge = (trueProb - recProb) / recProb;
      const expectedValue = (recOdds * trueProb) - 1;

      if (expectedValue > 0) {
        valueBets.push({
          outcome,
          bookmakerOdds: recOdds,
          trueOdds,
          edge: Math.round(edge * 10000) / 100, // Basis points
          expectedValue: Math.round(expectedValue * 10000) / 100, // Percentage
          confidence: trueLine.confidence,
          recommendation: this.getValueRecommendation(expectedValue, trueLine.confidence)
        });
      }
    }

    return {
      hasValue: valueBets.length > 0,
      valueBets,
      bestValue: valueBets.length > 0 
        ? valueBets.reduce((best, current) => 
            current.expectedValue > best.expectedValue ? current : best
          )
        : null
    };
  }

  /**
   * Get recommendation for value bet based on EV and confidence
   * 
   * @param {number} ev - Expected value
   * @param {number} confidence - Confidence score
   * @returns {string} Recommendation
   */
  getValueRecommendation(ev, confidence) {
    if (ev > 0.05 && confidence > 0.8) return 'STRONG_BET';
    if (ev > 0.03 && confidence > 0.7) return 'BET';
    if (ev > 0.02 && confidence > 0.6) return 'SMALL_BET';
    if (ev > 0) return 'MARGINAL';
    return 'NO_BET';
  }

  /**
   * Get cached result
   * 
   * @param {string} key - Cache key
   * @returns {Object|null} Cached value or null
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.options.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  /**
   * Set cached result
   * 
   * @param {string} key - Cache key
   * @param {Object} value - Value to cache
   */
  setCached(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Get health status of sharp bookmaker integrations
   * 
   * @returns {Object} Health status for each bookmaker
   */
  getHealthStatus() {
    return {
      pinnacle: {
        enabled: this.bookmakers.pinnacle.enabled,
        status: this.bookmakers.pinnacle.enabled ? 'configured' : 'not_configured',
        features: this.bookmakers.pinnacle.features
      },
      cloudbet: {
        enabled: this.bookmakers.cloudbet.enabled,
        status: this.bookmakers.cloudbet.enabled ? 'configured' : 'not_configured',
        features: this.bookmakers.cloudbet.features
      },
      maxwell: {
        enabled: this.bookmakers.maxwell.enabled,
        status: this.bookmakers.maxwell.enabled ? 'configured' : 'not_configured',
        features: this.bookmakers.maxwell.features
      }
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('Sharp bookmaker cache cleared');
  }
}

module.exports = SharpBookmakerIntegration;
