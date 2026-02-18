/**
 * Cross-Sport Arbitrage API Routes
 * 
 * REST API endpoints for cross-sport arbitrage functionality.
 */

import { Router, Request, Response } from 'express';
import { CrossSportArbitrageService } from '../cross-sport-arbitrage-service.js';
import logger from '../utils/logger.js';

export function createCrossSportRoutes(service: CrossSportArbitrageService): Router {
  const router = Router();

  /**
   * GET /api/cross-sport/opportunities
   * Get all cross-sport arbitrage opportunities
   */
  router.get('/opportunities', (req: Request, res: Response) => {
    try {
      const {
        sportPair,
        minProfit,
        minConfidence,
        minCorrelation,
        limit = '50'
      } = req.query;

      const filters: any = {};
      
      if (sportPair) {
        filters.sportPair = sportPair as string;
      }
      if (minProfit) {
        filters.minProfit = parseFloat(minProfit as string);
      }
      if (minConfidence) {
        filters.minConfidence = parseFloat(minConfidence as string);
      }

      let opportunities = service.getCachedOpportunities(filters);

      // Apply correlation filter
      if (minCorrelation) {
        const minCorr = parseFloat(minCorrelation as string);
        opportunities = opportunities.filter(o => o.correlationStrength >= minCorr);
      }

      // Apply limit
      const limitNum = parseInt(limit as string, 10);
      opportunities = opportunities.slice(0, limitNum);

      res.json({
        success: true,
        data: opportunities,
        count: opportunities.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching cross-sport opportunities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch opportunities'
      });
    }
  });

  /**
   * GET /api/cross-sport/opportunities/:id
   * Get specific opportunity by ID
   */
  router.get('/opportunities/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const opportunity = service.getOpportunity(id);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      res.json({
        success: true,
        data: opportunity,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching opportunity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch opportunity'
      });
    }
  });

  /**
   * GET /api/cross-sport/sport-pairs
   * Get available sport pairs
   */
  router.get('/sport-pairs', (req: Request, res: Response) => {
    try {
      const pairs = service.getAvailableSportPairs();

      res.json({
        success: true,
        data: pairs,
        count: pairs.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching sport pairs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch sport pairs'
      });
    }
  });

  /**
   * GET /api/cross-sport/mappings
   * Get all cross-sport mappings
   */
  router.get('/mappings', (req: Request, res: Response) => {
    try {
      const mappings = service.getMappings();

      res.json({
        success: true,
        data: mappings,
        count: mappings.length,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching mappings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch mappings'
      });
    }
  });

  /**
   * POST /api/cross-sport/mappings
   * Add custom cross-sport mapping
   */
  router.post('/mappings', (req: Request, res: Response) => {
    try {
      const mapping = req.body;

      // Validate required fields
      if (!mapping.id || !mapping.sportA || !mapping.sportB) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: id, sportA, sportB'
        });
      }

      service.addCustomMapping(mapping);

      res.json({
        success: true,
        message: 'Mapping added successfully',
        data: mapping,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error adding mapping:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add mapping'
      });
    }
  });

  /**
   * GET /api/cross-sport/stats
   * Get service statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = service.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch stats'
      });
    }
  });

  /**
   * POST /api/cross-sport/config
   * Update service configuration
   */
  router.post('/config', (req: Request, res: Response) => {
    try {
      const updates = req.body;

      service.updateConfig(updates);

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: service.getStats().config,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error updating config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update configuration'
      });
    }
  });

  /**
   * POST /api/cross-sport/scan
   * Trigger manual scan (for testing/admin)
   */
  router.post('/scan', async (req: Request, res: Response) => {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: events (array)'
        });
      }

      const startTime = Date.now();
      const opportunities = await service.processEvents(events);
      const duration = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          opportunities,
          eventsProcessed: events.length,
          opportunitiesFound: opportunities.length,
          durationMs: duration
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error running scan:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run scan'
      });
    }
  });

  return router;
}

export default createCrossSportRoutes;
