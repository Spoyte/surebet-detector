/**
 * User Routes
 * 
 * Composed user-related endpoints.
 */

import { Router } from 'express';
import { serviceClient } from '../utils/service-client.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/user/profile-complete
 * 
 * Complete user profile with all related data.
 */
router.get('/profile-complete', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const results = await serviceClient.batch([
      { service: 'userManagement', endpoint: `/api/users/${userId}` },
      { service: 'userManagement', endpoint: `/api/users/${userId}/preferences` },
      { service: 'userManagement', endpoint: `/api/users/${userId}/accounts` },
      { service: 'analyticsService', endpoint: `/api/users/${userId}/stats` },
      { service: 'analyticsService', endpoint: `/api/users/${userId}/history?limit=10` }
    ]);

    const [profile, preferences, accounts, stats, history] = results;

    res.json({
      profile: profile.success ? profile.data : null,
      preferences: preferences.success ? preferences.data : {},
      accounts: accounts.success ? accounts.data : [],
      stats: stats.success ? stats.data : {},
      recentHistory: history.success ? history.data : [],
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching complete profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/user/betting-summary
 * 
 * User's betting activity summary.
 */
router.get('/betting-summary', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const period = (req.query.period as string) || '30d';

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const results = await serviceClient.batch([
      { service: 'analyticsService', endpoint: `/api/users/${userId}/bets?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/users/${userId}/profit?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/users/${userId}/performance?period=${period}` },
      { service: 'analyticsService', endpoint: `/api/users/${userId}/sports-breakdown?period=${period}` }
    ]);

    const [bets, profit, performance, sportsBreakdown] = results;

    const betData = bets.success ? bets.data as any[] : [];
    
    res.json({
      summary: {
        totalBets: betData.length,
        totalStaked: betData.reduce((sum, b) => sum + (b.stake || 0), 0),
        totalProfit: profit.success ? (profit.data as any).total : 0,
        roi: performance.success ? (performance.data as any).roi : 0,
        winRate: calculateWinRate(betData)
      },
      bets: betData,
      sportsBreakdown: sportsBreakdown.success ? sportsBreakdown.data : [],
      performance: performance.success ? performance.data : {},
      period,
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching betting summary:', error);
    res.status(500).json({ error: 'Failed to fetch betting summary' });
  }
});

/**
 * GET /api/user/notifications-preferences
 * 
 * User notifications and preferences combined.
 */
router.get('/notifications-preferences', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const results = await serviceClient.batch([
      { service: 'notificationService', endpoint: `/api/notifications?userId=${userId}&limit=20` },
      { service: 'userManagement', endpoint: `/api/users/${userId}/notification-preferences` },
      { service: 'notificationService', endpoint: `/api/alerts?userId=${userId}&unreadOnly=true` }
    ]);

    const [notifications, preferences, unreadAlerts] = results;

    res.json({
      notifications: notifications.success ? notifications.data : [],
      preferences: preferences.success ? preferences.data : {},
      unreadCount: unreadAlerts.success ? (unreadAlerts.data as any[]).length : 0,
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching notifications and preferences:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

/**
 * POST /api/user/update-profile-composite
 * 
 * Update profile across multiple services.
 */
router.post('/update-profile-composite', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const { profile, preferences, notificationSettings } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  const updates = [];

  try {
    if (profile) {
      updates.push(
        serviceClient.post(`userManagement`, `/api/users/${userId}`, profile)
      );
    }

    if (preferences) {
      updates.push(
        serviceClient.post(`userManagement`, `/api/users/${userId}/preferences`, preferences)
      );
    }

    if (notificationSettings) {
      updates.push(
        serviceClient.post(`userManagement`, `/api/users/${userId}/notification-preferences`, notificationSettings)
      );
    }

    const results = await Promise.allSettled(updates);
    const allSuccessful = results.every(r => r.status === 'fulfilled');

    res.json({
      success: allSuccessful,
      updated: {
        profile: !!profile,
        preferences: !!preferences,
        notificationSettings: !!notificationSettings
      },
      partialSuccess: !allSuccessful && results.some(r => r.status === 'fulfilled'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Helper function
function calculateWinRate(bets: any[]): number {
  if (bets.length === 0) return 0;
  const won = bets.filter(b => b.result === 'won').length;
  return (won / bets.length) * 100;
}

export { router as userRoutes };
