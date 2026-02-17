/**
 * Analytics Routes
 * 
 * Composed analytics endpoints.
 */

import { Router } from 'express';
import { serviceClient } from '../utils/service-client.js';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../index.js';

const router = Router();

/**
 * GET /api/analytics/comprehensive
 * 
 * Full analytics report combining multiple data sources.
 */
router.get('/comprehensive', cacheMiddleware('analytics-comprehensive', 300), async (req, res) => {
  const period = (req.query.period as string) || '30d';

  try {
    const results = await serviceClient.batch([
      { service: 'analyticsService', endpoint: `/api/summary?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/profit-analysis?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/sport-breakdown?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/bookmaker-analysis?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/trends?period=${period}` }
    ]);

    const [summary, profitAnalysis, sportBreakdown, bookmakerAnalysis, trends] = results;

    res.json({
      summary: summary.success ? summary.data : {},
      profit: profitAnalysis.success ? profitAnalysis.data : {},
      sports: sportBreakdown.success ? sportBreakdown.data : [],
      bookmakers: bookmakerAnalysis.success ? bookmakerAnalysis.data : [],
      trends: trends.success ? trends.data : [],
      period,
      generatedAt: new Date().toISOString(),
      partialData: results.some(r => !r.success)
    });
  } catch (error) {
    logger.error('Error fetching comprehensive analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/real-time
 * 
 * Real-time analytics data.
 */
router.get('/real-time', cacheMiddleware('analytics-realtime', 10), async (req, res) => {
  try {
    const results = await serviceClient.batch([
      { service: 'arbitrageDetector', endpoint: '/api/opportunities/active-count' },
      { service: 'oddsCollector', endpoint: '/api/odds/update-rate' },
      { service: 'analyticsService', endpoint: '/api/current-activity' },
      { service: 'analyticsService', endpoint: '/api/live-metrics' }
    ]);

    const [activeOpportunities, updateRate, currentActivity, liveMetrics] = results;

    res.json({
      opportunities: {
        active: activeOpportunities.success ? (activeOpportunities.data as any).count : 0,
        averageProfit: activeOpportunities.success ? (activeOpportunities.data as any).avgProfit : 0
      },
      dataFlow: {
        oddsUpdateRate: updateRate.success ? (updateRate.data as any).rate : 0,
        lastUpdate: updateRate.success ? (updateRate.data as any).lastUpdate : null
      },
      activity: currentActivity.success ? currentActivity.data : {},
      metrics: liveMetrics.success ? liveMetrics.data : {},
      timestamp: new Date().toISOString(),
      partialData: results.some(r => !r.success)
    });
  } catch (error) {
    logger.error('Error fetching real-time analytics:', error);
    res.status(500).json({ error: 'Failed to fetch real-time analytics' });
  }
});

/**
 * GET /api/analytics/predictions
 * 
 * Predictive analytics based on historical data.
 */
router.get('/predictions', cacheMiddleware('analytics-predictions', 600), async (req, res) => {
  const horizon = (req.query.horizon as string) || '24h';

  try {
    const results = await serviceClient.batch([
      { service: 'analyticsService', endpoint: `/api/predictions/opportunities?horizon=${horizon}` },
      { service: 'analyticsService', endpoint: `/api/predictions/profit?horizon=${horizon}` },
      { service: 'analyticsService', endpoint: '/api/seasonal-patterns' }
    ]);

    const [opportunityPred, profitPred, seasonal] = results;

    res.json({
      predictions: {
        opportunities: opportunityPred.success ? opportunityPred.data : {},
        profit: profitPred.success ? profitPred.data : {}
      },
      seasonalPatterns: seasonal.success ? seasonal.data : [],
      horizon,
      generatedAt: new Date().toISOString(),
      confidence: calculatePredictionConfidence(results),
      partialData: results.some(r => !r.success)
    });
  } catch (error) {
    logger.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

/**
 * GET /api/analytics/bookmaker-comparison
 * 
 * Detailed bookmaker comparison analytics.
 */
router.get('/bookmaker-comparison', cacheMiddleware('bookmaker-comparison', 600), async (req, res) => {
  const period = (req.query.period as string) || '30d';

  try {
    const results = await serviceClient.batch([
      { service: 'analyticsService', endpoint: `/api/bookmaker-stats?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/bookmaker-odds-quality?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/bookmaker-payout-speed?period=${period}` },
      { service: 'oddsCollector', endpoint: '/api/bookmaker-coverage' }
    ]);

    const [stats, oddsQuality, payoutSpeed, coverage] = results;

    // Merge bookmaker data
    const bookmakerMap = new Map();

    if (stats.success) {
      (stats.data as any[]).forEach((bm: any) => {
        bookmakerMap.set(bm.name, { ...bookmakerMap.get(bm.name), ...bm });
      });
    }

    if (oddsQuality.success) {
      (oddsQuality.data as any[]).forEach((bm: any) => {
        bookmakerMap.set(bm.name, { ...bookmakerMap.get(bm.name), ...bm });
      });
    }

    if (payoutSpeed.success) {
      (payoutSpeed.data as any[]).forEach((bm: any) => {
        bookmakerMap.set(bm.name, { ...bookmakerMap.get(bm.name), ...bm });
      });
    }

    if (coverage.success) {
      (coverage.data as any[]).forEach((bm: any) => {
        bookmakerMap.set(bm.name, { ...bookmakerMap.get(bm.name), ...bm });
      });
    }

    const bookmakers = Array.from(bookmakerMap.entries()).map(([name, data]) => ({
      name,
      ...data,
      overallScore: calculateBookmakerScore(data)
    }));

    // Sort by overall score
    bookmakers.sort((a, b) => b.overallScore - a.overallScore);

    res.json({
      bookmakers,
      topRated: bookmakers.slice(0, 5),
      period,
      generatedAt: new Date().toISOString(),
      partialData: results.some(r => !r.success)
    });
  } catch (error) {
    logger.error('Error fetching bookmaker comparison:', error);
    res.status(500).json({ error: 'Failed to fetch bookmaker comparison' });
  }
});

// Helper functions
function calculatePredictionConfidence(results: Array<{ success: boolean; data?: any; error?: string }>): number {
  const successful = results.filter(r => r.success).length;
  const baseConfidence = successful / results.length;
  
  // Adjust based on data quality if available
  let dataQualityBonus = 0;
  results.forEach(r => {
    if (r.success && r.data?.confidence) {
      dataQualityBonus += r.data.confidence * 0.1;
    }
  });

  return Math.min(baseConfidence + dataQualityBonus, 1);
}

function calculateBookmakerScore(data: any): number {
  const weights = {
    reliability: 0.3,
    oddsQuality: 0.25,
    payoutSpeed: 0.2,
    coverage: 0.15,
    userRating: 0.1
  };

  return (
    (data.reliability || 0.5) * weights.reliability +
    (data.oddsQuality || 0.5) * weights.oddsQuality +
    (data.payoutSpeed || 0.5) * weights.payoutSpeed +
    (data.coverage || 0.5) * weights.coverage +
    (data.userRating || 0.5) * weights.userRating
  );
}

export { router as analyticsRoutes };
