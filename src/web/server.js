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

class WebDashboard {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.fetcher = new OddsFetcher(config);
        this.analyzer = new OpportunityAnalyzer(config);
        this.promotions = new PromotionsTracker();
        this.alertConfig = new AlertConfig();
        this.taxExporter = new TaxExporter();
        this.movementTracker = new OddsMovementTracker(config);
        this.latestOpportunities = null;
        this.latestMovementAnalysis = null;
        
        // Setup middleware first
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../../web/public')));
        
        this.setupRoutes();
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

        // Main dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/index.html'));
        });
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

    async runAnalysis() {
        console.log('Running manual analysis...');
        const data = await this.fetcher.fetchAll();
        const opportunities = this.analyzer.analyze(data);
        this.latestOpportunities = opportunities;
        
        // Run odds movement analysis
        console.log('Running odds movement analysis...');
        try {
            this.latestMovementAnalysis = await this.movementTracker.analyze(data);
            console.log(`Movement analysis complete: ${this.latestMovementAnalysis.summary.significantMovements} significant movements, ${this.latestMovementAnalysis.summary.newArbitrage} new arbitrage, ${this.latestMovementAnalysis.summary.newEV} new EV`);
        } catch (error) {
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

    start() {
        const port = this.config.PORT || 3000;
        
        this.app.listen(port, () => {
            console.log(`Dashboard running at http://localhost:${port}`);
        });

        // Schedule automatic updates
        if (this.config.UPDATE_CRON) {
            cron.schedule(this.config.UPDATE_CRON, async () => {
                console.log('Running scheduled update...');
                try {
                    await this.runAnalysis();
                } catch (error) {
                    console.error('Scheduled update failed:', error);
                }
            });
            console.log(`Scheduled updates: ${this.config.UPDATE_CRON}`);
        }
    }
}

module.exports = WebDashboard;
