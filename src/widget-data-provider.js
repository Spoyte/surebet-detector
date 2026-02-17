/**
 * Widget Data Provider
 * Provides data for iOS/Android home screen widgets
 */

class WidgetDataProvider {
  constructor(config = {}) {
    this.config = {
      maxOpportunities: config.maxOpportunities || 5,
      cacheTTL: config.cacheTTL || 60 * 1000, // 1 minute
      ...config,
    };
    
    this.cache = new Map();
    this.cacheTimestamps = new Map();
  }

  /**
   * Get cached data or fetch fresh
   */
  async getCached(key, fetchFn) {
    const now = Date.now();
    const cached = this.cache.get(key);
    const timestamp = this.cacheTimestamps.get(key);
    
    if (cached && timestamp && (now - timestamp) < this.config.cacheTTL) {
      return cached;
    }
    
    const data = await fetchFn();
    this.cache.set(key, data);
    this.cacheTimestamps.set(key, now);
    return data;
  }

  /**
   * Get widget data for top opportunities
   */
  async getOpportunitiesWidgetData(opportunities, options = {}) {
    const limit = options.limit || this.config.maxOpportunities;
    
    // Sort by profit percentage (highest first)
    const sortedOpportunities = opportunities
      .filter(o => o.status === 'ACTIVE')
      .sort((a, b) => (b.profitPercentage || b.evPercentage || 0) - (a.profitPercentage || a.evPercentage || 0))
      .slice(0, limit);

    return {
      type: 'opportunities',
      updatedAt: new Date().toISOString(),
      count: sortedOpportunities.length,
      items: sortedOpportunities.map(o => ({
        id: o.id,
        type: o.type,
        profitPercentage: o.profitPercentage,
        evPercentage: o.evPercentage,
        match: {
          homeTeam: o.match?.homeTeam,
          awayTeam: o.match?.awayTeam,
          league: o.match?.league,
          startTime: o.match?.startTime,
        },
        marketType: o.marketType,
        timeToEvent: o.timeToEvent,
        deepLink: `surebet://opportunity/${o.id}`,
      })),
    };
  }

  /**
   * Get widget data for profit summary
   */
  async getProfitWidgetData(bankroll, analytics, options = {}) {
    const period = options.period || 'today';
    
    let profitLoss = 0;
    let roi = 0;
    let bets = 0;
    
    switch (period) {
      case 'today':
        profitLoss = bankroll.dailyProfitLoss || 0;
        break;
      case 'week':
        profitLoss = bankroll.weeklyProfitLoss || 0;
        break;
      case 'month':
        profitLoss = bankroll.monthlyProfitLoss || 0;
        break;
      case 'all':
        profitLoss = bankroll.allTimeProfitLoss || 0;
        roi = bankroll.roi || 0;
        break;
    }

    return {
      type: 'profit',
      period,
      updatedAt: new Date().toISOString(),
      currency: bankroll.currency || 'EUR',
      totalBalance: bankroll.totalBalance || 0,
      profitLoss,
      roi,
      exposure: {
        current: bankroll.currentExposure || 0,
        limit: bankroll.exposureLimit || 0,
        percentage: bankroll.exposureLimit 
          ? Math.round((bankroll.currentExposure / bankroll.exposureLimit) * 100)
          : 0,
      },
      deepLink: 'surebet://bankroll',
    };
  }

  /**
   * Get widget data for live matches
   */
  async getLiveMatchesWidgetData(matches, options = {}) {
    const limit = options.limit || 3;
    
    const liveMatches = matches
      .filter(m => m.isLive)
      .slice(0, limit);

    return {
      type: 'live',
      updatedAt: new Date().toISOString(),
      count: liveMatches.length,
      items: liveMatches.map(m => ({
        id: m.id,
        sport: m.sport,
        league: m.league,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        score: m.score,
        hasOpportunity: m.opportunities?.length > 0,
        opportunityCount: m.opportunities?.length || 0,
        deepLink: `surebet://match/${m.id}`,
      })),
    };
  }

  /**
   * Get widget data for quick stats
   */
  async getQuickStatsWidgetData(analytics, bankroll) {
    return {
      type: 'quickstats',
      updatedAt: new Date().toISOString(),
      stats: {
        totalBets: analytics?.totalBets || 0,
        winRate: analytics?.winRate || 0,
        totalProfit: analytics?.totalProfit || bankroll?.allTimeProfitLoss || 0,
        roi: analytics?.roi || bankroll?.roi || 0,
        activeOpportunities: 0, // Will be populated by caller
      },
      deepLink: 'surebet://analytics',
    };
  }

  /**
   * Get all widget data in one request
   */
  async getAllWidgetData(data) {
    const { opportunities, bankroll, analytics, matches } = data;
    
    return {
      updatedAt: new Date().toISOString(),
      widgets: {
        opportunities: await this.getOpportunitiesWidgetData(opportunities),
        profit: await this.getProfitWidgetData(bankroll, analytics),
        live: await this.getLiveMatchesWidgetData(matches),
        quickstats: await this.getQuickStatsWidgetData(analytics, bankroll),
      },
    };
  }

  /**
   * Format data for iOS WidgetKit
   */
  formatForiOS(widgetData) {
    // iOS WidgetKit expects specific format
    return {
      ...widgetData,
      platform: 'ios',
      // iOS-specific formatting
      displaySize: widgetData.type === 'opportunities' ? 'medium' : 'small',
      refreshInterval: 300, // seconds
    };
  }

  /**
   * Format data for Android AppWidgetProvider
   */
  formatForAndroid(widgetData) {
    // Android widgets expect specific format
    return {
      ...widgetData,
      platform: 'android',
      // Android-specific formatting
      updateIntervalMillis: 300000, // 5 minutes
      layout: this.getAndroidLayout(widgetData.type),
    };
  }

  /**
   * Get Android layout resource for widget type
   */
  getAndroidLayout(type) {
    const layouts = {
      opportunities: 'widget_opportunities_list',
      profit: 'widget_profit_summary',
      live: 'widget_live_matches',
      quickstats: 'widget_quick_stats',
    };
    return layouts[type] || 'widget_default';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}

module.exports = { WidgetDataProvider };
