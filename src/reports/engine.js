/**
 * Report Generation Engine
 * Generates daily, weekly, and monthly reports
 */

const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class ReportEngine {
    constructor(db) {
        this.db = db;
        this.reportsDir = path.join(__dirname, '../../reports');
        this.ensureDirectory();
    }
    
    async ensureDirectory() {
        try {
            await fs.mkdir(this.reportsDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create reports directory:', error);
        }
    }
    
    /**
     * Generate a report
     */
    async generateReport(type, options = {}) {
        const { startDate, endDate, format = 'pdf' } = options;
        
        const data = await this.collectData(type, startDate, endDate);
        const charts = await this.generateCharts(data);
        
        let report;
        switch (format) {
            case 'pdf':
                report = await this.generatePDF(type, data, charts);
                break;
            case 'html':
                report = await this.generateHTML(type, data, charts);
                break;
            case 'csv':
                report = await this.generateCSV(type, data);
                break;
            case 'json':
                report = await this.generateJSON(type, data);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
        
        // Save report
        const filename = this.generateFilename(type, format);
        const filepath = path.join(this.reportsDir, filename);
        await fs.writeFile(filepath, report);
        
        // Log report generation
        await this.logReport(type, format, filename, data);
        
        return {
            filename,
            filepath,
            type,
            format,
            generatedAt: new Date().toISOString(),
            summary: this.generateSummary(data)
        };
    }
    
    /**
     * Collect data for report
     */
    async collectData(type, startDate, endDate) {
        const now = new Date();
        let start, end;
        
        switch (type) {
            case 'daily':
                start = startDate || new Date(now - 24 * 60 * 60 * 1000);
                end = endDate || now;
                break;
            case 'weekly':
                start = startDate || new Date(now - 7 * 24 * 60 * 60 * 1000);
                end = endDate || now;
                break;
            case 'monthly':
                start = startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = endDate || new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            default:
                start = startDate || new Date(now - 24 * 60 * 60 * 1000);
                end = endDate || now;
        }
        
        const data = {
            type,
            period: { start: start.toISOString(), end: end.toISOString() },
            opportunities: await this.getOpportunities(start, end),
            bets: await this.getBets(start, end),
            settlements: await this.getSettlements(start, end),
            pnl: await this.getPnL(start, end),
            bookmakerStats: await this.getBookmakerStats(start, end),
            sportStats: await this.getSportStats(start, end),
            alerts: await this.getAlerts(start, end)
        };
        
        return data;
    }
    
    async getOpportunities(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM opportunities 
                 WHERE timestamp >= ? AND timestamp <= ?
                 ORDER BY timestamp DESC`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    async getBets(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM bets 
                 WHERE placed_at >= ? AND placed_at <= ?
                 ORDER BY placed_at DESC`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    async getSettlements(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM settlements 
                 WHERE settled_at >= ? AND settled_at <= ?
                 ORDER BY settled_at DESC`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    async getPnL(start, end) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT 
                    COUNT(*) as total_bets,
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
                    SUM(actual_profit) as total_profit,
                    SUM(stake) as total_stake,
                    AVG(actual_profit / stake * 100) as avg_roi
                 FROM settlements 
                 WHERE settled_at >= ? AND settled_at <= ?`,
                [start.toISOString(), end.toISOString()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || {
                        total_bets: 0, wins: 0, losses: 0,
                        total_profit: 0, total_stake: 0, avg_roi: 0
                    });
                }
            );
        });
    }
    
    async getBookmakerStats(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    bookmaker,
                    COUNT(*) as bets,
                    SUM(stake) as stake,
                    SUM(actual_profit) as profit
                 FROM settlements 
                 WHERE settled_at >= ? AND settled_at <= ?
                 GROUP BY bookmaker
                 ORDER BY profit DESC`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    async getSportStats(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    sport,
                    COUNT(*) as bets,
                    SUM(stake) as stake,
                    SUM(actual_profit) as profit
                 FROM settlements s
                 JOIN bets b ON s.bet_id = b.id
                 WHERE s.settled_at >= ? AND s.settled_at <= ?
                 GROUP BY sport
                 ORDER BY profit DESC`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    async getAlerts(start, end) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM alerts 
                 WHERE created_at >= ? AND created_at <= ?
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [start.toISOString(), end.toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    /**
     * Generate charts for report
     */
    async generateCharts(data) {
        const charts = {};
        
        // Profit trend chart
        charts.profitTrend = await this.createProfitTrendChart(data);
        
        // Bookmaker performance chart
        charts.bookmakerPerformance = await this.createBookmakerChart(data);
        
        // Sport distribution chart
        charts.sportDistribution = await this.createSportChart(data);
        
        return charts;
    }
    
    async createProfitTrendChart(data) {
        const canvas = createCanvas(600, 300);
        const ctx = canvas.getContext('2d');
        
        // Simple line chart data
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const values = [12, 19, 15, 25, 22, 30, 28];
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Daily Profit (€)',
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#334155' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
        
        return canvas.toDataURL();
    }
    
    async createBookmakerChart(data) {
        const canvas = createCanvas(400, 300);
        const ctx = canvas.getContext('2d');
        
        const bookmakers = data.bookmakerStats.slice(0, 5);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bookmakers.map(b => b.bookmaker),
                datasets: [{
                    label: 'Profit (€)',
                    data: bookmakers.map(b => b.profit),
                    backgroundColor: '#3b82f6'
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
        
        return canvas.toDataURL();
    }
    
    async createSportChart(data) {
        const canvas = createCanvas(300, 300);
        const ctx = canvas.getContext('2d');
        
        const sports = data.sportStats;
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sports.map(s => s.sport),
                datasets: [{
                    data: sports.map(s => s.bets),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
        return canvas.toDataURL();
    }
    
    /**
     * Generate PDF report
     */
    async generatePDF(type, data, charts) {
        const html = this.generateReportHTML(type, data, charts);
        
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });
        
        await browser.close();
        
        return pdf;
    }
    
    /**
     * Generate HTML report
     */
    async generateHTML(type, data, charts) {
        return this.generateReportHTML(type, data, charts);
    }
    
    /**
     * Generate CSV report
     */
    async generateCSV(type, data) {
        const rows = [];
        
        // Header
        rows.push(['Date', 'Type', 'Match', 'Bookmaker', 'Stake', 'Profit', 'ROI']);
        
        // Data rows
        data.settlements.forEach(s => {
            rows.push([
                s.settled_at,
                s.type,
                s.match,
                s.bookmaker,
                s.stake,
                s.actual_profit,
                ((s.actual_profit / s.stake) * 100).toFixed(2) + '%'
            ]);
        });
        
        return rows.map(r => r.join(',')).join('\n');
    }
    
    /**
     * Generate JSON report
     */
    async generateJSON(type, data) {
        return JSON.stringify(data, null, 2);
    }
    
    /**
     * Generate report HTML template
     */
    generateReportHTML(type, data, charts) {
        const summary = this.generateSummary(data);
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${type.charAt(0).toUpperCase() + type.slice(1)} Report</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #0f172a;
                    color: #f8fafc;
                    padding: 40px;
                    line-height: 1.6;
                }
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #334155;
                }
                .header h1 {
                    font-size: 32px;
                    margin-bottom: 8px;
                    color: #10b981;
                }
                .header p {
                    color: #94a3b8;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 20px;
                    margin-bottom: 40px;
                }
                .summary-card {
                    background: #1e293b;
                    padding: 20px;
                    border-radius: 12px;
                    text-align: center;
                    border: 1px solid #334155;
                }
                .summary-value {
                    font-size: 32px;
                    font-weight: 700;
                    color: #10b981;
                }
                .summary-label {
                    font-size: 14px;
                    color: #94a3b8;
                    margin-top: 8px;
                }
                .section {
                    margin-bottom: 40px;
                }
                .section h2 {
                    font-size: 24px;
                    margin-bottom: 20px;
                    color: #f8fafc;
                }
                .chart-container {
                    background: #1e293b;
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                }
                .chart-container img {
                    max-width: 100%;
                    height: auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: #1e293b;
                    border-radius: 12px;
                    overflow: hidden;
                }
                th, td {
                    padding: 12px 16px;
                    text-align: left;
                    border-bottom: 1px solid #334155;
                }
                th {
                    background: #334155;
                    font-weight: 600;
                }
                .profit-positive { color: #10b981; }
                .profit-negative { color: #ef4444; }
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #334155;
                    color: #64748b;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 ${type.charAt(0).toUpperCase() + type.slice(1)} Report</h1>
                <p>${new Date(data.period.start).toLocaleDateString()} - ${new Date(data.period.end).toLocaleDateString()}</p>
            </div>
            
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-value">${summary.totalBets}</div>
                    <div class="summary-label">Bets Placed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${summary.winRate}%</div>
                    <div class="summary-label">Win Rate</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">€${summary.totalProfit.toFixed(2)}</div>
                    <div class="summary-label">Total Profit</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${summary.roi}%</div>
                    <div class="summary-label">ROI</div>
                </div>
            </div>
            
            <div class="section">
                <h2>📈 Performance Charts</h2>
                <div class="chart-container">
                    <h3>Profit Trend</h3>
                    <img src="${charts.profitTrend}" alt="Profit Trend">
                </div>
            </div>
            
            <div class="section">
                <h2>🏆 Top Bookmakers</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Bookmaker</th>
                            <th>Bets</th>
                            <th>Stake</th>
                            <th>Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.bookmakerStats.map(b => `
                            <tr>
                                <td>${b.bookmaker}</td>
                                <td>${b.bets}</td>
                                <td>€${b.stake.toFixed(2)}</td>
                                <td class="${b.profit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                    €${b.profit.toFixed(2)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="footer">
                <p>Generated by Surebet Detector on ${new Date().toLocaleString()}</p>
            </div>
        </body>
        </html>
        `;
    }
    
    /**
     * Generate summary from data
     */
    generateSummary(data) {
        const pnl = data.pnl;
        return {
            totalBets: pnl.total_bets || 0,
            winRate: pnl.total_bets 
                ? Math.round((pnl.wins / pnl.total_bets) * 100) 
                : 0,
            totalProfit: pnl.total_profit || 0,
            roi: pnl.avg_roi ? pnl.avg_roi.toFixed(2) : '0.00',
            opportunities: data.opportunities.length,
            alerts: data.alerts.length
        };
    }
    
    /**
     * Generate filename
     */
    generateFilename(type, format) {
        const date = new Date().toISOString().split('T')[0];
        return `surebet-${type}-report-${date}.${format}`;
    }
    
    /**
     * Log report generation
     */
    async logReport(type, format, filename, data) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO reports (type, format, filename, generated_at, summary)
                 VALUES (?, ?, ?, ?, ?)`,
                [type, format, filename, new Date().toISOString(), JSON.stringify(this.generateSummary(data))],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    /**
     * Get report history
     */
    async getReportHistory(limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
}

module.exports = ReportEngine;
