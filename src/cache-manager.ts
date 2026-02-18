/**
 * Redis Cache Manager
 * 
 * High-performance caching layer for frequently accessed data:
 * - Live odds with TTL
 * - User sessions
 * - Opportunity lists
 * - Aggregated statistics
 */

import Redis from 'ioredis';
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

export class CacheManager extends EventEmitter {
  private redis: Redis;
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
    size: 0
  };
  private localCache: Map<string, { value: any; expires: number }> = new Map();
  private readonly LOCAL_CACHE_TTL = 5000; // 5 seconds local cache

  constructor(config: Partial<CacheConfig> = {}) {
    super();
    
    this.config = {
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      defaultTTL: config.defaultTTL || 300, // 5 minutes
      keyPrefix: config.keyPrefix || 'surebet:',
      maxRetries: config.maxRetries || 3,
      enableCompression: config.enableCompression || false
    };

    this.redis = new Redis(this.config.redisUrl, {
      retryStrategy: (times) => {
        if (times > this.config.maxRetries) {
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: this.config.maxRetries
    });

    this.setupEventHandlers();
    this.startStatsCollection();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.emit('connect');
    });

    this.redis.on('error', (err) => {
      this.stats.errors++;
      this.emit('error', err);
    });

    this.redis.on('reconnecting', () => {
      this.emit('reconnecting');
    });
  }

  /**
   * Get value from cache (with local cache layer)
   */
  public async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);

    // Check local cache first
    const local = this.localCache.get(fullKey);
    if (local && local.expires > Date.now()) {
      this.stats.hits++;
      this.updateHitRate();
      return local.value as T;
    }

    try {
      const value = await this.redis.get(fullKey);
      
      if (value) {
        const parsed = JSON.parse(value);
        
        // Update local cache
        this.localCache.set(fullKey, {
          value: parsed,
          expires: Date.now() + this.LOCAL_CACHE_TTL
        });

        this.stats.hits++;
        this.updateHitRate();
        return parsed as T;
      }

      this.stats.misses++;
      this.updateHitRate();
      return null;
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'get', key, error: err });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  public async set(key: string, value: any, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const effectiveTTL = ttl || this.config.defaultTTL;

    try {
      const serialized = JSON.stringify(value);
      
      await this.redis.setex(fullKey, effectiveTTL, serialized);
      
      // Update local cache
      this.localCache.set(fullKey, {
        value,
        expires: Date.now() + this.LOCAL_CACHE_TTL
      });

      this.stats.sets++;
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'set', key, error: err });
    }
  }

  /**
   * Set multiple values (mset with TTL)
   */
  public async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const entry of entries) {
      const fullKey = this.getFullKey(entry.key);
      const ttl = entry.ttl || this.config.defaultTTL;
      const serialized = JSON.stringify(entry.value);
      
      pipeline.setex(fullKey, ttl, serialized);
      
      // Update local cache
      this.localCache.set(fullKey, {
        value: entry.value,
        expires: Date.now() + this.LOCAL_CACHE_TTL
      });
    }

    try {
      await pipeline.exec();
      this.stats.sets += entries.length;
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'mset', error: err });
    }
  }

  /**
   * Get multiple values
   */
  public async mget(keys: string[]): Promise<Map<string, any>> {
    const fullKeys = keys.map(k => this.getFullKey(k));
    const result = new Map<string, any>();

    try {
      const values = await this.redis.mget(...fullKeys);
      
      for (let i = 0; i < keys.length; i++) {
        if (values[i]) {
          const parsed = JSON.parse(values[i]!);
          result.set(keys[i], parsed);
          
          // Update local cache
          this.localCache.set(fullKeys[i], {
            value: parsed,
            expires: Date.now() + this.LOCAL_CACHE_TTL
          });
          
          this.stats.hits++;
        } else {
          this.stats.misses++;
        }
      }
      
      this.updateHitRate();
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'mget', error: err });
    }

    return result;
  }

  /**
   * Delete value from cache
   */
  public async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);

    try {
      await this.redis.del(fullKey);
      this.localCache.delete(fullKey);
      this.stats.deletes++;
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'delete', key, error: err });
    }
  }

  /**
   * Delete multiple values by pattern
   */
  public async deletePattern(pattern: string): Promise<number> {
    const fullPattern = this.getFullKey(pattern);
    
    try {
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        // Clear from local cache
        for (const key of keys) {
          this.localCache.delete(key);
        }
        
        this.stats.deletes += keys.length;
      }
      
      return keys.length;
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'deletePattern', pattern, error: err });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    
    try {
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (err) {
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  public async ttl(key: string): Promise<number> {
    const fullKey = this.getFullKey(key);
    
    try {
      return await this.redis.ttl(fullKey);
    } catch (err) {
      this.stats.errors++;
      return -1;
    }
  }

  /**
   * Increment counter
   */
  public async increment(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getFullKey(key);
    
    try {
      return await this.redis.incrby(fullKey, amount);
    } catch (err) {
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Add to sorted set
   */
  public async zadd(key: string, score: number, member: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    try {
      await this.redis.zadd(fullKey, score, member);
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'zadd', key, error: err });
    }
  }

  /**
   * Get range from sorted set
   */
  public async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const fullKey = this.getFullKey(key);
    
    try {
      return await this.redis.zrange(fullKey, start, stop);
    } catch (err) {
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Publish message to channel
   */
  public async publish(channel: string, message: any): Promise<void> {
    try {
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      await this.redis.publish(`${this.config.keyPrefix}${channel}`, serialized);
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'publish', channel, error: err });
    }
  }

  /**
   * Subscribe to channel
   */
  public subscribe(channel: string, handler: (message: any) => void): void {
    const subscriber = new Redis(this.config.redisUrl);
    const fullChannel = `${this.config.keyPrefix}${channel}`;
    
    subscriber.subscribe(fullChannel);
    subscriber.on('message', (ch, message) => {
      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch {
        handler(message);
      }
    });
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      size: 0
    };
  }

  /**
   * Clear all cached data
   */
  public async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      this.localCache.clear();
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { operation: 'clear', error: err });
    }
  }

  /**
   * Close connection
   */
  public async close(): Promise<void> {
    await this.redis.quit();
    this.localCache.clear();
  }

  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private startStatsCollection(): void {
    // Update size periodically
    setInterval(async () => {
      try {
        const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
        this.stats.size = keys.length;
      } catch {
        // Ignore errors
      }
    }, 60000); // Every minute
  }
}

export default CacheManager;
