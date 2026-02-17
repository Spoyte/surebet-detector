const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');

const OddsFetcher = require('../fetcher');
const OpportunityAnalyzer = require('../analyzer');
const PromotionsTracker = require('../promotions');
const AlertConfig = require('../alert-config');
const TaxExporter = require('../tax-exporter');
const OddsMovementTracker = require('../odds-movement-tracker');
const LiveMatchTracker = require('../live-match-tracker');
const BankrollManager = require('../bankroll-manager');
const SurebetWebSocketServer = require('../websocket-server');
const { AdvancedAnalytics } = require('../advanced-analytics');
const { BetSettlementTracker } = require('../bet-settlement-tracker');
const StatePersistence = require('../state-persistence');
const MetricsCollector = require('../metrics-collector');
const OpportunityExporter = require('../opportunity-exporter');
const { MLOddsPredictor } = require('../ml-odds-predictor');
const { WatchlistManager } = require('../watchlist-manager');
const ConfigManager = require('../config-manager');
const { DataRetentionManager } = require('../data-retention-manager');
const BookmakerKeyManager = require('../bookmaker-key-manager');
const SeasonalityAnalyzer = require('../seasonality-analyzer');
const WebhookAlertManager = require('../webhook-alerts');
const ThirdPartyAPI = require('../third-party-api');
const ScreenshotManager = require('../screenshot-manager');

class WebDashboard {
    constructor(config, loggerInstances = {}) {
        this.config = config;
        this.logger = loggerInstances.logger || null;
        this.audit = loggerInstances.audit || null;
        this.debug = loggerInstances.debug || null;
        
        this.app = express();
        this.fetcher = new OddsFetcher(config, this.logger);
        this.analyzer = new OpportunityAnalyzer(config, this.logger);
        this.promotions = new PromotionsTracker();
        this.alertConfig = new AlertConfig();
        this.taxExporter = new TaxExporter();
        this.movementTracker = new OddsMovementTracker(config, this.logger);
        this.liveTracker = new LiveMatchTracker(config, this.logger);
        this.bankrollManager = new BankrollManager(config, this.logger);
        this.wsServer = new SurebetWebSocketServer(config, this.logger);
        this.analytics = new AdvancedAnalytics({ dataDir: path.join(__dirname, '../../data') }, this.logger);
        this.settlementTracker = new BetSettlementTracker({ dataDir: path.join(__dirname, '../../data') }, this.logger);
        this.statePersistence = new StatePersistence({
            stateDir: path.join(__dirname, '../../data/state'),
            autoSaveInterval: 5 * 60 * 1000 // 5 minutes
        });
        this.metrics = new MetricsCollector({
            dataDir: path.join(__dirname, '../../data')
        });
        this.exporter = new OpportunityExporter({
            dataDir: path.join(__dirname, '../../data'),
            telegramBotToken: config.TELEGRAM_BOT_TOKEN,
            telegramChatId: config.TELEGRAM_CHAT_ID
        });
        this.mlPredictor = new MLOddsPredictor({
            dataDir: path.join(__dirname, '../../data')
        });
        this.watchlistManager = new WatchlistManager({
            dataDir: path.join(__dirname, '../../data')
        });
        this.configManager = new ConfigManager();
        this.retentionManager = new DataRetentionManager({
            archive: {
                archivePath: path.join(__dirname, '../../data/archive'),
                tempPath: path.join(__dirname, '../../data/temp')
            }
        });
        this.keyManager = new BookmakerKeyManager({
            dataDir: path.join(__dirname, '../../data'),
            encryptionKey: config.KEY_ENCRYPTION_SECRET || process.env.KEY_ENCRYPTION_SECRET
        });
        this.seasonalityAnalyzer = new SeasonalityAnalyzer({
            dataDir: path.join(__dirname, '../../data')
        });
        this.webhookManager = new WebhookAlertManager(
            path.join(__dirname, '../../data/webhook-config.json')
        );
        this.thirdPartyAPI = new ThirdPartyAPI({
            dataDir: path.join(__dirname, '../../data')
        });
        this.screenshotManager = new ScreenshotManager({
            screenshotsDir: path.join(__dirname, '../../data/screenshots'),
            tempDir: path.join(__dirname, '../../data/temp'),
            retentionDays: 365,
            enableAutoCleanup: true
        });
        this.latestOpportunities = null;
        this.latestMovementAnalysis = null;
        
        // Setup event handlers
        this.setupLiveTrackerEvents();
        this.setupBankrollEvents();
        this.setupSettlementEvents();
        this.setupWebSocketEvents();
        
        // Setup middleware first
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../../web/public')));
        
        // Request logging middleware
        this.app.use(this.requestLogger.bind(this));
        
        this.setupRoutes();
    }
    
