/**
 * Opportunity Quality Scoring Algorithm
 * Scores arbitrage and +EV opportunities based on multiple quality factors
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class OpportunityQualityScorer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.historyFile = path.join(this.dataDir, 'opportunity-history.json');
    this.bookmakerStatsFile = path.join(this.dataDir, 'bookmaker-stats.json');
    
    // Scoring weights (configurable)
    this.weights = {
      profitPercent: 0.25,      // Higher profit = better
      timeToEvent: 0.20,        // More time = better (up to a point)
      bookmakerReliability: 0.20, // Higher reliability = better
      marketLiquidity: 0.15,    // Higher liquidity = better
      historicalFillRate: 0.15, // Higher fill rate = better
      oddsStability: 0.05       // More stable odds = better
    };
    
    // Quality thresholds
    this.thresholds = {
      excellent: 85,  // 85-100
      good: 70,       // 70-84
      fair: 50,       // 50-69
      poor: 30        // 0-29
    };
    
    // Bookmaker reliability scores (0-100)
    this.bookmakerReliability = new Map();
    
    // Historical opportunity data
    this.opportunityHistory = [];
    
    // Market liquidity estimates
    this.marketLiquidity = new Map();
  }
  
  async init() {
    await this.loadBookmakerStats();
    await this.loadOpportunityHistory();
    console.log('[QualityScorer] Initialized with', this.bookmakerReliability.size, 'bookmaker reliability scores');
    return this;
  }
  
  /**
   * Load bookmaker reliability statistics
   */
  async loadBookmakerStats() {
    try {
      const data = await fs.readFile(this.bookmakerStatsFile, 'utf8');
      const stats = JSON.parse(data);
      
      for (const [bookmaker, score] of Object.entries(stats.reliability || {})) {
        this.bookmakerReliability.set(bookmaker, score);
      }
      
      // Market liquidity data
      for (const [market, liquidity] of Object.entries(stats.marketLiquidity || {})) {
        this.marketLiquidity.set(market, liquidity);
      }
    } catch (error) {
      // Initialize with default values
      this.initializeDefaultBookmakerStats();
    }
  }
  
  /**
   * Initialize default bookmaker reliability scores
   */
  initializeDefaultBookmakerStats() {
    const defaults = {
      'Unibet': 92,
      'Betclic': 88,
      'Winamax': 90,
      'FDJ': 85,
      'ParionsSport': 83,
      'ZEbet': 80,
      'Betfair': 95,
      'Smarkets': 93,
      'Polymarket': 87,
      'Pinnacle': 96
    };
    
    for (const [bookmaker, score] of Object.entries(defaults)) {
      this.bookmakerReliability.set(bookmaker, score);
    }
    
    // Default market liquidity scores
    const marketDefaults = {
      '1X2': 95,
      'Match Winner': 95,
      'Asian Handicap': 85,
      'Over/Under': 90,
      'BTTS': 88,
      'Double Chance': 82,
      'Correct Score': 60,
      'First Goalscorer': 55,
      'Corners': 70,
      'Cards': 65
    };
    
    for (const [market, liquidity] of Object.entries(marketDefaults)) {
      this.marketLiquidity.set(market, liquidity);
    }
  }
  
  /**
   * Load opportunity history for fill rate calculation
   */
  async loadOpportunityHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      this.opportunityHistory = JSON.parse(data);
      // Keep only last 90 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      this.opportunityHistory = this.opportunityHistory.filter(
        h => new Date(h.timestamp) > cutoff
      );
    } catch (error) {
      this.opportunityHistory = [];
    }
  }
  
  /**
   * Save bookmaker statistics
   */
  async saveBookmakerStats() {
    const stats = {
      reliability: Object.fromEntries(this.bookmakerReliability),
      marketLiquidity: Object.fromEntries(this.marketLiquidity),
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(this.bookmakerStatsFile, JSON.stringify(stats, null, 2));
  }
  
  /**
   * Save opportunity history
   */
  async saveOpportunityHistory() {
    await fs.writeFile(this.historyFile, JSON.stringify(this.opportunityHistory, null, 2));
  }
  
  /**
   * Calculate quality score for an arbitrage opportunity
   */
  scoreArbitrageOpportunity(opportunity) {
    const scores = {
      profitPercent: this.scoreProfitPercent(opportunity.profitPercent),
      timeToEvent: this.scoreTimeToEvent(opportunity.timeToEvent || this.estimateTimeToEvent(opportunity)),
      bookmakerReliability: this.scoreBookmakerReliability(opportunity.legs),
      marketLiquidity: this.scoreMarketLiquidity(opportunity.market || '1X2'),
      historicalFillRate: this.scoreHistoricalFillRate(opportunity),
      oddsStability: this.scoreOddsStability(opportunity)
    };
    
    // Calculate weighted total
    const totalScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * this.weights[key]);
    }, 0);
    
    const finalScore = Math.round(totalScore);
    const quality = this.getQualityLabel(finalScore);
    
    const result = {
      score: finalScore,
      quality,
      scores,
      factors: this.generateFactorAnalysis(scores, opportunity),
      recommendation: this.generateRecommendation(finalScore, scores, opportunity),
      timestamp: new Date().toISOString()
    };
    
    this.emit('opportunityScored', { opportunity, score: result });
    
    return result;
  }
  
  /**
   * Calculate quality score for a +EV opportunity
   */
  scoreEVOpportunity(opportunity) {
    const scores = {
      profitPercent: this.scoreEVPercent(opportunity.evPercent),
      timeToEvent: this.scoreTimeToEvent(opportunity.timeToEvent || this.estimateTimeToEvent(opportunity)),
      bookmakerReliability: this.scoreBookmakerReliability([{ bookmaker: opportunity.bookmaker }]),
      marketLiquidity: this.scoreMarketLiquidity(opportunity.market || '1X2'),
      historicalFillRate: this.scoreHistoricalFillRate(opportunity),
      oddsStability: this.scoreOddsStability(opportunity)
    };
    
    // Adjust weights for EV (profit % less important than for arb)
    const evWeights = {
      ...this.weights,
      profitPercent: 0.20,
      bookmakerReliability: 0.25 // More important for EV
    };
    
    const totalScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * (evWeights[key] || this.weights[key]));
    }, 0);
    
    const finalScore = Math.round(totalScore);
    const quality = this.getQualityLabel(finalScore);
    
    const result = {
      score: finalScore,
      quality,
      scores,
      factors: this.generateFactorAnalysis(scores, opportunity),
      recommendation: this.generateRecommendation(finalScore, scores, opportunity),
      timestamp: new Date().toISOString()
    };
    
    this.emit('opportunityScored', { opportunity, score: result });
    
    return result;
  }
  
  /**
   * Score based on profit percentage (arbitrage)
   */
  scoreProfitPercent(profitPercent) {
    // Higher profit is better, but diminishing returns after 5%
    // Suspiciously high profits (>10%) get penalized
    
    if (profitPercent > 10) {
      // Suspicious - possible palpable error
      return 40;
    }
    
    if (profitPercent >= 5) {
      return 100;
    }
    
    if (profitPercent >= 3) {
      return 80 + (profitPercent - 3) * 10;
    }
    
    if (profitPercent >= 1) {
      return 50 + (profitPercent - 1) * 15;
    }
    
    return Math.max(20, profitPercent * 50);
  }
  
  /**
   * Score based on EV percentage
   */
  scoreEVPercent(evPercent) {
    // Similar to profit but adjusted for EV expectations
    // EV bets typically have lower edge than arbs
    
    if (evPercent > 20) {
      // Very high EV - investigate
      return 60;
    }
    
    if (evPercent >= 10) {
      return 100;
    }
    
    if (evPercent >= 5) {
      return 80 + (evPercent - 5) * 4;
    }
    
    if (evPercent >= 2) {
      return 60 + (evPercent - 2) * 6.67;
    }
    
    return Math.max(30, evPercent * 30);
  }
  
  /**
   * Score based on time to event
   */
  scoreTimeToEvent(hoursToEvent) {
    // Sweet spot: 2-48 hours before event
    // Too early: odds may change significantly
    // Too late: may not have time to place all bets
    
    if (hoursToEvent < 0.5) {
      // Less than 30 minutes - risky
      return 30;
    }
    
    if (hoursToEvent < 2) {
      // 30 min - 2 hours - urgent but doable
      return 50 + (hoursToEvent - 0.5) * 16.7;
    }
    
    if (hoursToEvent <= 48) {
      // 2-48 hours - optimal
      return 100;
    }
    
    if (hoursToEvent <= 168) {
      // 2-7 days - good
      return 90 - (hoursToEvent - 48) * 0.2;
    }
    
    // More than a week - odds may change
    return Math.max(60, 80 - (hoursToEvent - 168) * 0.1);
  }
  
  /**
   * Score based on bookmaker reliability
   */
  scoreBookmakerReliability(legs) {
    if (!legs || legs.length === 0) return 50;
    
    const scores = legs.map(leg => {
      const reliability = this.bookmakerReliability.get(leg.bookmaker);
      return reliability !== undefined ? reliability : 70; // Default for unknown
    });
    
    // Use minimum score (weakest link)
    return Math.min(...scores);
  }
  
  /**
   * Score based on market liquidity
   */
  scoreMarketLiquidity(market) {
    const liquidity = this.marketLiquidity.get(market);
    return liquidity !== undefined ? liquidity : 70;
  }
  
  /**
   * Score based on historical fill rate
   */
  scoreHistoricalFillRate(opportunity) {
    // Look for similar opportunities in history
    const similar = this.opportunityHistory.filter(h => {
      const sameSport = h.sport === opportunity.sport;
      const sameMarket = h.market === (opportunity.market || '1X2');
      const similarProfit = Math.abs(h.profitPercent - (opportunity.profitPercent || opportunity.evPercent)) < 1;
      return sameSport && sameMarket && similarProfit;
    });
    
    if (similar.length === 0) {
      return 70; // Neutral for unknown
    }
    
    const filled = similar.filter(s => s.filled === true).length;
    const fillRate = filled / similar.length;
    
    return Math.round(fillRate * 100);
  }
  
  /**
   * Score based on odds stability
   */
  scoreOddsStability(opportunity) {
    // Check if odds have been stable recently
    // This would typically use the odds movement tracker data
    // For now, return a neutral score
    return 75;
  }
  
  /**
   * Estimate time to event from opportunity data
   */
  estimateTimeToEvent(opportunity) {
    if (opportunity.eventTime) {
      const eventTime = new Date(opportunity.eventTime);
      const now = new Date();
      return (eventTime - now) / (1000 * 60 * 60); // hours
    }
    
    // Default assumption: 24 hours
    return 24;
  }
  
  /**
   * Get quality label from score
   */
  getQualityLabel(score) {
    if (score >= this.thresholds.excellent) return 'excellent';
    if (score >= this.thresholds.good) return 'good';
    if (score >= this.thresholds.fair) return 'fair';
    if (score >= this.thresholds.poor) return 'poor';
    return 'very-poor';
  }
  
  /**
   * Generate factor analysis
   */
  generateFactorAnalysis(scores, opportunity) {
    const factors = [];
    
    // Profit factor
    if (scores.profitPercent >= 90) {
      factors.push({ type: 'positive', factor: 'profit', message: 'Excellent profit margin' });
    } else if (scores.profitPercent < 50) {
      factors.push({ type: 'negative', factor: 'profit', message: 'Low profit margin' });
    }
    
    // Time factor
    if (scores.timeToEvent < 50) {
      factors.push({ type: 'warning', factor: 'time', message: 'Urgent - limited time to place bets' });
    } else if (scores.timeToEvent >= 90) {
      factors.push({ type: 'positive', factor: 'time', message: 'Good time buffer' });
    }
    
    // Bookmaker factor
    if (scores.bookmakerReliability < 70) {
      factors.push({ type: 'warning', factor: 'bookmaker', message: 'Lower reliability bookmaker involved' });
    }
    
    // Liquidity factor
    if (scores.marketLiquidity < 60) {
      factors.push({ type: 'warning', factor: 'liquidity', message: 'Low liquidity market - stake limits may apply' });
    }
    
    // Historical factor
    if (scores.historicalFillRate < 50) {
      factors.push({ type: 'negative', factor: 'history', message: 'Poor historical fill rate' });
    } else if (scores.historicalFillRate >= 80) {
      factors.push({ type: 'positive', factor: 'history', message: 'Good historical fill rate' });
    }
    
    return factors;
  }
  
  /**
   * Generate recommendation based on score
   */
  generateRecommendation(score, scores, opportunity) {
    if (score >= 85) {
      return {
        action: 'take-immediately',
        priority: 'high',
        message: 'High quality opportunity - act quickly',
        maxStake: 'full'
      };
    }
    
    if (score >= 70) {
      return {
        action: 'take',
        priority: 'medium',
        message: 'Good opportunity - proceed with standard stake',
        maxStake: 'standard'
      };
    }
    
    if (score >= 50) {
      // Check specific concerns
      if (scores.timeToEvent < 50) {
        return {
          action: 'take-caution',
          priority: 'low',
          message: 'Fair opportunity but time is limited',
          maxStake: 'reduced'
        };
      }
      
      if (scores.bookmakerReliability < 70) {
        return {
          action: 'take-caution',
          priority: 'low',
          message: 'Fair opportunity but watch bookmaker restrictions',
          maxStake: 'reduced'
        };
      }
      
      return {
        action: 'take-caution',
        priority: 'low',
        message: 'Acceptable opportunity with some concerns',
        maxStake: 'reduced'
      };
    }
    
    if (score >= 30) {
      return {
        action: 'skip-or-minimal',
        priority: 'none',
        message: 'Poor quality - consider skipping or minimal stake',
        maxStake: 'minimal'
      };
    }
    
    return {
      action: 'skip',
      priority: 'none',
      message: 'Very poor quality - skip this opportunity',
      maxStake: 'none'
    };
  }
  
  /**
   * Record opportunity outcome for learning
   */
  async recordOutcome(opportunity, outcome) {
    const record = {
      id: opportunity.id || this.generateId(),
      timestamp: new Date().toISOString(),
      sport: opportunity.sport,
      market: opportunity.market || '1X2',
      profitPercent: opportunity.profitPercent || opportunity.evPercent,
      bookmakers: opportunity.legs?.map(l => l.bookmaker) || [opportunity.bookmaker],
      score: opportunity.qualityScore,
      filled: outcome.filled,
      actualProfit: outcome.actualProfit,
      notes: outcome.notes
    };
    
    this.opportunityHistory.push(record);
    
    // Keep only last 1000 records
    if (this.opportunityHistory.length > 1000) {
      this.opportunityHistory = this.opportunityHistory.slice(-1000);
    }
    
    await this.saveOpportunityHistory();
    
    // Update bookmaker reliability if outcome was bad
    if (!outcome.filled && outcome.reason === 'bookmaker_rejection') {
      await this.adjustBookmakerReliability(outcome.bookmaker, -2);
    }
    
    this.emit('outcomeRecorded', { record, outcome });
  }
  
  /**
   * Adjust bookmaker reliability score
   */
  async adjustBookmakerReliability(bookmaker, delta) {
    const current = this.bookmakerReliability.get(bookmaker) || 70;
    const adjusted = Math.max(0, Math.min(100, current + delta));
    this.bookmakerReliability.set(bookmaker, adjusted);
    await this.saveBookmakerStats();
  }
  
  /**
   * Score multiple opportunities and rank them
   */
  scoreAndRankOpportunities(opportunities, type = 'arbitrage') {
    const scored = opportunities.map(opp => {
      const score = type === 'arbitrage' 
        ? this.scoreArbitrageOpportunity(opp)
        : this.scoreEVOpportunity(opp);
      
      return {
        ...opp,
        qualityScore: score.score,
        quality: score.quality,
        qualityDetails: score
      };
    });
    
    // Sort by score descending
    return scored.sort((a, b) => b.qualityScore - a.qualityScore);
  }
  
  /**
   * Filter opportunities by minimum quality
   */
  filterByQuality(opportunities, minQuality = 'fair', type = 'arbitrage') {
    const scored = this.scoreAndRankOpportunities(opportunities, type);
    
    const qualityLevels = {
      'excellent': 85,
      'good': 70,
      'fair': 50,
      'poor': 30,
      'very-poor': 0
    };
    
    const minScore = qualityLevels[minQuality] || 50;
    return scored.filter(opp => opp.qualityScore >= minScore);
  }
  
  /**
   * Get quality distribution statistics
   */
  getQualityDistribution(opportunities, type = 'arbitrage') {
    const scored = this.scoreAndRankOpportunities(opportunities, type);
    
    const distribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      'very-poor': 0
    };
    
    for (const opp of scored) {
      distribution[opp.quality] = (distribution[opp.quality] || 0) + 1;
    }
    
    return {
      distribution,
      total: scored.length,
      averageScore: scored.reduce((sum, o) => sum + o.qualityScore, 0) / scored.length || 0,
      topOpportunities: scored.slice(0, 5)
    };
  }
  
  /**
   * Update scoring weights
   */
  updateWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    this.emit('weightsUpdated', this.weights);
  }
  
  /**
   * Get current configuration
   */
  getConfig() {
    return {
      weights: this.weights,
      thresholds: this.thresholds,
      bookmakerReliability: Object.fromEntries(this.bookmakerReliability),
      marketLiquidity: Object.fromEntries(this.marketLiquidity)
    };
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = { OpportunityQualityScorer };
