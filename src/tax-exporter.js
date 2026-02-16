/**
 * Tax Report Exporter
 * Generates tax-friendly reports in CSV and Excel formats
 */

const fs = require('fs').promises;
const path = require('path');

class TaxExporter {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.reportsDir = path.join(dataDir, 'reports');
        this.ensureReportsDir();
    }

    async ensureReportsDir() {
        try {
            await fs.mkdir(this.reportsDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create reports directory:', error);
        }
    }

    /**
     * Generate CSV report for tax reporting
     * @param {Object} options - Report options
     * @param {Date} options.startDate - Start date for report
     * @param {Date} options.endDate - End date for report
     * @param {string} options.format - 'csv' or 'excel'
     * @param {Array} options.bets - Array of bet objects
     * @returns {string} Path to generated report
     */
    async generateReport(options = {}) {
        const {
            startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Default: last year
            endDate = new Date(),
            format = 'csv',
            bets = null
        } = options;

        // Load bets if not provided
        const betData = bets || await this.loadBets();
        
        // Filter by date range
        const filteredBets = this.filterByDateRange(betData, startDate, endDate);
        
        // Generate report based on format
        if (format === 'csv') {
            return this.generateCSV(filteredBets, startDate, endDate);
        } else if (format === 'excel') {
            return this.generateExcel(filteredBets, startDate, endDate);
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Load bets from data files
     */
    async loadBets() {
        try {
            const betsFile = path.join(this.dataDir, 'bets.json');
            const data = await fs.readFile(betsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return empty array if file doesn't exist
            return [];
        }
    }

    /**
     * Filter bets by date range
     */
    filterByDateRange(bets, startDate, endDate) {
        return bets.filter(bet => {
            const betDate = new Date(bet.date || bet.timestamp);
            return betDate >= startDate && betDate <= endDate;
        });
    }

    /**
     * Generate CSV report
     */
    async generateCSV(bets, startDate, endDate) {
        const headers = [
            'Date',
            'Event',
            'Sport',
            'Bookmaker',
            'Bet Type',
            'Selection',
            'Odds',
            'Stake (EUR)',
            'Stake (Local)',
            'Currency',
            'Result',
            'Profit/Loss (EUR)',
            'Profit/Loss (Local)',
            'Exchange Rate',
            'Notes'
        ];

        let csv = headers.join(',') + '\n';

        for (const bet of bets) {
            const row = [
                this.formatDate(bet.date || bet.timestamp),
                this.escapeCSV(bet.event || ''),
                this.escapeCSV(bet.sport || ''),
                this.escapeCSV(bet.bookmaker || ''),
                this.escapeCSV(bet.betType || 'Single'),
                this.escapeCSV(bet.selection || bet.outcome || ''),
                bet.odds || '',
                bet.stakeEUR || bet.stake || '',
                bet.stakeLocal || bet.stake || '',
                bet.currency || 'EUR',
                bet.result || 'Pending',
                bet.profitLossEUR || '',
                bet.profitLossLocal || '',
                bet.exchangeRate || 1,
                this.escapeCSV(bet.notes || '')
            ];
            csv += row.join(',') + '\n';
        }

        // Add summary section
        csv += '\n';
        csv += 'SUMMARY\n';
        csv += this.generateSummaryCSV(bets);

        const filename = `tax-report-${this.formatDateForFilename(startDate)}-to-${this.formatDateForFilename(endDate)}.csv`;
        const filepath = path.join(this.reportsDir, filename);
        
        await fs.writeFile(filepath, csv, 'utf8');
        return filepath;
    }

    /**
     * Generate Excel report (using HTML table format that Excel can open)
     */
    async generateExcel(bets, startDate, endDate) {
        const totalStakes = bets.reduce((sum, bet) => sum + (parseFloat(bet.stakeEUR) || 0), 0);
        const totalProfitLoss = bets.reduce((sum, bet) => 
            sum + (parseFloat(bet.profitLossEUR) || 0), 0);
        const winningBets = bets.filter(b => (parseFloat(b.profitLossEUR) || 0) > 0).length;
        const losingBets = bets.filter(b => (parseFloat(b.profitLossEUR) || 0) < 0).length;

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Tax Report ${this.formatDate(startDate)} - ${this.formatDate(endDate)}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .summary { background-color: #e7f3fe; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .positive { color: green; }
        .negative { color: red; }
        .number { text-align: right; }
    </style>
</head>
<body>
    <h1>Sports Betting Tax Report</h1>
    <p><strong>Period:</strong> ${this.formatDate(startDate)} - ${this.formatDate(endDate)}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total Bets</td><td class="number">${bets.length}</td></tr>
            <tr><td>Winning Bets</td><td class="number">${winningBets}</td></tr>
            <tr><td>Losing Bets</td><td class="number">${losingBets}</td></tr>
            <tr><td>Total Stakes (EUR)</td><td class="number">€${totalStakes.toFixed(2)}</td></tr>
            <tr><td>Total Profit/Loss (EUR)</td><td class="number ${totalProfitLoss >= 0 ? 'positive' : 'negative'}">€${totalProfitLoss.toFixed(2)}</td></tr>
            <tr><td>ROI</td><td class="number">${totalStakes > 0 ? ((totalProfitLoss / totalStakes) * 100).toFixed(2) : 0}%</td></tr>
        </table>
    </div>

    <h2>Detailed Bet History</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Sport</th>
                <th>Bookmaker</th>
                <th>Selection</th>
                <th>Odds</th>
                <th>Stake (EUR)</th>
                <th>Result</th>
                <th>P/L (EUR)</th>
            </tr>
        </thead>
        <tbody>
            ${bets.map(bet => `
                <tr>
                    <td>${this.formatDate(bet.date || bet.timestamp)}</td>
                    <td>${this.escapeHtml(bet.event || '')}</td>
                    <td>${this.escapeHtml(bet.sport || '')}</td>
                    <td>${this.escapeHtml(bet.bookmaker || '')}</td>
                    <td>${this.escapeHtml(bet.selection || bet.outcome || '')}</td>
                    <td class="number">${bet.odds || ''}</td>
                    <td class="number">€${parseFloat(bet.stakeEUR || bet.stake || 0).toFixed(2)}</td>
                    <td>${bet.result || 'Pending'}</td>
                    <td class="number ${(parseFloat(bet.profitLossEUR) || 0) >= 0 ? 'positive' : 'negative'}">
                        €${parseFloat(bet.profitLossEUR || 0).toFixed(2)}
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>By Bookmaker</h2>
    <table>
        <thead>
            <tr><th>Bookmaker</th><th>Bets</th><th>Total Stake</th><th>Profit/Loss</th><th>ROI</th></tr>
        </thead>
        <tbody>
            ${this.generateBookmakerSummaryRows(bets)}
        </tbody>
    </table>

    <h2>By Sport</h2>
    <table>
        <thead>
            <tr><th>Sport</th><th>Bets</th><th>Total Stake</th><th>Profit/Loss</th><th>ROI</th></tr>
        </thead>
        <tbody>
            ${this.generateSportSummaryRows(bets)}
        </tbody>
    </table>

    <p style="margin-top: 40px; color: #666; font-size: 0.9em;">
        <em>This report is generated for tax reporting purposes. Please consult with a tax professional for advice specific to your jurisdiction.</em>
    </p>
</body>
</html>`;

        const filename = `tax-report-${this.formatDateForFilename(startDate)}-to-${this.formatDateForFilename(endDate)}.xls`;
        const filepath = path.join(this.reportsDir, filename);
        
        await fs.writeFile(filepath, html, 'utf8');
        return filepath;
    }

    /**
     * Generate summary CSV section
     */
    generateSummaryCSV(bets) {
        const totalStakes = bets.reduce((sum, bet) => sum + (parseFloat(bet.stakeEUR) || 0), 0);
        const totalProfitLoss = bets.reduce((sum, bet) => 
            sum + (parseFloat(bet.profitLossEUR) || 0), 0);
        const winningBets = bets.filter(b => (parseFloat(b.profitLossEUR) || 0) > 0).length;
        const losingBets = bets.filter(b => (parseFloat(b.profitLossEUR) || 0) < 0).length;

        let csv = '';
        csv += `Total Bets,${bets.length}\n`;
        csv += `Winning Bets,${winningBets}\n`;
        csv += `Losing Bets,${losingBets}\n`;
        csv += `Total Stakes (EUR),${totalStakes.toFixed(2)}\n`;
        csv += `Total Profit/Loss (EUR),${totalProfitLoss.toFixed(2)}\n`;
        csv += `ROI (%),${totalStakes > 0 ? ((totalProfitLoss / totalStakes) * 100).toFixed(2) : 0}\n`;
        csv += '\n';

        // By bookmaker
        csv += 'BY BOOKMAKER\n';
        csv += 'Bookmaker,Bets,Total Stake,Profit/Loss,ROI\n';
        csv += this.generateBookmakerSummaryCSV(bets);
        csv += '\n';

        // By sport
        csv += 'BY SPORT\n';
        csv += 'Sport,Bets,Total Stake,Profit/Loss,ROI\n';
        csv += this.generateSportSummaryCSV(bets);

        return csv;
    }

    /**
     * Generate bookmaker summary for Excel
     */
    generateBookmakerSummaryRows(bets) {
        const byBookmaker = this.groupBy(bets, 'bookmaker');
        
        return Object.entries(byBookmaker).map(([bookmaker, bookieBets]) => {
            const stake = bookieBets.reduce((sum, b) => sum + (parseFloat(b.stakeEUR) || 0), 0);
            const pl = bookieBets.reduce((sum, b) => sum + (parseFloat(b.profitLossEUR) || 0), 0);
            const roi = stake > 0 ? ((pl / stake) * 100).toFixed(2) : 0;
            
            return `
                <tr>
                    <td>${this.escapeHtml(bookmaker)}</td>
                    <td class="number">${bookieBets.length}</td>
                    <td class="number">€${stake.toFixed(2)}</td>
                    <td class="number ${pl >= 0 ? 'positive' : 'negative'}">€${pl.toFixed(2)}</td>
                    <td class="number">${roi}%</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Generate sport summary for Excel
     */
    generateSportSummaryRows(bets) {
        const bySport = this.groupBy(bets, 'sport');
        
        return Object.entries(bySport).map(([sport, sportBets]) => {
            const stake = sportBets.reduce((sum, b) => sum + (parseFloat(b.stakeEUR) || 0), 0);
            const pl = sportBets.reduce((sum, b) => sum + (parseFloat(b.profitLossEUR) || 0), 0);
            const roi = stake > 0 ? ((pl / stake) * 100).toFixed(2) : 0;
            
            return `
                <tr>
                    <td>${this.escapeHtml(sport)}</td>
                    <td class="number">${sportBets.length}</td>
                    <td class="number">€${stake.toFixed(2)}</td>
                    <td class="number ${pl >= 0 ? 'positive' : 'negative'}">€${pl.toFixed(2)}</td>
                    <td class="number">${roi}%</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Generate bookmaker summary CSV
     */
    generateBookmakerSummaryCSV(bets) {
        const byBookmaker = this.groupBy(bets, 'bookmaker');
        
        return Object.entries(byBookmaker).map(([bookmaker, bookieBets]) => {
            const stake = bookieBets.reduce((sum, b) => sum + (parseFloat(b.stakeEUR) || 0), 0);
            const pl = bookieBets.reduce((sum, b) => sum + (parseFloat(b.profitLossEUR) || 0), 0);
            const roi = stake > 0 ? ((pl / stake) * 100).toFixed(2) : 0;
            
            return `${this.escapeCSV(bookmaker)},${bookieBets.length},${stake.toFixed(2)},${pl.toFixed(2)},${roi}`;
        }).join('\n');
    }

    /**
     * Generate sport summary CSV
     */
    generateSportSummaryCSV(bets) {
        const bySport = this.groupBy(bets, 'sport');
        
        return Object.entries(bySport).map(([sport, sportBets]) => {
            const stake = sportBets.reduce((sum, b) => sum + (parseFloat(b.stakeEUR) || 0), 0);
            const pl = sportBets.reduce((sum, b) => sum + (parseFloat(b.profitLossEUR) || 0), 0);
            const roi = stake > 0 ? ((pl / stake) * 100).toFixed(2) : 0;
            
            return `${this.escapeCSV(sport)},${sportBets.length},${stake.toFixed(2)},${pl.toFixed(2)},${roi}`;
        }).join('\n');
    }

    /**
     * Group array by key
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key] || 'Unknown';
            (result[groupKey] = result[groupKey] || []).push(item);
            return result;
        }, {});
    }

    /**
     * Escape CSV value
     */
    escapeCSV(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    /**
     * Format date for filename
     */
    formatDateForFilename(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    /**
     * List all generated reports
     */
    async listReports() {
        try {
            const files = await fs.readdir(this.reportsDir);
            return files
                .filter(f => f.endsWith('.csv') || f.endsWith('.xls'))
                .map(f => ({
                    filename: f,
                    path: path.join(this.reportsDir, f),
                    created: fs.stat(path.join(this.reportsDir, f)).then(s => s.birthtime)
                }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Get report file path
     */
    getReportPath(filename) {
        return path.join(this.reportsDir, filename);
    }
}

module.exports = TaxExporter;
