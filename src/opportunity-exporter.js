/**
 * Opportunity Export and Sharing Module
 * Handles exporting opportunities to various formats and sharing via different channels
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class OpportunityExporter extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            dataDir: options.dataDir || path.join(__dirname, '../data'),
            telegramBotToken: options.telegramBotToken,
            telegramChatId: options.telegramChatId,
            emailConfig: options.emailConfig,
            ...options
        };
        
        this.exportHistory = [];
        this.sharedLinks = new Map();
    }

    /**
     * Export opportunities to JSON format
     */
    async exportToJSON(opportunities, options = {}) {
        const { includeMetadata = true, pretty = true } = options;
        
        const exportData = {
            exportDate: new Date().toISOString(),
            version: '1.0.0',
            count: opportunities.length,
            opportunities: opportunities.map(opp => this.sanitizeOpportunity(opp))
        };
        
        if (includeMetadata) {
            exportData.metadata = {
                totalProfit: opportunities.reduce((sum, o) => sum + (o.profitPercent || 0), 0),
                avgProfit: opportunities.length > 0 
                    ? opportunities.reduce((sum, o) => sum + (o.profitPercent || 0), 0) / opportunities.length 
                    : 0,
                sports: [...new Set(opportunities.map(o => o.sport).filter(Boolean))],
                bookmakers: [...new Set(opportunities.flatMap(o => 
                    o.legs ? o.legs.map(l => l.bookmaker) : [o.bookmaker]
                ))]
            };
        }
        
        return pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
    }

    /**
     * Export opportunities to CSV format
     */
    async exportToCSV(opportunities, options = {}) {
        const { includeHeaders = true } = options;
        
        const headers = [
            'ID', 'Type', 'Event', 'Sport', 'League', 'Start Time',
            'Profit %', 'EV %', 'Bookmakers', 'Outcomes', 'Odds',
            'Stakes', 'Total Stake', 'Expected Profit', 'Confidence',
            'Detected At', 'Expires At'
        ];
        
        const rows = opportunities.map(opp => {
            const isArbitrage = opp.type === 'arbitrage' || !!opp.legs;
            const bookmakers = opp.legs 
                ? opp.legs.map(l => l.bookmaker).join('; ')
                : opp.bookmaker;
            const outcomes = opp.legs
                ? opp.legs.map(l => l.outcome).join('; ')
                : opp.outcome;
            const odds = opp.legs
                ? opp.legs.map(l => l.odds).join('; ')
                : opp.odds;
            const stakes = opp.legs
                ? opp.legs.map(l => l.stake || 'N/A').join('; ')
                : opp.stake || 'N/A';
            
            return [
                opp.id,
                isArbitrage ? 'arbitrage' : 'ev',
                this.escapeCSV(opp.event),
                opp.sport || 'N/A',
                opp.league || 'N/A',
                opp.commenceTime || 'N/A',
                opp.profitPercent || opp.evPercent || 0,
                opp.evPercent || 0,
                this.escapeCSV(bookmakers),
                this.escapeCSV(outcomes),
                odds,
                stakes,
                opp.totalStake || 'N/A',
                opp.expectedProfit || 'N/A',
                opp.confidence || 'N/A',
                opp.detectedAt || new Date().toISOString(),
                opp.expiresAt || 'N/A'
            ];
        });
        
        const csv = [];
        if (includeHeaders) {
            csv.push(headers.join(','));
        }
        rows.forEach(row => {
            csv.push(row.map(cell => `"${cell}"`).join(','));
        });
        
        return csv.join('\n');
    }

    /**
     * Escape CSV special characters
     */
    escapeCSV(value) {
        if (value == null) return '';
        return String(value).replace(/"/g, '""');
    }

    /**
     * Export opportunities to Excel format (returns structured data for Excel libraries)
     */
    async exportToExcelData(opportunities, options = {}) {
        const sheets = {
            opportunities: opportunities.map(opp => ({
                'ID': opp.id,
                'Type': opp.type || (opp.legs ? 'arbitrage' : 'ev'),
                'Event': opp.event,
                'Sport': opp.sport,
                'League': opp.league,
                'Start Time': opp.commenceTime,
                'Profit %': opp.profitPercent,
                'EV %': opp.evPercent,
                'Confidence': opp.confidence,
                'Detected At': opp.detectedAt,
                'Notes': opp.notes
            })),
            legs: opportunities.flatMap(opp => 
                (opp.legs || []).map((leg, idx) => ({
                    'Opportunity ID': opp.id,
                    'Leg #': idx + 1,
                    'Bookmaker': leg.bookmaker,
                    'Outcome': leg.outcome,
                    'Odds': leg.odds,
                    'Stake': leg.stake,
                    'Probability': leg.impliedProbability
                }))
            ),
            summary: [{
                'Export Date': new Date().toISOString(),
                'Total Opportunities': opportunities.length,
                'Arbitrage Count': opportunities.filter(o => o.legs).length,
                'EV Count': opportunities.filter(o => !o.legs).length,
                'Avg Profit %': opportunities.length > 0 
                    ? opportunities.reduce((sum, o) => sum + (o.profitPercent || o.evPercent || 0), 0) / opportunities.length 
                    : 0,
                'Total Expected Profit': opportunities.reduce((sum, o) => sum + (o.expectedProfit || 0), 0)
            }]
        };
        
        return sheets;
    }

    /**
     * Export to PDF format (returns HTML for PDF generation)
     */
    async exportToPDF(opportunities, options = {}) {
        const { title = 'Surebet Opportunities Report' } = options;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #4CAF50; color: white; padding: 12px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        tr:hover { background: #f5f5f5; }
        .profit { color: #4CAF50; font-weight: bold; }
        .arbitrage { background: #e8f5e9; }
        .ev { background: #e3f2fd; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="summary">
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Opportunities:</strong> ${opportunities.length}</p>
        <p><strong>Arbitrage:</strong> ${opportunities.filter(o => o.legs).length}</p>
        <p><strong>+EV:</strong> ${opportunities.filter(o => !o.legs).length}</p>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Type</th>
                <th>Event</th>
                <th>Sport</th>
                <th>Profit/EV%</th>
                <th>Bookmakers</th>
                <th>Start Time</th>
            </tr>
        </thead>
        <tbody>
            ${opportunities.map(opp => `
                <tr class="${opp.legs ? 'arbitrage' : 'ev'}">
                    <td>${opp.legs ? 'Arbitrage' : '+EV'}</td>
                    <td>${opp.event}</td>
                    <td>${opp.sport || 'N/A'}</td>
                    <td class="profit">${opp.profitPercent || opp.evPercent || 0}%</td>
                    <td>${opp.legs ? opp.legs.map(l => l.bookmaker).join(', ') : opp.bookmaker}</td>
                    <td>${opp.commenceTime ? new Date(opp.commenceTime).toLocaleString() : 'N/A'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="footer">
        <p>Generated by Surebet Detector</p>
    </div>
</body>
</html>`;
        
        return html;
    }

    /**
     * Create a shareable link for opportunities
     */
    createShareableLink(opportunities, options = {}) {
        const { expiresInHours = 24, password = null } = options;
        
        const linkId = this.generateLinkId();
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
        
        const shareData = {
            id: linkId,
            opportunities: opportunities.map(opp => this.sanitizeOpportunity(opp)),
            createdAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            password: password ? this.hashPassword(password) : null,
            viewCount: 0
        };
        
        this.sharedLinks.set(linkId, shareData);
        
        // Schedule cleanup
        setTimeout(() => {
            this.sharedLinks.delete(linkId);
        }, expiresInHours * 60 * 60 * 1000);
        
        return {
            linkId,
            url: `/share/${linkId}`,
            expiresAt: expiresAt.toISOString(),
            fullUrl: `${options.baseUrl || ''}/share/${linkId}`
        };
    }

    /**
     * Get shared opportunities by link ID
     */
    getSharedOpportunities(linkId, password = null) {
        const shareData = this.sharedLinks.get(linkId);
        
        if (!shareData) {
            return { error: 'Link not found or expired' };
        }
        
        if (new Date() > new Date(shareData.expiresAt)) {
            this.sharedLinks.delete(linkId);
            return { error: 'Link has expired' };
        }
        
        if (shareData.password && !this.verifyPassword(password, shareData.password)) {
            return { error: 'Invalid password' };
        }
        
        shareData.viewCount++;
        
        return {
            opportunities: shareData.opportunities,
            createdAt: shareData.createdAt,
            expiresAt: shareData.expiresAt,
            viewCount: shareData.viewCount
        };
    }

    /**
     * Generate a unique link ID
     */
    generateLinkId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * Hash password (simple hash for demo - use bcrypt in production)
     */
    hashPassword(password) {
        // In production, use bcrypt or similar
        return Buffer.from(password).toString('base64');
    }

    /**
     * Verify password
     */
    verifyPassword(password, hash) {
        return this.hashPassword(password) === hash;
    }

    /**
     * Share opportunities via Telegram
     */
    async shareViaTelegram(opportunities, options = {}) {
        if (!this.config.telegramBotToken || !this.config.telegramChatId) {
            return { error: 'Telegram not configured' };
        }
        
        const axios = require('axios');
        const { message = 'New opportunities detected!' } = options;
        
        let text = `🎯 *${message}*\n\n`;
        
        // Add arbitrage opportunities
        const arbs = opportunities.filter(o => o.legs);
        if (arbs.length > 0) {
            text += `*📊 Arbitrage (${arbs.length})*\n\n`;
            for (const arb of arbs.slice(0, 3)) {
                text += `*${arb.event}*\n`;
                text += `Profit: ${arb.profitPercent}%\n`;
                for (const leg of arb.legs) {
                    text += `  • ${leg.outcome} @ ${leg.bookmaker}\n`;
                }
                text += '\n';
            }
        }
        
        // Add EV opportunities
        const evs = opportunities.filter(o => !o.legs);
        if (evs.length > 0) {
            text += `*💰 +EV Opportunities (${evs.length})*\n\n`;
            for (const ev of evs.slice(0, 3)) {
                text += `${ev.outcome} @ ${ev.bookmaker}\n`;
                text += `EV: +${ev.evPercent}% | Odds: ${ev.odds}\n\n`;
            }
        }
        
        try {
            await axios.post(`https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`, {
                chat_id: this.config.telegramChatId,
                text,
                parse_mode: 'Markdown'
            });
            
            this.recordExport('telegram', opportunities.length);
            return { success: true, count: opportunities.length };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Share opportunities via email (requires email configuration)
     */
    async shareViaEmail(opportunities, email, options = {}) {
        if (!this.config.emailConfig) {
            return { error: 'Email not configured' };
        }
        
        const { subject = 'Surebet Opportunities', message = '' } = options;
        
        // Generate HTML content
        const html = await this.exportToPDF(opportunities, { title: subject });
        
        // In production, integrate with nodemailer or similar
        // For now, return what would be sent
        this.recordExport('email', opportunities.length);
        
        return {
            success: true,
            to: email,
            subject,
            opportunityCount: opportunities.length,
            htmlLength: html.length
        };
    }

    /**
     * Sanitize opportunity for export (remove sensitive data)
     */
    sanitizeOpportunity(opp) {
        const sanitized = { ...opp };
        
        // Remove any internal IDs or sensitive data
        delete sanitized._internalId;
        delete sanitized.rawData;
        
        return sanitized;
    }

    /**
     * Record export in history
     */
    recordExport(format, count) {
        this.exportHistory.push({
            timestamp: new Date().toISOString(),
            format,
            count
        });
        
        // Keep only last 100 exports
        if (this.exportHistory.length > 100) {
            this.exportHistory.shift();
        }
        
        this.emit('export', { format, count });
    }

    /**
     * Get export history
     */
    getExportHistory(limit = 50) {
        return this.exportHistory.slice(-limit);
    }

    /**
     * Get active share links
     */
    getActiveShareLinks() {
        const now = new Date();
        const active = [];
        
        for (const [id, data] of this.sharedLinks) {
            if (new Date(data.expiresAt) > now) {
                active.push({
                    id,
                    createdAt: data.createdAt,
                    expiresAt: data.expiresAt,
                    viewCount: data.viewCount,
                    opportunityCount: data.opportunities.length,
                    hasPassword: !!data.password
                });
            }
        }
        
        return active;
    }

    /**
     * Revoke a share link
     */
    revokeShareLink(linkId) {
        return this.sharedLinks.delete(linkId);
    }

    /**
     * Save export history to disk
     */
    async saveHistory() {
        try {
            const historyFile = path.join(this.config.dataDir, 'export-history.json');
            await fs.writeFile(
                historyFile,
                JSON.stringify({
                    exports: this.exportHistory,
                    shares: Array.from(this.sharedLinks.entries())
                }, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('Failed to save export history:', error.message);
        }
    }

    /**
     * Load export history from disk
     */
    async loadHistory() {
        try {
            const historyFile = path.join(this.config.dataDir, 'export-history.json');
            const data = await fs.readFile(historyFile, 'utf8');
            const parsed = JSON.parse(data);
            
            this.exportHistory = parsed.exports || [];
            
            // Restore non-expired shares
            if (parsed.shares) {
                const now = new Date();
                for (const [id, data] of parsed.shares) {
                    if (new Date(data.expiresAt) > now) {
                        this.sharedLinks.set(id, data);
                    }
                }
            }
        } catch (error) {
            // History file might not exist
        }
    }
}

module.exports = OpportunityExporter;
