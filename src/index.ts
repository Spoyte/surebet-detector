import OddsAggregationEngine, { BookmakerConfig } from './odds-aggregation-engine.js';
import { createServer } from './web/server.js';
import logger from './utils/logger.js';
import { metricsMiddleware, register } from './utils/metrics.js';
import { SlippageProtector, getSlippageProtector } from './slippage-protector.js';
import { SlippageProtectionWebSocket } from './slippage-protection-websocket.js';
import { OpportunityConfidenceScorer, getOpportunityConfidenceScorer } from './opportunity-confidence-scorer.js';
import { ConfidenceScoringWebSocket } from './confidence-scoring-websocket.js';
import { CrossSportArbitrageService } from './cross-sport-arbitrage-service.js';
import { CrossSportArbitrageWebSocket } from './cross-sport-arbitrage-websocket.js';
import createCrossSportRoutes from './web/cross-sport-routes.js';

/**
 * Surebet Detector - Real-time Odds Aggregation Service
 * 
 * This is the main entry point for the high-performance odds aggregation
 * engine that collects and normalizes odds from 50+ bookmakers.
 */

// Bookmaker configurations
const BOOKMAKERS: BookmakerConfig[] = [
  {
    id: 'pinnacle',
    name: 'Pinnacle',
    restEndpoint: 'https://api.pinnacle.com/v2/odds',
    rateLimitMs: 1000,
    weight: 10,
    supportedSports: ['soccer', 'tennis', 'basketball', 'baseball', 'hockey', 'esports'],
    supportedMarkets: ['h2h', 'spreads', 'totals', 'moneyline']
  },
  {
    id: 'betfair',
    name: 'Betfair Exchange',
    wsEndpoint: 'wss://stream-api.betfair.com',
    restEndpoint: 'https://api.betfair.com/exchange/betting/rest/v1.0/',
    rateLimitMs: 200,
    weight: 9,
    supportedSports: ['soccer', 'tennis', 'basketball', 'horse_racing', 'cricket'],
    supportedMarkets: ['h2h', 'lay', 'back']
  },
  {
    id: 'unibet',
    name: 'Unibet',
    restEndpoint: 'https://eu-offering-api.kambicdn.com/offering/v2018/ub',
    rateLimitMs: 500,
    weight: 7,
    supportedSports: ['soccer', 'tennis', 'basketball', 'hockey', 'american_football'],
    supportedMarkets: ['h2h', 'totals', 'spreads']
  },
  {
    id: 'betclic',
    name: 'Betclic',
    restEndpoint: 'https://www.betclic.fr/api/odds',
    rateLimitMs: 1000,
    weight: 6,
    supportedSports: ['soccer', 'tennis', 'basketball', 'rugby'],
    supportedMarkets: ['h2h', 'totals']
  },
  {
    id: 'winamax',
    name: 'Winamax',
    restEndpoint: 'https://www.winamax.fr/api/odds',
    rateLimitMs: 1000,
    weight: 6,
    supportedSports: ['soccer', 'tennis', 'basketball', 'esports'],
    supportedMarkets: ['h2h', 'totals', 'handicap']
  },
  {
    id: 'fdj',
    name: 'Française des Jeux',
    restEndpoint: 'https://www.fdj.fr/api/odds',
    rateLimitMs: 2000,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball'],
    supportedMarkets: ['h2h']
  },
  {
    id: 'parionsport',
    name: 'ParionsSport',
    restEndpoint: 'https://www.parionssport.fdj.fr/api/odds',
    rateLimitMs: 2000,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball', 'rugby'],
    supportedMarkets: ['h2h', 'totals']
  },
  {
    id: 'zebet',
    name: 'ZEbet',
    restEndpoint: 'https://www.zebet.fr/api/odds',
    rateLimitMs: 1500,
    weight: 5,
    supportedSports: ['soccer', 'tennis', 'basketball'],
    supportedMarkets: ['h2h', 'handicap']
  },
  {
    id: 'cloudbet',
    name: 'Cloudbet',
    restEndpoint: 'https://www.cloudbet.com/api/odds',
    rateLimitMs: 1000,
    weight: 8,
    supportedSports: ['soccer', 'tennis', 'basketball', 'esports', 'crypto'],
    supportedMarkets: ['h2h', 'totals', 'spreads']
  },
  {
    id: 'smarkets',
    name: 'Smarkets',
    wsEndpoint: 'wss://api.smarkets.com/v3/stream',
    restEndpoint: 'https://api.smarkets.com/v3/',
    rateLimitMs: 200,
    weight: 8,
    supportedSports: ['soccer', 'tennis', 'basketball', 'horse_racing', 'politics'],
    supportedMarkets: ['h2h', 'lay', 'back']
  }
];

