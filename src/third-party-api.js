/**
 * Third-Party API Integration Module
 * 
 * Provides REST API endpoints for external tools to:
 * - Access opportunities
 * - Place bets programmatically
 * - Retrieve analytics
 * - Manage account settings
 * 
 * Features:
 * - API key authentication
 * - Rate limiting per API key
 * - Webhook support for real-time updates
 * - Comprehensive documentation endpoints
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class ThirdPartyAPI {
    constructor(options = {}) {
        this.dataDir = options.dataDir || path.join(__dirname, '../../data');
        this.apiKeysPath = path.join(this.dataDir, 'api-keys.json');
        this.webhooksPath = path.join(this.dataDir, 'api-webhooks.json');
        this.requestLogPath = path.join(this.dataDir, 'api-requests.log');
        
        this.apiKeys = new Map();
        this.webhooks = new Map();
        this.requestCounts = new Map(); // For rate limiting
        
        // Rate limiting config
        this.rateLimitConfig = {
            default: { requests: 100, window: 60 * 1000 }, // 100 requests per minute
            premium: { requests: 1000, window: 60 * 1000 }, // 1000 requests per minute
            enterprise: { requests: 5000, window: 60 * 1000 } // 5000 requests per minute
        };
        
        this.initialized = false;
    }

    /**
     * Initialize the API system
     */
    async init() {
        if (this.initialized) return;
        
        await this.loadAPIKeys();
        await this.loadWebhooks();
        this.initialized = true;
        
        console.log('🔌 Third-Party API initialized');
    }

    /**
     * Load API keys from storage
     */
    async loadAPIKeys() {
        try {
            const data = await fs.readFile(this.apiKeysPath, 'utf8');
            const keys = JSON.parse(data);
            this.apiKeys = new Map(Object.entries(keys));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading API keys:', error.message);
            }
            this.apiKeys = new Map();
        }
    }

    /**
     * Save API keys to storage
     */
    async saveAPIKeys() {
        try {
            const data = JSON.stringify(Object.fromEntries(this.apiKeys), null, 2);
            await fs.writeFile(this.apiKeysPath, data, 'utf8');
        } catch (error) {
            console.error('Error saving API keys:', error.message);
        }
    }

    /**
     * Load webhooks from storage
     */
    async loadWebhooks() {
        try {
            const data = await fs.readFile(this.webhooksPath, 'utf8');
            const hooks = JSON.parse(data);
            this.webhooks = new Map(Object.entries(hooks));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading webhooks:', error.message);
            }
            this.webhooks = new Map();
        }
    }

    /**
     * Save webhooks to storage
     */
    async saveWebhooks() {
        try {
            const data = JSON.stringify(Object.fromEntries(this.webhooks), null, 2);
            await fs.writeFile(this.webhooksPath, data, 'utf8');
        } catch (error) {
            console.error('Error saving webhooks:', error.message);
        }
    }

    /**
     * Generate a new API key
     */
    generateAPIKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate a new API secret
     */
    generateAPISecret() {
        return crypto.randomBytes(48).toString('hex');
    }

    /**
     * Hash an API key for storage
     */
    hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Create a new API key
     */
    async createAPIKey(options = {}) {
        const { 
            name, 
            description = '', 
            tier = 'default',
            permissions = ['read:opportunities', 'read:analytics'],
            rateLimitOverride = null,
            expiresAt = null,
            allowedIPs = [],
            metadata = {}
        } = options;

        if (!name) {
            throw new Error('API key name is required');
        }

        const keyId = crypto.randomUUID();
        const key = this.generateAPIKey();
        const secret = this.generateAPISecret();
        const hashedKey = this.hashKey(key);

        const apiKeyData = {
            id: keyId,
            name,
            description,
            tier,
            permissions,
            hashedKey,
            secret, // Store secret for HMAC verification
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            requestCount: 0,
            rateLimitOverride,
            expiresAt,
            allowedIPs,
            metadata,
            active: true
        };

        this.apiKeys.set(keyId, apiKeyData);
        await this.saveAPIKeys();

        // Return the actual key (only shown once)
        return {
            id: keyId,
            key, // Full API key - ONLY RETURNED ONCE
            secret, // Secret for signing requests
            name,
            tier,
            permissions,
            createdAt: apiKeyData.createdAt,
            expiresAt
        };
    }

    /**
     * Validate an API key
     */
    validateAPIKey(key) {
        if (!key) return null;

        const hashedKey = this.hashKey(key);
        
        for (const [keyId, keyData] of this.apiKeys) {
            if (keyData.hashedKey === hashedKey && keyData.active) {
                // Check expiration
                if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
                    return null;
                }
                return { keyId, keyData };
            }
        }
        
        return null;
    }

    /**
     * Check if API key has permission
     */
    hasPermission(keyData, permission) {
        if (!keyData || !keyData.permissions) return false;
        
        // Check for wildcard permission
        if (keyData.permissions.includes('*')) return true;
        
        // Check for specific permission
        if (keyData.permissions.includes(permission)) return true;
        
        // Check for wildcard in category (e.g., "read:*" matches "read:opportunities")
        const category = permission.split(':')[0];
        if (keyData.permissions.includes(`${category}:*`)) return true;
        
        return false;
    }

    /**
     * Check rate limit for API key
     */
    checkRateLimit(keyId, tier, override = null) {
        const now = Date.now();
        const config = override || this.rateLimitConfig[tier] || this.rateLimitConfig.default;
        const windowStart = now - config.window;

        // Get or initialize request history for this key
        if (!this.requestCounts.has(keyId)) {
            this.requestCounts.set(keyId, []);
        }
        
        const requests = this.requestCounts.get(keyId);
        
        // Remove old requests outside the window
        while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
        }
        
        // Check if limit exceeded
        if (requests.length >= config.requests) {
            return {
                allowed: false,
                limit: config.requests,
                remaining: 0,
                resetAt: requests[0] + config.window
            };
        }
        
        // Add current request
        requests.push(now);
        
        return {
            allowed: true,
            limit: config.requests,
            remaining: config.requests - requests.length - 1,
            resetAt: now + config.window
        };
    }

    /**
     * Middleware to authenticate API requests
     */
    authenticateMiddleware() {
        return async (req, res, next) => {
            try {
                // Get API key from header
                const apiKey = req.headers['x-api-key'];
                
                if (!apiKey) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'API key required. Include X-API-Key header.'
                    });
                }

                // Validate API key
                const validation = this.validateAPIKey(apiKey);
                
                if (!validation) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Invalid or expired API key'
                    });
                }

                const { keyId, keyData } = validation;

                // Check IP whitelist if configured
                if (keyData.allowedIPs && keyData.allowedIPs.length > 0) {
                    const clientIP = req.ip || req.connection.remoteAddress;
                    if (!keyData.allowedIPs.includes(clientIP)) {
                        return res.status(403).json({
                            error: 'Forbidden',
                            message: 'IP address not allowed'
                        });
                    }
                }

                // Check rate limit
                const rateLimit = this.checkRateLimit(
                    keyId, 
                    keyData.tier, 
                    keyData.rateLimitOverride
                );
                
                if (!rateLimit.allowed) {
                    return res.status(429).json({
                        error: 'Rate Limit Exceeded',
                        message: `Rate limit of ${rateLimit.limit} requests per minute exceeded`,
                        resetAt: new Date(rateLimit.resetAt).toISOString()
                    });
                }

                // Update usage stats
                keyData.lastUsedAt = new Date().toISOString();
                keyData.requestCount++;
                await this.saveAPIKeys();

                // Add rate limit headers
                res.setHeader('X-RateLimit-Limit', rateLimit.limit);
                res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
                res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000));

                // Attach key info to request
                req.apiKey = {
                    id: keyId,
                    tier: keyData.tier,
                    permissions: keyData.permissions,
                    hasPermission: (perm) => this.hasPermission(keyData, perm)
                };

                next();
            } catch (error) {
                console.error('API authentication error:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Authentication failed'
                });
            }
        };
    }

    /**
     * Middleware to require specific permission
     */
    requirePermission(permission) {
        return (req, res, next) => {
            if (!req.apiKey) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
            }

            if (!req.apiKey.hasPermission(permission)) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: `Permission '${permission}' required`
                });
            }

            next();
        };
    }

    /**
     * Register webhook
     */
    async registerWebhook(keyId, options) {
        const {
            url,
            events = ['opportunity.created'],
            secret = null,
            active = true,
            metadata = {}
        } = options;

        if (!url) {
            throw new Error('Webhook URL is required');
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            throw new Error('Invalid webhook URL');
        }

        const webhookId = crypto.randomUUID();
        const webhook = {
            id: webhookId,
            keyId,
            url,
            events,
            secret: secret || this.generateAPISecret(),
            active,
            createdAt: new Date().toISOString(),
            lastTriggeredAt: null,
            triggerCount: 0,
            failureCount: 0,
            metadata
        };

        this.webhooks.set(webhookId, webhook);
        await this.saveWebhooks();

        return webhook;
    }

    /**
     * Trigger webhooks for an event
     */
    async triggerWebhooks(event, payload) {
        const relevantWebhooks = Array.from(this.webhooks.values())
            .filter(w => w.active && w.events.includes(event));

        for (const webhook of relevantWebhooks) {
            try {
                await this.sendWebhook(webhook, event, payload);
            } catch (error) {
                console.error(`Webhook ${webhook.id} failed:`, error.message);
            }
        }
    }

    /**
     * Send webhook payload
     */
    async sendWebhook(webhook, event, payload) {
        const timestamp = Date.now();
        const body = JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload
        });

        // Generate signature
        const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(body)
            .digest('hex');

        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${signature}`,
                'X-Webhook-Event': event,
                'X-Webhook-ID': webhook.id,
                'X-Webhook-Timestamp': timestamp.toString()
            },
            body,
            timeout: 30000
        });

        webhook.lastTriggeredAt = new Date().toISOString();
        webhook.triggerCount++;

        if (!response.ok) {
            webhook.failureCount++;
        }

        await this.saveWebhooks();

        return response.ok;
    }

    /**
     * Get API key statistics
     */
    getKeyStats(keyId) {
        const keyData = this.apiKeys.get(keyId);
        if (!keyData) return null;

        const webhooks = Array.from(this.webhooks.values())
            .filter(w => w.keyId === keyId);

        return {
            id: keyId,
            name: keyData.name,
            tier: keyData.tier,
            createdAt: keyData.createdAt,
            lastUsedAt: keyData.lastUsedAt,
            requestCount: keyData.requestCount,
            active: keyData.active,
            expiresAt: keyData.expiresAt,
            webhooks: webhooks.length,
            permissions: keyData.permissions
        };
    }

    /**
     * Revoke an API key
     */
    async revokeAPIKey(keyId) {
        const keyData = this.apiKeys.get(keyId);
        if (!keyData) {
            throw new Error('API key not found');
        }

        keyData.active = false;
        keyData.revokedAt = new Date().toISOString();
        
        // Disable associated webhooks
        for (const [webhookId, webhook] of this.webhooks) {
            if (webhook.keyId === keyId) {
                webhook.active = false;
            }
        }

        await this.saveAPIKeys();
        await this.saveWebhooks();

        return { revoked: true, keyId };
    }

    /**
     * Delete an API key permanently
     */
    async deleteAPIKey(keyId) {
        if (!this.apiKeys.has(keyId)) {
            throw new Error('API key not found');
        }

        // Delete associated webhooks
        for (const [webhookId, webhook] of this.webhooks) {
            if (webhook.keyId === keyId) {
                this.webhooks.delete(webhookId);
            }
        }

        this.apiKeys.delete(keyId);
        await this.saveAPIKeys();
        await this.saveWebhooks();

        return { deleted: true, keyId };
    }

    /**
     * Get all API keys (admin only)
     */
    getAllKeys() {
        return Array.from(this.apiKeys.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            description: data.description,
            tier: data.tier,
            active: data.active,
            createdAt: data.createdAt,
            lastUsedAt: data.lastUsedAt,
            requestCount: data.requestCount,
            expiresAt: data.expiresAt
        }));
    }

    /**
     * Setup Express routes
     */
    setupRoutes(app, services) {
        // Public API documentation endpoint (no auth required)
        app.get('/api/v1', (req, res) => {
            res.json({
                name: 'Surebet Detector API',
                version: '1.0.0',
                documentation: '/api/v1/docs',
                endpoints: {
                    opportunities: '/api/v1/opportunities',
                    analytics: '/api/v1/analytics',
                    bets: '/api/v1/bets',
                    account: '/api/v1/account'
                },
                authentication: {
                    type: 'API Key',
                    header: 'X-API-Key',
                    documentation: '/api/v1/docs/auth'
                }
            });
        });

        // API Documentation
        app.get('/api/v1/docs', (req, res) => {
            res.json(this.getAPIDocumentation());
        });

        // Apply authentication middleware to all /api/v1/* routes except docs
        app.use('/api/v1/*', (req, res, next) => {
            if (req.path === '/docs' || req.path === '/') {
                return next();
            }
            this.authenticateMiddleware()(req, res, next);
        });

        // === OPPORTUNITIES ENDPOINTS ===
        
        // Get opportunities
        app.get('/api/v1/opportunities', this.requirePermission('read:opportunities'), async (req, res) => {
            try {
                const {
                    type = 'all', // 'arbitrage', 'value', 'all'
                    sport,
                    bookmaker,
                    minProfit,
                    maxProfit,
                    minQuality = 0,
                    market,
                    limit = 50,
                    offset = 0,
                    sortBy = 'quality', // 'quality', 'profit', 'time'
                    live = false
                } = req.query;

                const data = await services.loadLatestData();
                let opportunities = [];

                if (type === 'arbitrage' || type === 'all') {
                    opportunities = opportunities.concat(data.arbitrage || []);
                }
                if (type === 'value' || type === 'all') {
                    opportunities = opportunities.concat(data.positiveEV || []);
                }

                // Apply filters
                if (sport) {
                    opportunities = opportunities.filter(o => 
                        o.sport?.toLowerCase() === sport.toLowerCase()
                    );
                }
                if (bookmaker) {
                    opportunities = opportunities.filter(o => 
                        o.bookmakers?.some(b => 
                            b.name?.toLowerCase() === bookmaker.toLowerCase()
                        )
                    );
                }
                if (minProfit) {
                    opportunities = opportunities.filter(o => 
                        (o.profitPercent || o.evPercent) >= parseFloat(minProfit)
                    );
                }
                if (maxProfit) {
                    opportunities = opportunities.filter(o => 
                        (o.profitPercent || o.evPercent) <= parseFloat(maxProfit)
                    );
                }
                if (market) {
                    opportunities = opportunities.filter(o => 
                        o.market?.toLowerCase() === market.toLowerCase()
                    );
                }

                // Filter by quality score
                opportunities = opportunities.filter(o => 
                    (o.quality?.score || 0) >= parseInt(minQuality)
                );

                // Sort
                opportunities.sort((a, b) => {
                    switch (sortBy) {
                        case 'profit':
                            return (b.profitPercent || b.evPercent || 0) - 
                                   (a.profitPercent || a.evPercent || 0);
                        case 'time':
                            return new Date(a.eventTime || 0) - new Date(b.eventTime || 0);
                        case 'quality':
                        default:
                            return (b.quality?.score || 0) - (a.quality?.score || 0);
                    }
                });

                // Paginate
                const total = opportunities.length;
                opportunities = opportunities.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

                res.json({
                    opportunities,
                    pagination: {
                        total,
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: total > parseInt(offset) + parseInt(limit)
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific opportunity
        app.get('/api/v1/opportunities/:id', this.requirePermission('read:opportunities'), async (req, res) => {
            try {
                const data = await services.loadLatestData();
                const all = [...(data.arbitrage || []), ...(data.positiveEV || [])];
                const opportunity = all.find(o => o.id === req.params.id);

                if (!opportunity) {
                    return res.status(404).json({ error: 'Opportunity not found' });
                }

                res.json(opportunity);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Calculate stakes for an opportunity
        app.post('/api/v1/opportunities/:id/calculate', this.requirePermission('read:opportunities'), async (req, res) => {
            try {
                const { totalStake, strategy = 'equal' } = req.body;
                
                const data = await services.loadLatestData();
                const all = [...(data.arbitrage || []), ...(data.positiveEV || [])];
                const opportunity = all.find(o => o.id === req.params.id);

                if (!opportunity) {
                    return res.status(404).json({ error: 'Opportunity not found' });
                }

                // Calculate stakes based on strategy
                let stakes;
                switch (strategy) {
                    case 'kelly':
                        stakes = this.calculateKellyStakes(opportunity, totalStake);
                        break;
                    case 'proportional':
                        stakes = this.calculateProportionalStakes(opportunity, totalStake);
                        break;
                    case 'equal':
                    default:
                        stakes = this.calculateEqualStakes(opportunity, totalStake);
                        break;
                }

                res.json({
                    opportunity: req.params.id,
                    strategy,
                    totalStake,
                    stakes,
                    expectedProfit: this.calculateExpectedProfit(opportunity, stakes)
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // === ANALYTICS ENDPOINTS ===

        // Get analytics summary
        app.get('/api/v1/analytics/summary', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const summary = await services.analytics.getSummaryStats(range);
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get profit over time
        app.get('/api/v1/analytics/profit', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const data = await services.analytics.getProfitOverTime(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get ROI by sport
        app.get('/api/v1/analytics/roi/sports', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const data = await services.analytics.getROIBySport(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get ROI by bookmaker
        app.get('/api/v1/analytics/roi/bookmakers', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const data = await services.analytics.getROIByBookmaker(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get opportunity frequency
        app.get('/api/v1/analytics/frequency', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const data = await services.analytics.getOpportunityFrequency(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get success rate
        app.get('/api/v1/analytics/success-rate', this.requirePermission('read:analytics'), async (req, res) => {
            try {
                const { range = '30d' } = req.query;
                const data = await services.analytics.getSuccessRate(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // === BETS ENDPOINTS ===

        // Get bets
        app.get('/api/v1/bets', this.requirePermission('read:bets'), async (req, res) => {
            try {
                const { status = 'all', range = '30d' } = req.query;
                
                let bets;
                if (status === 'pending') {
                    bets = services.settlementTracker.getPendingBets();
                } else if (status === 'settled') {
                    bets = services.settlementTracker.getSettledBets(range);
                } else {
                    bets = [
                        ...services.settlementTracker.getPendingBets(),
                        ...services.settlementTracker.getSettledBets(range)
                    ];
                }

                res.json({ bets, count: bets.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific bet
        app.get('/api/v1/bets/:id', this.requirePermission('read:bets'), async (req, res) => {
            try {
                const bet = services.settlementTracker.getBet(req.params.id);
                if (!bet) {
                    return res.status(404).json({ error: 'Bet not found' });
                }
                res.json(bet);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Place a bet
        app.post('/api/v1/bets', this.requirePermission('write:bets'), async (req, res) => {
            try {
                const bet = await services.settlementTracker.registerBet(req.body);
                
                // Trigger webhook
                await this.triggerWebhooks('bet.placed', bet);
                
                res.status(201).json({ success: true, bet });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Settle a bet
        app.post('/api/v1/bets/:id/settle', this.requirePermission('write:bets'), async (req, res) => {
            try {
                const result = await services.settlementTracker.settleBet(req.params.id, req.body);
                
                // Trigger webhook
                await this.triggerWebhooks('bet.settled', result);
                
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // === ACCOUNT ENDPOINTS ===

        // Get account info
        app.get('/api/v1/account', this.requirePermission('read:account'), async (req, res) => {
            try {
                const stats = this.getKeyStats(req.apiKey.id);
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get account usage
        app.get('/api/v1/account/usage', this.requirePermission('read:account'), async (req, res) => {
            try {
                const keyData = this.apiKeys.get(req.apiKey.id);
                const rateLimit = this.rateLimitConfig[keyData.tier] || this.rateLimitConfig.default;
                
                res.json({
                    requestCount: keyData.requestCount,
                    tier: keyData.tier,
                    rateLimit: {
                        requests: rateLimit.requests,
                        window: rateLimit.window / 1000 // Convert to seconds
                    },
                    lastUsedAt: keyData.lastUsedAt
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // === WEBHOOK ENDPOINTS ===

        // List webhooks
        app.get('/api/v1/webhooks', this.requirePermission('read:webhooks'), async (req, res) => {
            try {
                const hooks = Array.from(this.webhooks.values())
                    .filter(w => w.keyId === req.apiKey.id)
                    .map(w => ({
                        id: w.id,
                        url: w.url,
                        events: w.events,
                        active: w.active,
                        createdAt: w.createdAt,
                        lastTriggeredAt: w.lastTriggeredAt,
                        triggerCount: w.triggerCount
                    }));
                
                res.json({ webhooks: hooks, count: hooks.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Create webhook
        app.post('/api/v1/webhooks', this.requirePermission('write:webhooks'), async (req, res) => {
            try {
                const webhook = await this.registerWebhook(req.apiKey.id, req.body);
                res.status(201).json({ success: true, webhook });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Delete webhook
        app.delete('/api/v1/webhooks/:id', this.requirePermission('write:webhooks'), async (req, res) => {
            try {
                const webhook = this.webhooks.get(req.params.id);
                if (!webhook || webhook.keyId !== req.apiKey.id) {
                    return res.status(404).json({ error: 'Webhook not found' });
                }
                
                this.webhooks.delete(req.params.id);
                await this.saveWebhooks();
                
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // === ADMIN ENDPOINTS (Require special permission) ===

        // Create API key (admin only)
        app.post('/api/v1/admin/keys', this.requirePermission('admin:keys'), async (req, res) => {
            try {
                const key = await this.createAPIKey(req.body);
                res.status(201).json({ success: true, ...key });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // List all API keys (admin only)
        app.get('/api/v1/admin/keys', this.requirePermission('admin:keys'), async (req, res) => {
            try {
                const keys = this.getAllKeys();
                res.json({ keys, count: keys.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Revoke API key (admin only)
        app.post('/api/v1/admin/keys/:id/revoke', this.requirePermission('admin:keys'), async (req, res) => {
            try {
                const result = await this.revokeAPIKey(req.params.id);
                res.json(result);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Delete API key (admin only)
        app.delete('/api/v1/admin/keys/:id', this.requirePermission('admin:keys'), async (req, res) => {
            try {
                const result = await this.deleteAPIKey(req.params.id);
                res.json(result);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
    }

    /**
     * Calculate equal stakes for arbitrage
     */
    calculateEqualStakes(opportunity, totalStake) {
        const outcomes = opportunity.outcomes || [];
        if (outcomes.length === 0) return [];

        const stakePerOutcome = totalStake / outcomes.length;
        
        return outcomes.map((outcome, index) => ({
            outcome: outcome.name || `Outcome ${index + 1}`,
            bookmaker: outcome.bookmaker,
            odds: outcome.odds,
            stake: stakePerOutcome,
            potentialReturn: stakePerOutcome * outcome.odds
        }));
    }

    /**
     * Calculate proportional stakes based on odds
     */
    calculateProportionalStakes(opportunity, totalStake) {
        const outcomes = opportunity.outcomes || [];
        if (outcomes.length === 0) return [];

        // Calculate implied probabilities
        const impliedProbs = outcomes.map(o => 1 / o.odds);
        const totalImpliedProb = impliedProbs.reduce((a, b) => a + b, 0);

        return outcomes.map((outcome, index) => {
            const stake = (totalStake * impliedProbs[index]) / totalImpliedProb;
            return {
                outcome: outcome.name || `Outcome ${index + 1}`,
                bookmaker: outcome.bookmaker,
                odds: outcome.odds,
                stake,
                potentialReturn: stake * outcome.odds
            };
        });
    }

    /**
     * Calculate Kelly Criterion stakes
     */
    calculateKellyStakes(opportunity, totalStake) {
        // For arbitrage, Kelly doesn't apply directly
        // Use a fraction of bankroll based on edge
        const edge = (opportunity.profitPercent || 0) / 100;
        const kellyFraction = edge / (opportunity.outcomes?.[0]?.odds || 2);
        const recommendedStake = totalStake * Math.min(kellyFraction * 0.25, 0.05); // Quarter Kelly, max 5%

        return this.calculateProportionalStakes(opportunity, recommendedStake);
    }

    /**
     * Calculate expected profit
     */
    calculateExpectedProfit(opportunity, stakes) {
        if (!stakes || stakes.length === 0) return 0;
        
        const totalStake = stakes.reduce((sum, s) => sum + s.stake, 0);
        const guaranteedReturn = stakes[0].potentialReturn; // All returns should be equal in arbitrage
        
        return guaranteedReturn - totalStake;
    }

    /**
     * Get API documentation
     */
    getAPIDocumentation() {
        return {
            name: 'Surebet Detector API v1',
            version: '1.0.0',
            description: 'REST API for accessing arbitrage opportunities, placing bets, and retrieving analytics',
            
            authentication: {
                type: 'API Key',
                header: 'X-API-Key',
                description: 'Include your API key in the X-API-Key header for all requests'
            },

            rateLimiting: {
                description: 'Rate limits vary by tier',
                tiers: {
                    default: '100 requests per minute',
                    premium: '1000 requests per minute',
                    enterprise: '5000 requests per minute'
                },
                headers: {
                    'X-RateLimit-Limit': 'Request limit for your tier',
                    'X-RateLimit-Remaining': 'Remaining requests in current window',
                    'X-RateLimit-Reset': 'Unix timestamp when limit resets'
                }
            },

            permissions: {
                description: 'API keys have specific permissions that control access',
                available: [
                    'read:opportunities - View arbitrage and value betting opportunities',
                    'read:analytics - Access analytics and statistics',
                    'read:bets - View bet history and status',
                    'write:bets - Place and settle bets',
                    'read:account - View account information',
                    'read:webhooks - View configured webhooks',
                    'write:webhooks - Create and manage webhooks',
                    'admin:keys - Manage API keys (admin only)'
                ]
            },

            endpoints: {
                opportunities: {
                    'GET /api/v1/opportunities': {
                        description: 'List arbitrage and value betting opportunities',
                        query: {
                            type: 'Filter by type: arbitrage, value, or all (default: all)',
                            sport: 'Filter by sport name',
                            bookmaker: 'Filter by bookmaker name',
                            minProfit: 'Minimum profit percentage',
                            maxProfit: 'Maximum profit percentage',
                            minQuality: 'Minimum quality score 0-100 (default: 0)',
                            market: 'Filter by market type',
                            limit: 'Number of results (default: 50, max: 100)',
                            offset: 'Pagination offset (default: 0)',
                            sortBy: 'Sort by: quality, profit, or time (default: quality)',
                            live: 'Include live opportunities only (default: false)'
                        },
                        response: 'Array of opportunity objects with pagination info'
                    },
                    'GET /api/v1/opportunities/:id': {
                        description: 'Get a specific opportunity by ID',
                        response: 'Opportunity object'
                    },
                    'POST /api/v1/opportunities/:id/calculate': {
                        description: 'Calculate optimal stakes for an opportunity',
                        body: {
                            totalStake: 'Total amount to stake',
                            strategy: 'Strategy: equal, proportional, or kelly (default: equal)'
                        },
                        response: 'Stake calculation with expected profit'
                    }
                },

                analytics: {
                    'GET /api/v1/analytics/summary': {
                        description: 'Get analytics summary',
                        query: { range: 'Time range: 7d, 30d, 90d, 1y (default: 30d)' },
                        response: 'Summary statistics object'
                    },
                    'GET /api/v1/analytics/profit': {
                        description: 'Get profit over time',
                        query: { range: 'Time range (default: 30d)' },
                        response: 'Profit data points'
                    },
                    'GET /api/v1/analytics/roi/sports': {
                        description: 'Get ROI breakdown by sport',
                        query: { range: 'Time range (default: 30d)' },
                        response: 'ROI data by sport'
                    },
                    'GET /api/v1/analytics/roi/bookmakers': {
                        description: 'Get ROI breakdown by bookmaker',
                        query: { range: 'Time range (default: 30d)' },
                        response: 'ROI data by bookmaker'
                    },
                    'GET /api/v1/analytics/frequency': {
                        description: 'Get opportunity frequency data',
                        query: { range: 'Time range (default: 30d)' },
                        response: 'Frequency statistics'
                    },
                    'GET /api/v1/analytics/success-rate': {
                        description: 'Get betting success rate',
                        query: { range: 'Time range (default: 30d)' },
                        response: 'Success rate statistics'
                    }
                },

                bets: {
                    'GET /api/v1/bets': {
                        description: 'List bets',
                        query: {
                            status: 'Filter by status: pending, settled, or all (default: all)',
                            range: 'Time range for settled bets (default: 30d)'
                        },
                        response: 'Array of bet objects'
                    },
                    'GET /api/v1/bets/:id': {
                        description: 'Get a specific bet',
                        response: 'Bet object'
                    },
                    'POST /api/v1/bets': {
                        description: 'Place a new bet',
                        body: 'Bet details object',
                        response: 'Created bet object'
                    },
                    'POST /api/v1/bets/:id/settle': {
                        description: 'Settle a bet',
                        body: { result: 'win, loss, or push', actualProfit: 'Actual profit/loss amount' },
                        response: 'Settlement result'
                    }
                },

                account: {
                    'GET /api/v1/account': {
                        description: 'Get account information',
                        response: 'Account details including tier and permissions'
                    },
                    'GET /api/v1/account/usage': {
                        description: 'Get API usage statistics',
                        response: 'Usage statistics'
                    }
                },

                webhooks: {
                    'GET /api/v1/webhooks': {
                        description: 'List configured webhooks',
                        response: 'Array of webhook objects'
                    },
                    'POST /api/v1/webhooks': {
                        description: 'Create a new webhook',
                        body: {
                            url: 'Webhook URL',
                            events: 'Array of events to subscribe to',
                            secret: 'Optional secret for signature verification'
                        },
                        response: 'Created webhook object'
                    },
                    'DELETE /api/v1/webhooks/:id': {
                        description: 'Delete a webhook',
                        response: 'Success confirmation'
                    }
                }
            },

            webhooks: {
                description: 'Real-time event notifications via HTTP POST',
                events: [
                    'opportunity.created - New arbitrage opportunity detected',
                    'opportunity.updated - Opportunity odds changed',
                    'opportunity.expired - Opportunity no longer available',
                    'bet.placed - New bet placed',
                    'bet.settled - Bet settled with result',
                    'alert.threshold - Profit threshold crossed'
                ],
                signature: {
                    description: 'Webhooks are signed with HMAC-SHA256',
                    header: 'X-Webhook-Signature: sha256=<signature>',
                    verification: 'Verify signature using your webhook secret'
                }
            },

            errors: {
                400: 'Bad Request - Invalid parameters',
                401: 'Unauthorized - Invalid or missing API key',
                403: 'Forbidden - Insufficient permissions',
                404: 'Not Found - Resource not found',
                429: 'Rate Limit Exceeded - Too many requests',
                500: 'Internal Server Error'
            },

            examples: {
                authentication: {
                    request: 'curl -H "X-API-Key: your-api-key" https://api.example.com/api/v1/opportunities',
                },
                opportunities: {
                    request: 'curl -H "X-API-Key: your-api-key" "https://api.example.com/api/v1/opportunities?type=arbitrage&minProfit=2&limit=10"',
                    response: {
                        opportunities: [
                            {
                                id: 'abc123',
                                eventName: 'Team A vs Team B',
                                sport: 'Soccer',
                                profitPercent: 3.5,
                                quality: { score: 85 },
                                bookmakers: [
                                    { name: 'Bookmaker1', odds: 2.1 },
                                    { name: 'Bookmaker2', odds: 2.0 }
                                ]
                            }
                        ],
                        pagination: { total: 25, limit: 10, offset: 0, hasMore: true }
                    }
                }
            }
        };
    }
}

module.exports = ThirdPartyAPI;
