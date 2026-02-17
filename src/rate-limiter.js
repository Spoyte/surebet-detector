/**
 * Rate Limiter and Request Throttling Module
 * Provides per-bookmaker rate limiting, global request throttling, and queue management
 */

class RateLimiter {
    constructor(config = {}) {
        this.config = {
            // Default rate limits per bookmaker (requests per minute)
            bookmakerLimits: {
                'unibet': { requestsPerMinute: 60, burstSize: 10 },
                'betclic': { requestsPerMinute: 30, burstSize: 5 },
                'winamax': { requestsPerMinute: 30, burstSize: 5 },
                'pinnacle': { requestsPerMinute: 120, burstSize: 20 },
                'polymarket': { requestsPerMinute: 100, burstSize: 15 },
                'default': { requestsPerMinute: 30, burstSize: 5 }
            },
            // Global rate limiting
            globalRequestsPerMinute: 300,
            globalBurstSize: 50,
            // Queue management
            maxQueueSize: 1000,
            defaultTimeout: 30000,
            // Retry configuration
            maxRetries: 3,
            retryDelay: 1000,
            exponentialBackoff: true,
            ...config
        };

        // Token buckets for each bookmaker
        this.buckets = new Map();
        
        // Global token bucket
        this.globalBucket = {
            tokens: this.config.globalBurstSize,
            lastRefill: Date.now()
        };

        // Request queues per bookmaker
        this.queues = new Map();

        // Request statistics
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            queuedRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            bookmakerStats: new Map()
        };

        // Start the token refill interval
        this.refillInterval = setInterval(() => this.refillTokens(), 1000);

