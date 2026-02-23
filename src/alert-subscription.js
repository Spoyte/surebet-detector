/**
 * @fileoverview Alert Subscription Manager
 * @description Manages user subscriptions for alerts by sport, league, and team
 * @module surebet-detector/alert-subscription
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * @typedef {Object} Subscription
 * @property {string} id - Unique subscription ID
 * @property {string} type - Subscription type: 'sport', 'league', 'team', 'event'
 * @property {string} value - The subscribed value (sport key, league name, team name, event ID)
 * @property {Object} criteria - Alert criteria
 * @property {number} criteria.minEV - Minimum EV% to trigger alert
 * @property {number} criteria.minArbitrage - Minimum arbitrage % to trigger alert
 * @property {string[]} criteria.markets - Markets to include
 * @property {string[]} criteria.bookmakers - Bookmakers to include
 * @property {string} createdAt - ISO timestamp
 * @property {boolean} enabled - Whether subscription is active
 */

/**
 * Alert Subscription Manager
 */
class AlertSubscriptionManager {
    /**
     * @param {Object} options - Configuration options
     * @param {string} options.dataDir - Directory for subscription data
     * @param {Object} options.logger - Logger instance
     */
    constructor(options = {}) {
        this.dataDir = options.dataDir || './data';
        this.subscriptionsPath = path.join(this.dataDir, 'alert-subscriptions.json');
        this.logger = options.logger || console;
        
        // In-memory storage
        this.subscriptions = new Map();
        this.subscriptionsByType = {
            sport: new Map(),
            league: new Map(),
            team: new Map(),
            event: new Map()
        };
        
        // Alert history to prevent duplicates
        this.alertHistory = new Map();
        this.alertHistoryExpiry = 24 * 60 * 60 * 1000; // 24 hours
        
        this.initialized = false;
    }

    /**
     * Initialize the manager
     */
    async init() {
        if (this.initialized) return;
        
        this.logger.info('Initializing Alert Subscription Manager...', { 
            category: 'alert-subscription' 
        });
        
        // Ensure data directory exists
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
        } catch (err) {
            // Directory may already exist
        }
        
        // Load existing subscriptions
        await this.loadSubscriptions();
        
