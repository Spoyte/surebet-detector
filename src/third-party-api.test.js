/**
 * Tests for Third-Party API Module
 */

const ThirdPartyAPI = require('./third-party-api');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('ThirdPartyAPI', () => {
    let api;
    let tempDir;

    beforeEach(async () => {
        // Create temp directory for test data
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'surebet-api-test-'));
        
        api = new ThirdPartyAPI({
            dataDir: tempDir
        });
        
        await api.init();
    });

    afterEach(async () => {
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('API Key Management', () => {
        test('should create API key with required fields', async () => {
            const key = await api.createAPIKey({
                name: 'Test Key',
                description: 'Test description'
            });

            expect(key).toHaveProperty('id');
            expect(key).toHaveProperty('key');
            expect(key).toHaveProperty('secret');
            expect(key.name).toBe('Test Key');
            expect(key.tier).toBe('default');
        });

        test('should reject API key without name', async () => {
            await expect(api.createAPIKey({}))
                .rejects.toThrow('API key name is required');
        });

        test('should validate API key', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key'
            });

            const validation = api.validateAPIKey(created.key);
            expect(validation).not.toBeNull();
            expect(validation.keyId).toBe(created.id);
        });

        test('should reject invalid API key', () => {
            const validation = api.validateAPIKey('invalid-key');
            expect(validation).toBeNull();
        });

        test('should check permissions correctly', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key',
                permissions: ['read:opportunities', 'read:analytics']
            });

            const keyData = api.apiKeys.get(created.id);
            
            expect(api.hasPermission(keyData, 'read:opportunities')).toBe(true);
            expect(api.hasPermission(keyData, 'read:analytics')).toBe(true);
            expect(api.hasPermission(keyData, 'write:bets')).toBe(false);
        });

        test('should support wildcard permissions', async () => {
            const created = await api.createAPIKey({
                name: 'Admin Key',
                permissions: ['read:*', 'admin:keys']
            });

            const keyData = api.apiKeys.get(created.id);
            
            expect(api.hasPermission(keyData, 'read:opportunities')).toBe(true);
            expect(api.hasPermission(keyData, 'read:analytics')).toBe(true);
            expect(api.hasPermission(keyData, 'write:bets')).toBe(false);
            expect(api.hasPermission(keyData, 'admin:keys')).toBe(true);
        });

        test('should revoke API key', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key'
            });

            await api.revokeAPIKey(created.id);
            
            const keyData = api.apiKeys.get(created.id);
            expect(keyData.active).toBe(false);
            expect(keyData).toHaveProperty('revokedAt');
        });

        test('should delete API key', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key'
            });

            await api.deleteAPIKey(created.id);
            
            expect(api.apiKeys.has(created.id)).toBe(false);
        });

        test('should get all keys', async () => {
            await api.createAPIKey({ name: 'Key 1' });
            await api.createAPIKey({ name: 'Key 2' });

            const keys = api.getAllKeys();
            expect(keys).toHaveLength(2);
        });
    });

    describe('Rate Limiting', () => {
        test('should allow requests within rate limit', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key',
                tier: 'default'
            });

            const rateLimit = api.checkRateLimit(created.id, 'default');
            expect(rateLimit.allowed).toBe(true);
            expect(rateLimit.remaining).toBe(99);
        });

        test('should block requests exceeding rate limit', async () => {
            const created = await api.createAPIKey({
                name: 'Test Key',
                tier: 'default'
            });

            // Exhaust rate limit
            for (let i = 0; i < 100; i++) {
                api.checkRateLimit(created.id, 'default');
            }

            const rateLimit = api.checkRateLimit(created.id, 'default');
            expect(rateLimit.allowed).toBe(false);
            expect(rateLimit.remaining).toBe(0);
        });

        test('should respect tier limits', async () => {
            const premium = await api.createAPIKey({
                name: 'Premium Key',
                tier: 'premium'
            });

            const rateLimit = api.checkRateLimit(premium.id, 'premium');
            expect(rateLimit.limit).toBe(1000);
        });

        test('should support rate limit override', async () => {
            const created = await api.createAPIKey({
                name: 'Custom Key',
                tier: 'default',
                rateLimitOverride: { requests: 500, window: 60000 }
            });

            const rateLimit = api.checkRateLimit(
                created.id, 
                'default', 
                { requests: 500, window: 60000 }
            );
            expect(rateLimit.limit).toBe(500);
        });
    });

    describe('Webhook Management', () => {
        test('should register webhook', async () => {
            const key = await api.createAPIKey({ name: 'Test Key' });
            
            const webhook = await api.registerWebhook(key.id, {
                url: 'https://example.com/webhook',
                events: ['opportunity.created', 'bet.placed']
            });

            expect(webhook).toHaveProperty('id');
            expect(webhook.url).toBe('https://example.com/webhook');
            expect(webhook.events).toContain('opportunity.created');
            expect(webhook).toHaveProperty('secret');
        });

        test('should reject webhook without URL', async () => {
            const key = await api.createAPIKey({ name: 'Test Key' });
            
            await expect(api.registerWebhook(key.id, {}))
                .rejects.toThrow('Webhook URL is required');
        });

        test('should reject invalid webhook URL', async () => {
            const key = await api.createAPIKey({ name: 'Test Key' });
            
            await expect(api.registerWebhook(key.id, {
                url: 'not-a-valid-url'
            })).rejects.toThrow('Invalid webhook URL');
        });

        test('should delete associated webhooks when key is revoked', async () => {
            const key = await api.createAPIKey({ name: 'Test Key' });
            const webhook = await api.registerWebhook(key.id, {
                url: 'https://example.com/webhook',
                events: ['opportunity.created']
            });

            await api.revokeAPIKey(key.id);

            const webhookData = api.webhooks.get(webhook.id);
            expect(webhookData.active).toBe(false);
        });
    });

    describe('Stake Calculations', () => {
        const mockOpportunity = {
            outcomes: [
                { name: 'Team A Win', bookmaker: 'Bookie1', odds: 2.1 },
                { name: 'Team B Win', bookmaker: 'Bookie2', odds: 2.0 }
            ],
            profitPercent: 2.5
        };

        test('should calculate equal stakes', () => {
            const stakes = api.calculateEqualStakes(mockOpportunity, 100);
            
            expect(stakes).toHaveLength(2);
            expect(stakes[0].stake).toBe(50);
            expect(stakes[1].stake).toBe(50);
        });

        test('should calculate proportional stakes', () => {
            const stakes = api.calculateProportionalStakes(mockOpportunity, 100);
            
            expect(stakes).toHaveLength(2);
            expect(stakes[0].stake).toBeGreaterThan(0);
            expect(stakes[1].stake).toBeGreaterThan(0);
            expect(stakes[0].stake + stakes[1].stake).toBeCloseTo(100, 5);
        });

        test('should calculate Kelly stakes', () => {
            const stakes = api.calculateKellyStakes(mockOpportunity, 1000);
            
            expect(stakes).toHaveLength(2);
            expect(stakes[0].stake).toBeGreaterThan(0);
            expect(stakes[1].stake).toBeGreaterThan(0);
        });

        test('should calculate expected profit', () => {
            const stakes = api.calculateEqualStakes(mockOpportunity, 100);
            const profit = api.calculateExpectedProfit(mockOpportunity, stakes);
            
            expect(profit).toBeGreaterThan(0);
        });
    });

    describe('API Documentation', () => {
        test('should return comprehensive documentation', () => {
            const docs = api.getAPIDocumentation();
            
            expect(docs).toHaveProperty('name');
            expect(docs).toHaveProperty('version');
            expect(docs).toHaveProperty('authentication');
            expect(docs).toHaveProperty('endpoints');
            expect(docs).toHaveProperty('webhooks');
            expect(docs).toHaveProperty('errors');
            expect(docs).toHaveProperty('examples');
        });

        test('should document all endpoints', () => {
            const docs = api.getAPIDocumentation();
            
            expect(docs.endpoints).toHaveProperty('opportunities');
            expect(docs.endpoints).toHaveProperty('analytics');
            expect(docs.endpoints).toHaveProperty('bets');
            expect(docs.endpoints).toHaveProperty('account');
            expect(docs.endpoints).toHaveProperty('webhooks');
        });
    });

    describe('Persistence', () => {
        test('should persist API keys', async () => {
            const created = await api.createAPIKey({
                name: 'Persistent Key'
            });

            // Create new instance with same data dir
            const api2 = new ThirdPartyAPI({ dataDir: tempDir });
            await api2.init();

            expect(api2.apiKeys.has(created.id)).toBe(true);
            expect(api2.apiKeys.get(created.id).name).toBe('Persistent Key');
        });

        test('should persist webhooks', async () => {
            const key = await api.createAPIKey({ name: 'Test Key' });
            const webhook = await api.registerWebhook(key.id, {
                url: 'https://example.com/webhook',
                events: ['opportunity.created']
            });

            // Create new instance with same data dir
            const api2 = new ThirdPartyAPI({ dataDir: tempDir });
            await api2.init();

            expect(api2.webhooks.has(webhook.id)).toBe(true);
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    const { execSync } = require('child_process');
    try {
        execSync('npx jest third-party-api.test.js --verbose', {
            cwd: __dirname,
            stdio: 'inherit'
        });
    } catch (error) {
        process.exit(1);
    }
}