        // Initialize default buckets
        this.initializeBuckets();
    }

    /**
     * Initialize token buckets for all configured bookmakers
     */
    initializeBuckets() {
        for (const [bookmaker, limits] of Object.entries(this.config.bookmakerLimits)) {
            this.buckets.set(bookmaker, {
                tokens: limits.burstSize,
                lastRefill: Date.now(),
                limits: limits
            });
            
            this.queues.set(bookmaker, []);
            
            this.stats.bookmakerStats.set(bookmaker, {
                requests: 0,
                throttled: 0,
                queued: 0,
                failed: 0,
                averageResponseTime: 0
            });
        }
    }

    /**
     * Refill tokens in all buckets every second
     */
    refillTokens() {
        const now = Date.now();

        // Refill global bucket
        const globalElapsed = (now - this.globalBucket.lastRefill) / 1000;
        const globalRatePerSecond = this.config.globalRequestsPerMinute / 60;
        const globalTokensToAdd = globalElapsed * globalRatePerSecond;
        this.globalBucket.tokens = Math.min(
            this.config.globalBurstSize,
            this.globalBucket.tokens + globalTokensToAdd
        );
        this.globalBucket.lastRefill = now;

        // Refill bookmaker buckets
        for (const [bookmaker, bucket] of this.buckets) {
            const elapsed = (now - bucket.lastRefill) / 1000;
            const ratePerSecond = bucket.limits.requestsPerMinute / 60;
            const tokensToAdd = elapsed * ratePerSecond;
            bucket.tokens = Math.min(
                bucket.limits.burstSize,
                bucket.tokens + tokensToAdd
            );
            bucket.lastRefill = now;
        }

        // Process queues
        this.processQueues();
    }

    /**
     * Process queued requests
     */
    async processQueues() {
        for (const [bookmaker, queue] of this.queues) {
            if (queue.length === 0) continue;

            const bucket = this.buckets.get(bookmaker);
            if (!bucket || bucket.tokens < 1) continue;

            // Process as many queued requests as we have tokens for
            while (queue.length > 0 && bucket.tokens >= 1 && this.globalBucket.tokens >= 1) {
                const request = queue.shift();
                bucket.tokens--;
                this.globalBucket.tokens--;
                
                try {
                    const result = await this.executeRequest(request);
                    request.resolve(result);
                } catch (error) {
                    request.reject(error);
                }
            }
        }
    }

    /**
     * Execute a request with retry logic
     */
    async executeRequest(request) {
        const { fn, bookmaker, retries = 0 } = request;
        const startTime = Date.now();
        
        try {
            const result = await fn();
            
            // Update statistics
            const bookmakerStats = this.stats.bookmakerStats.get(bookmaker);
            if (bookmakerStats) {
                bookmakerStats.requests++;
                const responseTime = Date.now() - startTime;
                bookmakerStats.averageResponseTime = 
                    (bookmakerStats.averageResponseTime * (bookmakerStats.requests - 1) + responseTime) 
                    / bookmakerStats.requests;
            }
            this.stats.totalRequests++;
            
            return result;
        } catch (error) {
            // Check if we should retry
            if (retries < this.config.maxRetries && this.isRetryableError(error)) {
                this.stats.retriedRequests++;
                const bookmakerStats = this.stats.bookmakerStats.get(bookmaker);
                if (bookmakerStats) bookmakerStats.failed++;
                
                const delay = this.config.exponentialBackoff 
                    ? this.config.retryDelay * Math.pow(2, retries)
                    : this.config.retryDelay;
                
                await this.sleep(delay);
                return this.executeRequest({ ...request, retries: retries + 1 });
            }
            
            this.stats.failedRequests++;
            throw error;
        }
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        if (!error) return false;
        
        // Network errors
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
            error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return true;
        }
        
        // HTTP status codes that are retryable
        if (error.response) {
            const status = error.response.status;
            return status === 429 || status === 503 || status === 502 || status === 504;
        }
        
        return false;
    }

    /**
     * Make a throttled request to a bookmaker
     */
    async request(bookmaker, fn, options = {}) {
        const normalizedBookmaker = this.normalizeBookmakerName(bookmaker);
        const timeout = options.timeout || this.config.defaultTimeout;
        
        // Check if bucket exists, create if not
        if (!this.buckets.has(normalizedBookmaker)) {
            this.buckets.set(normalizedBookmaker, {
                tokens: this.config.bookmakerLimits.default.burstSize,
                lastRefill: Date.now(),
                limits: this.config.bookmakerLimits.default
            });
            this.queues.set(normalizedBookmaker, []);
        }

        const bucket = this.buckets.get(normalizedBookmaker);
        const queue = this.queues.get(normalizedBookmaker);

        // Check if we can make the request immediately
        if (bucket.tokens >= 1 && this.globalBucket.tokens >= 1) {
            bucket.tokens--;
            this.globalBucket.tokens--;
            return this.executeRequest({ fn, bookmaker: normalizedBookmaker });
        }

        // Check queue size
        if (queue.length >= this.config.maxQueueSize) {
            throw new Error(`Rate limit queue full for ${normalizedBookmaker}. Max size: ${this.config.maxQueueSize}`);
        }

        // Queue the request
        this.stats.throttledRequests++;
        this.stats.queuedRequests++;
        
        const bookmakerStats = this.stats.bookmakerStats.get(normalizedBookmaker);
        if (bookmakerStats) {
            bookmakerStats.throttled++;
            bookmakerStats.queued++;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const index = queue.findIndex(r => r.timeoutId === timeoutId);
                if (index > -1) {
                    queue.splice(index, 1);
                }
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);

            queue.push({
                fn,
                bookmaker: normalizedBookmaker,
                resolve,
                reject,
                timeoutId,
                queuedAt: Date.now()
            });
        });
    }

    /**
     * Normalize bookmaker name
     */
    normalizeBookmakerName(name) {
        if (!name) return 'default';
        
        const normalized = name.toLowerCase().trim();
        
        // Handle regional variants (e.g., unibet_fr, winamax_de)
        for (const prefix of Object.keys(this.config.bookmakerLimits)) {
            if (normalized === prefix || normalized.startsWith(prefix + '_')) {
                return prefix;
            }
        }
        
        return 'default';
    }

    /**
     * Update rate limits for a bookmaker
     */
    updateLimits(bookmaker, limits) {
        const normalizedBookmaker = this.normalizeBookmakerName(bookmaker);
        
        if (this.buckets.has(normalizedBookmaker)) {
            const bucket = this.buckets.get(normalizedBookmaker);
            bucket.limits = { ...bucket.limits, ...limits };
        } else {
            this.buckets.set(normalizedBookmaker, {
                tokens: limits.burstSize || this.config.bookmakerLimits.default.burstSize,
                lastRefill: Date.now(),
                limits: { ...this.config.bookmakerLimits.default, ...limits }
            });
            this.queues.set(normalizedBookmaker, []);
        }
        
        this.config.bookmakerLimits[normalizedBookmaker] = {
            ...this.config.bookmakerLimits.default,
            ...limits
        };
    }

    /**
     * Get current statistics
     */
    getStats() {
        const bookmakerStats = {};
        for (const [name, stats] of this.stats.bookmakerStats) {
            const bucket = this.buckets.get(name);
            const queue = this.queues.get(name);
            bookmakerStats[name] = {
                ...stats,
                availableTokens: bucket ? Math.floor(bucket.tokens) : 0,
                queueLength: queue ? queue.length : 0
            };
        }

        return {
            global: {
                availableTokens: Math.floor(this.globalBucket.tokens),
                requestsPerMinute: this.config.globalRequestsPerMinute,
                burstSize: this.config.globalBurstSize
            },
            totalRequests: this.stats.totalRequests,
            throttledRequests: this.stats.throttledRequests,
            queuedRequests: this.stats.queuedRequests,
            failedRequests: this.stats.failedRequests,
            retriedRequests: this.stats.retriedRequests,
            bookmakers: bookmakerStats
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            queuedRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            bookmakerStats: new Map()
        };
        
        for (const bookmaker of this.buckets.keys()) {
            this.stats.bookmakerStats.set(bookmaker, {
                requests: 0,
                throttled: 0,
                queued: 0,
                failed: 0,
                averageResponseTime: 0
            });
        }
    }

    /**
     * Get queue status for a bookmaker
     */
    getQueueStatus(bookmaker) {
        const normalizedBookmaker = this.normalizeBookmakerName(bookmaker);
        const queue = this.queues.get(normalizedBookmaker) || [];
        const bucket = this.buckets.get(normalizedBookmaker);
        
        return {
            bookmaker: normalizedBookmaker,
            queueLength: queue.length,
            availableTokens: bucket ? Math.floor(bucket.tokens) : 0,
            oldestRequest: queue.length > 0 ? new Date(queue[0].queuedAt).toISOString() : null,
            estimatedWaitTime: this.estimateWaitTime(normalizedBookmaker, queue.length)
        };
    }

    /**
     * Estimate wait time for a request
     */
    estimateWaitTime(bookmaker, queuePosition = 0) {
        const normalizedBookmaker = this.normalizeBookmakerName(bookmaker);
        const bucket = this.buckets.get(normalizedBookmaker);
        
        if (!bucket) return 0;
        
        const tokensNeeded = Math.max(0, queuePosition + 1 - Math.floor(bucket.tokens));
        const ratePerSecond = bucket.limits.requestsPerMinute / 60;
        
        return Math.ceil(tokensNeeded / ratePerSecond * 1000);
    }

    /**
     * Clear all queues
     */
    clearQueues() {
        for (const [bookmaker, queue] of this.queues) {
            while (queue.length > 0) {
                const request = queue.shift();
                clearTimeout(request.timeoutId);
                request.reject(new Error('Queue cleared'));
            }
        }
    }

    /**
     * Shutdown the rate limiter
     */
    shutdown() {
        if (this.refillInterval) {
            clearInterval(this.refillInterval);
            this.refillInterval = null;
        }
        this.clearQueues();
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Request Queue Manager for handling batch requests
 */
class RequestQueueManager {
    constructor(rateLimiter, options = {}) {
        this.rateLimiter = rateLimiter;
        this.options = {
            batchSize: 10,
            batchDelay: 100,
            parallelBookmakers: 5,
            ...options
        };
        this.pendingBatches = new Map();
    }

    /**
     * Execute requests in batches with rate limiting
     */
    async executeBatch(requests, options = {}) {
        const batchSize = options.batchSize || this.options.batchSize;
        const parallelBookmakers = options.parallelBookmakers || this.options.parallelBookmakers;
        
        // Group requests by bookmaker
        const grouped = this.groupByBookmaker(requests);
        const results = [];
        
        // Process bookmakers in parallel (up to limit)
        const bookmakerEntries = Object.entries(grouped);
        
        for (let i = 0; i < bookmakerEntries.length; i += parallelBookmakers) {
            const batch = bookmakerEntries.slice(i, i + parallelBookmakers);
            
            const batchPromises = batch.map(async ([bookmaker, bookmakerRequests]) => {
                const bookmakerResults = [];
                
                // Process requests in smaller batches for each bookmaker
                for (let j = 0; j < bookmakerRequests.length; j += batchSize) {
                    const requestBatch = bookmakerRequests.slice(j, j + batchSize);
                    
                    const batchResults = await Promise.allSettled(
                        requestBatch.map(req => 
                            this.rateLimiter.request(bookmaker, req.fn, req.options)
                        )
                    );
                    
                    bookmakerResults.push(...batchResults);
                    
                    // Small delay between batches
                    if (j + batchSize < bookmakerRequests.length) {
                        await this.sleep(this.options.batchDelay);
                    }
                }
                
                return { bookmaker, results: bookmakerResults };
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            for (const { bookmaker, results: bookmakerResults } of batchResults) {
                results.push(...bookmakerResults.map((r, idx) => ({
                    bookmaker,
                    index: grouped[bookmaker][idx]?.index,
                    status: r.status,
                    value: r.status === 'fulfilled' ? r.value : undefined,
                    reason: r.status === 'rejected' ? r.reason : undefined
                })));
            }
        }
        
        return results;
    }

    /**
     * Group requests by bookmaker
     */
    groupByBookmaker(requests) {
        const grouped = {};
        
        requests.forEach((req, index) => {
            const bookmaker = req.bookmaker || 'default';
            if (!grouped[bookmaker]) {
                grouped[bookmaker] = [];
            }
            grouped[bookmaker].push({ ...req, index });
        });
        
        return grouped;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Throttled Fetch wrapper for HTTP requests
 */
class ThrottledFetch {
    constructor(rateLimiter, axiosInstance = null) {
        this.rateLimiter = rateLimiter;
        this.axios = axiosInstance || require('axios');
    }

    /**
     * Make a throttled HTTP request
     */
    async request(config, bookmaker = 'default', options = {}) {
        return this.rateLimiter.request(bookmaker, async () => {
            return this.axios.request(config);
        }, options);
    }

    /**
     * Make a throttled GET request
     */
    async get(url, config = {}, bookmaker = 'default', options = {}) {
        return this.rateLimiter.request(bookmaker, async () => {
            return this.axios.get(url, config);
        }, options);
    }

    /**
     * Make a throttled POST request
     */
    async post(url, data, config = {}, bookmaker = 'default', options = {}) {
        return this.rateLimiter.request(bookmaker, async () => {
            return this.axios.post(url, data, config);
        }, options);
    }
}

module.exports = {
    RateLimiter,
    RequestQueueManager,
    ThrottledFetch
};