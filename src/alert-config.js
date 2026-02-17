/**
 * Alert Configuration and Filtering System
 * Manages user preferences for alerts, filtering, and notification settings
 */

class AlertConfig {
    constructor(configPath = './data/alert-config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    /**
     * Default configuration
     */
    getDefaultConfig() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            
            // EV Threshold Settings
            evThresholds: {
                minEVPercent: 5,           // Minimum EV% to show
                maxEVPercent: 100,         // Maximum EV% cap
                minArbitrageProfit: 0.5,   // Minimum arbitrage profit %
            },

            // Sport Filters
            sports: {
                enabled: ['tennis', 'soccer', 'basketball'],
                disabled: [],
                tennis: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 10.0,
                    tournaments: [], // empty = all
                    excludeTournaments: []
                },
                soccer: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 15.0,
                    leagues: [],
                    excludeLeagues: []
                },
                basketball: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 10.0,
                    leagues: [],
                    excludeLeagues: []
                }
            },

            // Bookmaker Filters
            bookmakers: {
                enabled: ['Pinnacle', 'Unibet', 'Betclic', 'Winamax', 'FDJ', 'ParionsSport', 'ZEbet'],
                disabled: [],
                requirePinnacle: true,      // Only show EV if Pinnacle is available
                excludePromotional: false,  // Exclude suspicious/promotional odds
            },

            // Market Filters
            markets: {
                enabled: ['h2h', 'outrights'],
                h2h: {
                    enabled: true,
                    maxOutcomes: 3  // 2 for tennis, 3 for soccer with draw
                },
                outrights: {
                    enabled: true,
                    maxOutcomes: 20
                }
            },

            // Time-based Filters
            timing: {
                minTimeToEvent: 0,          // Minimum minutes before event starts (0 = now)
                maxTimeToEvent: 10080,      // Maximum minutes (7 days)
                quietHours: {
                    enabled: false,
                    start: '23:00',
                    end: '08:00',
                    timezone: 'Europe/Paris'
                }
            },

            // Alert Delivery Settings
            alerts: {
                telegram: {
                    enabled: true,
                    minEVForAlert: 8,       // Only send Telegram alert if EV > 8%
                    minArbitrageForAlert: 1.0, // Only alert if arbitrage > 1%
                    dailySummary: true,
                    quietHoursRespected: true
                },
                dashboard: {
                    enabled: true,
                    autoRefresh: true,
                    refreshInterval: 300    // seconds
                }
            },

            // Display Preferences
            display: {
                sortBy: 'ev',               // 'ev', 'time', 'sport'
                sortOrder: 'desc',          // 'asc', 'desc'
                groupBySport: false,
                showSuspicious: true,
                showStalenessWarning: true,
                maxResultsPerCategory: 50
            },

            // Advanced Filters
            advanced: {
                minBookmakerCount: 2,       // Minimum bookmakers offering the event
                excludeLiveEvents: false,   // Exclude in-play events
                requireLiquidity: false,    // Require known liquidity info
                maxOddsRatio: 2.5,          // Flag if odds >2.5x Pinnacle
                enableStalenessCheck: true  // Check if Pinnacle odds are stale
            }
        };
    }

    /**
     * Load configuration from file or create default
     */
    loadConfig() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const loaded = JSON.parse(data);
                // Merge with defaults to ensure all fields exist
                return this.mergeWithDefaults(loaded);
            }
        } catch (error) {
            console.warn('Failed to load alert config:', error.message);
        }
        return this.getDefaultConfig();
    }

    /**
     * Merge loaded config with defaults to ensure all fields exist
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
            
            // Ensure directory exists
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                try {
                    fs.mkdirSync(dir, { recursive: true });
                } catch (mkdirErr) {
                    // Silently fail in read-only environments (e.g., Vercel)
                    console.warn(`Warning: Could not create alert config directory: ${mkdirErr.message}`);
                    return false;
                }
            }
            
            this.config.updatedAt = new Date().toISOString();
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to save alert config:', error.message);
            return false;
        }
    }

    /**
     * Get full configuration
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
     * Check if a sport is enabled
     */
    isSportEnabled(sport) {
        const sportKey = sport.toLowerCase();
        if (!this.config.sports.enabled.includes(sportKey)) {
            return false;
        }
        const sportConfig = this.config.sports[sportKey];
        return sportConfig ? sportConfig.enabled : true;
    }

    /**
     * Check if a bookmaker is enabled
     */
    isBookmakerEnabled(bookmaker) {
        const name = bookmaker.toLowerCase();
        return this.config.bookmakers.enabled.some(b => 
            b.toLowerCase() === name || name.includes(b.toLowerCase())
        );
    }

    /**
     * Check if odds are within sport-specific range
     */
    areOddsInRange(sport, odds) {
        const sportKey = sport.toLowerCase();
        const sportConfig = this.config.sports[sportKey];
        if (!sportConfig) return true;
        
        return odds >= sportConfig.minOdds && odds <= sportConfig.maxOdds;
    }

    /**
     * Check if event time is within acceptable range
     */
    isTimeInRange(commenceTime) {
        const now = new Date();
        const eventTime = new Date(commenceTime);
        const diffMinutes = (eventTime - now) / (1000 * 60);
        
        return diffMinutes >= this.config.timing.minTimeToEvent && 
               diffMinutes <= this.config.timing.maxTimeToEvent;
    }

    /**
     * Check if current time is in quiet hours
     */
    isQuietHours() {
        if (!this.config.timing.quietHours.enabled) return false;
        
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [startHour, startMin] = this.config.timing.quietHours.start.split(':').map(Number);
        const [endHour, endMin] = this.config.timing.quietHours.end.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        if (startMinutes < endMinutes) {
            return currentTime >= startMinutes && currentTime <= endMinutes;
        } else {
            // Quiet hours span midnight
            return currentTime >= startMinutes || currentTime <= endMinutes;
        }
    }

    /**
     * Filter opportunities based on all configured rules
     */
    filterOpportunities(opportunities) {
        const filtered = {
            timestamp: opportunities.timestamp,
            forex: opportunities.forex,
            arbitrage: [],
            positiveEV: [],
            suspicious: opportunities.suspicious || [],
            promotions: opportunities.promotions || []
        };

        // Filter arbitrage opportunities
        for (const arb of opportunities.arbitrage || []) {
            if (this.shouldIncludeArbitrage(arb)) {
                filtered.arbitrage.push(arb);
            }
        }

        // Filter EV opportunities
        for (const ev of opportunities.positiveEV || []) {
            if (this.shouldIncludeEV(ev)) {
                filtered.positiveEV.push(ev);
            }
        }

        // Apply display limits
        filtered.arbitrage = filtered.arbitrage.slice(0, this.config.display.maxResultsPerCategory);
        filtered.positiveEV = filtered.positiveEV.slice(0, this.config.display.maxResultsPerCategory);

        // Filter suspicious if disabled
        if (!this.config.display.showSuspicious) {
            filtered.suspicious = [];
        }

        return filtered;
    }

    /**
     * Check if arbitrage opportunity should be included
     */
    shouldIncludeArbitrage(arb) {
        // Check sport
        if (!this.isSportEnabled(arb.sport)) return false;

        // Check profit threshold
        if (arb.profitPercent < this.config.evThresholds.minArbitrageProfit) return false;

        // Check time range
        if (!this.isTimeInRange(arb.commenceTime)) return false;

        // Check bookmakers
        for (const leg of arb.legs || []) {
            if (!this.isBookmakerEnabled(leg.bookmaker)) return false;
        }

        return true;
    }

    /**
     * Check if EV opportunity should be included
     */
    shouldIncludeEV(ev) {
        // Check sport
        if (!this.isSportEnabled(ev.sport)) return false;

        // Check EV thresholds
        if (ev.evPercent < this.config.evThresholds.minEVPercent) return false;
        if (ev.evPercent > this.config.evThresholds.maxEVPercent) return false;

        // Check time range
        if (!this.isTimeInRange(ev.commenceTime)) return false;

        // Check bookmaker
        if (!this.isBookmakerEnabled(ev.bookmaker)) return false;

        // Check odds range
        if (!this.areOddsInRange(ev.sport, ev.odds)) return false;

        // Check if Pinnacle is required
        if (this.config.bookmakers.requirePinnacle && !ev.pinnacleOdds) return false;

        return true;
    }

    /**
     * Check if Telegram alert should be sent for this opportunity
     */
    shouldSendTelegramAlert(opportunity, type) {
        if (!this.config.alerts.telegram.enabled) return false;
        if (this.config.alerts.telegram.quietHoursRespected && this.isQuietHours()) return false;

        if (type === 'arbitrage') {
            return opportunity.profitPercent >= this.config.alerts.telegram.minArbitrageForAlert;
        } else if (type === 'ev') {
            return opportunity.evPercent >= this.config.alerts.telegram.minEVForAlert;
        }

        return false;
    }

    /**
     * Get filtered config for public API (hide sensitive settings)
     */
    getPublicConfig() {
        return {
            evThresholds: this.config.evThresholds,
            sports: this.config.sports,
            bookmakers: {
                enabled: this.config.bookmakers.enabled,
                disabled: this.config.bookmakers.disabled,
                requirePinnacle: this.config.bookmakers.requirePinnacle
            },
            markets: this.config.markets,
            timing: this.config.timing,
            alerts: {
                telegram: {
                    enabled: this.config.alerts.telegram.enabled,
                    minEVForAlert: this.config.alerts.telegram.minEVForAlert,
                    minArbitrageForAlert: this.config.alerts.telegram.minArbitrageForAlert,
                    dailySummary: this.config.alerts.telegram.dailySummary
                },
                dashboard: this.config.alerts.dashboard
            },
            display: this.config.display,
            advanced: this.config.advanced,
            updatedAt: this.config.updatedAt
        };
    }

    /**
     * Reset to defaults
     */
    resetToDefaults() {
        this.config = this.getDefaultConfig();
        return this.saveConfig();
    }
}

module.exports = AlertConfig;
