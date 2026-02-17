/**
 * Redis Cache Manager
 *
 * High-performance caching layer for frequently accessed data:
 * - Live odds with TTL
 * - User sessions
 * - Opportunity lists
 * - Aggregated statistics
 */
import { EventEmitter } from 'events';
export interface CacheConfig {
    redisUrl: string;
    defaultTTL: number;
    keyPrefix: string;
    maxRetries: number;
    enableCompression: boolean;
}
export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
    size: number;
}
export declare class CacheManager extends EventEmitter {
    private redis;
    private config;
    private stats;
    private localCache;
    private readonly LOCAL_CACHE_TTL;
    constructor(config?: Partial<CacheConfig>);
    private setupEventHandlers;
    /**
     * Get value from cache (with local cache layer)
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * Set value in cache
     */
    set(key: string, value: any, ttl?: number): Promise<void>;
    /**
     * Set multiple values (mset with TTL)
     */
    mset(entries: Array<{
        key: string;
        value: any;
        ttl?: number;
    }>): Promise<void>;
    /**
     * Get multiple values
     */
    mget(keys: string[]): Promise<Map<string, any>>;
    /**
     * Delete value from cache
     */
    delete(key: string): Promise<void>;
    /**
     * Delete multiple values by pattern
     */
    deletePattern(pattern: string): Promise<number>;
    /**
     * Check if key exists
     */
    exists(key: string): Promise<boolean>;
    /**
     * Get TTL for a key
     */
    ttl(key: string): Promise<number>;
    /**
     * Increment counter
     */
    increment(key: string, amount?: number): Promise<number>;
    /**
     * Add to sorted set
     */
    zadd(key: string, score: number, member: string): Promise<void>;
    /**
     * Get range from sorted set
     */
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    /**
     * Publish message to channel
     */
    publish(channel: string, message: any): Promise<void>;
    /**
     * Subscribe to channel
     */
    subscribe(channel: string, handler: (message: any) => void): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    /**
     * Clear all cached data
     */
    clear(): Promise<void>;
    /**
     * Close connection
     */
    close(): Promise<void>;
    private getFullKey;
    private updateHitRate;
    private startStatsCollection;
}
export default CacheManager;
//# sourceMappingURL=cache-manager.d.ts.map