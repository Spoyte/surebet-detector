/**
 * Event Sourcing API Routes
 * 
 * REST API endpoints for audit trail, event replay, and debugging
 */

import { Router } from 'express';

/**
 * Create audit API routes
 */
export function createAuditRoutes(eventSourcingPlugin) {
  const router = Router();
  const { auditAPI, esm } = eventSourcingPlugin.getAPI();

  /**
   * GET /api/audit/trail/:entityType/:entityId
   * Get audit trail for a specific entity
   */
  router.get('/trail/:entityType/:entityId', async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const trail = await auditAPI.getAuditTrail(entityType, entityId);
      
      res.json({
        success: true,
        entityType,
        entityId,
        count: trail.length,
        trail
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/audit/period
   * Get audit trail for a time period
   * Query params: start, end (ISO dates)
   */
  router.get('/period', async (req, res) => {
    try {
      const { start, end } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({
          success: false,
          error: 'Missing required query params: start, end'
        });
      }
      
      const trail = await auditAPI.getAuditTrailForPeriod(
        new Date(start),
        new Date(end)
      );
      
      res.json({
        success: true,
        period: { start, end },
        count: trail.length,
        trail
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/audit/user/:userId
   * Get audit trail for a specific user
   */
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const trail = await auditAPI.getUserAuditTrail(userId);
      
      res.json({
        success: true,
        userId,
        count: trail.length,
        trail
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/audit/export
   * Export audit trail
   * Query params: format (json, csv)
   */
  router.get('/export', async (req, res) => {
    try {
      const { format = 'json' } = req.query;
      
      if (!['json', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Use json or csv'
        });
      }
      
      const data = await auditAPI.exportAuditTrail(format);
      
      const contentType = format === 'csv' 
        ? 'text/csv' 
        : 'application/json';
      
      const filename = `audit-trail-${new Date().toISOString().split('T')[0]}.${format}`;
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/audit/correlation/:correlationId
   * Get events by correlation ID
   */
  router.get('/correlation/:correlationId', async (req, res) => {
    try {
      const { correlationId } = req.params;
      const events = await auditAPI.getEventsByCorrelation(correlationId);
      
      res.json({
        success: true,
        correlationId,
        count: events.length,
        events
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/audit/stats
   * Get event statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await auditAPI.getStatistics();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Create event store API routes
 */
export function createEventStoreRoutes(eventSourcingPlugin) {
  const router = Router();
  const { esm } = eventSourcingPlugin.getAPI();

  /**
   * GET /api/events/stream/:streamId
   * Read events from a stream
   */
  router.get('/stream/:streamId', async (req, res) => {
    try {
      const { streamId } = req.params;
      const { fromVersion = 1, toVersion, limit } = req.query;
      
      const options = {
        fromVersion: parseInt(fromVersion),
        toVersion: toVersion ? parseInt(toVersion) : null,
        limit: limit ? parseInt(limit) : null
      };
      
      const events = await esm.eventStore.readStream(streamId, options);
      
      res.json({
        success: true,
        streamId,
        count: events.length,
        events
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/events/all
   * Read all events
   */
  router.get('/all', async (req, res) => {
    try {
      const { fromPosition = 0, limit, eventTypes } = req.query;
      
      const options = {
        fromPosition: parseInt(fromPosition),
        limit: limit ? parseInt(limit) : null,
        eventTypes: eventTypes ? eventTypes.split(',') : null
      };
      
      const events = await esm.eventStore.readAll(options);
      
      res.json({
        success: true,
        count: events.length,
        events
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/events/replay
   * Replay events to rebuild projections
   */
  router.post('/replay', async (req, res) => {
    try {
      const { eventTypes } = req.body;
      
      const count = await auditAPI.replayEvents(eventTypes);
      
      res.json({
        success: true,
        message: `Replayed ${count} events`,
        count
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/events/export
   * Export all events for backup
   */
  router.get('/export', async (req, res) => {
    try {
      const data = await esm.exportEvents();
      
      const filename = `events-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/events/import
   * Import events from backup
   */
  router.post('/import', async (req, res) => {
    try {
      const { events } = req.body;
      
      if (!events) {
        return res.status(400).json({
          success: false,
          error: 'Missing events data'
        });
      }
      
      const count = await esm.importEvents(JSON.stringify(events));
      
      res.json({
        success: true,
        message: `Imported ${count} events`,
        count
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Create aggregate API routes
 */
export function createAggregateRoutes(eventSourcingPlugin) {
  const router = Router();
  const { betTracker, bankrollManager, opportunityTracker } = eventSourcingPlugin.getAPI();

  /**
   * GET /api/aggregates/bet/:betId
   * Get bet with audit trail
   */
  router.get('/bet/:betId', async (req, res) => {
    try {
      const { betId } = req.params;
      
      if (!betTracker) {
        return res.status(503).json({
          success: false,
          error: 'Bet tracker not available'
        });
      }
      
      const bet = await betTracker.getBetWithAuditTrail(betId);
      
      res.json({
        success: true,
        bet
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/aggregates/bankroll/:bankrollId
   * Get bankroll with history
   */
  router.get('/bankroll/:bankrollId', async (req, res) => {
    try {
      const { bankrollId } = req.params;
      
      if (!bankrollManager) {
        return res.status(503).json({
          success: false,
          error: 'Bankroll manager not available'
        });
      }
      
      const bankroll = await bankrollManager.getBankrollWithHistory(bankrollId);
      
      res.json({
        success: true,
        bankroll
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/aggregates/bankrolls
   * Get all bankrolls
   */
  router.get('/bankrolls', async (req, res) => {
    try {
      if (!bankrollManager) {
        return res.status(503).json({
          success: false,
          error: 'Bankroll manager not available'
        });
      }
      
      const bankrolls = await bankrollManager.getAllBankrolls();
      
      res.json({
        success: true,
        count: bankrolls.length,
        bankrolls
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/aggregates/opportunity/:opportunityId
   * Get opportunity with history
   */
  router.get('/opportunity/:opportunityId', async (req, res) => {
    try {
      const { opportunityId } = req.params;
      
      if (!opportunityTracker) {
        return res.status(503).json({
          success: false,
          error: 'Opportunity tracker not available'
        });
      }
      
      const opportunity = await opportunityTracker.getOpportunityWithHistory(opportunityId);
      
      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/aggregates/opportunities/active
   * Get active opportunities
   */
  router.get('/opportunities/active', async (req, res) => {
    try {
      if (!opportunityTracker) {
        return res.status(503).json({
          success: false,
          error: 'Opportunity tracker not available'
        });
      }
      
      const opportunities = opportunityTracker.getActiveOpportunities();
      
      res.json({
        success: true,
        count: opportunities.length,
        opportunities
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Create all event sourcing routes
 */
export function createEventSourcingRoutes(eventSourcingPlugin) {
  const router = Router();

  router.use('/audit', createAuditRoutes(eventSourcingPlugin));
  router.use('/events', createEventStoreRoutes(eventSourcingPlugin));
  router.use('/aggregates', createAggregateRoutes(eventSourcingPlugin));

  return router;
}

export default createEventSourcingRoutes;
