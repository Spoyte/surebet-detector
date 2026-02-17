/**
 * Webhook Alert System for Discord, Slack, and Custom Endpoints
 * Sends high-value opportunities to external services via webhooks
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class WebhookAlertManager {
    constructor(configPath = './data/webhook-config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
        this.deliveryLog = [];
        this.maxLogSize = 1000;
    }

    /**
     * Default webhook configuration
     */
    getDefaultConfig() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            
            // Global settings
            global: {
                enabled: true,
                minProfitForAlert: 3.0,        // Minimum profit % for arbitrage
                minEVForAlert: 5.0,            // Minimum EV% for value bets
                minQualityScore: 70,           // Minimum quality score
                rateLimitPerMinute: 10,        // Max alerts per minute globally
                cooldownSeconds: 60,           // Cooldown between identical alerts
                includeTestOpportunities: false // Include test/paper trades
            },

            // Discord webhooks
            discord: {
                enabled: false,
                webhooks: [], // Array of {id, name, url, channelName, avatarUrl, enabled}
                format: 'embed', // 'embed' or 'text'
                colorCoding: true,
                includeTimestamp: true,
                includeFooter: true,
                mentionRoles: [], // Role IDs to mention for high-value alerts
                mentionUsers: [], // User IDs to mention
                minProfitForMention: 5.0 // Profit % threshold for mentions
            },

            // Slack webhooks
            slack: {
                enabled: false,
                webhooks: [], // Array of {id, name, url, channel, username, iconEmoji, enabled}
                format: 'blocks', // 'blocks' or 'attachments'
                colorCoding: true,
                includeTimestamp: true,
                mentionUsers: [], // User IDs to mention (@user)
                mentionGroups: [], // Group handles to mention (@group)
                minProfitForMention: 5.0
            },

            // Custom webhooks (generic HTTP POST)
            custom: {
                enabled: false,
                endpoints: [], // Array of {id, name, url, method, headers, auth, enabled}
                payloadFormat: 'default', // 'default', 'custom', 'template'
                customTemplate: null, // Custom payload template
                retryAttempts: 3,
                retryDelayMs: 1000,
                timeoutMs: 10000
            },

            // Alert templates and customization
            templates: {
                arbitrageTitle: '🎯 Arbitrage Opportunity Detected',
                valueBetTitle: '💰 Value Bet Opportunity',
                highValueTitle: '🔥 High-Value Opportunity',
                includeOddsComparison: true,
                includeStakeSuggestion: true,
                includeBookmakerLinks: true,
                maxDescriptionLength: 500
            },

            // Filtering by sport/bookmaker
            filters: {
                sports: [], // Empty = all sports
                excludeSports: [],
                bookmakers: [], // Empty = all bookmakers
                excludeBookmakers: [],
                minOdds: 1.1,
                maxOdds: 50.0,
                markets: ['h2h', 'asian_handicap', 'over_under'] // Markets to include
            },

            // Delivery tracking
            tracking: {
                logDeliveries: true,
                logRetentionDays: 30,
                trackSuccessRate: true,
                alertOnDeliveryFailure: true
            }
        };
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const loaded = JSON.parse(data);
                return this.mergeWithDefaults(loaded);
            }
        } catch (error) {
            console.warn('Failed to load webhook config:', error.message);
        }
        return this.getDefaultConfig();
    }

    /**
     * Merge loaded config with defaults
     */
    mergeWithDefaults(loaded) {
        const defaults = this.getDefaultConfig();
        
        function deepMerge(target, source) {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    target[key] = target[key] || {};
                    deepMerge(target[key], source[key]);
                } else if (target[key] === undefined) {
                    target[key] = source[key];
                }
            }
            return target;
        }

        return deepMerge(loaded, defaults);
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            this.config.updatedAt = new Date().toISOString();
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to save webhook config:', error.message);
            return false;
        }
    }

    /**
     * Add a Discord webhook
     */
    addDiscordWebhook(name, webhookUrl, options = {}) {
        const id = crypto.randomUUID();
        
        // Validate Discord webhook URL
        if (!this.isValidDiscordWebhook(webhookUrl)) {
            throw new Error('Invalid Discord webhook URL format');
        }

        const webhook = {
            id,
            name: name || 'Discord Webhook',
            url: webhookUrl,
            channelName: options.channelName || null,
            avatarUrl: options.avatarUrl || null,
            enabled: options.enabled !== false,
            addedAt: new Date().toISOString()
        };

        this.config.discord.webhooks.push(webhook);
        this.saveConfig();
        
        return { id, success: true };
    }

    /**
     * Add a Slack webhook
     */
    addSlackWebhook(name, webhookUrl, options = {}) {
        const id = crypto.randomUUID();
        
        // Validate Slack webhook URL
        if (!this.isValidSlackWebhook(webhookUrl)) {
            throw new Error('Invalid Slack webhook URL format');
        }

        const webhook = {
            id,
            name: name || 'Slack Webhook',
            url: webhookUrl,
            channel: options.channel || null,
            username: options.username || 'Surebet Detector',
            iconEmoji: options.iconEmoji || ':moneybag:',
            enabled: options.enabled !== false,
            addedAt: new Date().toISOString()
        };

        this.config.slack.webhooks.push(webhook);
        this.saveConfig();
        
        return { id, success: true };
    }

    /**
     * Add a custom webhook endpoint
     */
    addCustomEndpoint(name, url, options = {}) {
        const id = crypto.randomUUID();

        const endpoint = {
            id,
            name: name || 'Custom Endpoint',
            url,
            method: options.method || 'POST',
            headers: options.headers || { 'Content-Type': 'application/json' },
            auth: options.auth || null, // { type: 'bearer', token: '...' } or { type: 'basic', username: '...', password: '...' }
            enabled: options.enabled !== false,
            addedAt: new Date().toISOString()
        };

        this.config.custom.endpoints.push(endpoint);
        this.saveConfig();
        
        return { id, success: true };
    }

    /**
     * Remove a webhook by ID
     */
    removeWebhook(type, id) {
        if (type === 'discord') {
            this.config.discord.webhooks = this.config.discord.webhooks.filter(w => w.id !== id);
        } else if (type === 'slack') {
            this.config.slack.webhooks = this.config.slack.webhooks.filter(w => w.id !== id);
        } else if (type === 'custom') {
            this.config.custom.endpoints = this.config.custom.endpoints.filter(e => e.id !== id);
        }
        this.saveConfig();
        return true;
    }

    /**
     * Enable/disable a webhook
     */
    setWebhookEnabled(type, id, enabled) {
        let webhook;
        if (type === 'discord') {
            webhook = this.config.discord.webhooks.find(w => w.id === id);
        } else if (type === 'slack') {
            webhook = this.config.slack.webhooks.find(w => w.id === id);
        } else if (type === 'custom') {
            webhook = this.config.custom.endpoints.find(e => e.id === id);
        }
        
        if (webhook) {
            webhook.enabled = enabled;
            this.saveConfig();
            return true;
        }
        return false;
    }

    /**
     * Test a webhook by sending a test message
     */
    async testWebhook(type, id) {
        const testOpportunity = {
            id: 'test-' + crypto.randomUUID(),
            type: 'arbitrage',
            sport: 'tennis',
            event: 'Test Match: Player A vs Player B',
            commenceTime: new Date(Date.now() + 3600000).toISOString(),
            profitPercent: 4.5,
            legs: [
                { bookmaker: 'Pinnacle', outcome: 'Player A', odds: 2.1, stake: 100 },
                { bookmaker: 'Unibet', outcome: 'Player B', odds: 2.05, stake: 102.44 }
            ],
            totalStake: 202.44,
            guaranteedProfit: 9.11,
            qualityScore: 85
        };

        try {
            if (type === 'discord') {
                const webhook = this.config.discord.webhooks.find(w => w.id === id);
                if (!webhook) throw new Error('Discord webhook not found');
                await this.sendDiscordAlert(webhook, testOpportunity, true);
            } else if (type === 'slack') {
                const webhook = this.config.slack.webhooks.find(w => w.id === id);
                if (!webhook) throw new Error('Slack webhook not found');
                await this.sendSlackAlert(webhook, testOpportunity, true);
            } else if (type === 'custom') {
                const endpoint = this.config.custom.endpoints.find(e => e.id === id);
                if (!endpoint) throw new Error('Custom endpoint not found');
                await this.sendCustomWebhook(endpoint, testOpportunity, true);
            }
            return { success: true, message: 'Test message sent successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if opportunity meets alert criteria
     */
    shouldAlert(opportunity, type) {
        if (!this.config.global.enabled) return false;

        const global = this.config.global;
        
        // Check profit/EV thresholds
        if (type === 'arbitrage') {
            if (opportunity.profitPercent < global.minProfitForAlert) return false;
        } else if (type === 'valuebet' || type === 'ev') {
            if (opportunity.evPercent < global.minEVForAlert) return false;
        }

        // Check quality score
        if (opportunity.qualityScore && opportunity.qualityScore < global.minQualityScore) {
            return false;
        }

        // Check test mode
        if (opportunity.isTest && !global.includeTestOpportunities) return false;

        // Check sport filters
        const filters = this.config.filters;
        if (filters.sports.length > 0 && !filters.sports.includes(opportunity.sport)) {
            return false;
        }
        if (filters.excludeSports.includes(opportunity.sport)) return false;

        // Check bookmaker filters
        const bookmakers = opportunity.legs?.map(l => l.bookmaker) || [opportunity.bookmaker];
        if (filters.bookmakers.length > 0) {
            const hasAllowedBookmaker = bookmakers.some(b => filters.bookmakers.includes(b));
            if (!hasAllowedBookmaker) return false;
        }
        const hasExcludedBookmaker = bookmakers.some(b => filters.excludeBookmakers.includes(b));
        if (hasExcludedBookmaker) return false;

        // Check cooldown
        if (this.isOnCooldown(opportunity)) return false;

        return true;
    }

    /**
     * Check if similar alert was sent recently
     */
    isOnCooldown(opportunity) {
        const cooldownMs = this.config.global.cooldownSeconds * 1000;
        const now = Date.now();
        
        // Create a signature for this opportunity type
        const signature = this.getOpportunitySignature(opportunity);
        
        const recentAlert = this.deliveryLog.find(log => 
            log.signature === signature && 
            (now - new Date(log.timestamp).getTime()) < cooldownMs
        );
        
        return !!recentAlert;
    }

    /**
     * Get a unique signature for an opportunity
     */
    getOpportunitySignature(opportunity) {
        const parts = [
            opportunity.sport,
            opportunity.event || opportunity.match,
            opportunity.type
        ];
        return parts.join('|').toLowerCase();
    }

    /**
     * Send alert to all configured webhooks
     */
    async sendAlert(opportunity, type = 'arbitrage') {
        if (!this.shouldAlert(opportunity, type)) {
            return { sent: false, reason: 'Did not meet alert criteria' };
        }

        const results = {
            sent: false,
            discord: [],
            slack: [],
            custom: [],
            timestamp: new Date().toISOString()
        };

        // Send to Discord
        if (this.config.discord.enabled) {
            for (const webhook of this.config.discord.webhooks.filter(w => w.enabled)) {
                try {
                    await this.sendDiscordAlert(webhook, opportunity, false, type);
                    results.discord.push({ id: webhook.id, success: true });
                    results.sent = true;
                } catch (error) {
                    results.discord.push({ id: webhook.id, success: false, error: error.message });
                }
            }
        }

        // Send to Slack
        if (this.config.slack.enabled) {
            for (const webhook of this.config.slack.webhooks.filter(w => w.enabled)) {
                try {
                    await this.sendSlackAlert(webhook, opportunity, false, type);
                    results.slack.push({ id: webhook.id, success: true });
                    results.sent = true;
                } catch (error) {
                    results.slack.push({ id: webhook.id, success: false, error: error.message });
                }
            }
        }

        // Send to custom endpoints
        if (this.config.custom.enabled) {
            for (const endpoint of this.config.custom.endpoints.filter(e => e.enabled)) {
                try {
                    await this.sendCustomWebhook(endpoint, opportunity, false, type);
                    results.custom.push({ id: endpoint.id, success: true });
                    results.sent = true;
                } catch (error) {
                    results.custom.push({ id: endpoint.id, success: false, error: error.message });
                }
            }
        }

        // Log delivery
        if (results.sent && this.config.tracking.logDeliveries) {
            this.logDelivery(opportunity, results);
        }

        return results;
    }

    /**
     * Send Discord webhook alert
     */
    async sendDiscordAlert(webhook, opportunity, isTest = false, type = 'arbitrage') {
        const isHighValue = opportunity.profitPercent >= this.config.discord.minProfitForMention ||
                           opportunity.evPercent >= this.config.discord.minProfitForMention;

        const embed = this.buildDiscordEmbed(opportunity, isTest, type, isHighValue);
        
        const payload = {
            embeds: [embed]
        };

        // Add mentions for high-value alerts
        if (isHighValue && !isTest) {
            const mentions = [];
            if (this.config.discord.mentionRoles.length > 0) {
                mentions.push(...this.config.discord.mentionRoles.map(r => `<@&${r}>`));
            }
            if (this.config.discord.mentionUsers.length > 0) {
                mentions.push(...this.config.discord.mentionUsers.map(u => `<@${u}>`));
            }
            if (mentions.length > 0) {
                payload.content = mentions.join(' ');
            }
        }

        await this.makeHttpRequest(webhook.url, 'POST', { 'Content-Type': 'application/json' }, payload);
    }

    /**
     * Build Discord embed for opportunity
     */
    buildDiscordEmbed(opportunity, isTest, type, isHighValue) {
        const templates = this.config.templates;
        
        let title = templates.arbitrageTitle;
        if (type === 'valuebet' || type === 'ev') title = templates.valueBetTitle;
        if (isHighValue) title = templates.highValueTitle;
        if (isTest) title = '🧪 TEST: ' + title;

        const color = this.getDiscordColor(opportunity, type, isHighValue);
        
        const embed = {
            title,
            color,
            timestamp: new Date().toISOString(),
            fields: []
        };

        // Event info
        embed.fields.push({
            name: '🏆 Event',
            value: opportunity.event || opportunity.match || 'Unknown Event',
            inline: false
        });

        // Sport and time
        const commenceTime = opportunity.commenceTime ? 
            new Date(opportunity.commenceTime).toLocaleString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            }) : 'Unknown';
        
        embed.fields.push({
            name: '📊 Details',
            value: `**Sport:** ${opportunity.sport}\n**Starts:** ${commenceTime}`,
            inline: true
        });

        // Profit/EV info
        if (type === 'arbitrage') {
            embed.fields.push({
                name: '💰 Profit',
                value: `**${opportunity.profitPercent.toFixed(2)}%**\nGuaranteed: €${opportunity.guaranteedProfit?.toFixed(2) || 'N/A'}`,
                inline: true
            });
        } else {
            embed.fields.push({
                name: '💰 Expected Value',
                value: `**${opportunity.evPercent.toFixed(2)}%**\nEdge over market`,
                inline: true
            });
        }

        // Quality score
        if (opportunity.qualityScore) {
            const qualityEmoji = opportunity.qualityScore >= 90 ? '🟢' : 
                                opportunity.qualityScore >= 70 ? '🟡' : '🟠';
            embed.fields.push({
                name: '⭐ Quality Score',
                value: `${qualityEmoji} ${opportunity.qualityScore}/100`,
                inline: true
            });
        }

        // Legs/Bets
        if (opportunity.legs && opportunity.legs.length > 0) {
            const legsText = opportunity.legs.map(leg => 
                `**${leg.bookmaker}** - ${leg.outcome} @ ${leg.odds}${leg.stake ? ` (€${leg.stake.toFixed(2)})` : ''}`
            ).join('\n');
            
            embed.fields.push({
                name: '📋 Bets to Place',
                value: legsText,
                inline: false
            });

            if (opportunity.totalStake) {
                embed.fields.push({
                    name: '💵 Total Stake',
                    value: `€${opportunity.totalStake.toFixed(2)}`,
                    inline: true
                });
            }
        } else if (opportunity.bookmaker) {
            // Single value bet
            embed.fields.push({
                name: '📋 Bet Details',
                value: `**${opportunity.bookmaker}** - ${opportunity.outcome || opportunity.selection} @ ${opportunity.odds}`,
                inline: false
            });
        }

        // Footer
        if (templates.includeFooter) {
            embed.footer = {
                text: `Surebet Detector • ${isTest ? 'Test Alert' : 'Live Opportunity'}`
            };
        }

        return embed;
    }

    /**
     * Get Discord color based on opportunity value
     */
    getDiscordColor(opportunity, type, isHighValue) {
        if (!this.config.discord.colorCoding) return 0x3498db;
        
        if (isHighValue) return 0xe74c3c; // Red for high value
        if (type === 'arbitrage') {
            if (opportunity.profitPercent >= 3) return 0x2ecc71; // Green
            if (opportunity.profitPercent >= 1) return 0xf1c40f; // Yellow
            return 0x3498db; // Blue
        } else {
            if (opportunity.evPercent >= 8) return 0x2ecc71;
            if (opportunity.evPercent >= 5) return 0xf1c40f;
            return 0x3498db;
        }
    }

    /**
     * Send Slack webhook alert
     */
    async sendSlackAlert(webhook, opportunity, isTest = false, type = 'arbitrage') {
        const isHighValue = opportunity.profitPercent >= this.config.slack.minProfitForMention ||
                           opportunity.evPercent >= this.config.slack.minProfitForMention;

        const blocks = this.buildSlackBlocks(opportunity, isTest, type, isHighValue);
        
        const payload = {
            username: webhook.username,
            icon_emoji: webhook.iconEmoji,
            blocks
        };

        // Add mentions for high-value alerts
        if (isHighValue && !isTest) {
            const mentions = [];
            if (this.config.slack.mentionUsers.length > 0) {
                mentions.push(...this.config.slack.mentionUsers.map(u => `<@${u}>`));
            }
            if (this.config.slack.mentionGroups.length > 0) {
                mentions.push(...this.config.slack.mentionGroups.map(g => `<!subteam^${g}>`));
            }
            if (mentions.length > 0) {
                payload.text = mentions.join(' ');
            }
        }

        await this.makeHttpRequest(webhook.url, 'POST', { 'Content-Type': 'application/json' }, payload);
    }

    /**
     * Build Slack blocks for opportunity
     */
    buildSlackBlocks(opportunity, isTest, type, isHighValue) {
        const templates = this.config.templates;
        
        let title = templates.arbitrageTitle;
        if (type === 'valuebet' || type === 'ev') title = templates.valueBetTitle;
        if (isHighValue) title = templates.highValueTitle;
        if (isTest) title = '🧪 TEST: ' + title;

        const color = this.getSlackColor(opportunity, type, isHighValue);
        
        const blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: title,
                    emoji: true
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*🏆 Event:* ${opportunity.event || opportunity.match || 'Unknown Event'}`
                }
            }
        ];

        // Details section
        const commenceTime = opportunity.commenceTime ? 
            new Date(opportunity.commenceTime).toLocaleString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            }) : 'Unknown';

        let detailsText = `*Sport:* ${opportunity.sport}\n*Starts:* ${commenceTime}\n`;
        
        if (type === 'arbitrage') {
            detailsText += `*Profit:* ${opportunity.profitPercent.toFixed(2)}%`;
            if (opportunity.guaranteedProfit) {
                detailsText += ` (€${opportunity.guaranteedProfit.toFixed(2)})`;
            }
        } else {
            detailsText += `*Expected Value:* ${opportunity.evPercent.toFixed(2)}%`;
        }

        if (opportunity.qualityScore) {
            detailsText += `\n*Quality Score:* ${opportunity.qualityScore}/100`;
        }

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: detailsText
            }
        });

        // Divider
        blocks.push({ type: 'divider' });

        // Legs/Bets
        if (opportunity.legs && opportunity.legs.length > 0) {
            const legsText = opportunity.legs.map(leg => 
                `• *${leg.bookmaker}* - ${leg.outcome} @ ${leg.odds}${leg.stake ? ` (€${leg.stake.toFixed(2)})` : ''}`
            ).join('\n');
            
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*📋 Bets to Place:*\n${legsText}`
                }
            });

            if (opportunity.totalStake) {
                blocks.push({
                    type: 'context',
                    elements: [{
                        type: 'mrkdwn',
                        text: `Total Stake: €${opportunity.totalStake.toFixed(2)}`
                    }]
                });
            }
        } else if (opportunity.bookmaker) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*📋 Bet Details:*\n• *${opportunity.bookmaker}* - ${opportunity.outcome || opportunity.selection} @ ${opportunity.odds}`
                }
            });
        }

        // Footer
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `Surebet Detector • ${isTest ? 'Test Alert' : 'Live Opportunity'} • ${new Date().toLocaleString()}`
            }]
        });

        return blocks;
    }

    /**
     * Get Slack color based on opportunity value
     */
    getSlackColor(opportunity, type, isHighValue) {
        if (!this.config.slack.colorCoding) return '#3498db';
        
        if (isHighValue) return '#e74c3c';
        if (type === 'arbitrage') {
            if (opportunity.profitPercent >= 3) return '#2ecc71';
            if (opportunity.profitPercent >= 1) return '#f1c40f';
            return '#3498db';
        } else {
            if (opportunity.evPercent >= 8) return '#2ecc71';
            if (opportunity.evPercent >= 5) return '#f1c40f';
            return '#3498db';
        }
    }

    /**
     * Send custom webhook
     */
    async sendCustomWebhook(endpoint, opportunity, isTest = false, type = 'arbitrage') {
        const payload = this.buildCustomPayload(opportunity, isTest, type);
        
        const headers = { ...endpoint.headers };
        
        // Add authentication
        if (endpoint.auth) {
            if (endpoint.auth.type === 'bearer') {
                headers['Authorization'] = `Bearer ${endpoint.auth.token}`;
            } else if (endpoint.auth.type === 'basic') {
                const credentials = Buffer.from(`${endpoint.auth.username}:${endpoint.auth.password}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
            }
        }

        const retryAttempts = this.config.custom.retryAttempts;
        const retryDelayMs = this.config.custom.retryDelayMs;

        for (let attempt = 0; attempt < retryAttempts; attempt++) {
            try {
                await this.makeHttpRequest(
                    endpoint.url, 
                    endpoint.method, 
                    headers, 
                    payload,
                    this.config.custom.timeoutMs
                );
                return;
            } catch (error) {
                if (attempt === retryAttempts - 1) throw error;
                await this.sleep(retryDelayMs * Math.pow(2, attempt));
            }
        }
    }

    /**
     * Build custom webhook payload
     */
    buildCustomPayload(opportunity, isTest, type) {
        if (this.config.custom.payloadFormat === 'custom' && this.config.custom.customTemplate) {
            // Template substitution would go here
            return this.config.custom.customTemplate;
        }

        // Default payload format
        return {
            event: 'opportunity.detected',
            timestamp: new Date().toISOString(),
            test: isTest,
            data: {
                id: opportunity.id,
                type,
                sport: opportunity.sport,
                event: opportunity.event || opportunity.match,
                commenceTime: opportunity.commenceTime,
                profitPercent: opportunity.profitPercent,
                evPercent: opportunity.evPercent,
                guaranteedProfit: opportunity.guaranteedProfit,
                totalStake: opportunity.totalStake,
                qualityScore: opportunity.qualityScore,
                legs: opportunity.legs,
                bookmaker: opportunity.bookmaker,
                outcome: opportunity.outcome || opportunity.selection,
                odds: opportunity.odds
            }
        };
    }

    /**
     * Make HTTP request
     */
    makeHttpRequest(url, method, headers, body, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(JSON.stringify(body))
                },
                timeout: timeoutMs
            };

            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(JSON.stringify(body));
            req.end();
        });
    }

    /**
     * Log delivery for tracking
     */
    logDelivery(opportunity, results) {
        const log = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            signature: this.getOpportunitySignature(opportunity),
            opportunityId: opportunity.id,
            type: opportunity.type,
            results
        };

        this.deliveryLog.push(log);
        
        // Trim log if too large
        if (this.deliveryLog.length > this.maxLogSize) {
            this.deliveryLog = this.deliveryLog.slice(-this.maxLogSize);
        }
    }

    /**
     * Get delivery log
     */
    getDeliveryLog(limit = 100) {
        return this.deliveryLog.slice(-limit);
    }

    /**
     * Get delivery statistics
     */
    getDeliveryStats() {
        const stats = {
            total: this.deliveryLog.length,
            successful: 0,
            failed: 0,
            byType: {}
        };

        for (const log of this.deliveryLog) {
            const success = log.results.sent;
            if (success) stats.successful++;
            else stats.failed++;

            const type = log.type || 'unknown';
            if (!stats.byType[type]) {
                stats.byType[type] = { total: 0, successful: 0 };
            }
            stats.byType[type].total++;
            if (success) stats.byType[type].successful++;
        }

        return stats;
    }

    /**
     * Validate Discord webhook URL
     */
    isValidDiscordWebhook(url) {
        return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
    }

    /**
     * Validate Slack webhook URL
     */
    isValidSlackWebhook(url) {
        return /^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(url);
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = this.mergeWithDefaults(updates);
        return this.saveConfig();
    }

    /**
     * Get webhook status summary
     */
    getWebhookStatus() {
        return {
            global: {
                enabled: this.config.global.enabled,
                minProfitForAlert: this.config.global.minProfitForAlert,
                minEVForAlert: this.config.global.minEVForAlert
            },
            discord: {
                enabled: this.config.discord.enabled,
                count: this.config.discord.webhooks.length,
                active: this.config.discord.webhooks.filter(w => w.enabled).length
            },
            slack: {
                enabled: this.config.slack.enabled,
                count: this.config.slack.webhooks.length,
                active: this.config.slack.webhooks.filter(w => w.enabled).length
            },
            custom: {
                enabled: this.config.custom.enabled,
                count: this.config.custom.endpoints.length,
                active: this.config.custom.endpoints.filter(e => e.enabled).length
            },
            deliveryStats: this.getDeliveryStats()
        };
    }
}

module.exports = WebhookAlertManager;
