/**
 * Tests for Rate Limiter Module
 */

const { RateLimiter, RequestQueueManager, ThrottledFetch } = require('./rate-limiter');

// Test utilities
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🧪 Running Rate Limiter Tests...\n');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Basic rate limiting
    try {
        console.log('Test 1: Basic rate limiting');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 2 }
            },
            globalRequestsPerMinute: 100,
            globalBurstSize: 5
        });

        let requestCount = 0;
        const fn = async () => { requestCount++; return 'success'; };

        // First 2 requests should go through immediately (burst size)
        await limiter.request('test', fn);
        await limiter.request('test', fn);
        
        if (requestCount !== 2) {
            throw new Error(`Expected 2 requests, got ${requestCount}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 2: Queue management
    try {
        console.log('Test 2: Queue management');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            },
            globalRequestsPerMinute: 100,
            globalBurstSize: 10
        });

        let requestCount = 0;
        const fn = async () => { 
            await sleep(50); // Simulate work
            requestCount++; 
            return requestCount; 
        };

        // Make 3 requests with burst size of 1
        const promises = [
            limiter.request('test', fn),
            limiter.request('test', fn),
            limiter.request('test', fn)
        ];

        const results = await Promise.all(promises);
        
        if (results.length !== 3) {
            throw new Error(`Expected 3 results, got ${results.length}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 3: Bookmaker name normalization
    try {
        console.log('Test 3: Bookmaker name normalization');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'unibet': { requestsPerMinute: 60, burstSize: 5 }
            }
        });

        const testCases = [
            ['unibet', 'unibet'],
            ['Unibet', 'unibet'],
            ['UNIBET', 'unibet'],
            ['unibet_fr', 'unibet'],
            ['unibet_uk', 'unibet'],
            ['unknown', 'default']
        ];

        for (const [input, expected] of testCases) {
            const result = limiter.normalizeBookmakerName(input);
            if (result !== expected) {
                throw new Error(`Expected ${expected} for "${input}", got ${result}`);
            }
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 4: Statistics tracking
    try {
        console.log('Test 4: Statistics tracking');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            }
        });

        const fn = async () => 'success';
        
        await limiter.request('test', fn);
        await limiter.request('test', fn);
        
        const stats = limiter.getStats();
        
        if (stats.totalRequests !== 2) {
            throw new Error(`Expected 2 total requests, got ${stats.totalRequests}`);
        }

        if (!stats.bookmakers['test']) {
            throw new Error('Expected test bookmaker stats');
        }

        if (stats.bookmakers['test'].requests !== 2) {
            throw new Error(`Expected 2 test requests, got ${stats.bookmakers['test'].requests}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 5: Retry logic
    try {
        console.log('Test 5: Retry logic');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            },
            maxRetries: 2,
            retryDelay: 10,
            exponentialBackoff: false
        });

        let attemptCount = 0;
        const fn = async () => {
            attemptCount++;
            if (attemptCount < 3) {
                const error = new Error('Temporary error');
                error.code = 'ECONNRESET';
                throw error;
            }
            return 'success';
        };

        const result = await limiter.request('test', fn);
        
        if (result !== 'success') {
            throw new Error(`Expected success, got ${result}`);
        }

        if (attemptCount !== 3) {
            throw new Error(`Expected 3 attempts, got ${attemptCount}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 6: Global rate limiting
    try {
        console.log('Test 6: Global rate limiting');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test1': { requestsPerMinute: 1000, burstSize: 10 },
                'test2': { requestsPerMinute: 1000, burstSize: 10 }
            },
            globalRequestsPerMinute: 60,
            globalBurstSize: 2
        });

        let requestCount = 0;
        const fn = async () => { requestCount++; return 'success'; };

        // Make requests to different bookmakers
        await limiter.request('test1', fn);
        await limiter.request('test2', fn);
        
        if (requestCount !== 2) {
            throw new Error(`Expected 2 requests, got ${requestCount}`);
        }

        // Global burst should be exhausted
        const stats = limiter.getStats();
        if (stats.global.availableTokens >= 2) {
            throw new Error('Global tokens should be depleted');
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 7: Queue status
    try {
        console.log('Test 7: Queue status');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            }
        });

        const fn = async () => { await sleep(100); return 'success'; };

        // Start a request that will take time
        const promise1 = limiter.request('test', fn);
        
        // Queue another request
        const promise2 = limiter.request('test', fn);

        const status = limiter.getQueueStatus('test');
        
        if (status.bookmaker !== 'test') {
            throw new Error(`Expected bookmaker test, got ${status.bookmaker}`);
        }

        await Promise.all([promise1, promise2]);
        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 8: Update limits dynamically
    try {
        console.log('Test 8: Update limits dynamically');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            }
        });

        limiter.updateLimits('test', { requestsPerMinute: 120, burstSize: 5 });
        
        const bucket = limiter.buckets.get('test');
        if (bucket.limits.requestsPerMinute !== 120) {
            throw new Error(`Expected 120 rpm, got ${bucket.limits.requestsPerMinute}`);
        }

        if (bucket.limits.burstSize !== 5) {
            throw new Error(`Expected burst 5, got ${bucket.limits.burstSize}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 9: Request timeout
    try {
        console.log('Test 9: Request timeout');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            },
            maxQueueSize: 1
        });

        const slowFn = async () => { 
            await sleep(5000); 
            return 'success'; 
        };

        // Start a slow request
        const promise1 = limiter.request('test', slowFn);
        
        // Queue should fill up quickly
        try {
            const fastFn = async () => 'fast';
            await limiter.request('test', fastFn, { timeout: 50 });
            throw new Error('Should have timed out');
        } catch (error) {
            if (!error.message.includes('timeout')) {
                throw error;
            }
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 10: RequestQueueManager batch execution
    try {
        console.log('Test 10: RequestQueueManager batch execution');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 120, burstSize: 10 }
            }
        });
        
        const queueManager = new RequestQueueManager(limiter, {
            batchSize: 3,
            batchDelay: 10
        });

        const requests = [];
        for (let i = 0; i < 5; i++) {
            requests.push({
                bookmaker: 'test',
                fn: async () => `result-${i}`,
                options: {}
            });
        }

        const results = await queueManager.executeBatch(requests);
        
        if (results.length !== 5) {
            throw new Error(`Expected 5 results, got ${results.length}`);
        }

        const successful = results.filter(r => r.status === 'fulfilled');
        if (successful.length !== 5) {
            throw new Error(`Expected 5 successful, got ${successful.length}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 11: Reset statistics
    try {
        console.log('Test 11: Reset statistics');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            }
        });

        const fn = async () => 'success';
        
        await limiter.request('test', fn);
        
        let stats = limiter.getStats();
        if (stats.totalRequests !== 1) {
            throw new Error(`Expected 1 request before reset, got ${stats.totalRequests}`);
        }

        limiter.resetStats();
        
        stats = limiter.getStats();
        if (stats.totalRequests !== 0) {
            throw new Error(`Expected 0 requests after reset, got ${stats.totalRequests}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 12: Clear queues
    try {
        console.log('Test 12: Clear queues');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            }
        });

        const slowFn = async () => { 
            await sleep(2000); 
            return 'success'; 
        };

        // Start a slow request and queue another
        const promise1 = limiter.request('test', slowFn);
        const promise2 = limiter.request('test', slowFn);

        // Wait a bit for queue to populate
        await sleep(50);

        // Clear queues immediately
        limiter.clearQueues();

        // First request might complete, second should be rejected
        try {
            await promise2;
        } catch (error) {
            if (!error.message.includes('cleared')) {
                throw error;
            }
        }

        // Wait for first promise to avoid unhandled rejection
        try { await promise1; } catch (e) { /* ignore */ }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 13: ThrottledFetch wrapper
    try {
        console.log('Test 13: ThrottledFetch wrapper');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            }
        });

        // Mock axios
        const mockAxios = {
            request: async (config) => ({ data: 'response', config }),
            get: async (url, config) => ({ data: 'get-response', url, config }),
            post: async (url, data, config) => { 
                return { data: 'post-response', url, postData: data, config };
            }
        };

        const throttledFetch = new ThrottledFetch(limiter, mockAxios);

        const getResult = await throttledFetch.get('http://test.com', {}, 'test');
        if (getResult.data !== 'get-response') {
            throw new Error(`GET request failed: ${JSON.stringify(getResult)}`);
        }

        const postResult = await throttledFetch.post('http://test.com', { test: true }, {}, 'test');
        if (postResult.data !== 'post-response') {
            throw new Error(`POST request failed: expected data='post-response', got ${JSON.stringify(postResult)}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 14: Is retryable error
    try {
        console.log('Test 14: Is retryable error detection');
        const limiter = new RateLimiter({});

        const retryableErrors = [
            { code: 'ECONNRESET' },
            { code: 'ETIMEDOUT' },
            { code: 'ECONNREFUSED' },
            { code: 'ENOTFOUND' },
            { response: { status: 429 } },
            { response: { status: 503 } },
            { response: { status: 502 } },
            { response: { status: 504 } }
        ];

        for (const error of retryableErrors) {
            if (!limiter.isRetryableError(error)) {
                throw new Error(`Expected retryable for ${JSON.stringify(error)}`);
            }
        }

        const nonRetryableErrors = [
            { code: 'EACCES' },
            { response: { status: 400 } },
            { response: { status: 404 } },
            { response: { status: 500 } },
            null,
            undefined
        ];

        for (const error of nonRetryableErrors) {
            if (limiter.isRetryableError(error)) {
                throw new Error(`Expected non-retryable for ${JSON.stringify(error)}`);
            }
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 15: Estimate wait time
    try {
        console.log('Test 15: Estimate wait time');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 10 }
            }
        });

        // With burst of 10 and position 5, should be 0
        const wait0 = limiter.estimateWaitTime('test', 5);
        if (wait0 !== 0) {
            throw new Error(`Expected 0ms wait, got ${wait0}ms`);
        }

        // With burst of 10 and position 15, need 5 tokens at 1/sec = 5 seconds
        const wait5 = limiter.estimateWaitTime('test', 15);
        if (wait5 < 4000 || wait5 > 6000) {
            throw new Error(`Expected ~5000ms wait, got ${wait5}ms`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 16: Queue full error
    try {
        console.log('Test 16: Queue full error');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            },
            maxQueueSize: 2
        });

        const slowFn = async () => { 
            await sleep(5000); 
            return 'success'; 
        };

        // Start one request
        const promise1 = limiter.request('test', slowFn);
        
        // Fill the queue
        const promise2 = limiter.request('test', slowFn);
        const promise3 = limiter.request('test', slowFn);

        // This should fail - queue full
        try {
            await limiter.request('test', slowFn);
            throw new Error('Should have thrown queue full error');
        } catch (error) {
            if (!error.message.includes('queue full')) {
                throw error;
            }
        }

        // Clean up - clear queues and ignore promise rejections
        limiter.clearQueues();
        
        // Ignore rejections from cleared promises
        promise1.catch(() => {});
        promise2.catch(() => {});
        promise3.catch(() => {});
        
        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 17: Multiple bookmakers isolation
    try {
        console.log('Test 17: Multiple bookmakers isolation');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'bookmaker1': { requestsPerMinute: 60, burstSize: 2 },
                'bookmaker2': { requestsPerMinute: 60, burstSize: 2 }
            }
        });

        let count1 = 0, count2 = 0;
        
        await limiter.request('bookmaker1', async () => { count1++; return '1'; });
        await limiter.request('bookmaker1', async () => { count1++; return '1'; });
        await limiter.request('bookmaker2', async () => { count2++; return '2'; });
        await limiter.request('bookmaker2', async () => { count2++; return '2'; });

        if (count1 !== 2 || count2 !== 2) {
            throw new Error(`Expected 2 requests each, got ${count1} and ${count2}`);
        }

        const stats = limiter.getStats();
        if (!stats.bookmakers['bookmaker1'] || !stats.bookmakers['bookmaker2']) {
            throw new Error('Expected separate stats for each bookmaker');
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 18: Exponential backoff
    try {
        console.log('Test 18: Exponential backoff');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            },
            maxRetries: 3,
            retryDelay: 100,
            exponentialBackoff: true
        });

        let attempts = 0;
        const delays = [];
        let lastAttemptTime = Date.now();

        const fn = async () => {
            const now = Date.now();
            delays.push(now - lastAttemptTime);
            lastAttemptTime = now;
            
            attempts++;
            if (attempts < 4) {
                const error = new Error('Temporary error');
                error.code = 'ECONNRESET';
                throw error;
            }
            return 'success';
        };

        const result = await limiter.request('test', fn);
        
        // Wait a bit for any async cleanup
        await sleep(100);

        // Check that delays increase exponentially (approximately)
        // First delay should be ~100ms, second ~200ms, third ~400ms
        // Note: delays[0] is time to first attempt (minimal)
        if (delays[1] < 80 || delays[1] > 150) {
            throw new Error(`First retry delay ${delays[1]}ms not in expected range`);
        }
        if (delays[2] < 150 || delays[2] > 250) {
            throw new Error(`Second retry delay ${delays[2]}ms not in expected range`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 19: Stats include response time
    try {
        console.log('Test 19: Stats include response time');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 5 }
            }
        });

        const fn = async () => {
            await sleep(50);
            return 'success';
        };

        await limiter.request('test', fn);
        await limiter.request('test', fn);
        await limiter.request('test', fn);

        const stats = limiter.getStats();
        const bookmakerStats = stats.bookmakers['test'];
        
        if (!bookmakerStats.averageResponseTime || bookmakerStats.averageResponseTime <= 0) {
            throw new Error(`Expected positive average response time, got ${bookmakerStats.averageResponseTime}`);
        }

        limiter.shutdown();
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 20: Shutdown cleanup
    try {
        console.log('Test 20: Shutdown cleanup');
        const limiter = new RateLimiter({
            bookmakerLimits: {
                'test': { requestsPerMinute: 60, burstSize: 1 }
            }
        });

        const slowFn = async () => { 
            await sleep(5000); 
            return 'success'; 
        };

        // Start and queue requests (but don't await)
        const p1 = limiter.request('test', slowFn).catch(() => {});
        const p2 = limiter.request('test', slowFn).catch(() => {});

        // Shutdown should clear everything
        limiter.shutdown();

        if (limiter.refillInterval !== null) {
            throw new Error('Refill interval should be null after shutdown');
        }

        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Summary
    console.log('='.repeat(50));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = { runTests };