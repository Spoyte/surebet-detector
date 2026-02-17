/**
 * Dashboard Routes
 * 
 * Optimized endpoints specifically for dashboard consumption.
 */

import { Router } from 'express';
import { serviceClient } from '../utils/service-client.js';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../index.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * 
 * Quick summary for the main dashboard view.
 */
router.get('/summary', cacheMiddleware('dashboard-summary', 30), async (req, res) => {
  try {
    const [opportunities, stats, alerts] = await Promise.allSettled([
      serviceClient.get('arbitrageDetector', '/api/opportunities?limit=5&sort=profit'),
      serviceClient.get('analyticsService', '/api/summary-stats'),
      serviceClient.get('notificationService', '/api/alerts?unreadOnly=true&limit=3')
    ]);

    res.json({
      topOpportunities: opportunities.status === 'fulfilled' ? opportunities.value : [],
      stats: stats.status === 'fulfilled' ? stats.value : {},
      unreadAlerts: alerts.status === 'fulfilled' ? (alerts.value as any[]).length : 0,
      recentAlerts: alerts.status === 'fulfilled' ? alerts.value : [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

/**
 * GET /api/dashboard/live-feed
 * 
 * Real-time data for the live dashboard feed.
 */
router.get('/live-feed', cacheMiddleware('live-feed', 10), async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const [opportunities, oddsUpdates, notifications] = await Promise.allSettled([
      serviceClient.get('arbitrageDetector', `/api/opportunities?limit=${limit}&live=true`),
      serviceClient.get('oddsCollector', '/api/updates?since=1m'),
      serviceClient.get('notificationService', `/api/notifications?limit=${Math.min(limit, 10)}`)
    ]);

    // Merge and sort by timestamp
    const feed = [];
    
    if (opportunities.status === 'fulfilled') {
      feed.push(...(opportunities.value as any[]).map(o => ({
        type: 'opportunity',
        timestamp: o.createdAt || o.timestamp,
        data: o
      })));
    }

    if (oddsUpdates.status === 'fulfilled') {
      feed.push(...(oddsUpdates.value as any[]).map(o => ({
        type: 'odds_update',
        timestamp: o.timestamp,
        data: o
      })));
    }

    if (notifications.status === 'fulfilled') {
      feed.push(...(notifications.value as any[]).map(n => ({
        type: 'notification',
        timestamp: n.createdAt,
        data: n
      })));
    }

    // Sort by timestamp descending
    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      feed: feed.slice(0, limit),
      count: feed.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching live feed:', error);
    res.status(500).json({ error: 'Failed to fetch live feed' });
  }
});

/**
 * GET /api/dashboard/performance
 * 
 * Performance metrics for the dashboard charts.
 */
router.get('/performance', cacheMiddleware('performance', 300), async (req, res) => {
  const period = (req.query.period as string) || '7d';

  try {
    const results = await serviceClient.batch([
      { service: 'analyticsService', endpoint: `/api/performance?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/profit-chart?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/sport-distribution?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/bookmaker-performance?period=${period}` }
    ]);

    const [performance, profitChart, sportDistribution, bookmakerPerformance] = results;

    res.json({
      summary: performance.success ? performance.data : {},
      profitChart: profitChart.success ? profitChart.data : [],
      sportDistribution: sportDistribution.success ? sportDistribution.data : [],
      bookmakerPerformance: bookmakerPerformance.success ? bookmakerPerformance.data : [],
      period,
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching performance data:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

/**
 * GET /api/dashboard/alerts
 * 
 * Consolidated alerts from multiple sources.
 */
router.get('/alerts', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  
  try {
    const results = await serviceClient.batch([
      { service: 'notificationService', endpoint: userId ? `/api/alerts?userId=${userId}` : '/api/alerts' },
      { service: 'arbitrageDetector', endpoint: '/api/high-value-opportunities?minProfit=5' },
      { service: 'oddsCollector', endpoint: '/api/bookmaker-alerts' }
    ]);

    const [notifications, highValueOpps, bookmakerAlerts] = results;

    const alerts = [];

    if (notifications.success) {
      alerts.push(...(notifications.value as any[]).map(n => ({
        ...n,
        source: 'notification',
        priority: n.priority || 'medium'
      })));
    }

    if (highValueOpps.success) {
      alerts.push(...(highValueOpps.value as any[]).map(o => ({
        id: `opp-${o.id}`,
        type: 'high_value_opportunity',
        title: `High Value: ${o.event}`,
        message: `Profit: ${o.profitPercent}%`,
        priority: 'high',
        source: 'arbitrage',
        data: o,
        timestamp: o.createdAt
      })));
    }

    if (bookmakerAlerts.success) {
      alerts.push(...(bookmakerAlerts.value as any[]).map(a => ({
        ...a,
        source: 'bookmaker',
        priority: a.severity || 'low'
      })));
    }

    // Sort by priority and timestamp
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    res.json({
      alerts,
      unreadCount: alerts.filter((a: any) => !a.read).length,
      highPriorityCount: alerts.filter((a: any) => ['critical', 'high'].includes(a.priority)).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export { router as dashboardRoutes };
