/**
 * Correlation Detector for Related Bets
 * Detects correlated bets across different markets to prevent overexposure
 */

const EventEmitter = require('events');

class CorrelationDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.correlationThreshold = options.correlationThreshold || 0.7;
    this.maxExposurePerEvent = options.maxExposurePerEvent || 1000;
    this.maxExposurePerTeam = options.maxExposurePerTeam || 2000;
    this.maxExposurePerLeague = options.maxExposurePerLeague || 5000;
    this.dataDir = options.dataDir || './data';
    
    // Track current exposures
    this.eventExposures = new Map();
    this.teamExposures = new Map();
    this.leagueExposures = new Map();
    this.marketExposures = new Map();
    
    // Bet registry for correlation analysis
    this.activeBets = new Map();
    this.betHistory = [];
    
    // Market correlation matrix
    this.marketCorrelations = this.initializeMarketCorrelations();
    
    // Team/League mappings
    this.teamLeagues = new Map();
    this.leagueTeams = new Map();
  }

  /**
   * Initialize default market correlation matrix
   * Values represent correlation coefficient (0-1)
   */
  initializeMarketCorrelations() {
    return {
      // Match result markets
      '1X2': {
        '1X2': 1.0,
        'double_chance_1x': 0.95,
        'double_chance_12': 0.95,
        'double_chance_x2': 0.95,
        'draw_no_bet_1': 0.9,
        'draw_no_bet_2': 0.9,
        'asian_handicap': 0.85,
        'european_handicap': 0.9,
        'over_under': 0.3,
        'btts': 0.4,
        'correct_score': 0.7,
        'half_time_full_time': 0.75
      },
      'double_chance_1x': {
        '1X2': 0.95,
        'double_chance_1x': 1.0,
        'asian_handicap_plus_0_5_home': 0.98
      },
      'double_chance_12': {
        '1X2': 0.95,
        'double_chance_12': 1.0,
        'btts_no': 0.6
      },
      'double_chance_x2': {
        '1X2': 0.95,
        'double_chance_x2': 1.0,
        'asian_handicap_plus_0_5_away': 0.98
      },
      // Asian Handicap correlations
      'asian_handicap': {
        '1X2': 0.85,
        'asian_handicap': 1.0,
        'european_handicap': 0.95,
        'over_under': 0.5
      },
      'asian_handicap_plus_0_5_home': {
        'double_chance_1x': 0.98,
        '1X2_home': 0.9,
        'over_under_over_0_5': 0.85
      },
      'asian_handicap_plus_0_5_away': {
        'double_chance_x2': 0.98,
        '1X2_away': 0.9,
        'over_under_over_0_5': 0.85
      },
      // Over/Under correlations
      'over_under': {
        '1X2': 0.3,
        'asian_handicap': 0.5,
        'over_under': 1.0,
        'btts': 0.7,
        'correct_score': 0.6
      },
      'over_under_over_2_5': {
        'btts_yes': 0.8,
        'correct_score_any_over_2_5': 0.9
      },
      'over_under_under_2_5': {
        'btts_no': 0.75,
        'correct_score_any_under_2_5': 0.9
      },
      // BTTS correlations
      'btts': {
        '1X2': 0.4,
        'over_under': 0.7,
        'btts': 1.0,
        'correct_score': 0.5
      },
      'btts_yes': {
        'over_under_over_2_5': 0.8,
        'correct_score_any_both_score': 0.95
      },
      'btts_no': {
        'double_chance_12': 0.6,
        'over_under_under_2_5': 0.75
      },
      // Correct score correlations
      'correct_score': {
        '1X2': 0.7,
        'over_under': 0.6,
        'btts': 0.5,
        'correct_score': 1.0
      },
      // Half-time/Full-time
      'half_time_full_time': {
        '1X2': 0.75,
        'half_time_full_time': 1.0
      },
      // Lay betting (exchanges)
      'lay_1': {
        '1X2_2': 0.85,
        '1X2_x': 0.85,
        'double_chance_x2': 0.9
      },
      'lay_2': {
        '1X2_1': 0.85,
        '1X2_x': 0.85,
        'double_chance_1x': 0.9
      },
      'lay_x': {
        '1X2_1': 0.85,
        '1X2_2': 0.85,
        'double_chance_12': 0.9
      }
    };
  }

  /**
   * Get correlation coefficient between two markets
   */
  getMarketCorrelation(market1, market2) {
    if (market1 === market2) return 1.0;
    
    // Check direct correlation
    if (this.marketCorrelations[market1]?.[market2] !== undefined) {
      return this.marketCorrelations[market1][market2];
    }
    
    // Check reverse correlation
    if (this.marketCorrelations[market2]?.[market1] !== undefined) {
      return this.marketCorrelations[market2][market1];
    }
    
    // Default low correlation
    return 0.1;
  }

  /**
   * Calculate correlation between two bets
   */
  calculateBetCorrelation(bet1, bet2) {
    // Same event - high correlation
    if (bet1.eventId === bet2.eventId) {
      return this.getMarketCorrelation(bet1.market, bet2.market);
    }
    
    // Same teams in different events (e.g., back-to-back games)
    const sharedTeams = this.getSharedTeams(bet1, bet2);
    if (sharedTeams.length > 0) {
      // Check if same league
      const sameLeague = bet1.league === bet2.league;
      const baseCorrelation = sameLeague ? 0.4 : 0.2;
      
      // Higher correlation if same team involved
      if (sharedTeams.includes(bet1.team) || sharedTeams.includes(bet2.team)) {
        return Math.min(0.6, baseCorrelation + 0.2);
      }
      
      return baseCorrelation;
    }
    
    // Same league, different teams
    if (bet1.league === bet2.league) {
      return 0.15;
    }
    
    // Same sport
    if (bet1.sport === bet2.sport) {
      return 0.05;
    }
    
    // No correlation
    return 0;
  }

  /**
   * Get shared teams between two bets
   */
  getSharedTeams(bet1, bet2) {
    const teams1 = [bet1.homeTeam, bet1.awayTeam].filter(Boolean);
    const teams2 = [bet2.homeTeam, bet2.awayTeam].filter(Boolean);
    return teams1.filter(t => teams2.includes(t));
  }

  /**
   * Register a new bet and check correlations
   */
  registerBet(bet) {
    const betId = bet.id || this.generateBetId();
    const betData = {
      id: betId,
      eventId: bet.eventId,
      eventName: bet.eventName,
      homeTeam: bet.homeTeam,
      awayTeam: bet.awayTeam,
      team: bet.team,
      league: bet.league,
      sport: bet.sport,
      market: bet.market,
      outcome: bet.outcome,
      odds: bet.odds,
      stake: bet.stake,
      bookmaker: bet.bookmaker,
      timestamp: new Date().toISOString(),
      expectedValue: bet.expectedValue || 0,
      correlationGroup: null
    };

    // Find correlated bets
    const correlatedBets = this.findCorrelatedBets(betData);
    
    // Calculate aggregate correlation
    const aggregateCorrelation = this.calculateAggregateCorrelation(betData, correlatedBets);
    
    // Check exposure limits
    const exposureCheck = this.checkExposureLimits(betData);
    
    // Assign correlation group
    if (correlatedBets.length > 0) {
      betData.correlationGroup = this.assignCorrelationGroup(betData, correlatedBets);
    }

    // Update exposures
    this.updateExposures(betData);
    
    // Store bet
    this.activeBets.set(betId, betData);
    
    // Emit events
    this.emit('betRegistered', {
      bet: betData,
      correlatedBets,
      aggregateCorrelation,
      exposureCheck
    });

    if (exposureCheck.wouldExceed) {
      this.emit('exposureWarning', {
        bet: betData,
        exposureCheck,
        correlatedBets
      });
    }

    return {
      betId,
      correlatedBets: correlatedBets.map(b => ({
        id: b.id,
        eventName: b.eventName,
        correlation: this.calculateBetCorrelation(betData, b),
        market: b.market
      })),
      aggregateCorrelation,
      exposureCheck,
      canPlace: !exposureCheck.wouldExceed
    };
  }

  /**
   * Find bets that correlate with the given bet
   */
  findCorrelatedBets(bet, threshold = this.correlationThreshold) {
    const correlated = [];
    
    for (const [_, existingBet] of this.activeBets) {
      const correlation = this.calculateBetCorrelation(bet, existingBet);
      if (correlation >= threshold) {
        correlated.push({
          ...existingBet,
          correlationCoefficient: correlation
        });
      }
    }
    
    return correlated.sort((a, b) => b.correlationCoefficient - a.correlationCoefficient);
  }

  /**
   * Calculate aggregate correlation with existing portfolio
   */
  calculateAggregateCorrelation(bet, correlatedBets) {
    if (correlatedBets.length === 0) return 0;
    
    // Weighted average by stake
    let totalWeight = 0;
    let weightedCorrelation = 0;
    
    for (const correlatedBet of correlatedBets) {
      const weight = correlatedBet.stake || 1;
      totalWeight += weight;
      weightedCorrelation += correlatedBet.correlationCoefficient * weight;
    }
    
    return totalWeight > 0 ? weightedCorrelation / totalWeight : 0;
  }

  /**
   * Check if adding this bet would exceed exposure limits
   */
  checkExposureLimits(bet) {
    const checks = {
      event: {
        current: this.eventExposures.get(bet.eventId) || 0,
        limit: this.maxExposurePerEvent,
        wouldAdd: bet.stake || 0,
        wouldTotal: (this.eventExposures.get(bet.eventId) || 0) + (bet.stake || 0)
      },
      team: {
        current: this.teamExposures.get(bet.team) || 0,
        limit: this.maxExposurePerTeam,
        wouldAdd: bet.stake || 0,
        wouldTotal: (this.teamExposures.get(bet.team) || 0) + (bet.stake || 0)
      },
      league: {
        current: this.leagueExposures.get(bet.league) || 0,
        limit: this.maxExposurePerLeague,
        wouldAdd: bet.stake || 0,
        wouldTotal: (this.leagueExposures.get(bet.league) || 0) + (bet.stake || 0)
      }
    };

    const exceeded = [];
    if (checks.event.wouldTotal > checks.event.limit) exceeded.push('event');
    if (checks.team.wouldTotal > checks.team.limit) exceeded.push('team');
    if (checks.league.wouldTotal > checks.league.limit) exceeded.push('league');

    return {
      wouldExceed: exceeded.length > 0,
      exceeded,
      details: checks
    };
  }

  /**
   * Update exposure tracking
   */
  updateExposures(bet) {
    // Event exposure
    const currentEvent = this.eventExposures.get(bet.eventId) || 0;
    this.eventExposures.set(bet.eventId, currentEvent + (bet.stake || 0));

    // Team exposure
    if (bet.team) {
      const currentTeam = this.teamExposures.get(bet.team) || 0;
      this.teamExposures.set(bet.team, currentTeam + (bet.stake || 0));
    }

    // League exposure
    if (bet.league) {
      const currentLeague = this.leagueExposures.get(bet.league) || 0;
      this.leagueExposures.set(bet.league, currentLeague + (bet.stake || 0));
    }

    // Market exposure
    const marketKey = `${bet.sport}:${bet.market}`;
    const currentMarket = this.marketExposures.get(marketKey) || 0;
    this.marketExposures.set(marketKey, currentMarket + (bet.stake || 0));
  }

  /**
   * Assign correlation group
   */
  assignCorrelationGroup(bet, correlatedBets) {
    // Find existing group or create new
    const existingGroups = correlatedBets
      .filter(b => b.correlationGroup)
      .map(b => b.correlationGroup);
    
    if (existingGroups.length > 0) {
      // Join the largest group
      const groupCounts = {};
      for (const group of existingGroups) {
        groupCounts[group] = (groupCounts[group] || 0) + 1;
      }
      return Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }
    
    // Create new group
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Settle a bet and update exposures
   */
  settleBet(betId, result) {
    const bet = this.activeBets.get(betId);
    if (!bet) return null;

    // Update exposures (remove stake)
    this.reduceExposures(bet);

    // Move to history
    bet.settledAt = new Date().toISOString();
    bet.result = result;
    bet.profit = result.profit || 0;
    this.betHistory.push(bet);
    this.activeBets.delete(betId);

    this.emit('betSettled', { bet, result });

    return bet;
  }

  /**
   * Reduce exposures when bet settles
   */
  reduceExposures(bet) {
    const stake = bet.stake || 0;

    if (this.eventExposures.has(bet.eventId)) {
      this.eventExposures.set(bet.eventId, Math.max(0, this.eventExposures.get(bet.eventId) - stake));
    }

    if (bet.team && this.teamExposures.has(bet.team)) {
      this.teamExposures.set(bet.team, Math.max(0, this.teamExposures.get(bet.team) - stake));
    }

    if (bet.league && this.leagueExposures.has(bet.league)) {
      this.leagueExposures.set(bet.league, Math.max(0, this.leagueExposures.get(bet.league) - stake));
    }

    const marketKey = `${bet.sport}:${bet.market}`;
    if (this.marketExposures.has(marketKey)) {
      this.marketExposures.set(marketKey, Math.max(0, this.marketExposures.get(marketKey) - stake));
    }
  }

  /**
   * Get current exposure summary
   */
  getExposureSummary() {
    return {
      events: Object.fromEntries(this.eventExposures),
      teams: Object.fromEntries(this.teamExposures),
      leagues: Object.fromEntries(this.leagueExposures),
      markets: Object.fromEntries(this.marketExposures),
      limits: {
        perEvent: this.maxExposurePerEvent,
        perTeam: this.maxExposurePerTeam,
        perLeague: this.maxExposurePerLeague
      },
      activeBets: this.activeBets.size,
      totalExposed: Array.from(this.eventExposures.values()).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Get correlation groups
   */
  getCorrelationGroups() {
    const groups = new Map();
    
    for (const [_, bet] of this.activeBets) {
      if (bet.correlationGroup) {
        if (!groups.has(bet.correlationGroup)) {
          groups.set(bet.correlationGroup, []);
        }
        groups.get(bet.correlationGroup).push(bet);
      }
    }

    return Array.from(groups.entries()).map(([id, bets]) => ({
      id,
      bets: bets.map(b => ({
        id: b.id,
        eventName: b.eventName,
        market: b.market,
        stake: b.stake,
        odds: b.odds
      })),
      totalStake: bets.reduce((sum, b) => sum + (b.stake || 0), 0),
      avgCorrelation: this.calculateGroupCorrelation(bets)
    }));
  }

  /**
   * Calculate average correlation within a group
   */
  calculateGroupCorrelation(bets) {
    if (bets.length < 2) return 0;
    
    let totalCorrelation = 0;
    let pairs = 0;
    
    for (let i = 0; i < bets.length; i++) {
      for (let j = i + 1; j < bets.length; j++) {
        totalCorrelation += this.calculateBetCorrelation(bets[i], bets[j]);
        pairs++;
      }
    }
    
    return pairs > 0 ? totalCorrelation / pairs : 0;
  }

  /**
   * Analyze opportunity for correlation risks
   */
  analyzeOpportunity(opportunity) {
    const risks = [];
    const warnings = [];
    
    // Check if similar bets already exist
    for (const leg of opportunity.legs || []) {
      const bet = {
        eventId: opportunity.eventId || opportunity.id,
        eventName: opportunity.event,
        homeTeam: opportunity.homeTeam,
        awayTeam: opportunity.awayTeam,
        team: leg.outcome,
        league: opportunity.league,
        sport: opportunity.sport,
        market: leg.market || '1X2',
        outcome: leg.outcome,
        odds: leg.odds,
        stake: leg.stake || 0,
        bookmaker: leg.bookmaker
      };
      
      const correlated = this.findCorrelatedBets(bet, 0.5);
      
      if (correlated.length > 0) {
        const highCorrelation = correlated.filter(c => c.correlationCoefficient >= this.correlationThreshold);
        
        if (highCorrelation.length > 0) {
          risks.push({
            type: 'high_correlation',
            message: `High correlation detected with ${highCorrelation.length} existing bets`,
            correlatedBets: highCorrelation.map(c => c.id),
            maxCorrelation: Math.max(...highCorrelation.map(c => c.correlationCoefficient))
          });
        } else {
          warnings.push({
            type: 'moderate_correlation',
            message: `Moderate correlation with ${correlated.length} existing bets`,
            correlatedBets: correlated.map(c => c.id)
          });
        }
      }
      
      // Check exposure
      const exposureCheck = this.checkExposureLimits(bet);
      if (exposureCheck.wouldExceed) {
        risks.push({
          type: 'exposure_limit',
          message: `Would exceed ${exposureCheck.exceeded.join(', ')} exposure limits`,
          details: exposureCheck.details
        });
      }
    }
    
    return {
      canProceed: risks.length === 0,
      risks,
      warnings,
      riskLevel: risks.length > 0 ? 'high' : warnings.length > 0 ? 'medium' : 'low'
    };
  }

  /**
   * Get diversification score
   */
  getDiversificationScore() {
    const totalBets = this.activeBets.size;
    if (totalBets === 0) return 100;
    
    // Calculate metrics
    const uniqueEvents = new Set(Array.from(this.activeBets.values()).map(b => b.eventId)).size;
    const uniqueLeagues = new Set(Array.from(this.activeBets.values()).map(b => b.league)).size;
    const uniqueMarkets = new Set(Array.from(this.activeBets.values()).map(b => b.market)).size;
    
    // Scores (0-100)
    const eventScore = Math.min(100, (uniqueEvents / totalBets) * 100);
    const leagueScore = Math.min(100, (uniqueLeagues / Math.max(1, totalBets * 0.3)) * 100);
    const marketScore = Math.min(100, (uniqueMarkets / Math.max(1, totalBets * 0.5)) * 100);
    
    // Weighted average
    return Math.round((eventScore * 0.4 + leagueScore * 0.35 + marketScore * 0.25));
  }

  /**
   * Generate bet recommendations based on correlation
   */
  getRecommendations() {
    const recommendations = [];
    const summary = this.getExposureSummary();
    
    // Check concentration
    const maxEventExposure = Math.max(...Object.values(summary.events), 0);
    if (maxEventExposure > this.maxExposurePerEvent * 0.8) {
      recommendations.push({
        type: 'diversify',
        priority: 'high',
        message: 'High event concentration detected. Consider diversifying across more events.'
      });
    }
    
    // Check correlation groups
    const groups = this.getCorrelationGroups();
    const largeGroups = groups.filter(g => g.bets.length > 3);
    if (largeGroups.length > 0) {
      recommendations.push({
        type: 'reduce_correlation',
        priority: 'medium',
        message: `${largeGroups.length} correlation groups have more than 3 bets. Review for overexposure.`
      });
    }
    
    // Diversification score
    const divScore = this.getDiversificationScore();
    if (divScore < 50) {
      recommendations.push({
        type: 'improve_diversification',
        priority: 'medium',
        message: `Diversification score is ${divScore}/100. Consider adding bets from different leagues and markets.`
      });
    }
    
    return recommendations;
  }

  /**
   * Generate unique bet ID
   */
  generateBetId() {
    return `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export data
   */
  exportData() {
    return {
      activeBets: Array.from(this.activeBets.values()),
      exposures: this.getExposureSummary(),
      correlationGroups: this.getCorrelationGroups(),
      diversificationScore: this.getDiversificationScore(),
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear() {
    this.activeBets.clear();
    this.betHistory = [];
    this.eventExposures.clear();
    this.teamExposures.clear();
    this.leagueExposures.clear();
    this.marketExposures.clear();
  }
}

module.exports = CorrelationDetector;