async function main() {
  logger.info('Starting Surebet Detector - Odds Aggregation Engine');

  // Initialize the aggregation engine
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const engine = new OddsAggregationEngine(redisUrl);

  // Initialize slippage protector
  const slippageConfig = {
    maxSlippagePercent: parseFloat(process.env.SLIPPAGE_MAX_PERCENT || '0.5'),
    criticalSlippagePercent: parseFloat(process.env.SLIPPAGE_CRITICAL_PERCENT || '2.0'),
    checkWindowMs: parseInt(process.env.SLIPPAGE_CHECK_WINDOW_MS || '5000'),
    autoRetry: process.env.SLIPPAGE_AUTO_RETRY !== 'false',
    maxRetries: parseInt(process.env.SLIPPAGE_MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.SLIPPAGE_RETRY_DELAY_MS || '1000'),
    detectPriceImprovement: process.env.SLIPPAGE_DETECT_IMPROVEMENT !== 'false'
  };
  
  const slippageProtector = getSlippageProtector(slippageConfig);
  
  // Start slippage protection WebSocket server
  const slippageWsPort = parseInt(process.env.SLIPPAGE_WS_PORT || '8081');
  const slippageWs = new SlippageProtectionWebSocket(slippageProtector, slippageWsPort);
  
  logger.info('Slippage protection initialized', { config: slippageConfig, wsPort: slippageWsPort });

  // Initialize opportunity confidence scorer
  const confidenceScorer = getOpportunityConfidenceScorer({
    weights: {
      profit: parseFloat(process.env.CONFIDENCE_WEIGHT_PROFIT || '0.25'),
      timing: parseFloat(process.env.CONFIDENCE_WEIGHT_TIMING || '0.20'),
      bookmaker: parseFloat(process.env.CONFIDENCE_WEIGHT_BOOKMAKER || '0.20'),
      market: parseFloat(process.env.CONFIDENCE_WEIGHT_MARKET || '0.20'),
      historical: parseFloat(process.env.CONFIDENCE_WEIGHT_HISTORICAL || '0.15')
    },
    thresholds: {
      excellent: parseInt(process.env.CONFIDENCE_THRESHOLD_EXCELLENT || '85'),
      good: parseInt(process.env.CONFIDENCE_THRESHOLD_GOOD || '70'),
      fair: parseInt(process.env.CONFIDENCE_THRESHOLD_FAIR || '55'),
      poor: parseInt(process.env.CONFIDENCE_THRESHOLD_POOR || '40')
    }
  });

  // Start confidence scoring WebSocket server
  const confidenceWsPort = parseInt(process.env.CONFIDENCE_WS_PORT || '8082');
  const confidenceWs = new ConfidenceScoringWebSocket(confidenceScorer, confidenceWsPort);

  logger.info('Opportunity confidence scoring initialized', { wsPort: confidenceWsPort });

  // Initialize cross-sport arbitrage service
  const crossSportService = new CrossSportArbitrageService({
    minProfitPercent: parseFloat(process.env.CROSS_SPORT_MIN_PROFIT || '0.3'),
    maxProfitPercent: parseFloat(process.env.CROSS_SPORT_MAX_PROFIT || '15'),
    minCorrelationStrength: parseFloat(process.env.CROSS_SPORT_MIN_CORRELATION || '0.6'),
    minConfidence: parseFloat(process.env.CROSS_SPORT_MIN_CONFIDENCE || '0.5'),
    scanIntervalMs: parseInt(process.env.CROSS_SPORT_SCAN_INTERVAL || '30000'),
    maxOpportunitiesCache: parseInt(process.env.CROSS_SPORT_MAX_CACHE || '1000')
  });

  await crossSportService.start();

  // Start cross-sport arbitrage WebSocket server
  const crossSportWsPort = parseInt(process.env.CROSS_SPORT_WS_PORT || '8083');
  const crossSportWs = new CrossSportArbitrageWebSocket(crossSportService, crossSportWsPort);

  logger.info('Cross-sport arbitrage service initialized', { wsPort: crossSportWsPort });

  // Register event handlers
  engine.on('engine:started', () => {
    logger.info('Odds aggregation engine started');
  });

  engine.on('engine:stopped', () => {
    logger.info('Odds aggregation engine stopped');
  });

  engine.on('bookmaker:registered', (config) => {
    logger.info(`Registered bookmaker: ${config.name} (${config.id})`);
  });

  engine.on('bookmaker:connected', ({ id, type }) => {
    logger.info(`Bookmaker connected: ${id} (${type})`);
  });

  engine.on('bookmaker:disconnected', ({ id, reason }) => {
    logger.warn(`Bookmaker disconnected: ${id} (${reason})`);
  });

  engine.on('odds:updated', ({ bookmaker, count, odds }) => {
    logger.debug(`Received ${count} odds updates from ${bookmaker}`);
    
    // Record odds for slippage protection
    if (odds && Array.isArray(odds)) {
      odds.forEach((odd: any) => {
        slippageProtector.recordOdds({
          bookmaker: odd.bookmaker || bookmaker,
          market: odd.market,
          selection: odd.selection,
          odds: odd.odds,
          timestamp: Date.now(),
          liquidity: odd.liquidity
        });
      });
    }
  });

  engine.on('odds:aggregated', (data) => {
    logger.debug(`Aggregated odds for event: ${data.eventId}`);
  });

  // Listen for arbitrage opportunities and score them
  engine.on('arbitrage:detected', async (opportunity: any) => {
    logger.info('Arbitrage opportunity detected, scoring confidence...', {
      match: opportunity.match,
      profit: opportunity.profitPercent
    });

    try {
      // Extract features from the opportunity for scoring
      const features = {
        profitPercent: opportunity.profitPercent || 0,
        expectedValue: opportunity.expectedValue || 0,
        timeToEventMinutes: opportunity.timeToEventMinutes || 120,
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        bookmakers: opportunity.bookmakers || [],
        bookmakerReliabilityScores: opportunity.bookmakerReliabilityScores || [0.8, 0.8],
        bookmakerAvgFillRates: opportunity.bookmakerAvgFillRates || [0.85, 0.85],
        bookmakerLimitHistory: opportunity.bookmakerLimitHistory || [500, 500],
        sport: opportunity.sport || 'soccer',
        league: opportunity.league || 'Unknown',
        market: opportunity.market || '1X2',
        liquidityScore: opportunity.liquidityScore || 0.7,
        oddsMovementVolatility: opportunity.oddsMovementVolatility || 0.05,
        historicalSuccessRate: opportunity.historicalSuccessRate || 0.7,
        similarOpportunitiesCount: opportunity.similarOpportunitiesCount || 10,
        avgTimeToFillMinutes: opportunity.avgTimeToFillMinutes || 10,
        competitorCount: opportunity.competitorCount || 5,
        marketEfficiency: opportunity.marketEfficiency || 0.7
      };

      // Score and broadcast the opportunity
      const score = await confidenceWs.scoreAndBroadcast(
        opportunity.id || `opp_${Date.now()}`,
        opportunity.match || 'Unknown Match',
        opportunity.sport || 'soccer',
        opportunity.league || 'Unknown',
        opportunity.market || '1X2',
        opportunity.bookmakers || [],
        features
      );

      logger.info('Opportunity confidence scored', {
        match: opportunity.match,
        score: score.score,
        grade: score.grade,
        action: score.recommendedAction
      });
    } catch (error) {
      logger.error('Failed to score opportunity:', error);
    }
  });

  engine.on('error', ({ source, bookmaker, error }) => {
    logger.error(`Error from ${source}${bookmaker ? ` (${bookmaker})` : ''}:`, error);
  });

  // Register all bookmakers
  for (const config of BOOKMAKERS) {
    // Skip if API key not available (would be set in env)
    if (process.env[`API_KEY_${config.id.toUpperCase()}`]) {
      config.apiKey = process.env[`API_KEY_${config.id.toUpperCase()}`];
    }
    engine.registerBookmaker(config);
  }

  // Start the engine
  await engine.start();

  // Start web server for API access
  const port = parseInt(process.env.PORT || '3000');
  const app = createServer(engine);
  
  // Add cross-sport arbitrage routes
  app.use('/api/cross-sport', createCrossSportRoutes(crossSportService));
  
  app.listen(port, () => {
    logger.info(`API server listening on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await crossSportWs.close();
    await crossSportService.stop();
    await confidenceWs.close();
    await slippageWs.close();
    slippageProtector.dispose();
    await engine.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await crossSportWs.close();
    await crossSportService.stop();
    await confidenceWs.close();
    await slippageWs.close();
    slippageProtector.dispose();
    await engine.stop();
    process.exit(0);
  });

  // Periodic stats logging
  setInterval(() => {
    const stats = engine.getStats();
    logger.info('Engine stats:', stats);
    
    // Update Prometheus metrics
    register.metrics().then((metrics) => {
      // Metrics are automatically updated via the metrics module
    });
  }, 60000); // Every minute
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
