/**
 * Seasonality and Trend Analysis Module for Surebet Detector
 * Analyzes opportunity patterns by day of week, time of day, season, and sport-specific trends
 */

const fs = require('fs');
const path = require('path');

class SeasonalityAnalyzer {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.analyticsDir = path.join(this.dataDir, 'analytics');
    this.historyDir = path.join(this.dataDir, 'history');
    this.reportsDir = path.join(this.dataDir, 'reports');
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Cache for computed analytics
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }
  
  ensureDirectories() {
    [this.analyticsDir, this.historyDir, this.reportsDir].forEach(dir => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        console.warn(`Warning: Could not create directory ${dir}: ${err.message}`);
      }
    });
  }
  
  /**
   * Get comprehensive seasonality analysis
   */
  async getSeasonalityAnalysis(timeRange = '90d') {
    const cacheKey = `seasonality_${timeRange}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    const data = {
      dayOfWeek: await this.getDayOfWeekAnalysis(timeRange),
      timeOfDay: await this.getTimeOfDayAnalysis(timeRange),
      seasonal: await this.getSeasonalAnalysis(timeRange),
      sportTrends: await this.getSportTrends(timeRange),
      monthlyPatterns: await this.getMonthlyPatterns(timeRange),
      peakHours: await this.getPeakHours(timeRange),
      sportSeasonality: await this.getSportSeasonality(timeRange),
      generatedAt: new Date().toISOString()
    };
    
    this.setCached(cacheKey, data);
    return data;
  }
  
  /**
   * Analyze patterns by day of week
   */
  async getDayOfWeekAnalysis(timeRange = '90d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    const bets = await this.getBetsInRange(timeRange);
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData = {};
    
    // Initialize all days
    days.forEach(day => {
      dayData[day] = {
        opportunities: 0,
        arbitrage: 0,
        ev: 0,
        avgProfitPercent: 0,
        bets: 0,
        profit: 0,
        winRate: 0
      };
    });
    
    // Analyze opportunities
    opportunities.forEach(opp => {
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      const dayName = days[date.getDay()];
      
      dayData[dayName].opportunities++;
      if (opp.type === 'arbitrage') dayData[dayName].arbitrage++;
      if (opp.type === 'ev' || opp.type === 'positiveEV') dayData[dayName].ev++;
    });
    
    // Calculate average profit percent per day
    days.forEach(day => {
      const dayOpps = opportunities.filter(opp => {
        const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
        return days[date.getDay()] === day;
      });
      
      if (dayOpps.length > 0) {
        const avgProfit = dayOpps.reduce((sum, o) => {
          return sum + (o.profitPercent || o.evPercent || o.expectedProfit || 0);
        }, 0) / dayOpps.length;
        dayData[day].avgProfitPercent = Math.round(avgProfit * 100) / 100;
      }
    });
    
    // Analyze bets
    const completedBets = bets.filter(b => b.status === 'settled');
    completedBets.forEach(bet => {
      const date = new Date(bet.createdAt || bet.settledAt);
      const dayName = days[date.getDay()];
      
      dayData[dayName].bets++;
      dayData[dayName].profit += bet.profit || 0;
    });
    
    // Calculate win rates
    days.forEach(day => {
      const dayBets = completedBets.filter(bet => {
        const date = new Date(bet.createdAt || bet.settledAt);
        return days[date.getDay()] === day;
      });
      
      if (dayBets.length > 0) {
        const wins = dayBets.filter(b => b.profit > 0).length;
        dayData[day].winRate = Math.round((wins / dayBets.length) * 10000) / 100;
      }
    });
    
    // Find best and worst days
    const sortedByOpps = days
      .map(day => ({ day, ...dayData[day] }))
      .sort((a, b) => b.opportunities - a.opportunities);
    
    return {
      breakdown: days.map(day => ({ day, ...dayData[day] })),
      bestDay: sortedByOpps[0],
      worstDay: sortedByOpps[sortedByOpps.length - 1],
      mostProfitable: days
        .map(day => ({ day, ...dayData[day] }))
        .sort((a, b) => b.profit - a.profit)[0],
      highestWinRate: days
        .map(day => ({ day, ...dayData[day] }))
        .sort((a, b) => b.winRate - a.winRate)[0]
    };
  }
  
  /**
   * Analyze patterns by time of day (hourly)
   */
  async getTimeOfDayAnalysis(timeRange = '90d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    
    // Initialize 24 hours
    const hourlyData = Array(24).fill(null).map((_, hour) => ({
      hour,
      hourLabel: `${hour.toString().padStart(2, '0')}:00`,
      opportunities: 0,
      arbitrage: 0,
      ev: 0,
      avgProfitPercent: 0,
      sports: {}
    }));
    
    // Group opportunities by hour
    opportunities.forEach(opp => {
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      const hour = date.getHours();
      
      hourlyData[hour].opportunities++;
      if (opp.type === 'arbitrage') hourlyData[hour].arbitrage++;
      if (opp.type === 'ev' || opp.type === 'positiveEV') hourlyData[hour].ev++;
      
      // Track by sport
      const sport = opp.sport || 'Unknown';
      if (!hourlyData[hour].sports[sport]) {
        hourlyData[hour].sports[sport] = 0;
      }
      hourlyData[hour].sports[sport]++;
    });
    
    // Calculate average profit percent per hour
    hourlyData.forEach((data, hour) => {
      const hourOpps = opportunities.filter(opp => {
        const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
        return date.getHours() === hour;
      });
      
      if (hourOpps.length > 0) {
        const avgProfit = hourOpps.reduce((sum, o) => {
          return sum + (o.profitPercent || o.evPercent || o.expectedProfit || 0);
        }, 0) / hourOpps.length;
        data.avgProfitPercent = Math.round(avgProfit * 100) / 100;
      }
    });
    
    // Find peak hours
    const sortedByOpps = [...hourlyData].sort((a, b) => b.opportunities - a.opportunities);
    const peakHours = sortedByOpps.slice(0, 5);
    const quietHours = sortedByOpps.slice(-5);
    
    return {
      hourly: hourlyData,
      peakHours,
      quietHours,
      bestHour: peakHours[0],
      quietestHour: quietHours[0]
    };
  }
  
  /**
   * Analyze seasonal patterns (by month/quarter)
   */
  async getSeasonalAnalysis(timeRange = '365d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    const bets = await this.getBetsInRange(timeRange);
    
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const quarters = {
      'Q1 (Jan-Mar)': [0, 1, 2],
      'Q2 (Apr-Jun)': [3, 4, 5],
      'Q3 (Jul-Sep)': [6, 7, 8],
      'Q4 (Oct-Dec)': [9, 10, 11]
    };
    
    const monthData = {};
    months.forEach(month => {
      monthData[month] = {
        opportunities: 0,
        arbitrage: 0,
        ev: 0,
        avgProfitPercent: 0,
        bets: 0,
        profit: 0,
        sports: {}
      };
    });
    
    // Analyze opportunities by month
    opportunities.forEach(opp => {
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      const monthName = months[date.getMonth()];
      
      monthData[monthName].opportunities++;
      if (opp.type === 'arbitrage') monthData[monthName].arbitrage++;
      if (opp.type === 'ev' || opp.type === 'positiveEV') monthData[monthName].ev++;
      
      const sport = opp.sport || 'Unknown';
      if (!monthData[monthName].sports[sport]) {
        monthData[monthName].sports[sport] = 0;
      }
      monthData[monthName].sports[sport]++;
    });
    
    // Analyze bets by month
    const completedBets = bets.filter(b => b.status === 'settled');
    completedBets.forEach(bet => {
      const date = new Date(bet.createdAt || bet.settledAt);
      const monthName = months[date.getMonth()];
      
      monthData[monthName].bets++;
      monthData[monthName].profit += bet.profit || 0;
    });
    
    // Calculate averages
    months.forEach(month => {
      const monthOpps = opportunities.filter(opp => {
        const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
        return months[date.getMonth()] === month;
      });
      
      if (monthOpps.length > 0) {
        const avgProfit = monthOpps.reduce((sum, o) => {
          return sum + (o.profitPercent || o.evPercent || o.expectedProfit || 0);
        }, 0) / monthOpps.length;
        monthData[month].avgProfitPercent = Math.round(avgProfit * 100) / 100;
      }
    });
    
    // Analyze by quarter
    const quarterData = {};
    Object.entries(quarters).forEach(([quarterName, monthIndices]) => {
      quarterData[quarterName] = {
        opportunities: 0,
        arbitrage: 0,
        ev: 0,
        bets: 0,
        profit: 0
      };
      
      monthIndices.forEach(idx => {
        const month = months[idx];
        quarterData[quarterName].opportunities += monthData[month].opportunities;
        quarterData[quarterName].arbitrage += monthData[month].arbitrage;
        quarterData[quarterName].ev += monthData[month].ev;
        quarterData[quarterName].bets += monthData[month].bets;
        quarterData[quarterName].profit += monthData[month].profit;
      });
    });
    
    // Find best/worst months
    const sortedByOpps = months
      .map(month => ({ month, ...monthData[month] }))
      .sort((a, b) => b.opportunities - a.opportunities);
    
    return {
      monthly: months.map(month => ({ month, ...monthData[month] })),
      quarterly: Object.entries(quarterData).map(([quarter, data]) => ({ quarter, ...data })),
      bestMonth: sortedByOpps[0],
      worstMonth: sortedByOpps[sortedByOpps.length - 1],
      bestQuarter: Object.entries(quarterData)
        .sort((a, b) => b[1].opportunities - a[1].opportunities)[0][0]
    };
  }
  
  /**
   * Analyze sport-specific trends over time
   */
  async getSportTrends(timeRange = '90d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    const bets = await this.getBetsInRange(timeRange);
    
    const sportData = {};
    
    // Group by sport
    opportunities.forEach(opp => {
      const sport = opp.sport || 'Unknown';
      if (!sportData[sport]) {
        sportData[sport] = {
          opportunities: 0,
          arbitrage: 0,
          ev: 0,
          avgProfitPercent: 0,
          hourlyDistribution: Array(24).fill(0),
          dailyDistribution: Array(7).fill(0),
          monthlyDistribution: Array(12).fill(0)
        };
      }
      
      sportData[sport].opportunities++;
      if (opp.type === 'arbitrage') sportData[sport].arbitrage++;
      if (opp.type === 'ev' || opp.type === 'positiveEV') sportData[sport].ev++;
      
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      sportData[sport].hourlyDistribution[date.getHours()]++;
      sportData[sport].dailyDistribution[date.getDay()]++;
      sportData[sport].monthlyDistribution[date.getMonth()]++;
    });
    
    // Calculate averages per sport
    Object.keys(sportData).forEach(sport => {
      const sportOpps = opportunities.filter(opp => (opp.sport || 'Unknown') === sport);
      if (sportOpps.length > 0) {
        const avgProfit = sportOpps.reduce((sum, o) => {
          return sum + (o.profitPercent || o.evPercent || o.expectedProfit || 0);
        }, 0) / sportOpps.length;
        sportData[sport].avgProfitPercent = Math.round(avgProfit * 100) / 100;
      }
      
      // Find peak hour for this sport
      const maxHourCount = Math.max(...sportData[sport].hourlyDistribution);
      sportData[sport].peakHour = sportData[sport].hourlyDistribution.indexOf(maxHourCount);
      
      // Find peak day for this sport
      const maxDayCount = Math.max(...sportData[sport].dailyDistribution);
      sportData[sport].peakDay = sportData[sport].dailyDistribution.indexOf(maxDayCount);
    });
    
    // Add bet data
    const completedBets = bets.filter(b => b.status === 'settled');
    completedBets.forEach(bet => {
      const sport = bet.sport || 'Unknown';
      if (!sportData[sport]) {
        sportData[sport] = {
          opportunities: 0,
          arbitrage: 0,
          ev: 0,
          bets: 0,
          profit: 0
        };
      }
      sportData[sport].bets = (sportData[sport].bets || 0) + 1;
      sportData[sport].profit = (sportData[sport].profit || 0) + (bet.profit || 0);
    });
    
    // Sort by opportunity count
    const sortedSports = Object.entries(sportData)
      .map(([sport, data]) => ({ sport, ...data }))
      .sort((a, b) => b.opportunities - a.opportunities);
    
    return {
      sports: sortedSports,
      topSport: sortedSports[0],
      sportCount: sortedSports.length
    };
  }
  
  /**
   * Get detailed monthly patterns with year-over-year comparison
   */
  async getMonthlyPatterns(timeRange = '365d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    
    const monthlyPatterns = {};
    
    opportunities.forEach(opp => {
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyPatterns[yearMonth]) {
        monthlyPatterns[yearMonth] = {
          opportunities: 0,
          arbitrage: 0,
          ev: 0,
          avgProfitPercent: 0,
          bySport: {},
          byDayOfWeek: Array(7).fill(0)
        };
      }
      
      monthlyPatterns[yearMonth].opportunities++;
      if (opp.type === 'arbitrage') monthlyPatterns[yearMonth].arbitrage++;
      if (opp.type === 'ev' || opp.type === 'positiveEV') monthlyPatterns[yearMonth].ev++;
      
      const sport = opp.sport || 'Unknown';
      if (!monthlyPatterns[yearMonth].bySport[sport]) {
        monthlyPatterns[yearMonth].bySport[sport] = 0;
      }
      monthlyPatterns[yearMonth].bySport[sport]++;
      
      monthlyPatterns[yearMonth].byDayOfWeek[date.getDay()]++;
    });
    
    // Calculate averages
    Object.keys(monthlyPatterns).forEach(month => {
      const monthOpps = opportunities.filter(opp => {
        const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
        const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return ym === month;
      });
      
      if (monthOpps.length > 0) {
        const avgProfit = monthOpps.reduce((sum, o) => {
          return sum + (o.profitPercent || o.evPercent || o.expectedProfit || 0);
        }, 0) / monthOpps.length;
        monthlyPatterns[month].avgProfitPercent = Math.round(avgProfit * 100) / 100;
      }
    });
    
    return Object.entries(monthlyPatterns)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
  
  /**
   * Get peak hours analysis with recommendations
   */
  async getPeakHours(timeRange = '90d') {
    const timeOfDay = await this.getTimeOfDayAnalysis(timeRange);
    
    const recommendations = [];
    
    // Analyze peak hours
    if (timeOfDay.peakHours.length > 0) {
      const peak = timeOfDay.peakHours[0];
      recommendations.push({
        type: 'peak',
        hour: peak.hour,
        message: `Highest opportunity volume at ${peak.hourLabel} (${peak.opportunities} opportunities)`,
        action: 'Monitor closely during these hours'
      });
    }
    
    // Analyze quiet hours
    if (timeOfDay.quietHours.length > 0) {
      const quiet = timeOfDay.quietHours[0];
      recommendations.push({
        type: 'quiet',
        hour: quiet.hour,
        message: `Lowest activity at ${quiet.hourLabel} (${quiet.opportunities} opportunities)`,
        action: 'Reduce monitoring frequency or focus on other tasks'
      });
    }
    
    // Find consecutive peak hours
    const hourly = timeOfDay.hourly;
    let consecutivePeaks = [];
    let currentStreak = [];
    
    for (let i = 0; i < hourly.length; i++) {
      if (hourly[i].opportunities > 0) {
        currentStreak.push(hourly[i]);
      } else {
        if (currentStreak.length > consecutivePeaks.length) {
          consecutivePeaks = currentStreak;
        }
        currentStreak = [];
      }
    }
    
    if (consecutivePeaks.length >= 3) {
      recommendations.push({
        type: 'window',
        startHour: consecutivePeaks[0].hour,
        endHour: consecutivePeaks[consecutivePeaks.length - 1].hour,
        message: `Peak window: ${consecutivePeaks[0].hourLabel} - ${consecutivePeaks[consecutivePeaks.length - 1].hourLabel}`,
        action: 'Primary monitoring window - ensure full coverage'
      });
    }
    
    return {
      peakHours: timeOfDay.peakHours,
      quietHours: timeOfDay.quietHours,
      hourlyBreakdown: timeOfDay.hourly,
      recommendations
    };
  }
  
  /**
   * Get sport-specific seasonality (which sports are active when)
   */
  async getSportSeasonality(timeRange = '365d') {
    const opportunities = await this.getOpportunitiesInRange(timeRange);
    
    const sportSeasonality = {};
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    opportunities.forEach(opp => {
      const sport = opp.sport || 'Unknown';
      const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp);
      const month = date.getMonth();
      
      if (!sportSeasonality[sport]) {
        sportSeasonality[sport] = {
          monthlyActivity: Array(12).fill(0),
          peakMonths: [],
          offSeason: [],
          totalOpportunities: 0
        };
      }
      
      sportSeasonality[sport].monthlyActivity[month]++;
      sportSeasonality[sport].totalOpportunities++;
    });
    
    // Determine peak and off-season months for each sport
    Object.keys(sportSeasonality).forEach(sport => {
      const activity = sportSeasonality[sport].monthlyActivity;
      const maxActivity = Math.max(...activity);
      const minActivity = Math.min(...activity);
      const threshold = maxActivity * 0.3; // 30% of max is considered active
      
      sportSeasonality[sport].peakMonths = activity
        .map((count, idx) => ({ month: months[idx], count, idx }))
        .filter(m => m.count >= threshold)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map(m => m.month);
      
      sportSeasonality[sport].offSeason = activity
        .map((count, idx) => ({ month: months[idx], count }))
        .filter(m => m.count === 0 || m.count < maxActivity * 0.1)
        .map(m => m.month);
      
      // Calculate activity score (0-100)
      const totalActivity = activity.reduce((sum, count) => sum + count, 0);
      const avgActivity = totalActivity / 12;
      sportSeasonality[sport].activityScore = Math.round((avgActivity / (maxActivity || 1)) * 100);
    });
    
    return Object.entries(sportSeasonality)
      .map(([sport, data]) => ({ sport, ...data }))
      .sort((a, b) => b.totalOpportunities - a.totalOpportunities);
  }
  
  /**
   * Generate trend predictions based on historical patterns
   */
  async getTrendPredictions() {
    const seasonality = await this.getSeasonalityAnalysis('365d');
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const currentMonth = now.getMonth();
    
    const predictions = {
      today: {
        expectedOpportunities: 'medium',
        confidence: 0,
        reasoning: []
      },
      thisWeek: {
        expectedOpportunities: 'medium',
        confidence: 0,
        reasoning: []
      },
      thisMonth: {
        expectedOpportunities: 'medium',
        confidence: 0,
        reasoning: []
      }
    };
    
    // Today's prediction based on day of week
    const dayAnalysis = seasonality.dayOfWeek.breakdown.find(d => d.day === [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ][currentDay]);
    
    if (dayAnalysis) {
      const avgOpps = dayAnalysis.opportunities;
      if (avgOpps > 10) {
        predictions.today.expectedOpportunities = 'high';
        predictions.today.confidence = 70;
      } else if (avgOpps > 5) {
        predictions.today.expectedOpportunities = 'medium';
        predictions.today.confidence = 60;
      } else {
        predictions.today.expectedOpportunities = 'low';
        predictions.today.confidence = 50;
      }
      predictions.today.reasoning.push(`Historical average for ${dayAnalysis.day}: ${avgOpps} opportunities`);
    }
    
    // This month's prediction
    const monthAnalysis = seasonality.seasonal.monthly.find(m => 
      ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'][currentMonth] === m.month
    );
    
    if (monthAnalysis) {
      if (monthAnalysis.opportunities > 50) {
        predictions.thisMonth.expectedOpportunities = 'high';
        predictions.thisMonth.confidence = 65;
      } else if (monthAnalysis.opportunities > 20) {
        predictions.thisMonth.expectedOpportunities = 'medium';
        predictions.thisMonth.confidence = 55;
      } else {
        predictions.thisMonth.expectedOpportunities = 'low';
        predictions.thisMonth.confidence = 45;
      }
      predictions.thisMonth.reasoning.push(`Historical average for ${monthAnalysis.month}: ${monthAnalysis.opportunities} opportunities`);
    }
    
    return predictions;
  }
  
  /**
   * Generate a comprehensive seasonality report
   */
  async generateReport(timeRange = '90d') {
    const analysis = await this.getSeasonalityAnalysis(timeRange);
    const predictions = await this.getTrendPredictions();
    
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: {
        bestDayOfWeek: analysis.dayOfWeek.bestDay,
        bestTimeOfDay: analysis.timeOfDay.bestHour,
        bestMonth: analysis.seasonal.bestMonth,
        topSport: analysis.sportTrends.topSport,
        peakHours: analysis.peakHours.peakHours.slice(0, 3).map(h => h.hourLabel)
      },
      analysis,
      predictions,
      recommendations: this.generateRecommendations(analysis)
    };
    
    // Save report
    const reportPath = path.join(this.reportsDir, `seasonality-report-${Date.now()}.json`);
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } catch (err) {
      console.warn(`Could not save report: ${err.message}`);
    }
    
    return report;
  }
  
  /**
   * Generate actionable recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Day of week recommendations
    if (analysis.dayOfWeek.bestDay && analysis.dayOfWeek.bestDay.opportunities > 0) {
      recommendations.push({
        category: 'Day of Week',
        recommendation: `Focus monitoring on ${analysis.dayOfWeek.bestDay.day}s (historically ${analysis.dayOfWeek.bestDay.opportunities} opportunities)`,
        priority: 'high'
      });
    }
    
    // Time of day recommendations
    if (analysis.timeOfDay.peakHours.length > 0) {
      const peakHours = analysis.timeOfDay.peakHours.slice(0, 3).map(h => h.hourLabel).join(', ');
      recommendations.push({
        category: 'Time of Day',
        recommendation: `Peak opportunity hours: ${peakHours}. Ensure maximum coverage during these times.`,
        priority: 'high'
      });
    }
    
    // Sport recommendations
    if (analysis.sportTrends.topSport) {
      recommendations.push({
        category: 'Sports',
        recommendation: `${analysis.sportTrends.topSport.sport} shows highest activity (${analysis.sportTrends.topSport.opportunities} opportunities). Prioritize this sport.`,
        priority: 'medium'
      });
    }
    
    // Seasonal recommendations
    if (analysis.seasonal.bestMonth) {
      recommendations.push({
        category: 'Seasonal',
        recommendation: `${analysis.seasonal.bestMonth.month} historically has the most opportunities (${analysis.seasonal.bestMonth.opportunities}).`,
        priority: 'medium'
      });
    }
    
    // Quiet time recommendations
    if (analysis.timeOfDay.quietHours.length > 0) {
      const quietHours = analysis.timeOfDay.quietHours.slice(0, 2).map(h => h.hourLabel).join(', ');
      recommendations.push({
        category: 'Efficiency',
        recommendation: `Reduce monitoring frequency during ${quietHours} (historically low activity).`,
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Helper methods
  
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }
  
  setCached(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
  
  parseTimeRange(timeRange) {
    const match = timeRange.match(/(\d+)([dmy])/);
    if (!match) return 30;
    
    const [, num, unit] = match;
    switch (unit) {
      case 'd': return parseInt(num);
      case 'm': return parseInt(num) * 30;
      case 'y': return parseInt(num) * 365;
      default: return 30;
    }
  }
  
  async getOpportunitiesInRange(timeRange) {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Try to load from history files
    const opportunities = [];
    
    try {
      const files = fs.readdirSync(this.historyDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(this.historyDir, file), 'utf8'));
            if (Array.isArray(data)) {
              opportunities.push(...data);
            } else if (data.arbitrage || data.positiveEV) {
              opportunities.push(...(data.arbitrage || []), ...(data.positiveEV || []));
            }
          } catch (e) {
            // Skip invalid files
          }
        }
      }
    } catch (err) {
      // Directory might not exist
    }
    
    // Also check latest analysis
    try {
      const latestFile = path.join(this.dataDir, 'latest-analysis.json');
      if (fs.existsSync(latestFile)) {
        const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
        if (data.arbitrage) opportunities.push(...data.arbitrage);
        if (data.positiveEV) opportunities.push(...data.positiveEV);
      }
    } catch (err) {
      // Ignore
    }
    
    // Filter by date and add timestamps if missing
    return opportunities
      .filter(opp => {
        const date = new Date(opp.detectedAt || opp.createdAt || opp.timestamp || Date.now());
        return date >= cutoffDate;
      })
      .map(opp => ({
        ...opp,
        detectedAt: opp.detectedAt || opp.createdAt || opp.timestamp || new Date().toISOString()
      }));
  }
  
  async getBetsInRange(timeRange) {
    const days = this.parseTimeRange(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const betsFile = path.join(this.dataDir, 'bets.json');
    
    if (!fs.existsSync(betsFile)) {
      return [];
    }
    
    try {
      const bets = JSON.parse(fs.readFileSync(betsFile, 'utf8'));
      return bets.filter(b => new Date(b.createdAt) >= cutoffDate);
    } catch (error) {
      return [];
    }
  }
}

module.exports = SeasonalityAnalyzer;
