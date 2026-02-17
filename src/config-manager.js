/**
 * Configuration Management UI API
 * Provides endpoints for managing all Surebet Detector settings
 */

class ConfigManager {
    constructor(configPath = './data/config-manager.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    /**
     * Default configuration schema with all settings
     */
    getDefaultConfig() {
        return {
            version: 2,
            updatedAt: new Date().toISOString(),
            
            // Profit Thresholds
            thresholds: {
                minArbitrageProfit: 0.5,      // Minimum arbitrage profit %
                minEVPercent: 5,              // Minimum EV %
                maxEVPercent: 100,            // Maximum EV % cap
                minQualityScore: 60,          // Minimum opportunity quality score (0-100)
            },

            // Stake & Bankroll Settings
            stakes: {
                defaultTotalStake: 100,       // Default total stake for arbitrage (EUR)
                maxStakePerBet: 500,          // Maximum stake per individual bet
                maxStakePerDay: 2000,         // Maximum total daily stakes
                maxStakePerBookmaker: 1000,   // Maximum per bookmaker per day
                kellyFraction: 0.25,          // Kelly Criterion fraction (0.25 = quarter Kelly)
                minStake: 5,                  // Minimum stake per bookmaker
                bankrollPercentPerBet: 10,    // Max % of bankroll per bet
                enableSmartSizing: true,      // Use smart bet sizing algorithm
            },

            // Bookmaker Settings
            bookmakers: {
                enabled: ['Pinnacle', 'Unibet', 'Betclic', 'Winamax', 'FDJ', 'ParionsSport', 'ZEbet', 'Betfair', 'Smarkets'],
                disabled: [],
                requirePinnacle: true,        // Require Pinnacle odds for EV calculation
                maxBookmakersPerOpportunity: 5, // Limit bookmakers shown per opportunity
                apiTimeouts: {
                    default: 10000,           // Default API timeout (ms)
                    pinnacle: 15000,
                    unibet: 12000,
                    betclic: 12000,
                    winamax: 10000,
                    fdj: 15000,
                    parionssport: 15000,
                    zebet: 12000,
                    betfair: 20000,
                    smarkets: 20000,
                },
                rateLimits: {
                    requestsPerMinute: 60,    // Global rate limit
                    perBookmaker: {
                        pinnacle: 30,
                        unibet: 30,
                        betclic: 30,
                        winamax: 30,
                        fdj: 20,
                        parionssport: 20,
                        zebet: 30,
                        betfair: 20,
                        smarkets: 20,
                    }
                }
            },

            // Sport & Market Settings
            sports: {
                enabled: ['tennis', 'soccer', 'basketball', 'esports', 'horse_racing'],
                tennis: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 10.0,
                    tournaments: [],          // Empty = all
                    excludeTournaments: [],
                    markets: ['h2h', 'set1', 'set2']
                },
                soccer: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 15.0,
                    leagues: [],
                    excludeLeagues: [],
                    markets: ['1x2', 'asian_handicap', 'over_under', 'btts', 'double_chance']
                },
                basketball: {
                    enabled: true,
                    minOdds: 1.1,
                    maxOdds: 10.0,
                    leagues: [],
                    excludeLeagues: [],
                    markets: ['h2h', 'spread', 'total']
                },
                esports: {
                    enabled: false,
                    minOdds: 1.1,
                    maxOdds: 5.0,
                    games: [],
                    excludeGames: [],
                    markets: ['h2h', 'map1', 'map2']
                },
                horse_racing: {
                    enabled: false,
                    minOdds: 1.5,
                    maxOdds: 50.0,
                    courses: [],
                    excludeCourses: [],
                    markets: ['win', 'place']
                }
            },

            markets: {
                enabled: ['1x2', 'h2h', 'asian_handicap', 'over_under', 'btts', 'double_chance'],
                '1x2': { enabled: true, maxOutcomes: 3 },
                'h2h': { enabled: true, maxOutcomes: 2 },
                'asian_handicap': { enabled: true, maxOutcomes: 2 },
                'over_under': { enabled: true, maxOutcomes: 2 },
                'btts': { enabled: true, maxOutcomes: 2 },
                'double_chance': { enabled: true, maxOutcomes: 3 },
            },

            // Timing Settings
            timing: {
                minTimeToEvent: 0,            // Minimum minutes before event
                maxTimeToEvent: 10080,        // Maximum minutes (7 days)
                refreshInterval: 30,          // Data refresh interval (minutes)
                liveRefreshInterval: 5,       // Live match refresh (minutes)
                staleOddsThreshold: 10,       // Minutes before odds considered stale
                quietHours: {
                    enabled: false,
                    start: '23:00',
                    end: '08:00',
                    timezone: 'Europe/Paris',
                    disableAlerts: true,
                    disableRefresh: false,
                }
            },

            // Alert & Notification Settings
            alerts: {
                telegram: {
                    enabled: true,
                    botToken: '',               // Set via environment
                    chatId: '',                 // Set via environment
                    minArbitrageForAlert: 1.0,  // Min profit % for alert
                    minEVForAlert: 8,           // Min EV % for alert
                    minQualityScore: 70,        // Min quality score for alert
                    dailySummary: true,
                    summaryTime: '09:00',
                    quietHoursRespected: true,
                    includeOdds: true,
                    includeStakes: true,
                },
                email: {
                    enabled: false,
                    smtpHost: '',
                    smtpPort: 587,
                    smtpUser: '',
                    smtpPass: '',
                    fromAddress: '',
                    toAddresses: [],
                    minArbitrageForAlert: 2.0,
                    minEVForAlert: 10,
                },
                push: {
                    enabled: false,
                    minArbitrageForAlert: 1.5,
                    minEVForAlert: 12,
                },
                webhook: {
                    enabled: false,
                    url: '',
                    secret: '',
                    events: ['arbitrage', 'high_ev', 'odds_movement'],
                }
            },

            // Display Settings
            display: {
                theme: 'dark',                // 'dark', 'light', 'auto'
                language: 'en',               // 'en', 'fr', 'de', 'es'
                timezone: 'Europe/Paris',
                currency: 'EUR',              // 'EUR', 'GBP', 'USD'
                dateFormat: 'DD/MM/YYYY',
                timeFormat: '24h',            // '24h', '12h'
                
                dashboard: {
                    autoRefresh: true,
                    refreshInterval: 30,      // seconds
                    maxResultsPerCategory: 50,
                    showSuspicious: true,
                    showStalenessWarning: true,
                    showProfitChart: true,
                    showEVChart: true,
                    defaultView: 'all',       // 'all', 'arbitrage', 'ev', 'live'
                },
                
                sorting: {
                    defaultSort: 'ev',        // 'ev', 'profit', 'time', 'quality'
                    defaultOrder: 'desc',     // 'asc', 'desc'
                    groupBySport: false,
                    groupByBookmaker: false,
                },
                
                columns: {
                    showSport: true,
                    showLeague: true,
                    showTime: true,
                    showBookmakers: true,
                    showOdds: true,
                    showEV: true,
                    showProfit: true,
                    showStakes: true,
                    showQuality: true,
                    showLiquidity: false,
                }
            },

            // Risk Management
            risk: {
                maxDailyLoss: 500,            // Maximum daily loss (EUR)
                maxConsecutiveLosses: 5,      // Alert after N consecutive losses
                maxExposurePerEvent: 300,     // Max total exposure per event
                maxExposurePerBookmaker: 1000, // Max per bookmaker
                palpableErrorThreshold: 10,   // Profit % that triggers palpable error warning
                enableAutoStop: false,        // Auto-stop after max daily loss
                enableLossStreakAlert: true,
            },

            // Data & Storage
            data: {
                retentionDays: 365,           // Keep data for N days
                archiveAfterDays: 90,         // Archive after N days
                compressionEnabled: true,
                backupEnabled: true,
                backupInterval: 'daily',      // 'hourly', 'daily', 'weekly'
                exportFormat: 'json',         // 'json', 'csv', 'both'
            },

            // Circuit Breaker Settings
            circuitBreaker: {
                enabled: true,
                failureThreshold: 5,          // Failures before opening
                failureWindowMs: 60000,       // Time window for failures (ms)
                resetTimeoutMs: 30000,        // Time before recovery attempt (ms)
                successThreshold: 3,          // Successes to close
                maxConsecutiveFailures: 10,   // Hard limit
                halfOpenMaxCalls: 3,          // Max calls in half-open state
            },

            // Advanced Settings
            advanced: {
                enableCrossMarketArbitrage: true,
                enableLiveArbitrage: true,
                enablePaperTrading: true,
                enableMLPrediction: false,
                logLevel: 'info',             // 'debug', 'info', 'warn', 'error'
                enableAuditLog: true,
                enableMetrics: true,
                metricsPort: 9090,
                enableCORS: true,
                allowedOrigins: ['http://localhost:3000', 'http://localhost:8080'],
            },

            // Security
            security: {
                enable2FA: false,
                sessionTimeout: 3600,         // Session timeout (seconds)
                maxLoginAttempts: 5,
                lockoutDuration: 900,         // Lockout duration (seconds)
                requireStrongPassword: true,
                apiKeyRotation: 30,           // Days between API key rotation
            }
        };
    }

    loadConfig() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const loaded = JSON.parse(data);
                return this.mergeWithDefaults(loaded);
            }
        } catch (error) {
            console.warn('Failed to load config manager:', error.message);
        }
        return this.getDefaultConfig();
    }

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
            console.error('Failed to save config:', error.message);
            return false;
        }
    }

    getConfig() {
        return this.config;
    }

    getPublicConfig() {
        // Return config without sensitive data
        const public = JSON.parse(JSON.stringify(this.config));
        delete public.alerts.telegram.botToken;
        delete public.alerts.telegram.chatId;
        delete public.alerts.email.smtpPass;
        delete public.alerts.webhook.secret;
        return public;
    }

    updateConfig(updates) {
        this.config = this.mergeWithDefaults(updates);
        return this.saveConfig();
    }

    updateSection(section, values) {
        if (this.config[section]) {
            this.config[section] = { ...this.config[section], ...values };
            return this.saveConfig();
        }
        return false;
    }

    resetToDefaults() {
        this.config = this.getDefaultConfig();
        return this.saveConfig();
    }

    exportConfig(format = 'json') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `surebet-config-${timestamp}.${format}`;
        
        if (format === 'json') {
            return {
                filename,
                content: JSON.stringify(this.config, null, 2),
                contentType: 'application/json'
            };
        } else if (format === 'csv') {
            // Flatten config to CSV
            const rows = this.flattenConfig(this.config);
            const csv = this.convertToCSV(rows);
            return {
                filename,
                content: csv,
                contentType: 'text/csv'
            };
        }
        return null;
    }

    flattenConfig(obj, prefix = '') {
        const rows = [];
        for (const key in obj) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                rows.push(...this.flattenConfig(obj[key], path));
            } else {
                rows.push({ path, value: Array.isArray(obj[key]) ? obj[key].join(',') : obj[key] });
            }
        }
        return rows;
    }

    convertToCSV(rows) {
        const headers = 'Key,Value\n';
        const lines = rows.map(r => `"${r.path}","${r.value}"`).join('\n');
        return headers + lines;
    }

    importConfig(configData) {
        try {
            if (typeof configData === 'string') {
                configData = JSON.parse(configData);
            }
            this.config = this.mergeWithDefaults(configData);
            return this.saveConfig();
        } catch (error) {
            console.error('Failed to import config:', error.message);
            return false;
        }
    }

    validateConfig() {
        const errors = [];
        const config = this.config;

        // Validate thresholds
        if (config.thresholds.minArbitrageProfit < 0) {
            errors.push('minArbitrageProfit must be >= 0');
        }
        if (config.thresholds.minEVPercent >= config.thresholds.maxEVPercent) {
            errors.push('minEVPercent must be less than maxEVPercent');
        }

        // Validate stakes
        if (config.stakes.minStake >= config.stakes.maxStakePerBet) {
            errors.push('minStake must be less than maxStakePerBet');
        }

        // Validate timing
        if (config.timing.minTimeToEvent >= config.timing.maxTimeToEvent) {
            errors.push('minTimeToEvent must be less than maxTimeToEvent');
        }

        // Validate bookmakers
        if (config.bookmakers.enabled.length === 0) {
            errors.push('At least one bookmaker must be enabled');
        }

        // Validate sports
        const enabledSports = Object.keys(config.sports).filter(s => 
            s !== 'enabled' && config.sports[s]?.enabled
        );
        if (enabledSports.length === 0) {
            errors.push('At least one sport must be enabled');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    getConfigSchema() {
        return {
            sections: [
                { key: 'thresholds', label: 'Profit Thresholds', icon: 'target' },
                { key: 'stakes', label: 'Stake & Bankroll', icon: 'dollar-sign' },
                { key: 'bookmakers', label: 'Bookmakers', icon: 'book' },
                { key: 'sports', label: 'Sports & Markets', icon: 'activity' },
                { key: 'markets', label: 'Market Types', icon: 'grid' },
                { key: 'timing', label: 'Timing & Scheduling', icon: 'clock' },
                { key: 'alerts', label: 'Alerts & Notifications', icon: 'bell' },
                { key: 'display', label: 'Display Settings', icon: 'monitor' },
                { key: 'risk', label: 'Risk Management', icon: 'shield' },
                { key: 'data', label: 'Data & Storage', icon: 'database' },
                { key: 'circuitBreaker', label: 'Circuit Breaker', icon: 'zap' },
                { key: 'advanced', label: 'Advanced', icon: 'settings' },
                { key: 'security', label: 'Security', icon: 'lock' },
            ],
            version: this.config.version,
            updatedAt: this.config.updatedAt
        };
    }
}

module.exports = ConfigManager;
