/**
 * Composition Routes
 * 
 * Generic composition endpoints that combine data from multiple services
 * based on client needs.
 */

import { Router } from 'express';
import { serviceClient } from '../utils/service-client.js';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../index.js';

const router = Router();

/**
 * GET /api/composite/opportunities-with-odds
 * 
 * Combines arbitrage opportunities with detailed odds information
 * from the odds collector service.
 */
router.get('/opportunities-with-odds', cacheMiddleware('opportunities-odds', 15), async (req, res) => {
  try {
    const [opportunitiesResult, oddsResult] = await Promise.allSettled([
      serviceClient.get('arbitrageDetector', '/api/opportunities'),
      serviceClient.get('oddsCollector', '/api/odds')
    ]);

    const opportunities = opportunitiesResult.status === 'fulfilled' 
      ? opportunitiesResult.value 
      : [];
    const odds = oddsResult.status === 'fulfilled' 
      ? oddsResult.value 
      : [];

    // Enrich opportunities with full odds data
    const enriched = opportunities.map((opp: any) => {
      const relatedOdds = odds.find((o: any) => 
        o.matchId === opp.matchId || 
        o.event === opp.event
      );
      
      return {
        ...opp,
        oddsDetails: relatedOdds || null,
        oddsAge: relatedOdds ? Date.now() - new Date(relatedOdds.timestamp).getTime() : null
      };
    });

    res.json({
      opportunities: enriched,
      count: enriched.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error composing opportunities with odds:', error);
    res.status(500).json({ error: 'Failed to compose data' });
  }
});

/**
 * GET /api/composite/user-dashboard
 * 
 * Combines user-specific data: preferences, notifications, 
 * recent opportunities, and analytics.
 */
router.get('/user-dashboard', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const results = await serviceClient.batch([
      { service: 'userManagement', endpoint: `/api/users/${userId}` },
      { service: 'userManagement', endpoint: `/api/users/${userId}/preferences` },
      { service: 'notificationService', endpoint: `/api/notifications?userId=${userId}&limit=10` },
      { service: 'arbitrageDetector', endpoint: '/api/opportunities?limit=20' },
      { service: 'analyticsService', endpoint: `/api/user-stats/${userId}` }
    ]);

    const [user, preferences, notifications, opportunities, stats] = results;

    res.json({
      user: user.success ? user.data : null,
      preferences: preferences.success ? preferences.data : {},
      recentNotifications: notifications.success ? notifications.data : [],
      topOpportunities: opportunities.success ? opportunities.data : [],
      userStats: stats.success ? stats.data : {},
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error composing user dashboard:', error);
    res.status(500).json({ error: 'Failed to compose dashboard data' });
  }
});

/**
 * GET /api/composite/opportunity-details/:id
 * 
 * Full opportunity details including related matches,
 * historical odds, and similar opportunities.
 */
router.get('/opportunity-details/:id', cacheMiddleware('opportunity-details', 60), async (req, res) => {
  const { id } = req.params;

  try {
    const results = await serviceClient.batch([
      { service: 'arbitrageDetector', endpoint: `/api/opportunities/${id}` },
      { service: 'analyticsService', endpoint: `/api/opportunities/${id}/history` },
      { service: 'oddsCollector', endpoint: `/api/odds?opportunityId=${id}` },
      { service: 'analyticsService', endpoint: `/api/similar-opportunities/${id}` }
    ]);

    const [opportunity, history, odds, similar] = results;

    if (!opportunity.success) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    res.json({
      opportunity: opportunity.data,
      historicalData: history.success ? history.data : [],
      currentOdds: odds.success ? odds.data : [],
      similarOpportunities: similar.success ? similar.data : [],
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error composing opportunity details:', error);
    res.status(500).json({ error: 'Failed to compose opportunity details' });
  }
});

/**
 * POST /api/composite/place-bet-composite
 * 
 * Places a bet and updates relevant services (user balance, 
 * analytics, notifications).
 */
router.post('/place-bet-composite', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const { opportunityId, stakes, bookmakers } = req.body;

  if (!userId || !opportunityId || !stakes) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // First, validate the opportunity is still available
    const opportunity = await serviceClient.get(
      'arbitrageDetector', 
      `/api/opportunities/${opportunityId}`
    );

    if (!opportunity) {
      return res.status(410).json({ error: 'Opportunity no longer available' });
    }

    // Check user balance
    const userBalance = await serviceClient.get(
      'userManagement',
      `/api/users/${userId}/balance`
    );

    const totalStake = Object.values(stakes as Record<string, number>).reduce((a, b) => a + b, 0);
    
    if ((userBalance as any).available < totalStake) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Record the bet in analytics
    const betRecord = await serviceClient.post(
      'analyticsService',
      '/api/bets',
      {
        userId,
        opportunityId,
        stakes,
        bookmakers,
        timestamp: new Date().toISOString()
      }
    );

    // Update user balance
    await serviceClient.post(
      'userManagement',
      `/api/users/${userId}/transactions`,
      {
        type: 'bet_placed',
        amount: -totalStake,
        betId: (betRecord as any).id
      }
    );

    // Send notification
    await serviceClient.post(
      'notificationService',
      '/api/notifications',
      {
        userId,
        type: 'bet_placed',
        title: 'Bet Placed Successfully',
        message: `Your bet of €${totalStake.toFixed(2)} has been recorded`,
        data: { betId: (betRecord as any).id }
      }
    );

    res.json({
      success: true,
      betId: (betRecord as any).id,
      opportunity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in composite bet placement:', error);
    res.status(500).json({ error: 'Failed to place bet' });
  }
});

/**
 * GET /api/composite/market-overview
 * 
 * Market-wide overview with aggregated statistics.
 */
router.get('/market-overview', cacheMiddleware('market-overview', 60), async (req, res) => {
  try {
    const results = await serviceClient.batch([
      { service: 'arbitrageDetector', endpoint: '/api/opportunities/stats' },
      { service: 'oddsCollector', endpoint: '/api/stats' },
      { service: 'analyticsService', endpoint: '/api/market-trends' },
      { service: 'analyticsService', endpoint: '/api/top-bookmakers' }
    ]);

    const [opportunityStats, oddsStats, trends, topBookmakers] = results;

    res.json({
      opportunities: opportunityStats.success ? opportunityStats.data : {},
      odds: oddsStats.success ? oddsStats.data : {},
      trends: trends.success ? trends.data : [],
      topBookmakers: topBookmakers.success ? topBookmakers.data : [],
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error composing market overview:', error);
    res.status(500).json({ error: 'Failed to compose market overview' });
  }
});

export { router as compositionRoutes };
