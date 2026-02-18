/**
 * Smart Bet Slippage Protection
 * 
 * Detects and prevents bet placement when odds have moved unfavorably
 * between detection and execution. Configurable slippage tolerance
 * with automatic retry logic and user notifications.
 */

import { EventEmitter } from 'events';
import logger from './logger.js';

export interface SlippageConfig {
  /** Maximum acceptable slippage percentage (e.g., 0.5 = 0.5%) */
  maxSlippagePercent: number;
  /** Critical slippage threshold that blocks execution (e.g., 2.0 = 2%) */
  criticalSlippagePercent: number;
  /** Time window to check for slippage (ms) */
  checkWindowMs: number;
  /** Auto-retry on slippage detection */
  autoRetry: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Delay between retries (ms) */
  retryDelayMs: number;
  /** Enable price improvement detection (positive slippage) */
  detectPriceImprovement: boolean;
}

export interface OddsSnapshot {
  bookmaker: string;
  market: string;
  selection: string;
  odds: number;
  timestamp: number;
  liquidity?: number;
}

export interface BetPlacementRequest {
  id: string;
  opportunityId: string;
  bookmaker: string;
  market: string;
  selection: string;
  requestedOdds: number;
  stake: number;
  timestamp: number;
  legIndex?: number;
}

export interface SlippageCheckResult {
  canProceed: boolean;
  slippagePercent: number;
  currentOdds: number;
  requestedOdds: number;
  slippageType: 'none' | 'favorable' | 'acceptable' | 'critical';
  recommendation: 'proceed' | 'retry' | 'abort';
  reason: string;
  adjustedStake?: number;
  retryAfterMs?: number;
}

export interface SlippageEvent {
  request: BetPlacementRequest;
  result: SlippageCheckResult;
  timestamp: number;
}

