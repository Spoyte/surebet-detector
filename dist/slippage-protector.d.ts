/**
 * Smart Bet Slippage Protection
 *
 * Detects and prevents bet placement when odds have moved unfavorably
 * between detection and execution. Configurable slippage tolerance
 * with automatic retry logic and user notifications.
 */
import { EventEmitter } from 'events';
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
export declare class SlippageProtector extends EventEmitter {
    private config;
    private oddsHistory;
    private pendingChecks;
    private retryAttempts;
    private readonly HISTORY_MAX_AGE_MS;
    private cleanupInterval;
    constructor(config?: Partial<SlippageConfig>);
    /**
     * Update configuration
     */
    updateConfig(config: Partial<SlippageConfig>): void;
    /**
     * Record odds snapshot for tracking
     */
    recordOdds(snapshot: OddsSnapshot): void;
    /**
     * Check for slippage before bet placement
     */
    checkSlippage(request: BetPlacementRequest): Promise<SlippageCheckResult>;
    /**
     * Execute bet placement with slippage protection
     */
    executeWithProtection(request: BetPlacementRequest, executeFn: (req: BetPlacementRequest, adjustedStake?: number) => Promise<boolean>): Promise<{
        success: boolean;
        result: SlippageCheckResult;
        attempts: number;
    }>;
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
    };
    /**
     * Clear retry attempts for a request
     */
    clearRetryAttempts(requestId: string): void;
    /**
     * Dispose and cleanup
     */
    dispose(): void;
    private getOddsKey;
    private getCurrentOdds;
    private calculateAdjustedStake;
    private delay;
    private startCleanupInterval;
}
export declare function getSlippageProtector(config?: Partial<SlippageConfig>): SlippageProtector;
export declare function resetSlippageProtector(): void;
export default SlippageProtector;
//# sourceMappingURL=slippage-protector.d.ts.map