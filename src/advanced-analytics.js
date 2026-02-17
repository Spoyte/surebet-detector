/**
 * Advanced Analytics Module for Surebet Detector
 * Provides comprehensive analytics, charts, and performance metrics
 */

const fs = require('fs');
const path = require('path');

class AdvancedAnalytics {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.analyticsDir = path.join(this.dataDir, 'analytics');
    this.historyDir = path.join(this.dataDir, 'history');
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Cache for computed analytics
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }
  
  ensureDirectories() {
    [this.analyticsDir, this.historyDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardData(timeRange = '30d') {
    const cacheKey = `dashboard_${timeRange}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    const data = {
      summary: await this.getSummaryStats(timeRange),
      profitOverTime: await this.getProfitOverTime(timeRange),
      roiBySport: await this.getROIBySport(timeRange),
      roiByBookmaker: await this.getROIByBookmaker(timeRange),
      opportunityFrequency: await this.getOpportunityFrequency(timeRange),
      successRate: await this.getSuccessRate(timeRange),
      bestPerformers: await this.getBestPerformers(timeRange),
      dailyBreakdown: await this.getDailyBreakdown(timeRange),
      monthlyComparison: await this.getMonthlyComparison(),
      evAccuracy: await this.getEVAccuracy(timeRange),
      bookmakerHealth: await this.getBookmakerHealth(),
      generatedAt: new Date().toISOString()
    };
    
    this.setCached(cacheKey, data);
    return data;
  }
  
  /**
   * Get summary statistics
   */
  async getSummaryStats(timeRange = '30d') {
    const bets = await this.getBetsInRange(timeRange);
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    
    const completedBets = bets.filter(b => b.status === 'settled');
    const winningBets = completedBets.filter(b => b.profit > 0);
    
    const totalStaked = bets.reduce((sum, b) => sum + (b.stake || 0), 0);
    const totalProfit = completedBets.reduce((sum, b) => sum + (b.profit || 0), 0);
    const totalEV = opportunities.reduce((sum, o) => sum + (o.expectedProfit || 0), 0);
    
    return {
      totalBets: bets.length,
      completedBets: completedBets.length,
      winRate: completedBets.length > 0 ? (winningBets.length / completedBets.length * 100) : 0,
      totalStaked: Math.round(totalStaked * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalEV: Math.round(totalEV * 100) / 100,
      roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 10000) / 100 : 0,
      evAccuracy: totalEV > 0 ? Math.round((totalProfit / totalEV) * 10000) / 100 : 0,
      avgProfitPerBet: completedBets.length > 0 ? Math.round((totalProfit / completedBets.length) * 100) / 100 : 0,
      arbitrageCount: opportunities.filter(o => o.type === 'arbitrage').length,
      evCount: opportunities.filter(o => o.type === 'ev').length
    };
  }
  
  /**
   * Get profit data over time for charting
   */
  async getProfitOverTime(timeRange = '30d') {
    const days = this.parseTimeRange(timeRange);
    const bets = await this.getBetsInRange(timeRange);
    const completedBets = bets.filter(b => b.status === 'settled');
    
    const data = [];
    let cumulativeProfit = 0;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayBets = completedBets.filter(b => {
        const betDate = new Date(b.settledAt || b.createdAt).toISOString().split('T')[0];
        return betDate === dateStr;
      });
      
      const dayProfit = dayBets.reduce((sum, b) => sum + (b.profit || 0), 0);
      cumulativeProfit += dayProfit;
      
      data.push({
        date: dateStr,
        profit: Math.round(dayProfit * 100) / 100,
        cumulative: Math.round(cumulativeProfit * 100) / 100,
        betCount: dayBets.length
      });
    }
    
    return data;
  }
  
  /**
   * Get ROI breakdown by sport
   */
  async getROIBySport(timeRange = '30d') {
    const bets = await this.getBetsInRange(timeRange);
    const completedBets = bets.filter(b => b.status === 'settled');
    
    const bySport = {};
    
    completedBets.forEach(bet => {
      const sport = bet.sport || 'Unknown';
      if (!bySport[sport]) {
        bySport[sport] = { staked: 0, profit: 0, bets: 0, wins: 0 };
      }
      bySport[sport].staked += bet.stake || 0;
      bySport[sport].profit += bet.profit || 0;
      bySport[sport].bets += 1;
      if (bet.profit > 0) bySport[sport].wins += 1;
    });
    
    return Object.entries(bySport)
      .map(([sport, data]) => ({
        sport,
        staked: Math.round(data.staked * 100) / 100,
        profit: Math.round(data.profit * 100) / 100,
        roi: data.staked > 0 ? Math.round((data.profit / data.staked) * 10000) / 100 : 0,
        bets: data.bets,
        winRate: data.bets > 0 ? Math.round((data.wins / data.bets) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.roi - a.roi);
  }
  
  /**
   * Get ROI breakdown by bookmaker
   */
  async getROIByBookmaker(timeRange = '30d') {
    const bets = await this.getBetsInRange(timeRange);
    const completedBets = bets.filter(b => b.status === 'settled');
    
    const byBookmaker = {};
    
    completedBets.forEach(bet => {
      const bookmaker = bet.bookmaker || 'Unknown';
      if (!byBookmaker[bookmaker]) {
        byBookmaker[bookmaker] = { staked: 0, profit: 0, bets: 0, wins: 0 };
      }
      byBookmaker[bookmaker].staked += bet.stake || 0;
      byBookmaker[bookmaker].profit += bet.profit || 0;
      byBookmaker[bookmaker].bets += 1;
      if (bet.profit > 0) byBookmaker[bookmaker].wins += 1;
    });
    
    return Object.entries(byBookmaker)
      .map(([bookmaker, data]) => ({
        bookmaker,
        staked: Math.round(data.staked * 100) / 100,
        profit: Math.round(data.profit * 100) / 100,
        roi: data.staked > 0 ? Math.round((data.profit / data.staked) * 10000) / 100 : 0,
        bets: data.bets,
        winRate: data.bets > 0 ? Math.round((data.wins / data.bets) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.roi - a.roi);
  }
  
  /**
   * Get opportunity frequency data
   */
  async getOpportunityFrequency(timeRange = '30d') {
    const days = this.parseTimeRange(timeRange);
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayOpps = opportunities.filter(o => {
        const oppDate = new Date(o.detectedAt || o.createdAt).toISOString().split('T')[0];
        return oppDate === dateStr;
      });
      
      data.push({
        date: dateStr,
        total: dayOpps.length,
        arbitrage: dayOpps.filter(o => o.type === 'arbitrage').length,
        ev: dayOpps.filter(o => o.type === 'ev').length,
        avgProfit: dayOpps.length > 0 
          ? Math.round(dayOpps.reduce((sum, o) => sum + (o.profitPercent || o.evPercent || 0), 0) / dayOpps.length * 100) / 100
          : 0
      });
    }
    
    return data;
  }
  
  /**
   * Get success rate metrics
   */
  async getSuccessRate(timeRange = '30d') {
    const bets = await this.getBetsInRange(timeRange);
    const completedBets = bets.filter(b => b.status === 'settled');
    
    if (completedBets.length === 0) {
      return {
        overall: 0,
        byType: {},
        bySport: {},
        byBookmaker: {}
      };
    }
    
    const winningBets = completedBets.filter(b => b.profit > 0);
    
    // By type
    const byType = {};
    ['arbitrage', 'ev'].forEach(type => {
      const typeBets = completedBets.filter(b => b.type === type);
      const typeWins = typeBets.filter(b => b.profit > 0);
      byType[type] = typeBets.length > 0 
        ? Math.round((typeWins.length / typeBets.length) * 10000) / 100 
        : 0;
    });
    
    // By sport
    const bySport = {};
    const sports = [...new Set(completedBets.map(b => b.sport).filter(Boolean))];
    sports.forEach(sport => {
      const sportBets = completedBets.filter(b => b.sport === sport);
      const sportWins = sportBets.filter(b => b.profit > 0);
      bySport[sport] = Math.round((sportWins.length / sportBets.length) * 10000) / 100;
    });
    
    // By bookmaker
    const byBookmaker = {};
    const bookmakers = [...new Set(completedBets.map(b => b.bookmaker).filter(Boolean))];
    bookmakers.forEach(bookmaker => {
      const bmBets = completedBets.filter(b => b.bookmaker === bookmaker);
      const bmWins = bmBets.filter(b => b.profit > 0);
      byBookmaker[bookmaker] = Math.round((bmWins.length / bmBets.length) * 10000) / 100;
    });
    
    return {
      overall: Math.round((winningBets.length / completedBets.length) * 10000) / 100,
      byType,
      bySport,
      byBookmaker
    };
  }
  
  /**
   * Get best performing entities
   */
  async getBestPerformers(timeRange = '30d') {
    const roiBySport = await this.getROIBySport(timeRange);
    const roiByBookmaker = await this.getROIByBookmaker(timeRange);
    
    return {
      bestSport: roiBySport[0] || null,
      worstSport: roiBySport[roiBySport.length - 1] || null,
      bestBookmaker: roiByBookmaker[0] || null,
      worstBookmaker: roiByBookmaker[roiByBookmaker.length - 1] || null,
      topSports: roiBySport.slice(0, 5),
      topBookmakers: roiByBookmaker.slice(0, 5)
    };
  }
  
  /**
   * Get daily breakdown with detailed metrics
   */
  async getDailyBreakdown(timeRange = '30d') {
    const profitOverTime = await this.getProfitOverTime(timeRange);
    const frequency = await this.getOpportunityFrequency(timeRange);
    
    // Merge data
    const breakdown = profitOverTime.map((p, i) => ({
      ...p,
      opportunities: frequency[i]?.total || 0,
      arbitrageOpps: frequency[i]?.arbitrage || 0,
      evOpps: frequency[i]?.ev || 0,
      avgOppQuality: frequency[i]?.avgProfit || 0
    }));
    
    // Calculate additional metrics
    const totalProfit = breakdown.reduce((sum, d) => sum + d.profit, 0);
    const avgDailyProfit = totalProfit / breakdown.length;
    const bestDay = breakdown.reduce((best, d) => d.profit > best.profit ? d : best, breakdown[0] || { profit: 0 });
    const worstDay = breakdown.reduce((worst, d) => d.profit < worst.profit ? d : worst, breakdown[0] || { profit: 0 });
    
    return {
      daily: breakdown,
      summary: {
        avgDailyProfit: Math.round(avgDailyProfit * 100) / 100,
        bestDay: bestDay.date,
        bestDayProfit: bestDay.profit,
        worstDay: worstDay.date,
        worstDayProfit: worstDay.profit,
        profitableDays: breakdown.filter(d => d.profit > 0).length,
        unprofitableDays: breakdown.filter(d => d.profit < 0).length
      }
    };
  }
  
  /**
   * Get monthly comparison data
   */
  async getMonthlyComparison() {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = month.toISOString().slice(0, 7); // YYYY-MM
      const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-${daysInMonth}`;
      
      const bets = await this.getBetsInDateRange(startDate, endDate);
      const completedBets = bets.filter(b => b.status === 'settled');
      const opportunities = await this.getOpportunitiesInDateRange(startDate, endDate);
      
      const totalStaked = completedBets.reduce((sum, b) => sum + (b.stake || 0), 0);
      const totalProfit = completedBets.reduce((sum, b) => sum + (b.profit || 0), 0);
      
      months.push({
        month: monthStr,
        label: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        bets: completedBets.length,
        staked: Math.round(totalStaked * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 10000) / 100 : 0,
        opportunities: opportunities.length,
        avgDailyProfit: Math.round((totalProfit / daysInMonth) * 100) / 100
      });
    }
    
    return months;
  }
  
  /**
   * Get EV prediction accuracy
   */
  async getEVAccuracy(timeRange = '30d') {
    const bets = await this.getBetsInRange(timeRange);
    const evBets = bets.filter(b => b.type === 'ev' && b.status === 'settled');
    
    if (evBets.length === 0) {
      return { accuracy: 0, correlation: 0, sampleSize: 0 };
    }
    
    // Calculate correlation between predicted EV and actual profit
    const predictions = evBets.map(b => b.expectedProfit || 0);
    const actuals = evBets.map(b => b.profit || 0);
    
    const correlation = this.calculateCorrelation(predictions, actuals);
    
    // Calculate accuracy (how close actual was to expected)
    const totalExpected = predictions.reduce((sum, p) => sum + p, 0);
    const totalActual = actuals.reduce((sum, a) => sum + a, 0);
    const accuracy = totalExpected !== 0 ? (totalActual / totalExpected) * 100 : 0;
    
    return {
      accuracy: Math.round(accuracy * 100) / 100,
      correlation: Math.round(correlation * 10000) / 10000,
      sampleSize: evBets.length,
      totalExpected: Math.round(totalExpected * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100
    };
  }
  
  /**
   * Get bookmaker API health metrics
   */
  async getBookmakerHealth() {
    const healthFile = path.join(this.dataDir, 'bookmaker-health.json');
    
    if (!fs.existsSync(healthFile)) {
      // Generate sample health data if none exists
      return this.generateSampleHealthData();
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
      return data;
    } catch (error) {
      return this.generateSampleHealthData();
    }
  }
  
  /**
   * Record bookmaker health metrics
   */
  async recordBookmakerHealth(bookmaker, metrics) {
    const healthFile = path.join(this.dataDir, 'bookmaker-health.json');
    let data = {};
    
    if (fs.existsSync(healthFile)) {
      try {
        data = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
      } catch (error) {
        data = {};
      }
    }
    
    if (!data[bookmaker]) {
      data[bookmaker] = {
        history: [],
        current: null
      };
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      ...metrics
    };
    
    data[bookmaker].current = entry;
    data[bookmaker].history.push(entry);
    
    // Keep only last 100 entries
    if (data[bookmaker].history.length > 100) {
      data[bookmaker].history = data[bookmaker].history.slice(-100);
    }
    
    fs.writeFileSync(healthFile, JSON.stringify(data, null, 2));
    return data[bookmaker];
  }
  
  /**
   * Get bets within time range
   */
  async getBetsInRange(timeRange) {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const betsFile = path.join(this.dataDir, 'bets.json');
    
    if (!fs.existsSync(betsFile)) {
      return this.generateSampleBets(days);
    }
    
    try {
      const bets = JSON.parse(fs.readFileSync(betsFile, 'utf8'));
      return bets.filter(b => new Date(b.createdAt) >= cutoffDate);
    } catch (error) {
      return this.generateSampleBets(days);
    }
  }
  
  /**
   * Get bets in specific date range
   */
  async getBetsInDateRange(startDate, endDate) {
    const betsFile = path.join(this.dataDir, 'bets.json');
    
    if (!fs.existsSync(betsFile)) {
      return [];
    }
    
    try {
      const bets = JSON.parse(fs.readFileSync(betsFile, 'utf8'));
      return bets.filter(b => {
        const betDate = b.createdAt || b.settledAt;
        return betDate >= startDate && betDate <= endDate;
      });
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Get opportunities within time range
   */
  async getOpportunitiesInRange(timeRange) {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Try to load from history files
    const opportunities = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const historyFile = path.join(this.historyDir, `${dateStr}.json`);
      
      if (fs.existsSync(historyFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
          if (data.opportunities) {
            opportunities.push(...data.opportunities);
          }
        } catch (error) {
          // Skip corrupted files
        }
      }
    }
    
    if (opportunities.length === 0) {
      return this.generateSampleOpportunities(days);
    }
    
    return opportunities;
  }
  
  /**
   * Get opportunities in specific date range
   */
  async getOpportunitiesInDateRange(startDate, endDate) {
    const opportunities = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const historyFile = path.join(this.historyDir, `${dateStr}.json`);
      
      if (fs.existsSync(historyFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
          if (data.opportunities) {
            opportunities.push(...data.opportunities);
          }
        } catch (error) {
          // Skip corrupted files
        }
      }
    }
    
    return opportunities;
  }
  
  /**
   * Parse time range string to days
   */
  parseTimeRange(timeRange) {
    const match = timeRange.match(/^(\d+)([dwm])$/);
    if (!match) return 30;
    
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    
    switch (unit) {
      case 'd': return n;
      case 'w': return n * 7;
      case 'm': return n * 30;
      default: return 30;
    }
  }
  
  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(x, y) {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
  
  /**
   * Get cached data
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }
  
  /**
   * Set cached data
   */
  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Generate sample bets for demonstration
   */
  generateSampleBets(days) {
    const bets = [];
    const bookmakers = ['Unibet', 'Betclic', 'Winamax', 'Pinnacle', 'FDJ'];
    const sports = ['tennis', 'soccer', 'basketball'];
    const types = ['arbitrage', 'ev'];
    
    for (let i = 0; i < days * 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * days));
      
      const type = types[Math.floor(Math.random() * types.length)];
      const isWin = Math.random() > 0.4; // 60% win rate
      const stake = 50 + Math.random() * 200;
      const profit = isWin ? stake * (0.02 + Math.random() * 0.08) : -stake * 0.5;
      
      bets.push({
        id: `bet_${i}`,
        type,
        bookmaker: bookmakers[Math.floor(Math.random() * bookmakers.length)],
        sport: sports[Math.floor(Math.random() * sports.length)],
        stake: Math.round(stake * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        status: 'settled',
        createdAt: date.toISOString(),
        settledAt: date.toISOString()
      });
    }
    
    return bets;
  }
  
  /**
   * Generate sample opportunities for demonstration
   */
  generateSampleOpportunities(days) {
    const opportunities = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // 2-5 opportunities per day
      const count = 2 + Math.floor(Math.random() * 4);
      
      for (let j = 0; j < count; j++) {
        const isArbitrage = Math.random() > 0.6;
        
        opportunities.push({
          id: `opp_${i}_${j}`,
          type: isArbitrage ? 'arbitrage' : 'ev',
          profitPercent: isArbitrage ? 1 + Math.random() * 4 : null,
          evPercent: !isArbitrage ? 5 + Math.random() * 15 : null,
          expectedProfit: 2 + Math.random() * 20,
          detectedAt: date.toISOString(),
          createdAt: date.toISOString()
        });
      }
    }
    
    return opportunities;
  }
  
  /**
   * Generate sample health data
   */
  generateSampleHealthData() {
    const bookmakers = ['Unibet', 'Betclic', 'Winamax', 'Pinnacle', 'FDJ', 'ParionsSport', 'ZEbet'];
    const data = {};
    
    bookmakers.forEach(bm => {
      data[bm] = {
        current: {
          timestamp: new Date().toISOString(),
          status: Math.random() > 0.1 ? 'healthy' : 'degraded',
          responseTime: 100 + Math.random() * 500,
          errorRate: Math.random() * 5,
          lastSuccess: new Date().toISOString(),
          consecutiveErrors: Math.random() > 0.9 ? Math.floor(Math.random() * 5) : 0,
          dataFreshness: Math.floor(Math.random() * 300) // seconds
        },
        history: []
      };
    });
    
    return data;
  }
  
  /**
   * Export analytics to JSON file
   */
  async exportAnalytics(format = 'json', timeRange = '30d') {
    const data = await this.getDashboardData(timeRange);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (format === 'json') {
      const filename = `analytics_${timeRange}_${timestamp}.json`;
      const filepath = path.join(this.analyticsDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return { filename, filepath };
    }
    
    if (format === 'csv') {
      // Export summary as CSV
      const filename = `analytics_${timeRange}_${timestamp}.csv`;
      const filepath = path.join(this.analyticsDir, filename);
      
      const csv = this.convertToCSV(data.profitOverTime);
      fs.writeFileSync(filepath, csv);
      return { filename, filepath };
    }
    
    throw new Error(`Unsupported format: ${format}`);
  }
  
  /**
   * Convert array of objects to CSV
   */
  convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val;
      }).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }
}

module.exports = { AdvancedAnalytics };
