"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const logger_js_1 = __importDefault(require("../utils/logger.js"));
const metrics_js_1 = require("../utils/metrics.js");
/**
 * Express server for API endpoints
 */
function createServer(engine) {
    const app = (0, express_1.default)();
    // Middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)());
    app.use((0, compression_1.default)());
    app.use(express_1.default.json());
    // Health check
    app.get('/health', (req, res) => {
        const stats = engine.getStats();
        res.json({
            status: stats.isRunning ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            stats
        });
    });
    // Metrics endpoint for Prometheus
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', metrics_js_1.register.contentType);
        res.end(await metrics_js_1.register.metrics());
    });
    // Get all active events with aggregated odds
    app.get('/api/events', async (req, res) => {
        try {
            const events = await engine.getAllEvents();
            res.json({
                count: events.length,
                events
            });
        }
        catch (error) {
            logger_js_1.default.error('Error fetching events:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    });
    // Get aggregated odds for a specific event
    app.get('/api/events/:eventId', async (req, res) => {
        try {
            const { eventId } = req.params;
            const event = await engine.getEventOdds(eventId);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json(event);
        }
        catch (error) {
            logger_js_1.default.error('Error fetching event:', error);
            res.status(500).json({ error: 'Failed to fetch event' });
        }
    });
    // Get bookmaker health status
    app.get('/api/bookmakers/health', (req, res) => {
        const health = engine.getBookmakerHealth();
        res.json({
            count: health.length,
            bookmakers: health
        });
    });
    // Get engine statistics
    app.get('/api/stats', (req, res) => {
        const stats = engine.getStats();
        res.json(stats);
    });
    // WebSocket upgrade endpoint for real-time odds streaming
    app.get('/api/stream', (req, res) => {
        res.json({
            message: 'WebSocket streaming available at ws://localhost:3001/stream',
            documentation: 'Connect via WebSocket to receive real-time odds updates'
        });
    });
    // i18n Service Proxy Routes
    const I18N_SERVICE_URL = process.env.I18N_SERVICE_URL || 'http://localhost:3007';
    // Get available languages
    app.get('/api/i18n/languages', async (req, res) => {
        try {
            const response = await fetch(`${I18N_SERVICE_URL}/api/languages`);
            const data = await response.json();
            res.json(data);
        }
        catch (error) {
            logger_js_1.default.error('Error fetching languages:', error);
            res.status(503).json({
                error: 'i18n service unavailable',
                languages: [
                    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isActive: true, isDefault: true },
                    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', isActive: true },
                    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', isActive: true },
                    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', isActive: true }
                ]
            });
        }
    });
    // Get translations for a language and namespace
    app.get('/api/i18n/translations/:lang/:namespace', async (req, res) => {
        try {
            const { lang, namespace } = req.params;
            const response = await fetch(`${I18N_SERVICE_URL}/api/translations/${lang}/${namespace}`);
            const data = await response.json();
            res.json(data);
        }
        catch (error) {
            logger_js_1.default.error('Error fetching translations:', error);
            // Return fallback translations
            res.json({
                language: req.params.lang,
                namespace: req.params.namespace,
                translations: getFallbackTranslations(req.params.namespace)
            });
        }
    });
    // Get user preferences
    app.get('/api/i18n/preferences', async (req, res) => {
        try {
            const userId = req.headers['x-user-id'] || 'anonymous';
            const response = await fetch(`${I18N_SERVICE_URL}/api/preferences/${userId}`, {
                headers: { 'Accept-Language': req.headers['accept-language'] || 'en' }
            });
            if (response.ok) {
                const data = await response.json();
                res.json(data);
            }
            else {
                throw new Error('Preferences not found');
            }
        }
        catch (error) {
            // Return default preferences
            res.json({
                language: req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en',
                fallbackLanguage: 'en',
                timezone: 'UTC',
                dateFormat: 'YYYY-MM-DD',
                timeFormat: '24h'
            });
        }
    });
    // Save user preferences
    app.post('/api/i18n/preferences', async (req, res) => {
        try {
            const userId = req.headers['x-user-id'] || 'anonymous';
            const response = await fetch(`${I18N_SERVICE_URL}/api/preferences/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });
            if (response.ok) {
                const data = await response.json();
                res.json(data);
            }
            else {
                throw new Error('Failed to save preferences');
            }
        }
        catch (error) {
            logger_js_1.default.error('Error saving preferences:', error);
            // Return the preferences as if they were saved
            res.json({
                ...req.body,
                userId: 'anonymous',
                updatedAt: new Date().toISOString()
            });
        }
    });
    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
    // Error handler
    app.use((err, req, res, next) => {
        logger_js_1.default.error('Express error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });
    return app;
}
/**
 * Get fallback translations when i18n service is unavailable
 */
function getFallbackTranslations(namespace) {
    const fallbacks = {
        common: {
            // Navigation
            'nav.dashboard': 'Dashboard',
            'nav.analytics': 'Analytics',
            'nav.settlements': 'Settlements',
            'nav.matchedBetting': 'Matched Betting',
            'nav.keys': 'API Keys',
            'nav.config': 'Config',
            'nav.settings': 'Settings',
            // Hero
            'hero.title': 'Find the edge',
            'hero.subtitle': 'Arbitrage and +EV opportunities across multiple bookmakers',
            'hero.refresh': 'Refresh Now',
            'hero.viewOpportunities': 'View Opportunities',
            'hero.alertSettings': 'Alert Settings',
            // Summary Cards
            'summary.arbitrage': 'Arbitrage',
            'summary.arbitrage.sub': 'Guaranteed profit',
            'summary.ev': '+EV',
            'summary.ev.sub': 'Expected value',
            'summary.suspicious': 'Suspicious',
            'summary.suspicious.sub': 'Check promotions',
            // Sections
            'section.liveMatches': 'Live Matches',
            'section.liveMatches.sub': 'In-play arbitrage opportunities (real-time tracking)',
            'section.arbitrage': 'Arbitrage Opportunities',
            'section.arbitrage.sub': 'Risk-free profit by betting on all outcomes',
            'section.positiveEV': 'Positive EV Opportunities',
            'section.positiveEV.sub': 'Value bets based on sharp bookmaker odds',
            'section.suspicious': 'Suspicious Opportunities',
            'section.suspicious.sub': 'Potential promotions or errors',
            // Buttons
            'btn.refresh': 'Refresh Now',
            'btn.startTracking': 'Start Tracking',
            'btn.stopTracking': 'Stop Tracking',
            'btn.placeBet': 'Place Bet',
            'btn.calculate': 'Calculate',
            'btn.save': 'Save',
            'btn.cancel': 'Cancel',
            'btn.close': 'Close',
            // Status
            'status.online': 'Online',
            'status.offline': 'Offline',
            'status.loading': 'Loading...',
            'status.noData': 'No data available',
            // Time
            'time.lastUpdate': 'Last update',
            'time.justNow': 'Just now',
            'time.minutesAgo': '{{count}} minutes ago',
            'time.hoursAgo': '{{count}} hours ago',
            // Footer
            'footer.updateInterval': 'Updates every 30 minutes',
            'footer.dataSource': 'Data from Unibet, Polymarket, and more'
        },
        opportunities: {
            'opp.profit': 'Profit',
            'opp.stake': 'Stake',
            'opp.odds': 'Odds',
            'opp.bookmaker': 'Bookmaker',
            'opp.market': 'Market',
            'opp.event': 'Event',
            'opp.startTime': 'Start Time',
            'opp.arbitrage': 'Arbitrage',
            'opp.positiveEV': 'Positive EV',
            'opp.ev': 'EV',
            'opp.expectedProfit': 'Expected Profit',
            'opp.totalStake': 'Total Stake',
            'opp.guaranteedProfit': 'Guaranteed Profit'
        },
        betting: {
            'bet.stake': 'Stake',
            'bet.odds': 'Odds',
            'bet.profit': 'Profit',
            'bet.return': 'Return',
            'bet.layStake': 'Lay Stake',
            'bet.liability': 'Liability',
            'bet.qualifying': 'Qualifying Bet',
            'bet.freeBet': 'Free Bet',
            'bet.snr': 'Stake Not Returned',
            'bet.sr': 'Stake Returned'
        },
        live: {
            'live.activeMatches': 'Active Matches',
            'live.liveArbitrage': 'Live Arbitrage',
            'live.highUrgency': 'High Urgency',
            'live.score': 'Score',
            'live.status': 'Status',
            'live.time': 'Time',
            'live.bookmakers': 'Bookmakers',
            'live.notStarted': 'Live tracking not started. Click "Start Tracking" to begin.'
        }
    };
    return fallbacks[namespace] || {};
}
//# sourceMappingURL=server.js.map