    /**
     * Express middleware for logging requests
     */
    requestLogger(req, res, next) {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (this.logger) {
                this.logger.info(`${req.method} ${req.path}`, {
                    category: 'http',
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration,
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('user-agent')
                });
            }
        });
        
        next();
    }

    setupRoutes() {
        // API Routes
        this.app.get('/api/opportunities', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/history', async (req, res) => {
            try {
                const history = await this.loadHistory();
                res.json(history);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/refresh', async (req, res) => {
            try {
                await this.runAnalysis();
                res.json({ success: true, opportunities: this.latestOpportunities });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/forex', async (req, res) => {
            try {
                const forex = await this.fetcher.fetchForexRate();
                res.json(forex);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Promotions API
        this.app.get('/api/promotions', (req, res) => {
            res.json(this.promotions.export());
        });

        this.app.post('/api/promotions', (req, res) => {
            try {
                const promo = this.promotions.addPromotion(req.body);
                res.json({ success: true, promotion: promo });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/combines', (req, res) => {
            try {
                console.log('Received combine data:', JSON.stringify(req.body, null, 2));
                if (!req.body || !req.body.bookmaker) {
                    return res.status(400).json({ error: 'Invalid request body. Required: bookmaker, name, legs' });
                }
                const combine = this.promotions.addCombine(req.body);
                res.json({ success: true, combine });
            } catch (error) {
                console.error('Error adding combine:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Alert Configuration API
        this.app.get('/api/config', (req, res) => {
            try {
                res.json(this.alertConfig.getPublicConfig());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/config', (req, res) => {
            try {
                const success = this.alertConfig.updateConfig(req.body);
                if (success) {
                    res.json({ success: true, config: this.alertConfig.getPublicConfig() });
                } else {
                    res.status(500).json({ error: 'Failed to save configuration' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/config/reset', (req, res) => {
            try {
                const success = this.alertConfig.resetToDefaults();
                if (success) {
                    res.json({ success: true, config: this.alertConfig.getPublicConfig() });
                } else {
                    res.status(500).json({ error: 'Failed to reset configuration' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Filtered opportunities with config applied
        this.app.get('/api/opportunities/filtered', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                // Already filtered by analyzer using alertConfig
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Tax Report API
        this.app.get('/api/reports', async (req, res) => {
            try {
                const reports = await this.taxExporter.listReports();
                res.json(reports);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/reports/generate', async (req, res) => {
            try {
                const { startDate, endDate, format = 'csv' } = req.body;
                const options = {
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                    format
                };
                const filepath = await this.taxExporter.generateReport(options);
                res.json({ success: true, filepath, filename: path.basename(filepath) });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/reports/download/:filename', async (req, res) => {
            try {
                const filepath = this.taxExporter.getReportPath(req.params.filename);
                res.download(filepath);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Odds Movement API
        this.app.get('/api/movements', async (req, res) => {
            try {
                const data = await this.loadMovementData();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/movements/stats', async (req, res) => {
            try {
                const stats = await this.movementTracker.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/movements/alerts', async (req, res) => {
            try {
                const alerts = this.latestMovementAnalysis ? 
                    this.movementTracker.generateAlerts(this.latestMovementAnalysis) : [];
                res.json(alerts);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Live Match Tracking API
        this.app.get('/api/live/matches', async (req, res) => {
            try {
                const matches = this.liveTracker.getActiveMatches();
                res.json({
                    timestamp: new Date().toISOString(),
                    count: matches.length,
                    matches
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/opportunities', async (req, res) => {
            try {
                const opportunities = this.liveTracker.getOpportunities();
                res.json({
                    timestamp: new Date().toISOString(),
                    count: opportunities.length,
                    opportunities
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/stats', async (req, res) => {
            try {
                const stats = this.liveTracker.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/matches/:matchId', async (req, res) => {
            try {
                const match = this.liveTracker.getMatch(req.params.matchId);
                if (!match) {
                    return res.status(404).json({ error: 'Match not found' });
                }
                res.json(match);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/live/start', async (req, res) => {
            try {
                if (!this.liveTracker.isRunning) {
                    await this.liveTracker.init();
                    this.liveTracker.start();
                }
                res.json({ success: true, status: this.liveTracker.getStats() });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/live/stop', async (req, res) => {
            try {
                this.liveTracker.stop();
                res.json({ success: true, status: this.liveTracker.getStats() });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bankroll Management API
        this.app.get('/api/bankroll', async (req, res) => {
            try {
                const summary = this.bankrollManager.getBankrollSummary();
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll', async (req, res) => {
            try {
                const { total, currency } = req.body;
                const result = await this.bankrollManager.setTotalBankroll(total, currency);
                res.json({ success: true, bankroll: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/add-funds', async (req, res) => {
            try {
                const { amount, note } = req.body;
                const result = await this.bankrollManager.addFunds(amount, note);
                res.json({ success: true, bankroll: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/withdraw', async (req, res) => {
            try {
                const { amount, note } = req.body;
                const result = await this.bankrollManager.withdrawFunds(amount, note);
                res.json({ success: true, bankroll: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bookmaker management
        this.app.get('/api/bankroll/bookmakers', async (req, res) => {
            try {
                const summary = this.bankrollManager.getBankrollSummary();
                res.json(summary.bookmakers);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/bookmakers', async (req, res) => {
            try {
                const { name, balance, currency, ...metadata } = req.body;
                const result = await this.bankrollManager.setBookmaker(name, balance, currency, metadata);
                res.json({ success: true, bookmaker: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.put('/api/bankroll/bookmakers/:name', async (req, res) => {
            try {
                const { balance } = req.body;
                const result = await this.bankrollManager.updateBookmakerBalance(req.params.name, balance);
                res.json({ success: true, bookmaker: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/bankroll/bookmakers/:name', async (req, res) => {
            try {
                await this.bankrollManager.removeBookmaker(req.params.name);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Stake calculation
        this.app.post('/api/bankroll/calculate-stakes', async (req, res) => {
            try {
                const { opportunity, type, options } = req.body;
                let result;
                
                if (type === 'arbitrage') {
                    result = this.bankrollManager.calculateArbitrageStakes(opportunity, options);
                } else if (type === 'ev') {
                    result = this.bankrollManager.calculateEVStake(opportunity, options);
                } else {
                    return res.status(400).json({ error: 'Invalid type. Use "arbitrage" or "ev"' });
                }
                
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bet tracking
        this.app.get('/api/bankroll/bets', async (req, res) => {
            try {
                const pending = Array.from(this.bankrollManager.pendingBets.values());
                res.json({ pending, count: pending.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/bets', async (req, res) => {
            try {
                const { betId, ...details } = req.body;
                const result = await this.bankrollManager.placeBet(betId, details);
                res.json({ success: true, bet: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/bets/:id/settle', async (req, res) => {
            try {
                const { result, actualProfit } = req.body;
                const settlement = await this.bankrollManager.settleBet(req.params.id, { result, actualProfit });
                res.json({ success: true, settlement });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/bankroll/bets/:id', async (req, res) => {
            try {
                await this.bankrollManager.cancelBet(req.params.id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Statistics
        this.app.get('/api/bankroll/stats', async (req, res) => {
            try {
                const stats = await this.bankrollManager.getStatistics();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/bankroll/risk-status', async (req, res) => {
            try {
                const status = this.bankrollManager.checkRiskLimits();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Smart Bet Sizing API
        this.app.post('/api/bankroll/smart-stakes/arbitrage', async (req, res) => {
            try {
                const { opportunity, options } = req.body;
                const result = this.bankrollManager.calculateSmartArbitrageStakes(opportunity, options);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/smart-stakes/ev', async (req, res) => {
            try {
                const { opportunity, options } = req.body;
                const result = this.bankrollManager.calculateSmartEVStake(opportunity, options);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/bankroll/smart-stakes/risk-status', async (req, res) => {
            try {
                const status = this.bankrollManager.getSmartRiskStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/bankroll/smart-stakes/config', async (req, res) => {
            try {
                const config = this.bankrollManager.getSmartSizingConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/bankroll/smart-stakes/config', async (req, res) => {
            try {
                this.bankrollManager.updateSmartSizingConfig(req.body);
                const config = this.bankrollManager.getSmartSizingConfig();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Advanced Analytics API
        this.app.get('/api/analytics/dashboard', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getDashboardData(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/summary', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const summary = await this.analytics.getSummaryStats(timeRange);
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/profit', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getProfitOverTime(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/roi/sports', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getROIBySport(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/roi/bookmakers', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getROIByBookmaker(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/frequency', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getOpportunityFrequency(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/success-rate', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getSuccessRate(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/monthly', async (req, res) => {
            try {
                const data = await this.analytics.getMonthlyComparison();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/ev-accuracy', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const data = await this.analytics.getEVAccuracy(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/bookmaker-health', async (req, res) => {
            try {
                const data = await this.analytics.getBookmakerHealth();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/analytics/export', async (req, res) => {
            try {
                const timeRange = req.query.range || '30d';
                const format = req.query.format || 'json';
                const result = await this.analytics.exportAnalytics(format, timeRange);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Visualization Data API
        this.app.get('/api/analytics/visualization-data', async (req, res) => {
            try {
                const range = req.query.range || '30d';
                const data = await this.getVisualizationData(range);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bet Settlement API
        this.app.get('/api/settlements/bets', async (req, res) => {
            try {
                const { status = 'all', range = '30d' } = req.query;
                let bets;
                if (status === 'pending') {
                    bets = this.settlementTracker.getPendingBets();
                } else if (status === 'settled') {
                    bets = this.settlementTracker.getSettledBets(range);
                } else {
                    bets = [...this.settlementTracker.getPendingBets(), ...this.settlementTracker.getSettledBets(range)];
                }
                res.json({ bets, count: bets.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/settlements/bets/:id', async (req, res) => {
            try {
                const bet = this.settlementTracker.getBet(req.params.id);
                if (!bet) {
                    return res.status(404).json({ error: 'Bet not found' });
                }
                res.json(bet);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/settlements/bets', async (req, res) => {
            try {
                const bet = await this.settlementTracker.registerBet(req.body);
                res.json({ success: true, bet });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/settlements/bets/:id/settle', async (req, res) => {
            try {
                const result = await this.settlementTracker.settleBet(req.params.id, req.body);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/settlements/bets/:id/cancel', async (req, res) => {
            try {
                const bet = await this.settlementTracker.cancelBet(req.params.id, req.body.reason);
                res.json({ success: true, bet });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/settlements/stats', async (req, res) => {
            try {
                const range = req.query.range || '30d';
                const stats = await this.settlementTracker.getStatistics(range);
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/settlements/attention', async (req, res) => {
            try {
                const maxAge = parseInt(req.query.maxAge) || 24;
                const bets = this.settlementTracker.getPendingBetsNeedingAttention(maxAge);
                res.json({ bets, count: bets.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/settlements/reconciliation', async (req, res) => {
            try {
                const range = req.query.range || '30d';
                const report = await this.settlementTracker.getReconciliationReport(range);
                res.json(report);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/settlements/export', async (req, res) => {
            try {
                const range = req.query.range || '30d';
                const csv = await this.settlementTracker.exportToCSV(range);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="settlements_${range}_${new Date().toISOString().split('T')[0]}.csv"`);
                res.send(csv);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/settlements/check', async (req, res) => {
            try {
                const result = await this.settlementTracker.checkPendingBets();
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/settlements/arbitrage', async (req, res) => {
            try {
                const result = await this.settlementTracker.registerArbitrageBet(req.body);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Opportunity Quality Scoring API
        this.app.get('/api/quality/config', async (req, res) => {
            try {
                const config = this.analyzer.qualityScorer.getConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/quality/score', async (req, res) => {
            try {
                const { opportunity, type = 'arbitrage' } = req.body;
                const score = type === 'arbitrage' 
                    ? this.analyzer.qualityScorer.scoreArbitrageOpportunity(opportunity)
                    : this.analyzer.qualityScorer.scoreEVOpportunity(opportunity);
                res.json(score);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/quality/score-batch', async (req, res) => {
            try {
                const { opportunities, type = 'arbitrage' } = req.body;
                const scored = this.analyzer.qualityScorer.scoreAndRankOpportunities(opportunities, type);
                res.json({ opportunities: scored, count: scored.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/quality/distribution', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                const arbDist = this.analyzer.qualityScorer.getQualityDistribution(data.arbitrage || [], 'arbitrage');
                const evDist = this.analyzer.qualityScorer.getQualityDistribution(data.positiveEV || [], 'ev');
                res.json({ arbitrage: arbDist, ev: evDist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/quality/weights', async (req, res) => {
            try {
                this.analyzer.qualityScorer.updateWeights(req.body);
                const config = this.analyzer.qualityScorer.getConfig();
                res.json({ success: true, weights: config.weights });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/quality/record-outcome', async (req, res) => {
            try {
                const { opportunity, outcome } = req.body;
                await this.analyzer.qualityScorer.recordOutcome(opportunity, outcome);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bookmaker Health Monitoring API
        this.app.get('/api/health/status', async (req, res) => {
            try {
                const status = this.analyzer.healthMonitor.getAllHealthStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/status/:bookmaker', async (req, res) => {
            try {
                const status = this.analyzer.healthMonitor.getHealthStatus(req.params.bookmaker);
                if (!status) {
                    return res.status(404).json({ error: 'Bookmaker not found' });
                }
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/summary', async (req, res) => {
            try {
                const summary = this.analyzer.healthMonitor.getHealthSummary();
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/trends/:bookmaker', async (req, res) => {
            try {
                const hours = parseInt(req.query.hours) || 24;
                const trends = this.analyzer.healthMonitor.getPerformanceTrends(req.params.bookmaker, hours);
                if (!trends) {
                    return res.status(404).json({ error: 'No data available for bookmaker' });
                }
                res.json(trends);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/by-status/:status', async (req, res) => {
            try {
                const bookmakers = this.analyzer.healthMonitor.getBookmakersByStatus(req.params.status);
                res.json({ status: req.params.status, bookmakers });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/health/record', async (req, res) => {
            try {
                const { bookmaker, responseTime, errorRate, dataFreshness, success, error } = req.body;
                const result = await this.analyzer.healthMonitor.recordHealthCheck(bookmaker, {
                    responseTime,
                    errorRate,
                    dataFreshness,
                    success,
                    error
                });
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/config', async (req, res) => {
            try {
                const config = this.analyzer.healthMonitor.getConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/health/config', async (req, res) => {
            try {
                this.analyzer.healthMonitor.updateConfig(req.body);
                const config = this.analyzer.healthMonitor.getConfig();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/health/bookmaker/:name/enable', async (req, res) => {
            try {
                const { enabled } = req.body;
                this.analyzer.healthMonitor.setBookmakerEnabled(req.params.name, enabled);
                res.json({ success: true, name: req.params.name, enabled });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/health/clear-history', async (req, res) => {
            try {
                await this.analyzer.healthMonitor.clearHistory();
                res.json({ success: true, message: 'Health history cleared' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/export', async (req, res) => {
            try {
                const format = req.query.format || 'json';
                const data = await this.analyzer.healthMonitor.exportData(format);
                
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="health_export_${new Date().toISOString().split('T')[0]}.csv"`);
                    res.send(data);
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', `attachment; filename="health_export_${new Date().toISOString().split('T')[0]}.json"`);
                    res.send(data);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Multi-Currency API
        this.app.get('/api/currency/stats', async (req, res) => {
            try {
                const stats = this.bankrollManager.currencyManager.getCurrencyStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/currency/rates', async (req, res) => {
            try {
                const rates = this.bankrollManager.currencyManager.rates;
                res.json({
                    base: this.bankrollManager.currencyManager.config.baseCurrency,
                    rates,
                    lastUpdated: this.bankrollManager.currencyManager.rateHistory.length > 0
                        ? this.bankrollManager.currencyManager.rateHistory[this.bankrollManager.currencyManager.rateHistory.length - 1].timestamp
                        : null
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/currency/refresh-rates', async (req, res) => {
            try {
                await this.bankrollManager.currencyManager.refreshRates();
                res.json({ success: true, rates: this.bankrollManager.currencyManager.rates });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/currency/convert', async (req, res) => {
            try {
                const { amount, from, to } = req.body;
                const converted = this.bankrollManager.currencyManager.convert(amount, from, to);
                res.json({
                    original: { amount, currency: from },
                    converted: { amount: converted, currency: to },
                    rate: this.bankrollManager.currencyManager.rates[to] / this.bankrollManager.currencyManager.rates[from]
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/currency/forex-impact', async (req, res) => {
            try {
                const range = req.query.range || '30d';
                const impact = this.bankrollManager.currencyManager.getForexImpactSummary(range);
                res.json(impact);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/currency/transaction', async (req, res) => {
            try {
                const transaction = await this.bankrollManager.currencyManager.recordTransaction(req.body);
                res.json({ success: true, transaction });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/currency/transactions', async (req, res) => {
            try {
                const { currency, type, limit = 100 } = req.query;
                let transactions = this.bankrollManager.currencyManager.transactions;
                
                if (currency) {
                    transactions = transactions.filter(t => t.currency === currency);
                }
                if (type) {
                    transactions = transactions.filter(t => t.type === type);
                }
                
                transactions = transactions.slice(-parseInt(limit));
                res.json({ transactions, count: transactions.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/currency/bookmaker', async (req, res) => {
            try {
                const { bookmaker, currency, balance } = req.body;
                const account = await this.bankrollManager.currencyManager.addBookmakerAccount(bookmaker, currency, { balance });
                res.json({ success: true, account });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/currency/config', async (req, res) => {
            try {
                const config = this.bankrollManager.currencyManager.getConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/currency/config', async (req, res) => {
            try {
                await this.bankrollManager.currencyManager.updateConfig(req.body);
                const config = this.bankrollManager.currencyManager.getConfig();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/currency/export', async (req, res) => {
            try {
                const format = req.query.format || 'json';
                const data = await this.bankrollManager.currencyManager.exportData(format);
                
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="currency_export_${new Date().toISOString().split('T')[0]}.csv"`);
                    res.send(data);
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', `attachment; filename="currency_export_${new Date().toISOString().split('T')[0]}.json"`);
                    res.send(data);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Logging and Audit API
        this.app.get('/api/logs/stats', async (req, res) => {
            try {
                if (!this.logger) {
                    return res.status(503).json({ error: 'Logger not initialized' });
                }
                const stats = this.logger.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/logs/search', async (req, res) => {
            try {
                if (!this.logger) {
                    return res.status(503).json({ error: 'Logger not initialized' });
                }
                const { level, category, searchText, startTime, endTime, limit = 100 } = req.query;
                const results = await this.logger.search({
                    level: level ? parseInt(level) : undefined,
                    category,
                    searchText,
                    startTime,
                    endTime,
                    limit: parseInt(limit)
                });
                res.json({ results, count: results.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/logs/recent-errors', async (req, res) => {
            try {
                if (!this.logger) {
                    return res.status(503).json({ error: 'Logger not initialized' });
                }
                const limit = parseInt(req.query.limit) || 10;
                const stats = this.logger.getStats();
                res.json({ errors: stats.recentErrors.slice(-limit) });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/logs/level', async (req, res) => {
            try {
                if (!this.logger) {
                    return res.status(503).json({ error: 'Logger not initialized' });
                }
                const { level } = req.body;
                const validLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
                if (!validLevels.includes(level)) {
                    return res.status(400).json({ error: `Invalid level. Use: ${validLevels.join(', ')}` });
                }
                this.logger.config.level = require('../logger.js').LogLevel[level];
                res.json({ success: true, level });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Audit Trail API
        this.app.get('/api/audit/search', async (req, res) => {
            try {
                if (!this.audit) {
                    return res.status(503).json({ error: 'Audit trail not initialized' });
                }
                const { action, type, startTime, endTime, limit = 100 } = req.query;
                const results = await this.audit.search({
                    action,
                    type,
                    startTime,
                    endTime,
                    limit: parseInt(limit)
                });
                res.json({ results, count: results.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/audit/stats', async (req, res) => {
            try {
                if (!this.audit) {
                    return res.status(503).json({ error: 'Audit trail not initialized' });
                }
                const timeRange = req.query.range || '24h';
                const stats = await this.audit.getStats(timeRange);
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/audit/recent', async (req, res) => {
            try {
                if (!this.audit) {
                    return res.status(503).json({ error: 'Audit trail not initialized' });
                }
                const limit = parseInt(req.query.limit) || 50;
                const results = await this.audit.search({ limit });
                res.json({ results, count: results.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/audit/bets', async (req, res) => {
            try {
                if (!this.audit) {
                    return res.status(503).json({ error: 'Audit trail not initialized' });
                }
                const results = await this.audit.search({ type: 'bet', limit: 100 });
                res.json({ results, count: results.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/audit/opportunities', async (req, res) => {
            try {
                if (!this.audit) {
                    return res.status(503).json({ error: 'Audit trail not initialized' });
                }
                const results = await this.audit.search({ type: 'opportunity', limit: 100 });
                res.json({ results, count: results.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // State Persistence API
        this.app.get('/api/state', async (req, res) => {
            try {
                const state = this.statePersistence.getState();
                res.json(state);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/state/session', async (req, res) => {
            try {
                const stats = this.statePersistence.getSessionStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/state/save', async (req, res) => {
            try {
                const success = await this.statePersistence.save('manual');
                res.json({ success, timestamp: new Date().toISOString() });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/state/backups', async (req, res) => {
            try {
                const backups = await this.statePersistence.listBackups();
                res.json({ backups, count: backups.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/state/restore/:index', async (req, res) => {
            try {
                const index = parseInt(req.params.index);
                const success = await this.statePersistence.restoreFromBackup(index);
                res.json({ success, restoredFrom: index });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/state/clear', async (req, res) => {
            try {
                const success = await this.statePersistence.clearAll();
                res.json({ success, message: 'All state cleared' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Metrics and Monitoring API
        this.app.get('/metrics', async (req, res) => {
            try {
                const prometheusMetrics = this.metrics.getPrometheusMetrics();
                res.setHeader('Content-Type', 'text/plain');
                res.send(prometheusMetrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/metrics/summary', async (req, res) => {
            try {
                const summary = this.metrics.getMetricsSummary();
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health', async (req, res) => {
            try {
                const health = this.metrics.getHealthStatus();
                const statusCode = health.status === 'healthy' ? 200 : 
                                  health.status === 'degraded' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health/ready', async (req, res) => {
            try {
                const health = this.metrics.getHealthStatus();
                if (health.status === 'healthy' || health.status === 'degraded') {
                    res.json({ ready: true, status: health.status });
                } else {
                    res.status(503).json({ ready: false, status: health.status });
                }
            } catch (error) {
                res.status(503).json({ ready: false, error: error.message });
            }
        });

        this.app.get('/api/health/live', async (req, res) => {
            try {
                res.json({ alive: true, timestamp: new Date().toISOString() });
            } catch (error) {
                res.status(500).json({ alive: false, error: error.message });
            }
        });

        this.app.get('/api/metrics/performance', async (req, res) => {
            try {
                const performance = await this.metrics.getPerformanceMetrics();
                res.json(performance);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/metrics/trends', async (req, res) => {
            try {
                const timeRange = req.query.range || '1h';
                const trends = this.metrics.getTrends(timeRange);
                res.json(trends);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/metrics/record-opportunity', async (req, res) => {
            try {
                const { type, opportunity } = req.body;
                this.metrics.recordOpportunity(type, opportunity);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/metrics/record-bet', async (req, res) => {
            try {
                const { bet, result } = req.body;
                this.metrics.recordBet(bet, result);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/metrics/record-api-call', async (req, res) => {
            try {
                const { bookmaker, duration, success } = req.body;
                this.metrics.recordApiCall(bookmaker, duration, success);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/metrics/record-error', async (req, res) => {
            try {
                const { type, message } = req.body;
                this.metrics.recordError(type, message);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/metrics/reset', async (req, res) => {
            try {
                this.metrics.reset();
                res.json({ success: true, message: 'Metrics reset' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Opportunity Export and Sharing API
        this.app.get('/api/opportunities/export/json', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                const opportunities = [...data.arbitrage, ...data.positiveEV];
                const json = await this.exporter.exportToJSON(opportunities, req.query);
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="opportunities_${new Date().toISOString().split('T')[0]}.json"`);
                res.send(json);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/opportunities/export/csv', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                const opportunities = [...data.arbitrage, ...data.positiveEV];
                const csv = await this.exporter.exportToCSV(opportunities, req.query);
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="opportunities_${new Date().toISOString().split('T')[0]}.csv"`);
                res.send(csv);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/opportunities/export/excel', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                const opportunities = [...data.arbitrage, ...data.positiveEV];
                const excelData = await this.exporter.exportToExcelData(opportunities);
                
                res.json(excelData);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/opportunities/export/pdf', async (req, res) => {
            try {
                const data = await this.loadLatestData();
                const opportunities = [...data.arbitrage, ...data.positiveEV];
                const html = await this.exporter.exportToPDF(opportunities, req.query);
                
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Content-Disposition', `attachment; filename="opportunities_${new Date().toISOString().split('T')[0]}.html"`);
                res.send(html);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/opportunities/share', async (req, res) => {
            try {
                const { opportunityIds, expiresInHours = 24, password } = req.body;
                const data = await this.loadLatestData();
                const allOpportunities = [...data.arbitrage, ...data.positiveEV];
                const selected = allOpportunities.filter(o => opportunityIds.includes(o.id));
                
                if (selected.length === 0) {
                    return res.status(404).json({ error: 'No opportunities found with given IDs' });
                }
                
                const shareLink = this.exporter.createShareableLink(selected, {
                    expiresInHours,
                    password,
                    baseUrl: `${req.protocol}://${req.get('host')}`
                });
                
                res.json({ success: true, shareLink });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/share/:linkId', async (req, res) => {
            try {
                const { password } = req.query;
                const result = this.exporter.getSharedOpportunities(req.params.linkId, password);
                
                if (result.error) {
                    return res.status(404).json(result);
                }
                
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/opportunities/share/telegram', async (req, res) => {
            try {
                const { opportunityIds, message } = req.body;
                const data = await this.loadLatestData();
                const allOpportunities = [...data.arbitrage, ...data.positiveEV];
                const selected = allOpportunities.filter(o => opportunityIds.includes(o.id));
                
                if (selected.length === 0) {
                    return res.status(404).json({ error: 'No opportunities found with given IDs' });
                }
                
                const result = await this.exporter.shareViaTelegram(selected, { message });
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/opportunities/share/email', async (req, res) => {
            try {
                const { opportunityIds, email, subject, message } = req.body;
                const data = await this.loadLatestData();
                const allOpportunities = [...data.arbitrage, ...data.positiveEV];
                const selected = allOpportunities.filter(o => opportunityIds.includes(o.id));
                
                if (selected.length === 0) {
                    return res.status(404).json({ error: 'No opportunities found with given IDs' });
                }
                
                const result = await this.exporter.shareViaEmail(selected, email, { subject, message });
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/opportunities/shares', async (req, res) => {
            try {
                const links = this.exporter.getActiveShareLinks();
                res.json({ links, count: links.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/opportunities/shares/:linkId', async (req, res) => {
            try {
                const success = this.exporter.revokeShareLink(req.params.linkId);
                res.json({ success, revoked: req.params.linkId });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/opportunities/export/history', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const history = this.exporter.getExportHistory(limit);
                res.json({ history, count: history.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // ML Odds Prediction API
        this.app.get('/api/ml/predictions', async (req, res) => {
            try {
                const predictions = this.mlPredictor.getAllPredictions();
                res.json({ predictions, count: predictions.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ml/predictions/:eventId', async (req, res) => {
            try {
                const predictions = await this.mlPredictor.getEventPredictions(req.params.eventId);
                res.json({ predictions, count: predictions.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/ml/predict', async (req, res) => {
            try {
                const { event, bookmaker, market, outcome } = req.body;
                const result = await this.mlPredictor.predictOdds(event, bookmaker, market, outcome);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/ml/predict-arbitrage', async (req, res) => {
            try {
                const { events } = req.body;
                const predictions = await this.mlPredictor.predictArbitrageOpportunities(events);
                res.json({ predictions, count: predictions.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ml/stats', async (req, res) => {
            try {
                const stats = this.mlPredictor.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ml/accuracy', async (req, res) => {
            try {
                const evaluation = await this.mlPredictor.evaluateAccuracy();
                res.json(evaluation);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ml/export', async (req, res) => {
            try {
                const format = req.query.format || 'json';
                const data = await this.mlPredictor.exportPredictions(format);
                
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="ml_predictions_${new Date().toISOString().split('T')[0]}.csv"`);
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', `attachment; filename="ml_predictions_${new Date().toISOString().split('T')[0]}.json"`);
                }
                res.send(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/ml/record-odds', async (req, res) => {
            try {
                const { eventId, bookmaker, market, odds, timestamp } = req.body;
                await this.mlPredictor.recordOdds(eventId, bookmaker, market, odds, timestamp);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Watchlist API
        this.app.get('/api/watchlist/bookmarks', async (req, res) => {
            try {
                const result = this.watchlistManager.getAllBookmarks(req.query);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/bookmarks', async (req, res) => {
            try {
                const { opportunity, notes } = req.body;
                const bookmark = this.watchlistManager.bookmarkOpportunity(opportunity, notes);
                res.json({ success: true, bookmark });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/watchlist/bookmarks/:id', async (req, res) => {
            try {
                const bookmark = this.watchlistManager.getBookmark(req.params.id);
                if (!bookmark) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json(bookmark);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/bookmarks/:id', async (req, res) => {
            try {
                const success = this.watchlistManager.removeBookmark(req.params.id);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.patch('/api/watchlist/bookmarks/:id/status', async (req, res) => {
            try {
                const { status, details } = req.body;
                const bookmark = this.watchlistManager.updateBookmarkStatus(req.params.id, status, details);
                if (!bookmark) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json({ success: true, bookmark });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.patch('/api/watchlist/bookmarks/:id/notes', async (req, res) => {
            try {
                const { notes } = req.body;
                const bookmark = this.watchlistManager.updateNotes(req.params.id, notes);
                if (!bookmark) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json({ success: true, bookmark });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/bookmarks/:id/tags', async (req, res) => {
            try {
                const { tags } = req.body;
                const bookmark = this.watchlistManager.addTags(req.params.id, tags);
                if (!bookmark) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json({ success: true, bookmark });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/bookmarks/:id/tags', async (req, res) => {
            try {
                const { tags } = req.body;
                const bookmark = this.watchlistManager.removeTags(req.params.id, tags);
                if (!bookmark) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json({ success: true, bookmark });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Watchlists
        this.app.get('/api/watchlist/lists', async (req, res) => {
            try {
                const lists = this.watchlistManager.getAllWatchlists(req.query);
                res.json({ watchlists: lists, count: lists.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/lists', async (req, res) => {
            try {
                const { name, ...options } = req.body;
                const watchlist = this.watchlistManager.createWatchlist(name, options);
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/watchlist/lists/:name', async (req, res) => {
            try {
                const watchlist = this.watchlistManager.getWatchlist(req.params.name);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json(watchlist);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.patch('/api/watchlist/lists/:name', async (req, res) => {
            try {
                const watchlist = this.watchlistManager.updateWatchlist(req.params.name, req.body);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/lists/:name', async (req, res) => {
            try {
                const success = this.watchlistManager.deleteWatchlist(req.params.name);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/lists/:name/teams', async (req, res) => {
            try {
                const { teams } = req.body;
                const watchlist = this.watchlistManager.addTeams(req.params.name, teams);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/lists/:name/teams', async (req, res) => {
            try {
                const { teams } = req.body;
                const watchlist = this.watchlistManager.removeTeams(req.params.name, teams);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/lists/:name/leagues', async (req, res) => {
            try {
                const { leagues } = req.body;
                const watchlist = this.watchlistManager.addLeagues(req.params.name, leagues);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/lists/:name/leagues', async (req, res) => {
            try {
                const { leagues } = req.body;
                const watchlist = this.watchlistManager.removeLeagues(req.params.name, leagues);
                if (!watchlist) {
                    return res.status(404).json({ error: 'Watchlist not found' });
                }
                res.json({ success: true, watchlist });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Price alerts
        this.app.post('/api/watchlist/price-alerts', async (req, res) => {
            try {
                const { bookmarkId, targetOdds, direction } = req.body;
                const alert = this.watchlistManager.setPriceAlert(bookmarkId, targetOdds, direction);
                if (!alert) {
                    return res.status(404).json({ error: 'Bookmark not found' });
                }
                res.json({ success: true, alert });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/watchlist/price-alerts/:bookmarkId', async (req, res) => {
            try {
                const success = this.watchlistManager.removePriceAlert(req.params.bookmarkId);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Notifications
        this.app.get('/api/watchlist/notifications', async (req, res) => {
            try {
                const result = this.watchlistManager.getNotifications(req.query);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/notifications/read', async (req, res) => {
            try {
                const { ids } = req.body;
                this.watchlistManager.markAsRead(ids);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/notifications/read-all', async (req, res) => {
            try {
                this.watchlistManager.markAllAsRead();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Stats and export
        this.app.get('/api/watchlist/stats', async (req, res) => {
            try {
                const stats = this.watchlistManager.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/watchlist/export', async (req, res) => {
            try {
                const format = req.query.format || 'json';
                const data = await this.watchlistManager.exportData(format);
                
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="watchlist_${new Date().toISOString().split('T')[0]}.csv"`);
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', `attachment; filename="watchlist_${new Date().toISOString().split('T')[0]}.json"`);
                }
                res.send(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/watchlist/import', async (req, res) => {
            try {
                const { data } = req.body;
                await this.watchlistManager.importData(data);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Seasonality and Trend Analysis API
        this.app.get('/api/seasonality/analysis', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const data = await this.seasonalityAnalyzer.getSeasonalityAnalysis(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/day-of-week', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const data = await this.seasonalityAnalyzer.getDayOfWeekAnalysis(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/time-of-day', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const data = await this.seasonalityAnalyzer.getTimeOfDayAnalysis(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/seasonal', async (req, res) => {
            try {
                const timeRange = req.query.range || '365d';
                const data = await this.seasonalityAnalyzer.getSeasonalAnalysis(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/sport-trends', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const data = await this.seasonalityAnalyzer.getSportTrends(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/peak-hours', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const data = await this.seasonalityAnalyzer.getPeakHours(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/sport-seasonality', async (req, res) => {
            try {
                const timeRange = req.query.range || '365d';
                const data = await this.seasonalityAnalyzer.getSportSeasonality(timeRange);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/predictions', async (req, res) => {
            try {
                const data = await this.seasonalityAnalyzer.getTrendPredictions();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/seasonality/report', async (req, res) => {
            try {
                const timeRange = req.query.range || '90d';
                const report = await this.seasonalityAnalyzer.generateReport(timeRange);
                res.json(report);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Analytics Dashboard Page
        this.app.get('/analytics', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/analytics.html'));
        });

        // Visualization Dashboard Page
        this.app.get('/visualization', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/visualization.html'));
        });

        // Settlement Tracker Page
        this.app.get('/settlements', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/settlements.html'));
        });

        // Health Monitor Page
        this.app.get('/health', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/health.html'));
        });

        // Configuration Page
        this.app.get('/config', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/config.html'));
        });

        // Seasonality Analysis Page
        this.app.get('/seasonality', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/seasonality.html'));
        });

        // Main dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/index.html'));
        });

        // Bookmaker Key Management API
        this.setupKeyManagementRoutes();

        // Configuration Management API
        this.setupConfigRoutes();

        // Third-Party API Integration
        this.setupThirdPartyAPIRoutes();

        // Screenshot Management API
        this.setupScreenshotRoutes();
    }

    setupThirdPartyAPIRoutes() {
        // Initialize third-party API with services
        this.thirdPartyAPI.setupRoutes(this.app, {
            loadLatestData: this.loadLatestData.bind(this),
            analytics: this.analytics,
            settlementTracker: this.settlementTracker
        });
    }

    setupScreenshotRoutes() {
        // List screenshots with filtering
        this.app.get('/api/screenshots', async (req, res) => {
            try {
                const filters = {
                    type: req.query.type,
                    bookmaker: req.query.bookmaker,
                    betId: req.query.betId,
                    startDate: req.query.startDate,
                    endDate: req.query.endDate,
                    search: req.query.search,
                    limit: req.query.limit ? parseInt(req.query.limit) : undefined
                };
                const screenshots = this.screenshotManager.listScreenshots(filters);
                res.json({ screenshots, count: screenshots.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get screenshot statistics
        this.app.get('/api/screenshots/stats', async (req, res) => {
            try {
                const stats = this.screenshotManager.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific screenshot metadata
        this.app.get('/api/screenshots/:id', async (req, res) => {
            try {
                const screenshot = this.screenshotManager.getScreenshot(req.params.id);
                if (!screenshot) {
                    return res.status(404).json({ error: 'Screenshot not found' });
                }
                res.json(screenshot);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // View screenshot (HTML wrapper for iframe)
        this.app.get('/api/screenshots/:id/view', async (req, res) => {
            try {
                const screenshot = this.screenshotManager.getScreenshot(req.params.id);
                if (!screenshot) {
                    return res.status(404).json({ error: 'Screenshot not found' });
                }
                
                const fs = require('fs');
                const path = require('path');
                const imagePath = path.join(this.screenshotManager.config.screenshotsDir, screenshot.filename);
                const imageData = fs.readFileSync(imagePath, 'base64');
                
                const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1a1a2e; }
                            img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                        </style>
                    </head>
                    <body>
                        <img src="data:image/png;base64,${imageData}" alt="Screenshot" />
                    </body>
                    </html>
                `;
                
                res.setHeader('Content-Type', 'text/html');
                res.send(html);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Download screenshot file
        this.app.get('/api/screenshots/:id/download', async (req, res) => {
            try {
                const screenshotPath = this.screenshotManager.getScreenshotPath(req.params.id);
                if (!screenshotPath) {
                    return res.status(404).json({ error: 'Screenshot not found' });
                }
                const screenshot = this.screenshotManager.getScreenshot(req.params.id);
                res.download(screenshotPath, screenshot.filename);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Delete screenshot
        this.app.delete('/api/screenshots/:id', async (req, res) => {
            try {
                const result = await this.screenshotManager.deleteScreenshot(req.params.id);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export screenshots as ZIP
        this.app.post('/api/screenshots/export/zip', async (req, res) => {
            try {
                const { ids, filters, includeThumbnails } = req.body;
                const result = await this.screenshotManager.exportAsZip({
                    ids,
                    filters,
                    includeThumbnails
                });
                
                if (!result.success) {
                    return res.status(400).json(result);
                }
                
                res.download(result.filepath, result.filename, (err) => {
                    if (err) {
                        // Handle download error silently
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export screenshots as PDF
        this.app.post('/api/screenshots/export/pdf', async (req, res) => {
            try {
                const { ids, filters, title, includeMetadata } = req.body;
                const result = await this.screenshotManager.exportAsPdf({
                    ids,
                    filters,
                    title,
                    includeMetadata
                });
                
                if (!result.success) {
                    return res.status(400).json(result);
                }
                
                res.download(result.filepath, result.filename, (err) => {
                    if (err) {
                        // Handle download error silently
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export screenshot metadata as CSV
        this.app.post('/api/screenshots/export/csv', async (req, res) => {
            try {
                const { ids, filters } = req.body;
                const result = await this.screenshotManager.exportAsCsv({
                    ids,
                    filters
                });
                
                if (!result.success) {
                    return res.status(400).json(result);
                }
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                res.send(result.csv);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get screenshots for a specific bet
        this.app.get('/api/bets/:betId/screenshots', async (req, res) => {
            try {
                const screenshots = this.screenshotManager.getScreenshotsForBet(req.params.betId);
                res.json({ screenshots, count: screenshots.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Create dispute ticket
        this.app.post('/api/disputes', async (req, res) => {
            try {
                const { betId, bookmaker, issue, description, screenshotIds, priority } = req.body;
                const result = await this.screenshotManager.createDisputeTicket({
                    betId,
                    bookmaker,
                    issue,
                    description,
                    screenshotIds,
                    priority
                });
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get dispute ticket
        this.app.get('/api/disputes/:id', async (req, res) => {
            try {
                const ticket = this.screenshotManager.getDisputeTicket(req.params.id);
                if (!ticket) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }
                res.json(ticket);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // List dispute tickets
        this.app.get('/api/disputes', async (req, res) => {
            try {
                const filters = {
                    status: req.query.status,
                    bookmaker: req.query.bookmaker,
                    priority: req.query.priority,
                    betId: req.query.betId
                };
                const disputes = this.screenshotManager.listDisputes(filters);
                res.json({ disputes, count: disputes.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update dispute status
        this.app.patch('/api/disputes/:id/status', async (req, res) => {
            try {
                const { status, details } = req.body;
                const result = await this.screenshotManager.updateDisputeStatus(req.params.id, status, details);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Run cleanup manually
        this.app.post('/api/screenshots/cleanup', async (req, res) => {
            try {
                const result = await this.screenshotManager.runCleanup();
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Gallery page
        this.app.get('/gallery', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/gallery.html'));
        });
    }

    setupConfigRoutes() {
        // Get full configuration (public - no sensitive data)
        this.app.get('/api/config-manager', (req, res) => {
            try {
                res.json(this.configManager.getPublicConfig());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get configuration schema/structure
        this.app.get('/api/config-manager/schema', (req, res) => {
            try {
                res.json(this.configManager.getConfigSchema());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update full configuration
        this.app.post('/api/config-manager', (req, res) => {
            try {
                const success = this.configManager.updateConfig(req.body);
                if (success) {
                    // Validate the new config
                    const validation = this.configManager.validateConfig();
                    res.json({ 
                        success: true, 
                        config: this.configManager.getPublicConfig(),
                        validation
                    });
                } else {
                    res.status(500).json({ error: 'Failed to save configuration' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update specific section
        this.app.patch('/api/config-manager/:section', (req, res) => {
            try {
                const { section } = req.params;
                const success = this.configManager.updateSection(section, req.body);
                if (success) {
                    res.json({ 
                        success: true, 
                        section,
                        config: this.configManager.getPublicConfig()
                    });
                } else {
                    res.status(400).json({ error: `Invalid section: ${section}` });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Reset to defaults
        this.app.post('/api/config-manager/reset', (req, res) => {
            try {
                const success = this.configManager.resetToDefaults();
                if (success) {
                    res.json({ 
                        success: true, 
                        message: 'Configuration reset to defaults',
                        config: this.configManager.getPublicConfig()
                    });
                } else {
                    res.status(500).json({ error: 'Failed to reset configuration' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Validate current configuration
        this.app.get('/api/config-manager/validate', (req, res) => {
            try {
                const validation = this.configManager.validateConfig();
                res.json(validation);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export configuration
        this.app.get('/api/config-manager/export', (req, res) => {
            try {
                const format = req.query.format || 'json';
                const result = this.configManager.exportConfig(format);
                
                if (result) {
                    res.setHeader('Content-Type', result.contentType);
                    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                    res.send(result.content);
                } else {
                    res.status(400).json({ error: 'Invalid export format' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Import configuration
        this.app.post('/api/config-manager/import', (req, res) => {
            try {
                const success = this.configManager.importConfig(req.body);
                if (success) {
                    const validation = this.configManager.validateConfig();
                    res.json({ 
                        success: true, 
                        message: 'Configuration imported successfully',
                        config: this.configManager.getPublicConfig(),
                        validation
                    });
                } else {
                    res.status(500).json({ error: 'Failed to import configuration' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific section
        this.app.get('/api/config-manager/:section', (req, res) => {
            try {
                const { section } = req.params;
                const config = this.configManager.getPublicConfig();
                
                if (config[section]) {
                    res.json(config[section]);
                } else {
                    res.status(404).json({ error: `Section not found: ${section}` });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Data Retention API
        this.setupRetentionRoutes();
    }

    setupRetentionRoutes() {
        // Get retention configuration
        this.app.get('/api/retention/config', (req, res) => {
            try {
                const config = this.retentionManager.getConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update retention configuration
        this.app.post('/api/retention/config', (req, res) => {
            try {
                const config = this.retentionManager.updateConfig(req.body);
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get archive statistics
        this.app.get('/api/retention/stats', async (req, res) => {
            try {
                const stats = await this.retentionManager.getArchiveStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Run cleanup manually
        this.app.post('/api/retention/cleanup', async (req, res) => {
            try {
                const result = await this.retentionManager.runCleanup();
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Run full archive manually
        this.app.post('/api/retention/archive', async (req, res) => {
            try {
                const result = await this.retentionManager.runFullArchive();
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Restore archived file
        this.app.post('/api/retention/restore', async (req, res) => {
            try {
                const { fileName, dataType, destinationPath } = req.body;
                const result = await this.retentionManager.restoreFile(fileName, dataType, destinationPath);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export archived data by date range
        this.app.get('/api/retention/export', async (req, res) => {
            try {
                const { dataType, startDate, endDate } = req.query;
                const start = new Date(startDate);
                const end = new Date(endDate);
                const result = await this.retentionManager.exportArchive(dataType, start, end);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get data types
        this.app.get('/api/retention/data-types', (req, res) => {
            try {
                const { DATA_TYPES } = require('../data-retention-manager');
                res.json(DATA_TYPES);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Start scheduled tasks
        this.app.post('/api/retention/start', (req, res) => {
            try {
                this.retentionManager.startScheduledTasks();
                res.json({ success: true, message: 'Scheduled tasks started' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Stop scheduled tasks
        this.app.post('/api/retention/stop', (req, res) => {
            try {
                this.retentionManager.stopScheduledTasks();
                res.json({ success: true, message: 'Scheduled tasks stopped' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupKeyManagementRoutes() {
        // Get all keys
        this.app.get('/api/keys', async (req, res) => {
            try {
                const keys = this.keyManager.getAllKeys();
                const stats = this.keyManager.getSystemStats();
                res.json({ keys, stats });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get available bookmakers
        this.app.get('/api/keys/available', async (req, res) => {
            try {
                const bookmakers = this.keyManager.getAvailableBookmakers();
                res.json({ bookmakers });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific key
        this.app.get('/api/keys/:bookmakerId', async (req, res) => {
            try {
                const key = this.keyManager.getKey(req.params.bookmakerId);
                if (!key) {
                    return res.status(404).json({ error: 'Key not found' });
                }
                res.json(key);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Add or update key
        this.app.post('/api/keys/:bookmakerId', async (req, res) => {
            try {
                const key = await this.keyManager.addKey(req.params.bookmakerId, req.body);
                res.json({ success: true, key });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update key status
        this.app.patch('/api/keys/:bookmakerId/status', async (req, res) => {
            try {
                const key = await this.keyManager.updateKeyStatus(req.params.bookmakerId, req.body);
                res.json({ success: true, key });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Test key connection
        this.app.post('/api/keys/:bookmakerId/test', async (req, res) => {
            try {
                const result = await this.keyManager.testKey(req.params.bookmakerId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Test all keys
        this.app.post('/api/keys/test-all', async (req, res) => {
            try {
                const results = await this.keyManager.testAllKeys();
                res.json({ results });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Rotate key
        this.app.post('/api/keys/:bookmakerId/rotate', async (req, res) => {
            try {
                const key = await this.keyManager.rotateKey(req.params.bookmakerId, req.body);
                res.json({ success: true, key });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Delete key
        this.app.delete('/api/keys/:bookmakerId', async (req, res) => {
            try {
                const result = await this.keyManager.deleteKey(req.params.bookmakerId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get key stats
        this.app.get('/api/keys/:bookmakerId/stats', async (req, res) => {
            try {
                const stats = this.keyManager.getKeyStats(req.params.bookmakerId);
                if (!stats) {
                    return res.status(404).json({ error: 'Key not found' });
                }
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get rate limit status
        this.app.get('/api/keys/:bookmakerId/rate-limit', async (req, res) => {
            try {
                const status = this.keyManager.getRateLimitStatus(req.params.bookmakerId);
                if (!status) {
                    return res.status(404).json({ error: 'Key not found' });
                }
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get system-wide stats
        this.app.get('/api/keys/stats/system', async (req, res) => {
            try {
                const stats = this.keyManager.getSystemStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Key Management UI page
        this.app.get('/keys', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/keys.html'));
        });

        // Setup webhook routes
        this.setupWebhookRoutes();
    }

    setupLiveTrackerEvents() {
        // Handle new live opportunities
        this.liveTracker.on('opportunity', (opp) => {
            console.log(`🔴 LIVE ARBITRAGE: ${opp.eventName} - ${opp.profitPercent}% profit (${opp.urgency} urgency)`);
            
            // Send Telegram notification for high-urgency opportunities
            if (opp.urgency === 'HIGH' && this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_CHAT_ID) {
                this.sendLiveOpportunityAlert(opp);
            }
        });

        // Handle match start
        this.liveTracker.on('matchStarted', (match) => {
            console.log(`▶️  Live match started: ${match.eventName} (${match.sport})`);
        });

        // Handle match end
        this.liveTracker.on('matchEnded', (match) => {
            console.log(`⏹️  Live match ended: ${match.eventName}`);
        });

        // Handle odds changes
        this.liveTracker.on('oddsChange', ({ matchId, changes }) => {
            if (changes.length > 0) {
                console.log(`📊 Odds changed in match ${matchId}: ${changes.length} changes`);
            }
        });

        // Handle errors
        this.liveTracker.on('error', (error) => {
            console.error('Live tracker error:', error.message);
        });
    }

    setupBankrollEvents() {
        // Handle bankroll updates
        this.bankrollManager.on('bankrollUpdated', (data) => {
            console.log(`💰 Bankroll updated: ${data.total} ${data.currency}`);
        });

        this.bankrollManager.on('fundsAdded', (data) => {
            console.log(`➕ Funds added: ${data.amount} ${data.note ? `(${data.note})` : ''}`);
        });

        this.bankrollManager.on('fundsWithdrawn', (data) => {
            console.log(`➖ Funds withdrawn: ${data.amount} ${data.note ? `(${data.note})` : ''}`);
        });

        this.bankrollManager.on('bookmakerUpdated', (data) => {
            console.log(`🏦 Bookmaker updated: ${data.name} = ${data.balance}`);
        });

        this.bankrollManager.on('betPlaced', (data) => {
            console.log(`📝 Bet placed: ${data.betId} - ${data.event} (${data.stakes.length} legs)`);
        });

        this.bankrollManager.on('betSettled', (data) => {
            const emoji = data.actualProfit >= 0 ? '✅' : '❌';
            console.log(`${emoji} Bet settled: ${data.betId} - Profit: ${data.actualProfit}`);
        });

        this.bankrollManager.on('betCancelled', (data) => {
            console.log(`🚫 Bet cancelled: ${data.betId}`);
        });
    }

    setupSettlementEvents() {
        // Handle settlement tracker events
        if (!this.settlementTracker) return;
        
        this.settlementTracker.on('betSettled', (data) => {
            console.log(`✅ Bet settled: ${data.betId}, Profit: ${data.profit}`);
            // Broadcast to WebSocket if available
            if (this.wsServer) {
                this.wsServer.broadcastAlert({
                    type: 'betSettled',
                    ...data
                });
            }
        });
        
        this.settlementTracker.on('betPending', (data) => {
            console.log(`⏳ Bet pending: ${data.betId}`);
        });
    }

    setupWebSocketEvents() {
        // Handle WebSocket client connections
        this.wsServer.on('clientConnected', (data) => {
            console.log(`🔌 WebSocket client ${data.clientId} connected`);
        });

        this.wsServer.on('clientDisconnected', (data) => {
            console.log(`🔌 WebSocket client ${data.clientId} disconnected`);
        });

        // Forward live tracker events to WebSocket clients
        this.liveTracker.on('opportunity', (opp) => {
            this.wsServer.broadcastLiveArbitrage(opp);
        });

        this.liveTracker.on('matchStarted', (match) => {
            this.wsServer.broadcastLiveMatch({
                ...match,
                event: 'matchStarted'
            });
        });

        this.liveTracker.on('matchEnded', (match) => {
            this.wsServer.broadcastLiveMatch({
                ...match,
                event: 'matchEnded'
            });
        });

        this.liveTracker.on('oddsChange', (data) => {
            this.wsServer.broadcastOddsMovement({
                type: 'liveOddsChange',
                ...data
            });
        });

        // Forward bankroll events
        this.bankrollManager.on('bankrollUpdated', (data) => {
            this.wsServer.broadcastBankrollUpdate(data);
        });

        this.bankrollManager.on('betPlaced', (data) => {
            this.wsServer.broadcastAlert({
                type: 'betPlaced',
                severity: 'info',
                message: `Bet placed: ${data.event}`,
                data
            });
        });

        this.bankrollManager.on('betSettled', (data) => {
            this.wsServer.broadcastAlert({
                type: 'betSettled',
                severity: data.actualProfit >= 0 ? 'success' : 'warning',
                message: `Bet settled: ${data.actualProfit >= 0 ? '+' : ''}${data.actualProfit}`,
                data
            });
        });
    }

    async sendLiveOpportunityAlert(opp) {
        const axios = require('axios');
        
        let message = '🔴 *LIVE ARBITRAGE ALERT*\n\n';
        message += `*${opp.eventName}*\n`;
        message += `Sport: ${opp.sport.toUpperCase()}\n`;
        message += `Status: ${opp.status}`;
        if (opp.score && Object.keys(opp.score).length > 0) {
            message += ` | Score: ${JSON.stringify(opp.score)}`;
        }
        message += '\n';
        message += `Period: ${opp.period}\n`;
        message += `Time Remaining: ~${opp.timeRemaining} min\n`;
        message += `Profit: *${opp.profitPercent}%*\n`;
        message += `Urgency: ${opp.urgency}\n\n`;
        
        message += '*Bets to place:*\n';
        for (const leg of opp.legs) {
            message += `• ${leg.outcome} @ ${leg.bookmaker} (${leg.odds})\n`;
        }
        
        message += '\n⚡ Act fast - live odds change rapidly!';

        try {
            await axios.post(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: this.config.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Live opportunity alert failed:', error.message);
        }
    }

    async loadMovementData() {
        const analysisFile = path.join(__dirname, '../../data/movement-analysis.json');
        try {
            const data = await fs.readFile(analysisFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return { 
                error: 'No movement analysis available yet', 
                timestamp: new Date().toISOString(),
                movements: [],
                arbitrageFromMovements: [],
                evFromMovements: [],
                summary: { totalMovements: 0, significantMovements: 0, newArbitrage: 0, newEV: 0 }
            };
        }
    }

    async loadLatestData() {
        const cacheFile = path.join(__dirname, '../../data/cache/latest.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            const parsed = JSON.parse(data);
            const opportunities = this.analyzer.analyze(parsed);
            this.latestOpportunities = opportunities;
            return opportunities;
        } catch (error) {
            return { error: 'No data available yet', timestamp: new Date().toISOString() };
        }
    }

    async loadHistory() {
        const cacheDir = path.join(__dirname, '../../data/cache');
        try {
            const files = await fs.readdir(cacheDir);
            const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'latest.json');
            
            const history = [];
            for (const file of jsonFiles.slice(-10)) { // Last 10 files
                const data = await fs.readFile(path.join(cacheDir, file), 'utf8');
                const parsed = JSON.parse(data);
                const opportunities = this.analyzer.analyze(parsed);
                history.push({
                    timestamp: parsed.timestamp,
                    arbitrageCount: opportunities.arbitrage.length,
                    evCount: opportunities.positiveEV.length
                });
            }
            return history;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get visualization data for the analytics dashboard
     * @param {string} range - Time range (7d, 30d, 90d, 1y, all)
     * @returns {Object} Visualization data including stats and chart data
     */
    async getVisualizationData(range = '30d') {
        const cacheDir = path.join(__dirname, '../../data/cache');
        const dataDir = path.join(__dirname, '../../data');
        
        // Parse range to get cutoff date
        const now = new Date();
        let cutoffDate = new Date(0); // Default to all time
        
        switch (range) {
            case '7d':
                cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1y':
                cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
            default:
                cutoffDate = new Date(0);
        }

        try {
            // Load historical data from cache files
            const files = await fs.readdir(cacheDir).catch(() => []);
            const jsonFiles = files.filter(f => f.startsWith('data_') && f.endsWith('.json'));
            
            const profitTrend = [];
            const sportsDistribution = {};
            const bookmakerStats = {};
            const hourlyActivity = {};
            
            let totalProfit = 0;
            let totalOpportunities = 0;
            let totalArbitrage = 0;
            let totalEV = 0;
            
            // Process cache files within range
            const filesToProcess = jsonFiles.slice(-50); // Last 50 files for performance
            
            for (const file of filesToProcess) {
                try {
                    const data = await fs.readFile(path.join(cacheDir, file), 'utf8');
                    const parsed = JSON.parse(data);
                    const fileDate = new Date(parsed.timestamp);
                    
                    if (fileDate < cutoffDate) continue;
                    
                    const opportunities = this.analyzer.analyze(parsed);
                    
                    // Profit trend data
                    const dateKey = fileDate.toISOString().split('T')[0];
                    const dailyProfit = opportunities.arbitrage.reduce((sum, arb) => sum + (arb.profitPercent || 0), 0);
                    
                    profitTrend.push({
                        date: dateKey,
                        profit: Math.round(dailyProfit * 100) / 100,
                        arbitrage: opportunities.arbitrage.length,
                        ev: opportunities.positiveEV.length
                    });
                    
                    // Sports distribution
                    opportunities.arbitrage.forEach(arb => {
                        sportsDistribution[arb.sport] = (sportsDistribution[arb.sport] || 0) + 1;
                    });
                    opportunities.positiveEV.forEach(ev => {
                        sportsDistribution[ev.sport] = (sportsDistribution[ev.sport] || 0) + 1;
                    });
                    
                    // Bookmaker stats
                    opportunities.arbitrage.forEach(arb => {
                        arb.legs.forEach(leg => {
                            if (!bookmakerStats[leg.bookmaker]) {
                                bookmakerStats[leg.bookmaker] = { count: 0, profit: 0 };
                            }
                            bookmakerStats[leg.bookmaker].count++;
                            bookmakerStats[leg.bookmaker].profit += arb.profitPercent || 0;
                        });
                    });
                    
                    // Hourly activity
                    const hour = fileDate.getHours();
                    const day = fileDate.toLocaleDateString('en-US', { weekday: 'short' });
                    const activityKey = `${day}-${hour}`;
                    hourlyActivity[activityKey] = (hourlyActivity[activityKey] || 0) + opportunities.arbitrage.length + opportunities.positiveEV.length;
                    
                    totalArbitrage += opportunities.arbitrage.length;
                    totalEV += opportunities.positiveEV.length;
                    
                } catch (e) {
                    // Skip corrupted files
                    continue;
                }
            }
            
            totalOpportunities = totalArbitrage + totalEV;
            
            // Calculate average profit
            const avgProfit = totalOpportunities > 0 
                ? Math.round((profitTrend.reduce((sum, p) => sum + p.profit, 0) / profitTrend.length) * 100) / 100
                : 0;
            
            // Format opportunity distribution
            const opportunityDistribution = Object.entries(sportsDistribution)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);
            
            // Format bookmaker performance
            const bookmakerPerformance = Object.entries(bookmakerStats)
                .map(([name, stats]) => ({ 
                    name, 
                    profit: Math.round(stats.profit * 100) / 100,
                    count: stats.count
                }))
                .sort((a, b) => b.profit - a.profit);
            
            // Format activity heatmap
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const activityHeatmap = [];
            for (const day of days) {
                for (let hour = 0; hour < 24; hour++) {
                    const key = `${day}-${hour}`;
                    activityHeatmap.push({
                        day,
                        hour,
                        value: hourlyActivity[key] || 0
                    });
                }
            }
            
            // Get active bookmakers count
            const activeBookmakers = Object.keys(bookmakerStats).length;
            
            // Calculate changes (mock for now - would compare with previous period)
            const profitChange = profitTrend.length > 1 
                ? Math.round(((profitTrend[profitTrend.length - 1]?.profit || 0) - (profitTrend[0]?.profit || 0)) * 100) / 100
                : 0;
            
            return {
                stats: {
                    totalProfit: Math.round(totalProfit * 100) / 100,
                    totalOpportunities,
                    avgProfit,
                    activeBookmakers,
                    profitChange,
                    opportunityChange: totalOpportunities,
                    avgChange: 0
                },
                profitTrend: profitTrend.sort((a, b) => new Date(a.date) - new Date(b.date)),
                opportunityDistribution,
                bookmakerPerformance,
                activityHeatmap
            };
            
        } catch (error) {
            this.logger?.error('Failed to get visualization data', { error: error.message, category: 'analytics' });
            
            // Return empty data structure on error
            return {
                stats: {
                    totalProfit: 0,
                    totalOpportunities: 0,
                    avgProfit: 0,
                    activeBookmakers: 0,
                    profitChange: 0,
                    opportunityChange: 0,
                    avgChange: 0
                },
                profitTrend: [],
                opportunityDistribution: [],
                bookmakerPerformance: [],
                activityHeatmap: []
            };
        }
    }

    async runAnalysis() {
        this.logger?.info('Running manual analysis...', { category: 'analysis' });
        console.log('Running manual analysis...');
        const data = await this.fetcher.fetchAll();
        const opportunities = this.analyzer.analyze(data);
        this.latestOpportunities = opportunities;
        
        this.logger?.info('Analysis complete', { 
            category: 'analysis',
            arbitrageCount: opportunities.arbitrage.length,
            evCount: opportunities.positiveEV.length
        });
        
        // Record analysis in state persistence
        this.statePersistence.recordAnalysis(
            opportunities.arbitrage.length + opportunities.positiveEV.length
        );
        
        // Update active opportunities in state
        this.statePersistence.updateActiveOpportunities([
            ...opportunities.arbitrage,
            ...opportunities.positiveEV
        ]);
        
        // Record opportunities in audit trail
        for (const arb of opportunities.arbitrage.slice(0, 5)) {
            await this.audit?.recordOpportunityDetected({
                id: arb.id,
                event: arb.event,
                profit: arb.profitPercent,
                ev: arb.profitPercent,
                bookmakers: arb.legs.map(l => l.bookmaker)
            });
            
            // Record metrics
            this.metrics.recordOpportunity('arbitrage', arb);
        }
        
        for (const ev of opportunities.positiveEV.slice(0, 5)) {
            this.metrics.recordOpportunity('ev', ev);
        }
        
        // Run odds movement analysis
        this.logger?.info('Running odds movement analysis...', { category: 'analysis' });
        console.log('Running odds movement analysis...');
        try {
            this.latestMovementAnalysis = await this.movementTracker.analyze(data);
            this.logger?.info('Movement analysis complete', { 
                category: 'analysis',
                significantMovements: this.latestMovementAnalysis.summary.significantMovements,
                newArbitrage: this.latestMovementAnalysis.summary.newArbitrage,
                newEV: this.latestMovementAnalysis.summary.newEV
            });
            console.log(`Movement analysis complete: ${this.latestMovementAnalysis.summary.significantMovements} significant movements, ${this.latestMovementAnalysis.summary.newArbitrage} new arbitrage, ${this.latestMovementAnalysis.summary.newEV} new EV`);
        } catch (error) {
            this.logger?.error('Movement analysis failed', { error: error.message, category: 'analysis' });
            console.error('Movement analysis failed:', error.message);
        }
        
        // Send Telegram notification if configured
        if (this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_CHAT_ID) {
            await this.sendTelegramNotification(opportunities);
            
            // Also send movement alerts
            if (this.latestMovementAnalysis) {
                await this.sendMovementAlerts(this.latestMovementAnalysis);
            }
        }
        
        // Broadcast new opportunities via WebSocket
        if (this.wsServer) {
            // Broadcast arbitrage opportunities
            for (const arb of opportunities.arbitrage.slice(0, 5)) {
                this.wsServer.broadcastArbitrage(arb);
            }
            
            // Broadcast +EV opportunities
            for (const ev of opportunities.positiveEV.slice(0, 5)) {
                this.wsServer.broadcastPositiveEV(ev);
            }
        }
        
        return opportunities;
    }

    async sendTelegramNotification(opportunities) {
        const axios = require('axios');
        
        // Filter opportunities based on alert configuration
        const alertConfig = this.alertConfig.config;
        
        const highValueArbs = opportunities.arbitrage.filter(a => 
            this.alertConfig.shouldSendTelegramAlert(a, 'arbitrage')
        );
        
        const highValueEV = opportunities.positiveEV.filter(e => 
            this.alertConfig.shouldSendTelegramAlert(e, 'ev')
        );
        
        if (highValueArbs.length === 0 && highValueEV.length === 0) return;

        let message = '🎯 *Surebet Detector Alert*\n\n';
        
        if (highValueArbs.length > 0) {
            message += `*${highValueArbs.length} High-Value Arbitrage Opportunities*\n\n`;
            for (const arb of highValueArbs.slice(0, 3)) {
                message += `📊 *${arb.event}*\n`;
                message += `Profit: ${arb.profitPercent}%\n`;
                for (const leg of arb.legs) {
                    message += `  • ${leg.outcome} @ ${leg.bookmaker} (${leg.odds})\n`;
                }
                message += '\n';
            }
        }

        if (highValueEV.length > 0) {
            message += `*${highValueEV.length} High-Value +EV Opportunities*\n\n`;
            for (const ev of highValueEV.slice(0, 3)) {
                message += `💰 ${ev.outcome} @ ${ev.bookmaker}\n`;
                message += `Odds: ${ev.odds} | EV: +${ev.evPercent}%\n\n`;
            }
        }

        try {
            await axios.post(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: this.config.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Telegram notification failed:', error.message);
        }
    }

    async sendMovementAlerts(movementAnalysis) {
        const axios = require('axios');
        
        const alerts = this.movementTracker.generateAlerts(movementAnalysis);
        
        // Only send high priority alerts
        const highPriorityAlerts = alerts.filter(a => a.priority === 'high');
        
        if (highPriorityAlerts.length === 0) return;

        for (const alert of highPriorityAlerts.slice(0, 3)) { // Max 3 alerts
            try {
                await axios.post(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: this.config.TELEGRAM_CHAT_ID,
                    text: alert.message,
                    parse_mode: 'Markdown'
                });
                // Small delay between messages
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('Movement alert failed:', error.message);
            }
        }
    }

    // Webhook Alert Routes
    setupWebhookRoutes() {
        // Get webhook configuration
        this.app.get('/api/webhooks/config', (req, res) => {
            try {
                res.json(this.webhookManager.getConfig());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update webhook configuration
        this.app.post('/api/webhooks/config', (req, res) => {
            try {
                const success = this.webhookManager.updateConfig(req.body);
                res.json({ success, config: this.webhookManager.getConfig() });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get webhook status summary
        this.app.get('/api/webhooks/status', (req, res) => {
            try {
                res.json(this.webhookManager.getWebhookStatus());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Add Discord webhook
        this.app.post('/api/webhooks/discord', (req, res) => {
            try {
                const { name, url, ...options } = req.body;
                const result = this.webhookManager.addDiscordWebhook(name, url, options);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Add Slack webhook
        this.app.post('/api/webhooks/slack', (req, res) => {
            try {
                const { name, url, ...options } = req.body;
                const result = this.webhookManager.addSlackWebhook(name, url, options);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Add custom webhook endpoint
        this.app.post('/api/webhooks/custom', (req, res) => {
            try {
                const { name, url, ...options } = req.body;
                const result = this.webhookManager.addCustomEndpoint(name, url, options);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Delete webhook
        this.app.delete('/api/webhooks/:type/:id', (req, res) => {
            try {
                const { type, id } = req.params;
                this.webhookManager.removeWebhook(type, id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Enable/disable webhook
        this.app.patch('/api/webhooks/:type/:id', (req, res) => {
            try {
                const { type, id } = req.params;
                const { enabled } = req.body;
                const success = this.webhookManager.setWebhookEnabled(type, id, enabled);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Test webhook
        this.app.post('/api/webhooks/:type/:id/test', async (req, res) => {
            try {
                const { type, id } = req.params;
                const result = await this.webhookManager.testWebhook(type, id);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get delivery log
        this.app.get('/api/webhooks/deliveries', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                res.json(this.webhookManager.getDeliveryLog(limit));
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get delivery statistics
        this.app.get('/api/webhooks/stats', (req, res) => {
            try {
                res.json(this.webhookManager.getDeliveryStats());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Send manual alert (for testing)
        this.app.post('/api/webhooks/send-alert', async (req, res) => {
            try {
                const { opportunity, type = 'arbitrage' } = req.body;
                const result = await this.webhookManager.sendAlert(opportunity, type);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    start() {
        const port = this.config.PORT || 3000;
        
        const server = this.app.listen(port, async () => {
            this.logger?.info(`Dashboard running at http://localhost:${port}`, { category: 'server', port });
            console.log(`Dashboard running at http://localhost:${port}`);
            
            // Initialize state persistence first
            try {
                const restored = await this.statePersistence.init();
                if (restored) {
                    this.logger?.info('Previous state restored', { category: 'state' });
                    // Restore bankroll state if available
                    if (this.statePersistence.state.bankroll) {
                        this.logger?.info('Bankroll state restored', { 
                            category: 'state',
                            total: this.statePersistence.state.bankroll.totalBankroll 
                        });
                    }
                }
            } catch (error) {
                this.logger?.error('Failed to initialize state persistence', { error: error.message, category: 'state' });
            }
            
            // Initialize metrics collector
            try {
                await this.metrics.init();
                this.logger?.info('Metrics collector initialized', { category: 'metrics' });
                
                // Set up metrics event handlers
                this.metrics.on('snapshot', (snapshot) => {
                    this.wsServer?.broadcastMetrics?.(snapshot);
                });
            } catch (error) {
                this.logger?.error('Failed to initialize metrics collector', { error: error.message, category: 'metrics' });
            }
            
            // Initialize opportunity exporter
            try {
                await this.exporter.loadHistory();
                this.logger?.info('Opportunity exporter initialized', { category: 'export' });
            } catch (error) {
                this.logger?.error('Failed to initialize opportunity exporter', { error: error.message, category: 'export' });
            }
            
            // Initialize bankroll manager
            try {
                await this.bankrollManager.init();
                const summary = this.bankrollManager.getBankrollSummary();
                this.logger?.info('Bankroll manager initialized', { 
                    category: 'bankroll', 
                    total: summary.totalBankroll,
                    currency: summary.currency,
                    bookmakers: summary.bookmakerCount 
                });
                console.log(`💰 Bankroll: ${summary.totalBankroll} ${summary.currency} across ${summary.bookmakerCount} bookmakers`);
            } catch (error) {
                this.logger?.error('Failed to initialize bankroll manager', { error: error.message, category: 'bankroll' });
                console.error('Failed to initialize bankroll manager:', error.message);
            }
            
            // Initialize live tracker
            try {
                await this.liveTracker.init();
                this.logger?.info('Live Match Tracker initialized', { category: 'live' });
                console.log('📡 Live Match Tracker initialized');
                
                // Auto-start live tracking if configured
                if (this.config.LIVE_TRACKING_AUTO_START === 'true') {
                    this.liveTracker.start();
                    this.logger?.info('Live tracking auto-started', { category: 'live' });
                }
            } catch (error) {
                this.logger?.error('Failed to initialize live tracker', { error: error.message, category: 'live' });
                console.error('Failed to initialize live tracker:', error.message);
            }
            
            // Initialize WebSocket server (attached to HTTP server)
            try {
                await this.wsServer.init(server);
                this.logger?.info('WebSocket server initialized', { category: 'websocket' });
                console.log('🔌 WebSocket server initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize WebSocket server', { error: error.message, category: 'websocket' });
                console.error('Failed to initialize WebSocket server:', error.message);
            }
            
            // Initialize settlement tracker
            try {
                await this.settlementTracker.init();
                this.logger?.info('Bet Settlement Tracker initialized', { category: 'settlement' });
                console.log('✅ Bet Settlement Tracker initialized');
                
                // Start auto-checker if configured
                if (this.config.SETTLEMENT_AUTO_CHECK === 'true') {
                    this.settlementTracker.start();
                    this.logger?.info('Settlement auto-checker started', { category: 'settlement' });
                }
            } catch (error) {
                this.logger?.error('Failed to initialize settlement tracker', { error: error.message, category: 'settlement' });
                console.error('Failed to initialize settlement tracker:', error.message);
            }
            
            // Initialize ML Odds Predictor
            try {
                await this.mlPredictor.init();
                this.logger?.info('ML Odds Predictor initialized', { category: 'ml' });
                console.log('🤖 ML Odds Predictor initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize ML predictor', { error: error.message, category: 'ml' });
                console.error('Failed to initialize ML predictor:', error.message);
            }
            
            // Initialize Watchlist Manager
            try {
                await this.watchlistManager.init();
                this.logger?.info('Watchlist Manager initialized', { category: 'watchlist' });
                console.log('📋 Watchlist Manager initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize watchlist manager', { error: error.message, category: 'watchlist' });
                console.error('Failed to initialize watchlist manager:', error.message);
            }
            
            // Initialize Data Retention Manager
            try {
                await this.retentionManager.initialize();
                this.retentionManager.startScheduledTasks();
                this.logger?.info('Data Retention Manager initialized', { category: 'retention' });
                console.log('🗄️ Data Retention Manager initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize retention manager', { error: error.message, category: 'retention' });
                console.error('Failed to initialize retention manager:', error.message);
            }

            // Initialize Bookmaker Key Manager
            try {
                await this.keyManager.initialize();
                this.logger?.info('Bookmaker Key Manager initialized', { category: 'keys' });
                console.log('🔑 Bookmaker Key Manager initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize key manager', { error: error.message, category: 'keys' });
                console.error('Failed to initialize key manager:', error.message);
            }

            // Initialize Third-Party API
            try {
                await this.thirdPartyAPI.init();
                this.logger?.info('Third-Party API initialized', { category: 'api' });
                console.log('🔌 Third-Party API initialized');
            } catch (error) {
                this.logger?.error('Failed to initialize third-party API', { error: error.message, category: 'api' });
                console.error('Failed to initialize third-party API:', error.message);
            }
        });

        // Schedule automatic updates
        if (this.config.UPDATE_CRON) {
            cron.schedule(this.config.UPDATE_CRON, async () => {
                this.logger?.info('Running scheduled update', { category: 'scheduler' });
                console.log('Running scheduled update...');
                try {
                    await this.runAnalysis();
                    this.logger?.info('Scheduled update completed', { category: 'scheduler' });
                } catch (error) {
                    this.logger?.error('Scheduled update failed', { error: error.message, category: 'scheduler' });
                    console.error('Scheduled update failed:', error);
                }
            });
            this.logger?.info(`Scheduled updates: ${this.config.UPDATE_CRON}`, { category: 'scheduler', cron: this.config.UPDATE_CRON });
            console.log(`Scheduled updates: ${this.config.UPDATE_CRON}`);
        }
    }
    
    async stop() {
        this.logger?.info('Stopping dashboard...', { category: 'shutdown' });
        console.log('Stopping dashboard...');
        
        // Save final state before stopping
        try {
            // Update state with current data
            const bankrollSummary = this.bankrollManager.getBankrollSummary();
            this.statePersistence.updateBankroll(bankrollSummary);
            
            const pendingBets = Array.from(this.bankrollManager.pendingBets.values());
            this.statePersistence.updatePendingBets(pendingBets);
            
            if (this.latestOpportunities) {
                this.statePersistence.updateActiveOpportunities([
                    ...this.latestOpportunities.arbitrage,
                    ...this.latestOpportunities.positiveEV
                ]);
            }
            
            // Prepare shutdown (saves state)
            await this.statePersistence.prepareShutdown();
            this.logger?.info('State saved for shutdown', { category: 'shutdown' });
        } catch (error) {
            this.logger?.error('Failed to save state during shutdown', { error: error.message, category: 'shutdown' });
        }
        
        this.liveTracker.stop();
        this.wsServer.stop();
        this.settlementTracker.stop();
        this.retentionManager.stopScheduledTasks();
        
        // Shutdown metrics collector
        try {
            await this.metrics.shutdown();
            this.logger?.info('Metrics collector shutdown', { category: 'shutdown' });
        } catch (error) {
            this.logger?.error('Failed to shutdown metrics collector', { error: error.message, category: 'shutdown' });
        }
        
        // Save exporter history
        try {
            await this.exporter.saveHistory();
            this.logger?.info('Exporter history saved', { category: 'shutdown' });
        } catch (error) {
            this.logger?.error('Failed to save exporter history', { error: error.message, category: 'shutdown' });
        }
        
        this.logger?.info('Dashboard stopped', { category: 'shutdown' });
    }
}

module.exports = WebDashboard;
