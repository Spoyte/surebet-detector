const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');

const OddsFetcher = require('../fetcher');
const OpportunityAnalyzer = require('../analyzer');
const PromotionsTracker = require('../promotions');

class WebDashboard {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.fetcher = new OddsFetcher(config);
        this.analyzer = new OpportunityAnalyzer(config);
        this.promotions = new PromotionsTracker();
        this.latestOpportunities = null;
        
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

        // Main dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../web/index.html'));
        });
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
        
        // Send Telegram notification if configured
        if (this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_CHAT_ID) {
            await this.sendTelegramNotification(opportunities);
        }
        
        return opportunities;
    }

    async sendTelegramNotification(opportunities) {
        const axios = require('axios');
        
        const highValueArbs = opportunities.arbitrage.filter(a => a.profitPercent >= 2);
        const highValueEV = opportunities.positiveEV.filter(e => e.evPercent >= this.config.MIN_EV_THRESHOLD);
        
        if (highValueArbs.length === 0 && highValueEV.length === 0) return;

        let message = '🎯 *Surebet Detector Alert*\n\n';
        
        if (highValueArbs.length > 0) {
            message += `*${highValueArbs.length} Arbitrage Opportunities*\n\n`;
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
            message += `*${highValueEV.length} +EV Opportunities*\n\n`;
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
