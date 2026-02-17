import { ArbitrageDetector, ArbitrageOpportunity } from './arbitrage-detector.js';
import OddsAggregationEngine, { AggregatedOdds } from './odds-aggregation-engine.js';
import logger from './utils/logger.js';

/**
 * Arbitrage Detection Service
 * 
 * Continuously monitors aggregated odds and detects arbitrage opportunities
 * using advanced algorithms.
 */

export class ArbitrageDetectionService {
  private detector: ArbitrageDetector;
  private engine: OddsAggregationEngine;
  private activeOpportunities: Map<string, ArbitrageOpportunity> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 1000; // Check every second

  constructor(engine: OddsAggregationEngine) {
    this.engine = engine;
    this.detector = new ArbitrageDetector();
  }

  /**
   * Start the arbitrage detection service
   */
  public async start(): Promise<void> {
    logger.info('Starting Arbitrage Detection Service');

    this.checkInterval = setInterval(async () => {
      await this.checkForArbitrage();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the service
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Arbitrage Detection Service stopped');
  }

  /**
   * Check all events for arbitrage opportunities
   */
  private async checkForArbitrage(): Promise<void> {
    try {
      const events = await this.engine.getAllEvents();
      
      for (const event of events) {
        const opportunities = this.detector.detectArbitrage(event);
        
        for (const opportunity of opportunities) {
          // Check if this is a new opportunity
          if (!this.activeOpportunities.has(opportunity.id)) {
            this.activeOpportunities.set(opportunity.id, opportunity);
            this.emitOpportunity(opportunity);
          }
        }

        // Clean up expired opportunities
        this.cleanExpiredOpportunities();
      }
    } catch (error) {
      logger.error('Error checking for arbitrage:', error);
    }
  }

  /**
   * Emit a new arbitrage opportunity
   */
  private emitOpportunity(opportunity: ArbitrageOpportunity): void {
    logger.info(`New arbitrage opportunity detected: ${opportunity.id}`, {
      profit: opportunity.profitPercent,
      type: opportunity.type,
      event: `${opportunity.homeTeam} vs ${opportunity.awayTeam}`
    });

    // Here you would:
    // 1. Send to notification service
    // 2. Store in database
    // 3. Update real-time subscribers via WebSocket
    // 4. Trigger alerts if profit threshold met
  }

  /**
   * Remove expired opportunities
   */
  private cleanExpiredOpportunities(): void {
    const now = Date.now();
    for (const [id, opp] of this.activeOpportunities.entries()) {
      if (opp.expiresAt < now) {
        this.activeOpportunities.delete(id);
      }
    }
  }

  /**
   * Get all active opportunities
   */
  public getActiveOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.activeOpportunities.values())
      .sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Get opportunities filtered by criteria
   */
  public getFilteredOpportunities(filters: {
    minProfit?: number;
    maxProfit?: number;
    type?: string;
    sport?: string;
  }): ArbitrageOpportunity[] {
    return this.getActiveOpportunities().filter(opp => {
      if (filters.minProfit && opp.profitPercent < filters.minProfit) return false;
      if (filters.maxProfit && opp.profitPercent > filters.maxProfit) return false;
      if (filters.type && opp.type !== filters.type) return false;
      if (filters.sport && opp.sport !== filters.sport) return false;
      return true;
    });
  }
}

export default ArbitrageDetectionService;
