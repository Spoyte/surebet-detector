/**
 * Cross-Sport Arbitrage Service
 * 
 * Microservice for detecting and serving cross-sport arbitrage opportunities.
 * Integrates with the main arbitrage detection pipeline.
 */

import { CrossSportArbitrageDetector, CrossSportOpportunity, SportEvent } from './cross-sport-arbitrage-detector.js';
import { EventEmitter } from 'events';
import logger from './utils/logger.js';

export interface CrossSportServiceConfig {
  minProfitPercent: number;
  maxProfitPercent: number;
  minCorrelationStrength: number;
  minConfidence: number;
  scanIntervalMs: number;
  maxOpportunitiesCache: number;
}

export interface CrossSportAlert {
  opportunity: CrossSportOpportunity;
  timestamp: number;
  alertType: 'new' | 'updated' | 'expiring';
}

export class CrossSportArbitrageService extends EventEmitter {
  private detector: CrossSportArbitrageDetector;
  private config: CrossSportServiceConfig;
  private cachedOpportunities: Map<string, CrossSportOpportunity> = new Map();
  private scanTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<CrossSportServiceConfig> = {}) {
    super();
    
    this.config = {
      minProfitPercent: 0.3,
      maxProfitPercent: 15,
      minCorrelationStrength: 0.6,
      minConfidence: 0.5,
      scanIntervalMs: 30000, // 30 seconds
      maxOpportunitiesCache: 1000,
      ...config
    };

    this.detector = new CrossSportArbitrageDetector();
  }

  /**
   * Start the cross-sport arbitrage service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Cross-sport arbitrage service already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting cross-sport arbitrage service', { config: this.config });

    this.emit('service:started');

    // Start periodic scanning
    this.startScanning();
  }

  /**
   * Stop the service
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    logger.info('Cross-sport arbitrage service stopped');
    this.emit('service:stopped');
  }

  /**
   * Start periodic scanning for opportunities
   */
  private startScanning(): void {
    this.scanTimer = setInterval(() => {
      this.emit('scan:started');
    }, this.config.scanIntervalMs);
  }

  /**
   * Process events and detect cross-sport opportunities
   */
  public async processEvents(events: SportEvent[]): Promise<CrossSportOpportunity[]> {
    if (!this.isRunning) {
      throw new Error('Service not running');
    }

    const startTime = Date.now();
    
    try {
      // Detect opportunities
      const opportunities = this.detector.detectCrossSportArbitrage(events);
      
      // Filter based on config
      const filtered = this.detector.filterOpportunities(opportunities, {
        minProfit: this.config.minProfitPercent,
        maxProfit: this.config.maxProfitPercent,
        minConfidence: this.config.minConfidence,
        minCorrelationStrength: this.config.minCorrelationStrength
      });

      // Update cache and emit alerts
      this.updateOpportunitiesCache(filtered);

      const duration = Date.now() - startTime;
      logger.debug('Cross-sport scan completed', {
        eventsProcessed: events.length,
        opportunitiesFound: opportunities.length,
        opportunitiesFiltered: filtered.length,
        durationMs: duration
      });

      this.emit('scan:completed', {
        eventsProcessed: events.length,
        opportunitiesFound: opportunities.length,
        opportunitiesFiltered: filtered.length,
        durationMs: duration
      });

      return filtered;
    } catch (error) {
      logger.error('Error processing cross-sport events:', error);
      this.emit('scan:error', error);
      throw error;
    }
  }

  /**
   * Update opportunities cache and emit alerts
   */
  private updateOpportunitiesCache(opportunities: CrossSportOpportunity[]): void {
    const currentIds = new Set(opportunities.map(o => o.id));
    const newOpportunities: CrossSportOpportunity[] = [];
    const updatedOpportunities: CrossSportOpportunity[] = [];

    for (const opportunity of opportunities) {
      const existing = this.cachedOpportunities.get(opportunity.id);
      
      if (!existing) {
        // New opportunity
        newOpportunities.push(opportunity);
        this.cachedOpportunities.set(opportunity.id, opportunity);
        
        this.emit('opportunity:new', {
          opportunity,
          timestamp: Date.now(),
          alertType: 'new'
        } as CrossSportAlert);
      } else if (existing.profitPercent !== opportunity.profitPercent) {
        // Updated opportunity
        updatedOpportunities.push(opportunity);
        this.cachedOpportunities.set(opportunity.id, opportunity);
        
        this.emit('opportunity:updated', {
          opportunity,
          timestamp: Date.now(),
          alertType: 'updated'
        } as CrossSportAlert);
      }
    }

    // Check for expiring opportunities
    const now = Date.now();
    for (const [id, opportunity] of this.cachedOpportunities.entries()) {
      if (!currentIds.has(id)) {
        // Opportunity no longer exists
        if (opportunity.expiresAt < now + 5 * 60 * 1000) {
          // Expiring soon
          this.emit('opportunity:expiring', {
            opportunity,
            timestamp: Date.now(),
            alertType: 'expiring'
          } as CrossSportAlert);
        }
        this.cachedOpportunities.delete(id);
      }
    }

    // Trim cache if too large
    if (this.cachedOpportunities.size > this.config.maxOpportunitiesCache) {
      const sorted = Array.from(this.cachedOpportunities.entries())
        .sort((a, b) => b[1].profitPercent - a[1].profitPercent);
      
      this.cachedOpportunities = new Map(
        sorted.slice(0, this.config.maxOpportunitiesCache)
      );
    }
  }

  /**
   * Get cached opportunities
   */
  public getCachedOpportunities(
    filters?: {
      sportPair?: string;
      minProfit?: number;
      minConfidence?: number;
    }
  ): CrossSportOpportunity[] {
    let opportunities = Array.from(this.cachedOpportunities.values());

    if (filters) {
      if (filters.sportPair) {
        opportunities = opportunities.filter(o => 
          `${o.sportA}/${o.sportB}` === filters.sportPair
        );
      }
      if (filters.minProfit) {
        opportunities = opportunities.filter(o => 
          o.profitPercent >= filters.minProfit!
        );
      }
      if (filters.minConfidence) {
        opportunities = opportunities.filter(o => 
          o.confidence >= filters.minConfidence!
        );
      }
    }

    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Get opportunity by ID
   */
  public getOpportunity(id: string): CrossSportOpportunity | undefined {
    return this.cachedOpportunities.get(id);
  }

  /**
   * Get available sport pairs
   */
  public getAvailableSportPairs(): string[] {
    const pairs = new Set<string>();
    
    for (const opportunity of this.cachedOpportunities.values()) {
      pairs.add(`${opportunity.sportA}/${opportunity.sportB}`);
    }
    
    return Array.from(pairs).sort();
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    isRunning: boolean;
    cachedOpportunities: number;
    config: CrossSportServiceConfig;
    availableSportPairs: string[];
  } {
    return {
      isRunning: this.isRunning,
      cachedOpportunities: this.cachedOpportunities.size,
      config: this.config,
      availableSportPairs: this.getAvailableSportPairs()
    };
  }

  /**
   * Update service configuration
   */
  public updateConfig(updates: Partial<CrossSportServiceConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Cross-sport service config updated', { config: this.config });
    this.emit('config:updated', this.config);
  }

  /**
   * Add custom cross-sport mapping
   */
  public addCustomMapping(mapping: any): void {
    this.detector.addCrossSportMapping(mapping);
    logger.info('Custom cross-sport mapping added', { mappingId: mapping.id });
    this.emit('mapping:added', mapping);
  }

  /**
   * Get all available mappings
   */
  public getMappings(): any[] {
    return this.detector.getCrossSportMappings();
  }
}

export default CrossSportArbitrageService;