export class SlippageProtector extends EventEmitter {
  private config: SlippageConfig;
  private oddsHistory: Map<string, OddsSnapshot[]> = new Map();
  private pendingChecks: Map<string, BetPlacementRequest> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private readonly HISTORY_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SlippageConfig> = {}) {
    super();
    this.config = {
      maxSlippagePercent: 0.5,
      criticalSlippagePercent: 2.0,
      checkWindowMs: 5000,
      autoRetry: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      detectPriceImprovement: true,
      ...config
    };
    this.startCleanupInterval();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SlippageConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('SlippageProtector config updated', { config: this.config });
  }

  /**
   * Record odds snapshot for tracking
   */
  recordOdds(snapshot: OddsSnapshot): void {
    const key = this.getOddsKey(snapshot.bookmaker, snapshot.market, snapshot.selection);
    
    if (!this.oddsHistory.has(key)) {
      this.oddsHistory.set(key, []);
    }
    
    const history = this.oddsHistory.get(key)!;
    history.push(snapshot);
    
    // Keep only recent history
    const cutoff = Date.now() - this.HISTORY_MAX_AGE_MS;
    const filtered = history.filter(s => s.timestamp > cutoff);
    this.oddsHistory.set(key, filtered);
  }

  /**
   * Check for slippage before bet placement
   */
  async checkSlippage(request: BetPlacementRequest): Promise<SlippageCheckResult> {
    const key = this.getOddsKey(request.bookmaker, request.market, request.selection);
    const history = this.oddsHistory.get(key) || [];
    
    // Get current odds (most recent)
    const currentOdds = this.getCurrentOdds(request.bookmaker, request.market, request.selection);
    
    if (!currentOdds) {
      return {
        canProceed: false,
        slippagePercent: 0,
        currentOdds: 0,
        requestedOdds: request.requestedOdds,
        slippageType: 'critical',
        recommendation: 'abort',
        reason: 'No current odds available for comparison'
      };
    }

    // Calculate slippage percentage
    // Negative = odds got worse (lower payout), Positive = odds improved
    const slippagePercent = ((currentOdds - request.requestedOdds) / request.requestedOdds) * 100;
    
    // Determine slippage type and recommendation
    let slippageType: SlippageCheckResult['slippageType'];
    let recommendation: SlippageCheckResult['recommendation'];
    let canProceed: boolean;
    let reason: string;
    let adjustedStake: number | undefined;

    if (slippagePercent < -this.config.criticalSlippagePercent) {
      // Critical negative slippage - abort
      slippageType = 'critical';
      recommendation = 'abort';
      canProceed = false;
      reason = `Critical slippage detected: ${slippagePercent.toFixed(2)}%. Odds moved from ${request.requestedOdds} to ${currentOdds}`;
    } else if (slippagePercent < -this.config.maxSlippagePercent) {
      // Acceptable negative slippage - retry or proceed with adjusted stake
      slippageType = 'acceptable';
      
      const retryCount = this.retryAttempts.get(request.id) || 0;
      
      if (this.config.autoRetry && retryCount < this.config.maxRetries) {
        recommendation = 'retry';
        canProceed = false;
        reason = `Slippage detected: ${slippagePercent.toFixed(2)}%. Attempting retry ${retryCount + 1}/${this.config.maxRetries}`;
        this.retryAttempts.set(request.id, retryCount + 1);
      } else {
        // Max retries reached - adjust stake to maintain expected profit
        recommendation = 'proceed';
        canProceed = true;
        adjustedStake = this.calculateAdjustedStake(request, currentOdds);
        reason = `Slippage detected but proceeding with adjusted stake. Original: ${request.stake}, Adjusted: ${adjustedStake?.toFixed(2)}`;
      }
    } else if (slippagePercent < 0) {
      // Minor slippage within tolerance - proceed
      slippageType = 'acceptable';
      recommendation = 'proceed';
      canProceed = true;
      reason = `Minor slippage within tolerance: ${slippagePercent.toFixed(2)}%`;
    } else if (slippagePercent > 0 && this.config.detectPriceImprovement) {
      // Price improvement - favorable slippage
      slippageType = 'favorable';
      recommendation = 'proceed';
      canProceed = true;
      adjustedStake = this.calculateAdjustedStake(request, currentOdds);
      reason = `Price improvement detected: +${slippagePercent.toFixed(2)}%. Odds improved from ${request.requestedOdds} to ${currentOdds}`;
    } else {
      // No slippage
      slippageType = 'none';
      recommendation = 'proceed';
      canProceed = true;
      reason = 'No slippage detected';
    }

    const result: SlippageCheckResult = {
      canProceed,
      slippagePercent,
      currentOdds,
      requestedOdds: request.requestedOdds,
      slippageType,
      recommendation,
      reason,
      adjustedStake,
      retryAfterMs: recommendation === 'retry' ? this.config.retryDelayMs : undefined
    };

    // Emit event for monitoring
    this.emit('slippageCheck', {
      request,
      result,
      timestamp: Date.now()
    } as SlippageEvent);

    // Log the check
    logger.info('Slippage check completed', {
      requestId: request.id,
      bookmaker: request.bookmaker,
      slippagePercent,
      recommendation,
      canProceed
    });

    return result;
  }

  /**
   * Execute bet placement with slippage protection
   */
  async executeWithProtection(
    request: BetPlacementRequest,
    executeFn: (req: BetPlacementRequest, adjustedStake?: number) => Promise<boolean>
  ): Promise<{ success: boolean; result: SlippageCheckResult; attempts: number }> {
    let attempts = 0;
    const maxAttempts = this.config.maxRetries + 1;

    while (attempts < maxAttempts) {
      attempts++;
      
      const result = await this.checkSlippage(request);
      
      if (result.canProceed) {
        // Execute the bet
        try {
          const success = await executeFn(request, result.adjustedStake);
          
          if (success) {
            this.emit('betPlaced', {
              request,
              result,
              attempts,
              timestamp: Date.now()
            });
            
            // Clear retry count on success
            this.retryAttempts.delete(request.id);
            
            return { success: true, result, attempts };
          } else {
            // Execution failed but not due to slippage
            return { success: false, result, attempts };
          }
        } catch (error) {
          logger.error('Bet execution failed', { requestId: request.id, error });
          return { success: false, result, attempts };
        }
      } else if (result.recommendation === 'retry') {
        // Wait before retry
        logger.info(`Retrying slippage check after ${this.config.retryDelayMs}ms`, {
          requestId: request.id,
          attempt: attempts
        });
        await this.delay(this.config.retryDelayMs);
        
        // Update request with current timestamp for next check
        request.timestamp = Date.now();
      } else {
        // Abort - critical slippage or other issue
        this.emit('betAborted', {
          request,
          result,
          attempts,
          timestamp: Date.now()
        });
        
        return { success: false, result, attempts };
      }
    }

    // Max attempts reached
    const finalResult: SlippageCheckResult = {
      canProceed: false,
      slippagePercent: 0,
      currentOdds: 0,
      requestedOdds: request.requestedOdds,
      slippageType: 'critical',
      recommendation: 'abort',
      reason: `Maximum retry attempts (${maxAttempts}) reached`
    };

    this.emit('betAborted', {
      request,
      result: finalResult,
      attempts,
      timestamp: Date.now()
    });

    return { success: false, result: finalResult, attempts };
  }

  /**
   * Get slippage statistics for monitoring
   */
  getStats(): {
    totalChecks: number;
    criticalSlippageCount: number;
    acceptableSlippageCount: number;
    favorableSlippageCount: number;
    averageSlippagePercent: number;
    blockedBetsCount: number;
  } {
    // This would be implemented with actual tracking in production
    return {
      totalChecks: 0,
      criticalSlippageCount: 0,
      acceptableSlippageCount: 0,
      favorableSlippageCount: 0,
      averageSlippagePercent: 0,
      blockedBetsCount: 0
    };
  }

  /**
   * Clear retry attempts for a request
   */
  clearRetryAttempts(requestId: string): void {
    this.retryAttempts.delete(requestId);
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.oddsHistory.clear();
    this.pendingChecks.clear();
    this.retryAttempts.clear();
    this.removeAllListeners();
  }

  // Private methods

  private getOddsKey(bookmaker: string, market: string, selection: string): string {
    return `${bookmaker}:${market}:${selection}`;
  }

  private getCurrentOdds(bookmaker: string, market: string, selection: string): number | null {
    const key = this.getOddsKey(bookmaker, market, selection);
    const history = this.oddsHistory.get(key);
    
    if (!history || history.length === 0) {
      return null;
    }
    
    // Return most recent odds
    return history[history.length - 1].odds;
  }

  private calculateAdjustedStake(request: BetPlacementRequest, currentOdds: number): number {
    // Adjust stake to maintain expected value
    // If odds got worse, we might want to reduce stake
    // If odds improved, we might want to increase stake (within limits)
    const oddsRatio = request.requestedOdds / currentOdds;
    const adjustedStake = request.stake * oddsRatio;
    
    // Cap the adjustment to prevent excessive stakes
    const maxAdjustment = 1.5; // 150% of original
    const minAdjustment = 0.5; // 50% of original
    
    return Math.max(
      request.stake * minAdjustment,
      Math.min(request.stake * maxAdjustment, adjustedStake)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.HISTORY_MAX_AGE_MS;
      
      for (const [key, history] of this.oddsHistory.entries()) {
        const filtered = history.filter(s => s.timestamp > cutoff);
        if (filtered.length === 0) {
          this.oddsHistory.delete(key);
        } else {
          this.oddsHistory.set(key, filtered);
        }
      }
      
      // Clean up old retry attempts
      for (const [requestId, count] of this.retryAttempts.entries()) {
        // Remove entries older than 10 minutes
        // In a real implementation, we'd track timestamps
        if (count === 0) {
          this.retryAttempts.delete(requestId);
        }
      }
    }, 60000); // Run every minute
  }
}

// Singleton instance for application-wide use
let defaultProtector: SlippageProtector | null = null;

export function getSlippageProtector(config?: Partial<SlippageConfig>): SlippageProtector {
  if (!defaultProtector) {
    defaultProtector = new SlippageProtector(config);
  }
  return defaultProtector;
}

export function resetSlippageProtector(): void {
  if (defaultProtector) {
    defaultProtector.dispose();
    defaultProtector = null;
  }
}

export default SlippageProtector;