        this.initialized = true;
        this.logger.info('Alert Subscription Manager initialized', { 
            category: 'alert-subscription',
            subscriptions: this.subscriptions.size
        });
    }

    /**
     * Load subscriptions from storage
     */
    async loadSubscriptions() {
        try {
            const data = await fs.readFile(this.subscriptionsPath, 'utf8');
            const subs = JSON.parse(data);
            
            for (const sub of subs) {
                this.addToMemory(sub);
            }
            
            this.logger.info(`Loaded ${subs.length} subscriptions`, { 
                category: 'alert-subscription' 
            });
        } catch (err) {
            if (err.code !== 'ENOENT') {
                this.logger.error('Failed to load subscriptions', { 
                    category: 'alert-subscription',
                    error: err.message 
                });
            }
        }
    }

    /**
     * Save subscriptions to storage
     */
    async saveSubscriptions() {
        try {
            const subs = Array.from(this.subscriptions.values());
            await fs.writeFile(
                this.subscriptionsPath, 
                JSON.stringify(subs, null, 2)
            );
        } catch (err) {
            this.logger.error('Failed to save subscriptions', { 
                category: 'alert-subscription',
                error: err.message 
            });
        }
    }

    /**
     * Add subscription to memory indexes
     * @param {Subscription} sub 
     */
    addToMemory(sub) {
        this.subscriptions.set(sub.id, sub);
        
        if (!this.subscriptionsByType[sub.type]) {
            this.subscriptionsByType[sub.type] = new Map();
        }
        
        if (!this.subscriptionsByType[sub.type].has(sub.value)) {
            this.subscriptionsByType[sub.type].set(sub.value, []);
        }
        
        this.subscriptionsByType[sub.type].get(sub.value).push(sub);
    }

    /**
     * Create a new subscription
     * @param {Object} params - Subscription parameters
     * @returns {Subscription}
     */
    async subscribe(params) {
        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const subscription = {
            id,
            type: params.type,
            value: params.value.toLowerCase(),
            criteria: {
                minEV: params.minEV || 5,
                minArbitrage: params.minArbitrage || 0.5,
                markets: params.markets || ['h2h'],
                bookmakers: params.bookmakers || [],
                maxOdds: params.maxOdds || 20
            },
            createdAt: new Date().toISOString(),
            enabled: true,
            name: params.name || `${params.type}: ${params.value}`,
            description: params.description || '',
            notificationChannels: params.notificationChannels || ['dashboard']
        };
        
        this.addToMemory(subscription);
        await this.saveSubscriptions();
        
        this.logger.info('Subscription created', { 
            category: 'alert-subscription',
            id,
            type: subscription.type,
            value: subscription.value
        });
        
        return subscription;
    }

    /**
     * Remove a subscription
     * @param {string} id - Subscription ID
     * @returns {boolean}
     */
    async unsubscribe(id) {
        const sub = this.subscriptions.get(id);
        if (!sub) return false;
        
        this.subscriptions.delete(id);
        
        // Remove from type index
        const typeSubs = this.subscriptionsByType[sub.type];
        if (typeSubs) {
            const subs = typeSubs.get(sub.value) || [];
            const filtered = subs.filter(s => s.id !== id);
            if (filtered.length === 0) {
                typeSubs.delete(sub.value);
            } else {
                typeSubs.set(sub.value, filtered);
            }
        }
        
        await this.saveSubscriptions();
        
        this.logger.info('Subscription removed', { 
            category: 'alert-subscription',
            id 
        });
        
        return true;
    }

    /**
     * Get subscription by ID
     * @param {string} id 
     * @returns {Subscription|null}
     */
    getSubscription(id) {
        return this.subscriptions.get(id) || null;
    }

    /**
     * Get all subscriptions
     * @returns {Subscription[]}
     */
    getAllSubscriptions() {
        return Array.from(this.subscriptions.values());
    }

    /**
     * Get subscriptions by type
     * @param {string} type 
     * @returns {Subscription[]}
     */
    getSubscriptionsByType(type) {
        const typeMap = this.subscriptionsByType[type];
        if (!typeMap) return [];
        
        const all = [];
        for (const subs of typeMap.values()) {
            all.push(...subs);
        }
        return all;
    }

    /**
     * Get subscriptions for a specific value
     * @param {string} type 
     * @param {string} value 
     * @returns {Subscription[]}
     */
    getSubscriptionsForValue(type, value) {
        const typeMap = this.subscriptionsByType[type];
        if (!typeMap) return [];
        return typeMap.get(value.toLowerCase()) || [];
    }

    /**
     * Update subscription criteria
     * @param {string} id 
     * @param {Object} updates 
     * @returns {Subscription|null}
     */
    async updateSubscription(id, updates) {
        const sub = this.subscriptions.get(id);
        if (!sub) return null;
        
        if (updates.criteria) {
            sub.criteria = { ...sub.criteria, ...updates.criteria };
        }
        if (updates.enabled !== undefined) {
            sub.enabled = updates.enabled;
        }
        if (updates.name) {
            sub.name = updates.name;
        }
        if (updates.description !== undefined) {
            sub.description = updates.description;
        }
        if (updates.notificationChannels) {
            sub.notificationChannels = updates.notificationChannels;
        }
        
        sub.updatedAt = new Date().toISOString();
        
        await this.saveSubscriptions();
        
        this.logger.info('Subscription updated', { 
            category: 'alert-subscription',
            id 
        });
        
        return sub;
    }

    /**
     * Check if an opportunity matches a subscription
     * @param {Subscription} sub 
     * @param {Object} opportunity 
     * @returns {boolean}
     */
    matchesSubscription(sub, opportunity) {
        if (!sub.enabled) return false;
        
        // Check type-specific matching
        switch (sub.type) {
            case 'sport':
                if (!opportunity.sport || 
                    !opportunity.sport.toLowerCase().includes(sub.value)) {
                    return false;
                }
                break;
            case 'league':
                if (!opportunity.league || 
                    opportunity.league.toLowerCase() !== sub.value) {
                    return false;
                }
                break;
            case 'team': {
                const teams = [opportunity.homeTeam, opportunity.awayTeam,
                              opportunity.team1, opportunity.team2].filter(Boolean);
                if (!teams.some(t => t.toLowerCase().includes(sub.value))) {
                    return false;
                }
                break;
            }
            case 'event':
                if (opportunity.eventId !== sub.value) {
                    return false;
                }
                break;
            default:
                return false;
        }
        
        // Check EV/arbitrage criteria
        const ev = opportunity.evPercent || opportunity.profitPercent || 0;
        if (ev < sub.criteria.minEV) return false;
        
        // Check market
        if (!sub.criteria.markets.includes(opportunity.market || 'h2h')) {
            return false;
        }
        
        // Check bookmakers
        if (sub.criteria.bookmakers.length > 0) {
            const oppBookmakers = opportunity.bookmakers || [];
            const hasMatchingBookmaker = oppBookmakers.some(b => 
                sub.criteria.bookmakers.includes(b.name || b)
            );
            if (!hasMatchingBookmaker) return false;
        }
        
        return true;
    }

    /**
     * Find all matching subscriptions for an opportunity
     * @param {Object} opportunity 
     * @returns {Subscription[]}
     */
    findMatchingSubscriptions(opportunity) {
        const matches = [];
        
        // Check sport subscriptions
        if (opportunity.sport) {
            const sportSubs = this.getSubscriptionsForValue('sport', opportunity.sport);
            for (const sub of sportSubs) {
                if (this.matchesSubscription(sub, opportunity)) {
                    matches.push(sub);
                }
            }
        }
        
        // Check league subscriptions
        if (opportunity.league) {
            const leagueSubs = this.getSubscriptionsForValue('league', opportunity.league);
            for (const sub of leagueSubs) {
                if (!matches.includes(sub) && this.matchesSubscription(sub, opportunity)) {
                    matches.push(sub);
                }
            }
        }
        
        // Check team subscriptions
        const teams = [opportunity.homeTeam, opportunity.awayTeam, 
                      opportunity.team1, opportunity.team2].filter(Boolean);
        for (const team of teams) {
            const teamSubs = this.getSubscriptionsForValue('team', team);
            for (const sub of teamSubs) {
                if (!matches.includes(sub) && this.matchesSubscription(sub, opportunity)) {
                    matches.push(sub);
                }
            }
        }
        
        // Check event subscriptions
        if (opportunity.eventId) {
            const eventSubs = this.getSubscriptionsForValue('event', opportunity.eventId);
            for (const sub of eventSubs) {
                if (!matches.includes(sub) && this.matchesSubscription(sub, opportunity)) {
                    matches.push(sub);
                }
            }
        }
        
        return matches;
    }

    /**
     * Check if an alert has been sent recently (duplicate prevention)
     * @param {string} alertKey 
     * @returns {boolean}
     */
    wasAlertSentRecently(alertKey) {
        const lastSent = this.alertHistory.get(alertKey);
        if (!lastSent) return false;
        
        return (Date.now() - lastSent) < this.alertHistoryExpiry;
    }

    /**
     * Record that an alert was sent
     * @param {string} alertKey 
     */
    recordAlertSent(alertKey) {
        this.alertHistory.set(alertKey, Date.now());
        
        // Clean old entries periodically
        if (this.alertHistory.size > 1000) {
            this.cleanAlertHistory();
        }
    }

    /**
     * Clean old alert history entries
     */
    cleanAlertHistory() {
        const now = Date.now();
        for (const [key, timestamp] of this.alertHistory) {
            if ((now - timestamp) > this.alertHistoryExpiry) {
                this.alertHistory.delete(key);
            }
        }
    }

    /**
     * Generate alert key for an opportunity
     * @param {Object} opportunity 
     * @returns {string}
     */
    generateAlertKey(opportunity) {
        const parts = [
            opportunity.eventId || opportunity.eventName,
            opportunity.market || 'h2h',
            opportunity.outcome || opportunity.selection,
            Math.floor((opportunity.evPercent || opportunity.profitPercent) / 0.5) * 0.5 // Round to nearest 0.5
        ];
        return parts.join('|');
    }

    /**
     * Process opportunities and generate subscription alerts
     * @param {Object} opportunities 
     * @returns {Object[]}
     */
    processOpportunities(opportunities) {
        const alerts = [];
        
        const allOpportunities = [
            ...(opportunities.arbitrage || []),
            ...(opportunities.positiveEV || []),
            ...(opportunities.valueBets || [])
        ];
        
        for (const opp of allOpportunities) {
            const matchingSubs = this.findMatchingSubscriptions(opp);
            
            if (matchingSubs.length > 0) {
                const alertKey = this.generateAlertKey(opp);
                
                if (!this.wasAlertSentRecently(alertKey)) {
                    alerts.push({
                        opportunity: opp,
                        subscriptions: matchingSubs,
                        alertKey,
                        timestamp: new Date().toISOString()
                    });
                    
                    this.recordAlertSent(alertKey);
                }
            }
        }
        
        return alerts;
    }

    /**
     * Get popular subscriptions (for suggestions)
     * @returns {Object[]}
     */
    getPopularSubscriptions() {
        return [
            { type: 'sport', value: 'tennis', name: 'Tennis', icon: '🎾' },
            { type: 'sport', value: 'soccer', name: 'Soccer', icon: '⚽' },
            { type: 'sport', value: 'basketball', name: 'Basketball', icon: '🏀' },
            { type: 'league', value: 'premier_league', name: 'Premier League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
            { type: 'league', value: 'la_liga', name: 'La Liga', icon: '🇪🇸' },
            { type: 'league', value: 'nba', name: 'NBA', icon: '🇺🇸' },
            { type: 'league', value: 'atp', name: 'ATP Tour', icon: '🎾' },
            { type: 'league', value: 'wta', name: 'WTA Tour', icon: '🎾' }
        ];
    }

    /**
     * Get subscription statistics
     * @returns {Object}
     */
    getStats() {
        const stats = {
            total: this.subscriptions.size,
            byType: {},
            enabled: 0,
            disabled: 0
        };
        
        for (const sub of this.subscriptions.values()) {
            if (sub.enabled) {
                stats.enabled++;
            } else {
                stats.disabled++;
            }
            
            stats.byType[sub.type] = (stats.byType[sub.type] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * Shutdown the manager
     */
    async shutdown() {
        this.logger.info('Shutting down Alert Subscription Manager...', { 
            category: 'alert-subscription' 
        });
        await this.saveSubscriptions();
        this.initialized = false;
    }
}

module.exports = { AlertSubscriptionManager };
