/**
 * Tests for WebhookAlertManager
 */

const WebhookAlertManager = require('./webhook-alerts');
const assert = require('assert');

// Mock HTTP requests
const originalHttps = require('https');
const originalHttp = require('http');

let mockRequests = [];

function mockHttpRequest(options, callback) {
    const mockResponse = {
        statusCode: 200,
        on: (event, handler) => {
            if (event === 'data') handler('{"ok": true}');
            if (event === 'end') handler();
        }
    };
    
    mockRequests.push(options);
    
    const mockReq = {
        write: () => {},
        end: () => setTimeout(() => callback(mockResponse), 10),
        on: () => {},
        destroy: () => {}
    };
    
    return mockReq;
}

// Override HTTP modules for testing
jest.mock('https', () => ({
    request: jest.fn((options, callback) => mockHttpRequest(options, callback))
}));

jest.mock('http', () => ({
    request: jest.fn((options, callback) => mockHttpRequest(options, callback))
}));

describe('WebhookAlertManager', () => {
    let manager;
    
    beforeEach(() => {
        manager = new WebhookAlertManager('./data/test-webhook-config.json');
        mockRequests = [];
    });

    describe('Configuration', () => {
        test('should load default config', () => {
            const config = manager.getConfig();
            assert(config.global.enabled === true);
            assert(config.discord.enabled === false);
            assert(config.slack.enabled === false);
            assert(config.custom.enabled === false);
        });

        test('should validate Discord webhook URLs', () => {
            assert(manager.isValidDiscordWebhook('https://discord.com/api/webhooks/123456/abc-def'));
            assert(manager.isValidDiscordWebhook('https://discordapp.com/api/webhooks/123456/abc-def'));
            assert(!manager.isValidDiscordWebhook('https://example.com/webhook'));
            assert(!manager.isValidDiscordWebhook('invalid-url'));
        });

        test('should validate Slack webhook URLs', () => {
            assert(manager.isValidSlackWebhook('https://hooks.slack.com/services/T00/B00/XXXXXXXXXXXXXXXXXXXXXXXX'));
            assert(!manager.isValidSlackWebhook('https://example.com/webhook'));
            assert(!manager.isValidSlackWebhook('invalid-url'));
        });
    });

    describe('Webhook Management', () => {
        test('should add Discord webhook', () => {
            const result = manager.addDiscordWebhook('Test Discord', 'https://discord.com/api/webhooks/123456/abc-def');
            assert(result.success);
            assert(result.id);
            assert(manager.config.discord.webhooks.length === 1);
        });

        test('should reject invalid Discord webhook URL', () => {
            assert.throws(() => {
                manager.addDiscordWebhook('Test', 'https://example.com/webhook');
            }, /Invalid Discord webhook URL/);
        });

        test('should add Slack webhook', () => {
            const result = manager.addSlackWebhook('Test Slack', 'https://hooks.slack.com/services/T000/B000/XXX');
            assert(result.success);
            assert(result.id);
            assert(manager.config.slack.webhooks.length === 1);
        });

        test('should add custom endpoint', () => {
            const result = manager.addCustomEndpoint('Test API', 'https://api.example.com/webhook', {
                headers: { 'X-Custom': 'value' }
            });
            assert(result.success);
            assert(result.id);
            assert(manager.config.custom.endpoints.length === 1);
        });

        test('should remove webhook', () => {
            const { id } = manager.addDiscordWebhook('Test', 'https://discord.com/api/webhooks/123456/abc-def');
            assert(manager.config.discord.webhooks.length === 1);
            
            manager.removeWebhook('discord', id);
            assert(manager.config.discord.webhooks.length === 0);
        });

        test('should enable/disable webhook', () => {
            const { id } = manager.addDiscordWebhook('Test', 'https://discord.com/api/webhooks/123456/abc-def');
            
            manager.setWebhookEnabled('discord', id, false);
            assert(manager.config.discord.webhooks[0].enabled === false);
            
            manager.setWebhookEnabled('discord', id, true);
            assert(manager.config.discord.webhooks[0].enabled === true);
        });
    });

    describe('Alert Criteria', () => {
        test('should alert on high-value arbitrage', () => {
            const opportunity = {
                sport: 'tennis',
                event: 'Test Match',
                profitPercent: 5.0,
                qualityScore: 80,
                legs: [
                    { bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 },
                    { bookmaker: 'Unibet', outcome: 'Player B', odds: 2.1 }
                ]
            };
            
            assert(manager.shouldAlert(opportunity, 'arbitrage') === true);
        });

        test('should not alert on low-value arbitrage', () => {
            const opportunity = {
                sport: 'tennis',
                event: 'Test Match',
                profitPercent: 0.5,
                qualityScore: 80,
                legs: [
                    { bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 },
                    { bookmaker: 'Unibet', outcome: 'Player B', odds: 2.01 }
                ]
            };
            
            assert(manager.shouldAlert(opportunity, 'arbitrage') === false);
        });

        test('should not alert on excluded sport', () => {
            manager.config.filters.excludeSports = ['horseracing'];
            
            const opportunity = {
                sport: 'horseracing',
                event: 'Test Race',
                profitPercent: 5.0,
                legs: [{ bookmaker: 'Pinnacle', outcome: 'Horse A', odds: 2.0 }]
            };
            
            assert(manager.shouldAlert(opportunity, 'arbitrage') === false);
        });

        test('should not alert on excluded bookmaker', () => {
            manager.config.filters.excludeBookmakers = ['SketchyBook'];
            
            const opportunity = {
                sport: 'tennis',
                event: 'Test Match',
                profitPercent: 5.0,
                legs: [
                    { bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 },
                    { bookmaker: 'SketchyBook', outcome: 'Player B', odds: 2.1 }
                ]
            };
            
            assert(manager.shouldAlert(opportunity, 'arbitrage') === false);
        });

        test('should respect cooldown', () => {
            const opportunity = {
                id: 'test-1',
                sport: 'tennis',
                event: 'Same Match',
                profitPercent: 5.0,
                legs: [{ bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 }]
            };
            
            // First alert should pass
            assert(manager.shouldAlert(opportunity, 'arbitrage') === true);
            
            // Log the delivery
            manager.logDelivery(opportunity, { sent: true });
            
            // Second alert should be on cooldown
            assert(manager.shouldAlert(opportunity, 'arbitrage') === false);
        });
    });

    describe('Discord Embeds', () => {
        test('should build Discord embed for arbitrage', () => {
            const opportunity = {
                sport: 'tennis',
                event: 'Nadal vs Djokovic',
                profitPercent: 4.5,
                qualityScore: 85,
                commenceTime: new Date(Date.now() + 3600000).toISOString(),
                legs: [
                    { bookmaker: 'Pinnacle', outcome: 'Nadal', odds: 2.1, stake: 100 },
                    { bookmaker: 'Unibet', outcome: 'Djokovic', odds: 2.05, stake: 102.44 }
                ],
                totalStake: 202.44,
                guaranteedProfit: 9.11
            };
            
            const embed = manager.buildDiscordEmbed(opportunity, false, 'arbitrage', false);
            
            assert(embed.title.includes('Arbitrage'));
            assert(embed.color);
            assert(embed.fields.length > 0);
            assert(embed.fields.some(f => f.name.includes('Event')));
            assert(embed.fields.some(f => f.name.includes('Profit')));
            assert(embed.fields.some(f => f.name.includes('Bets')));
        });

        test('should build Discord embed for value bet', () => {
            const opportunity = {
                sport: 'soccer',
                event: 'Team A vs Team B',
                evPercent: 7.5,
                qualityScore: 80,
                bookmaker: 'Pinnacle',
                outcome: 'Team A Win',
                odds: 2.5
            };
            
            const embed = manager.buildDiscordEmbed(opportunity, false, 'valuebet', false);
            
            assert(embed.title.includes('Value'));
            assert(embed.fields.some(f => f.name.includes('Expected Value')));
        });

        test('should mark test alerts', () => {
            const opportunity = {
                sport: 'tennis',
                event: 'Test Match',
                profitPercent: 4.5,
                legs: [{ bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 }]
            };
            
            const embed = manager.buildDiscordEmbed(opportunity, true, 'arbitrage', false);
            assert(embed.title.includes('TEST'));
        });
    });

    describe('Slack Blocks', () => {
        test('should build Slack blocks for arbitrage', () => {
            const opportunity = {
                sport: 'tennis',
                event: 'Nadal vs Djokovic',
                profitPercent: 4.5,
                qualityScore: 85,
                commenceTime: new Date(Date.now() + 3600000).toISOString(),
                legs: [
                    { bookmaker: 'Pinnacle', outcome: 'Nadal', odds: 2.1, stake: 100 },
                    { bookmaker: 'Unibet', outcome: 'Djokovic', odds: 2.05, stake: 102.44 }
                ],
                totalStake: 202.44
            };
            
            const blocks = manager.buildSlackBlocks(opportunity, false, 'arbitrage', false);
            
            assert(blocks.length > 0);
            assert(blocks[0].type === 'header');
            assert(blocks.some(b => b.type === 'section'));
            assert(blocks.some(b => b.type === 'divider'));
        });
    });

    describe('Custom Payloads', () => {
        test('should build default custom payload', () => {
            const opportunity = {
                id: 'test-123',
                sport: 'tennis',
                event: 'Test Match',
                profitPercent: 4.5,
                legs: [{ bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.0 }]
            };
            
            const payload = manager.buildCustomPayload(opportunity, false, 'arbitrage');
            
            assert(payload.event === 'opportunity.detected');
            assert(payload.timestamp);
            assert(payload.data.id === 'test-123');
            assert(payload.data.type === 'arbitrage');
        });
    });

    describe('Delivery Tracking', () => {
        test('should log deliveries', () => {
            const opportunity = {
                id: 'test-1',
                sport: 'tennis',
                event: 'Test Match',
                type: 'arbitrage'
            };
            
            const results = { sent: true, discord: [{ id: 'webhook-1', success: true }] };
            manager.logDelivery(opportunity, results);
            
            assert(manager.deliveryLog.length === 1);
            assert(manager.deliveryLog[0].opportunityId === 'test-1');
        });

        test('should calculate delivery stats', () => {
            // Log some deliveries
            manager.logDelivery({ id: '1', type: 'arbitrage' }, { sent: true });
            manager.logDelivery({ id: '2', type: 'arbitrage' }, { sent: true });
            manager.logDelivery({ id: '3', type: 'valuebet' }, { sent: false });
            
            const stats = manager.getDeliveryStats();
            
            assert(stats.total === 3);
            assert(stats.successful === 2);
            assert(stats.failed === 1);
            assert(stats.byType.arbitrage.total === 2);
            assert(stats.byType.valuebet.total === 1);
        });
    });

    describe('Webhook Status', () => {
        test('should return webhook status summary', () => {
            manager.addDiscordWebhook('Test', 'https://discord.com/api/webhooks/123/abc');
            manager.addSlackWebhook('Test', 'https://hooks.slack.com/services/T/B/X');
            manager.addCustomEndpoint('Test', 'https://api.example.com/webhook');
            
            const status = manager.getWebhookStatus();
            
            assert(status.discord.count === 1);
            assert(status.slack.count === 1);
            assert(status.custom.count === 1);
            assert(status.deliveryStats.total >= 0);
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Running WebhookAlertManager tests...\n');
    
    // Simple test runner
    const tests = [];
    
    global.describe = (name, fn) => {
        console.log(`\n${name}`);
        fn();
    };
    
    global.test = (name, fn) => {
        tests.push({ name, fn });
    };
    
    global.beforeEach = () => {};
    global.jest = { mock: () => {} };
    
    // Load tests
    require('./webhook-alerts.test');
    
    // Run tests
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            test.fn();
            console.log(`  ✓ ${test.name}`);
            passed++;
        } catch (error) {
            console.log(`  ✗ ${test.name}`);
            console.log(`    ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
