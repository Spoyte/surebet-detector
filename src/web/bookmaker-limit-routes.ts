/**
 * Bookmaker Limit Optimizer API Routes
 * 
 * REST API endpoints for bookmaker limit management and stake optimization.
 */

import { Router, Request, Response } from 'express';
import { BookmakerLimitOptimizer } from '../bookmaker-limit-optimizer.js';
import { BookmakerLimitWidget } from '../bookmaker-limit-widget.js';
import logger from '../utils/logger.js';

export function createBookmakerLimitRoutes(
  optimizer: BookmakerLimitOptimizer,
  widget: BookmakerLimitWidget
): Router {
  const router = Router();

  /**
   * GET /api/limits/stats
   * Get overall statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = optimizer.getStats();
      
      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching limit stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  });

  /**
   * GET /api/limits/widget
   * Get widget data for dashboard
   */
  router.get('/widget', (req: Request, res: Response) => {
    try {
      const data = widget.getWidgetData();
      
      res.json({
        success: true,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching widget data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch widget data'
      });
    }
  });

  /**
   * GET /api/limits/accounts
   * Get all bookmaker accounts
   */
  router.get('/accounts', (req: Request, res: Response) => {
    try {
      const accounts = optimizer.limitManager.getAllAccounts();
      
      res.json({
        success: true,
        data: accounts.map(a => ({
          bookmakerId: a.bookmakerId,
          bookmakerName: a.bookmakerName,
          balance: a.balance,
          currency: a.currency,
          isActive: a.isActive,
          isLimited: a.dynamicAdjustment.isLimited,
          adjustmentFactor: a.dynamicAdjustment.adjustmentFactor,
          gubbingRisk: a.gubbingRisk,
          limitCount: a.limits.size
        })),
        count: accounts.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching accounts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch accounts'
      });
    }
  });

  /**
   * GET /api/limits/accounts/:bookmakerId
   * Get specific account details
   */
  router.get('/accounts/:bookmakerId', (req: Request, res: Response) => {
    try {
      const { bookmakerId } = req.params;
      const account = optimizer.limitManager.getAccount(bookmakerId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: {
          bookmakerId: account.bookmakerId,
          bookmakerName: account.bookmakerName,
          balance: account.balance,
          currency: account.currency,
          isActive: account.isActive,
          limits: Array.from(account.limits.entries()).map(([market, limit]) => ({
            ...limit,
            market
          })),
          dynamicAdjustment: account.dynamicAdjustment,
          gubbingRisk: account.gubbingRisk,
          limitHistory: account.limitHistory.slice(-10)
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching account:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch account'
      });
    }
  });

  /**
   * POST /api/limits/accounts
   * Register a new bookmaker account
   */
  router.post('/accounts', (req: Request, res: Response) => {
    try {
      const { bookmakerId, bookmakerName, balance, currency } = req.body;
      
      if (!bookmakerId || balance === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: bookmakerId, balance'
        });
      }

      const account = optimizer.registerAccount(
        bookmakerId,
        bookmakerName || bookmakerId,
        balance,
        currency || 'EUR'
      );

      res.json({
        success: true,
        message: 'Account registered successfully',
        data: {
          bookmakerId: account.bookmakerId,
          bookmakerName: account.bookmakerName,
          balance: account.balance,
          currency: account.currency
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error registering account:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register account'
      });
    }
  });

  /**
   * GET /api/limits/accounts/:bookmakerId/limits
   * Get limits for a specific account
   */
  router.get('/accounts/:bookmakerId/limits', (req: Request, res: Response) => {
    try {
      const { bookmakerId } = req.params;
      const { market } = req.query;
      
      if (market) {
        const limit = optimizer.limitManager.getEffectiveLimit(bookmakerId, market as string);
        return res.json({
          success: true,
          data: limit,
          timestamp: Date.now()
        });
      }

      const account = optimizer.limitManager.getAccount(bookmakerId);
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      const limits = Array.from(account.limits.entries()).map(([m, l]) => ({
        ...l,
        market: m
      }));

      res.json({
        success: true,
        data: limits,
        count: limits.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch limits'
      });
    }
  });

  /**
   * POST /api/limits/accounts/:bookmakerId/limits
   * Set limit for a specific market
   */
  router.post('/accounts/:bookmakerId/limits', (req: Request, res: Response) => {
    try {
      const { bookmakerId } = req.params;
      const { market, minStake, maxStake, source } = req.body;
      
      if (minStake === undefined || maxStake === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: minStake, maxStake'
        });
      }

      const limit = optimizer.setLimit(
        bookmakerId,
        market || 'default',
        minStake,
        maxStake,
        source || 'manual'
      );

      res.json({
        success: true,
        message: 'Limit set successfully',
        data: limit,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error setting limit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set limit'
      });
    }
  });

  /**
   * POST /api/limits/optimize
   * Optimize stakes for an arbitrage opportunity
   */
  router.post('/optimize', (req: Request, res: Response) => {
    try {
      const { opportunityId, legs, totalBankroll, options } = req.body;
      
      if (!opportunityId || !legs || !totalBankroll) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: opportunityId, legs, totalBankroll'
        });
      }

      const result = optimizer.optimizeStakes(
        opportunityId,
        legs,
        totalBankroll,
        options
      );

      res.json({
        success: true,
        data: {
          opportunityId: result.opportunityId,
          totalStake: result.totalStake,
          expectedProfit: result.expectedProfit,
          profitPercent: result.profitPercent,
          isOptimal: result.isOptimal,
          constraintsApplied: result.constraintsApplied,
          partialFillRisk: result.partialFillRisk,
          fallbackStrategy: result.fallbackStrategy,
          legs: result.legs.map(leg => ({
            bookmakerId: leg.bookmakerId,
            bookmakerName: leg.bookmakerName,
            market: leg.market,
            selection: leg.selection,
            odds: leg.odds,
            idealStake: leg.idealStake,
            actualStake: leg.actualStake,
            isConstrained: leg.isConstrained,
            constraintReason: leg.constraintReason,
            fillProbability: leg.fillProbability
          })),
          alternativeSuggestions: result.alternativeSuggestions
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error optimizing stakes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to optimize stakes'
      });
    }
  });

  /**
   * POST /api/limits/outcomes
   * Record bet outcome for dynamic adjustment
   */
  router.post('/outcomes', (req: Request, res: Response) => {
    try {
      const { bookmakerId, profit, stake } = req.body;
      
      if (!bookmakerId || profit === undefined || stake === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: bookmakerId, profit, stake'
        });
      }

      optimizer.recordBetOutcome(bookmakerId, profit, stake);

      res.json({
        success: true,
        message: 'Outcome recorded successfully',
        data: { bookmakerId, profit, stake },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error recording outcome:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record outcome'
      });
    }
  });

  /**
   * GET /api/limits/limited-accounts
   * Get accounts with dynamic limit reductions
   */
  router.get('/limited-accounts', (req: Request, res: Response) => {
    try {
      const limitedAccounts = optimizer.limitManager.getLimitedAccounts();
      
      res.json({
        success: true,
        data: limitedAccounts.map(a => ({
          bookmakerId: a.bookmakerId,
          bookmakerName: a.bookmakerName,
          adjustmentFactor: a.dynamicAdjustment.adjustmentFactor,
          consecutiveWins: a.dynamicAdjustment.consecutiveWins,
          totalProfit: a.dynamicAdjustment.totalProfit,
          gubbingRisk: a.gubbingRisk
        })),
        count: limitedAccounts.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching limited accounts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch limited accounts'
      });
    }
  });

  /**
   * POST /api/limits/accounts/:bookmakerId/reset
   * Reset dynamic adjustment for an account
   */
  router.post('/accounts/:bookmakerId/reset', (req: Request, res: Response) => {
    try {
      const { bookmakerId } = req.params;
      
      optimizer.limitManager.resetDynamicAdjustment(bookmakerId);

      res.json({
        success: true,
        message: 'Dynamic adjustment reset successfully',
        data: { bookmakerId },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error resetting dynamic adjustment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset dynamic adjustment'
      });
    }
  });

  /**
   * GET /api/limits/alerts
   * Get active alerts
   */
  router.get('/alerts', (req: Request, res: Response) => {
    try {
      const { includeAcknowledged } = req.query;
      const alerts = includeAcknowledged === 'true' 
        ? widget.getAllAlerts()
        : widget.getWidgetData().alerts;
      
      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alerts'
      });
    }
  });

  /**
   * POST /api/limits/alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  router.post('/alerts/:alertId/acknowledge', (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      
      const success = widget.acknowledgeAlert(alertId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      res.json({
        success: true,
        message: 'Alert acknowledged',
        data: { alertId },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert'
      });
    }
  });

  /**
   * POST /api/limits/bet-groups
   * Register a bet group for partial fill protection
   */
  router.post('/bet-groups', (req: Request, res: Response) => {
    try {
      const { groupId, legs } = req.body;
      
      if (!groupId || !legs || !Array.isArray(legs)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: groupId, legs'
        });
      }

      optimizer.registerBetGroup(groupId, legs);

      res.json({
        success: true,
        message: 'Bet group registered for partial fill protection',
        data: { groupId, legCount: legs.length },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error registering bet group:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register bet group'
      });
    }
  });

  /**
   * POST /api/limits/bet-groups/:groupId/fills
   * Record a fill for a bet group
   */
  router.post('/bet-groups/:groupId/fills', (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;
      const { betId, filledStake, status } = req.body;
      
      if (!betId || filledStake === undefined || !status) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: betId, filledStake, status'
        });
      }

      const result = optimizer.recordFill(groupId, betId, filledStake, status);

      res.json({
        success: true,
        data: result,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error recording fill:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record fill'
      });
    }
  });

  /**
   * GET /api/limits/export
   * Export all limit data
   */
  router.get('/export', (req: Request, res: Response) => {
    try {
      const data = optimizer.exportData();
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bookmaker-limits-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(data);
    } catch (error) {
      logger.error('Error exporting data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export data'
      });
    }
  });

  /**
   * POST /api/limits/import
   * Import limit data
   */
  router.post('/import', (req: Request, res: Response) => {
    try {
      const { accounts } = req.body;
      
      if (!accounts || !Array.isArray(accounts)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: accounts'
        });
      }

      optimizer.importData({ accounts });

      res.json({
        success: true,
        message: 'Data imported successfully',
        data: { accountCount: accounts.length },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error importing data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import data'
      });
    }
  });

  return router;
}

export default createBookmakerLimitRoutes;
