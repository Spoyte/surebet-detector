/**
 * Screenshot Manager - Handles screenshot capture, storage, and export
 * 
 * Features:
 * - Screenshot capture and storage
 * - ZIP/PDF/CSV export functionality
 * - Automatic cleanup scheduling
 * - Gallery management
 * - Dispute resolution workflow
 */

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');
const puppeteer = require('puppeteer');
const EventEmitter = require('events');

class ScreenshotManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            screenshotsDir: config.screenshotsDir || path.join(__dirname, '../../data/screenshots'),
            tempDir: config.tempDir || path.join(__dirname, '../../data/temp'),
            retentionDays: config.retentionDays || 365,
            maxScreenshotsPerBet: config.maxScreenshotsPerBet || 10,
            thumbnailWidth: config.thumbnailWidth || 300,
            enableAutoCleanup: config.enableAutoCleanup !== false,
            cleanupSchedule: config.cleanupSchedule || '0 2 * * 0', // Weekly on Sunday at 2 AM
            ...config
        };
        
        this.screenshots = new Map();
        this.betScreenshots = new Map();
        this.disputes = new Map();
        this.cleanupJob = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Ensure directories exist
            await fs.mkdir(this.config.screenshotsDir, { recursive: true });
            await fs.mkdir(this.config.tempDir, { recursive: true });
            
            // Load existing screenshot index
            await this.loadIndex();
            
            // Setup auto-cleanup if enabled
            if (this.config.enableAutoCleanup) {
                this.setupAutoCleanup();
            }
            
            this.emit('initialized', { screenshotCount: this.screenshots.size });
        } catch (error) {
            this.emit('error', error);
        }
    }
    
    /**
     * Load screenshot index from disk
     */
    async loadIndex() {
        try {
            const indexPath = path.join(this.config.screenshotsDir, 'index.json');
            const data = await fs.readFile(indexPath, 'utf8');
            const index = JSON.parse(data);
            
            this.screenshots = new Map(index.screenshots);
            this.betScreenshots = new Map(index.betScreenshots);
            this.disputes = new Map(index.disputes || []);
            
            this.emit('indexLoaded', { count: this.screenshots.size });
        } catch (error) {
            // No index exists yet, start fresh
            this.screenshots = new Map();
            this.betScreenshots = new Map();
            this.disputes = new Map();
        }
    }
    
    /**
     * Save screenshot index to disk
     */
    async saveIndex() {
        try {
            const indexPath = path.join(this.config.screenshotsDir, 'index.json');
            const index = {
                screenshots: Array.from(this.screenshots.entries()),
                betScreenshots: Array.from(this.betScreenshots.entries()),
                disputes: Array.from(this.disputes.entries()),
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
        } catch (error) {
            this.emit('error', error);
        }
    }
    
    /**
     * Capture a screenshot
     * @param {Object} options - Screenshot options
     * @returns {Promise<Object>} Screenshot metadata
     */
    async captureScreenshot(options) {
        const {
            betId,
            type = 'placement', // placement, confirmation, error, settlement
            bookmaker,
            url,
            html,
            metadata = {}
        } = options;
        
        const id = this.generateId();
        const timestamp = new Date().toISOString();
        const filename = `${id}.png`;
        const filepath = path.join(this.config.screenshotsDir, filename);
        
        try {
            let screenshotBuffer;
            
            if (url) {
                // Capture from URL using puppeteer
                screenshotBuffer = await this.captureFromUrl(url);
            } else if (html) {
                // Capture from HTML string
                screenshotBuffer = await this.captureFromHtml(html);
            } else {
                throw new Error('Either url or html must be provided');
            }
            
            // Save screenshot
            await fs.writeFile(filepath, screenshotBuffer);
            
            // Create thumbnail
            const thumbnailFilename = `${id}_thumb.png`;
            const thumbnailPath = path.join(this.config.screenshotsDir, thumbnailFilename);
            await this.createThumbnail(screenshotBuffer, thumbnailPath);
            
            // Create metadata
            const screenshot = {
                id,
                betId,
                type,
                bookmaker,
                filename,
                thumbnailFilename,
                timestamp,
                size: screenshotBuffer.length,
                metadata: {
                    ...metadata,
                    originalUrl: url,
                    capturedAt: timestamp
                }
            };
            
            // Store in index
            this.screenshots.set(id, screenshot);
            
            // Associate with bet
            if (betId) {
                if (!this.betScreenshots.has(betId)) {
                    this.betScreenshots.set(betId, []);
                }
                this.betScreenshots.get(betId).push(id);
            }
            
            // Save index
            await this.saveIndex();
            
            this.emit('screenshotCaptured', screenshot);
            
            return screenshot;
        } catch (error) {
            this.emit('error', { error, betId, type });
            throw error;
        }
    }
    
    /**
     * Capture screenshot from URL using puppeteer
     */
    async captureFromUrl(url) {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const screenshot = await page.screenshot({
                fullPage: true,
                encoding: 'binary'
            });
            
            return screenshot;
        } finally {
            await browser.close();
        }
    }
    
    /**
     * Capture screenshot from HTML string
     */
    async captureFromHtml(html) {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setContent(html, { waitUntil: 'networkidle2' });
            
            const screenshot = await page.screenshot({
                fullPage: true,
                encoding: 'binary'
            });
            
            return screenshot;
        } finally {
            await browser.close();
        }
    }
    
    /**
     * Create thumbnail from screenshot buffer
     */
    async createThumbnail(screenshotBuffer, outputPath) {
        // For now, just save a copy. In production, use sharp or similar for resizing
        await fs.writeFile(outputPath, screenshotBuffer);
    }
    
    /**
     * Get screenshot by ID
     */
    getScreenshot(id) {
        return this.screenshots.get(id);
    }
    
    /**
     * Get all screenshots for a bet
     */
    getScreenshotsForBet(betId) {
        const screenshotIds = this.betScreenshots.get(betId) || [];
        return screenshotIds.map(id => this.screenshots.get(id)).filter(Boolean);
    }
    
    /**
     * List screenshots with filtering
     */
    listScreenshots(filters = {}) {
        let screenshots = Array.from(this.screenshots.values());
        
        if (filters.type) {
            screenshots = screenshots.filter(s => s.type === filters.type);
        }
        
        if (filters.bookmaker) {
            screenshots = screenshots.filter(s => s.bookmaker === filters.bookmaker);
        }
        
        if (filters.betId) {
            screenshots = screenshots.filter(s => s.betId === filters.betId);
        }
        
        if (filters.startDate) {
            const start = new Date(filters.startDate);
            screenshots = screenshots.filter(s => new Date(s.timestamp) >= start);
        }
        
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            screenshots = screenshots.filter(s => new Date(s.timestamp) <= end);
        }
        
        if (filters.search) {
            const search = filters.search.toLowerCase();
            screenshots = screenshots.filter(s => 
                (s.bookmaker && s.bookmaker.toLowerCase().includes(search)) ||
                (s.betId && s.betId.toLowerCase().includes(search)) ||
                (s.metadata && JSON.stringify(s.metadata).toLowerCase().includes(search))
            );
        }
        
        // Sort by timestamp descending
        screenshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (filters.limit) {
            screenshots = screenshots.slice(0, parseInt(filters.limit));
        }
        
        return screenshots;
    }
    
    /**
     * Get screenshot statistics
     */
    getStats() {
        const screenshots = Array.from(this.screenshots.values());
        const byType = {};
        const byBookmaker = {};
        let totalSize = 0;
        
        for (const screenshot of screenshots) {
            byType[screenshot.type] = (byType[screenshot.type] || 0) + 1;
            if (screenshot.bookmaker) {
                byBookmaker[screenshot.bookmaker] = (byBookmaker[screenshot.bookmaker] || 0) + 1;
            }
            totalSize += screenshot.size || 0;
        }
        
        return {
            totalCount: screenshots.length,
            totalSize,
            totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
            byType,
            byBookmaker,
            retentionDays: this.config.retentionDays
        };
    }
    
    /**
     * Delete a screenshot
     */
    async deleteScreenshot(id) {
        const screenshot = this.screenshots.get(id);
        if (!screenshot) {
            return { success: false, error: 'Screenshot not found' };
        }
        
        try {
            // Delete files
            const filepath = path.join(this.config.screenshotsDir, screenshot.filename);
            const thumbpath = path.join(this.config.screenshotsDir, screenshot.thumbnailFilename);
            
            await fs.unlink(filepath).catch(() => {});
            await fs.unlink(thumbpath).catch(() => {});
            
            // Remove from index
            this.screenshots.delete(id);
            
            // Remove from bet association
            if (screenshot.betId && this.betScreenshots.has(screenshot.betId)) {
                const ids = this.betScreenshots.get(screenshot.betId);
                const index = ids.indexOf(id);
                if (index > -1) {
                    ids.splice(index, 1);
                }
            }
            
            await this.saveIndex();
            
            this.emit('screenshotDeleted', { id });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Export screenshots as ZIP
     */
    async exportAsZip(options = {}) {
        const {
            ids,
            filters,
            includeThumbnails = false,
            filename = `screenshots_${new Date().toISOString().split('T')[0]}.zip`
        } = options;
        
        // Get screenshots to export
        let screenshots;
        if (ids && ids.length > 0) {
            screenshots = ids.map(id => this.screenshots.get(id)).filter(Boolean);
        } else {
            screenshots = this.listScreenshots(filters);
        }
        
        if (screenshots.length === 0) {
            return { success: false, error: 'No screenshots to export' };
        }
        
        const outputPath = path.join(this.config.tempDir, filename);
        const output = createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        return new Promise((resolve, reject) => {
            output.on('close', () => {
                resolve({
                    success: true,
                    filepath: outputPath,
                    filename,
                    count: screenshots.length,
                    size: archive.pointer()
                });
            });
            
            archive.on('error', reject);
            
            archive.pipe(output);
            
            // Add screenshots to archive
            for (const screenshot of screenshots) {
                const filepath = path.join(this.config.screenshotsDir, screenshot.filename);
                archive.file(filepath, { name: screenshot.filename });
                
                if (includeThumbnails && screenshot.thumbnailFilename) {
                    const thumbpath = path.join(this.config.screenshotsDir, screenshot.thumbnailFilename);
                    archive.file(thumbpath, { name: `thumbnails/${screenshot.thumbnailFilename}` });
                }
            }
            
            // Add metadata JSON
            const metadata = {
                exportDate: new Date().toISOString(),
                count: screenshots.length,
                screenshots: screenshots.map(s => ({
                    id: s.id,
                    betId: s.betId,
                    type: s.type,
                    bookmaker: s.bookmaker,
                    timestamp: s.timestamp,
                    filename: s.filename
                }))
            };
            archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
            
            archive.finalize();
        });
    }
    
    /**
     * Export screenshots as PDF report
     */
    async exportAsPdf(options = {}) {
        const {
            ids,
            filters,
            title = 'Screenshot Report',
            includeMetadata = true,
            filename = `screenshots_${new Date().toISOString().split('T')[0]}.pdf`
        } = options;
        
        // Get screenshots to export
        let screenshots;
        if (ids && ids.length > 0) {
            screenshots = ids.map(id => this.screenshots.get(id)).filter(Boolean);
        } else {
            screenshots = this.listScreenshots(filters);
        }
        
        if (screenshots.length === 0) {
            return { success: false, error: 'No screenshots to export' };
        }
        
        // Generate HTML for PDF
        const html = this.generatePdfHtml(screenshots, title, includeMetadata);
        
        // Convert to PDF using puppeteer
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle2' });
            
            const outputPath = path.join(this.config.tempDir, filename);
            
            await page.pdf({
                path: outputPath,
                format: 'A4',
                printBackground: true,
                margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
            });
            
            return {
                success: true,
                filepath: outputPath,
                filename,
                count: screenshots.length
            };
        } finally {
            await browser.close();
        }
    }
    
    /**
     * Generate HTML for PDF export
     */
    generatePdfHtml(screenshots, title, includeMetadata) {
        const screenshotItems = screenshots.map(s => {
            const imagePath = path.join(this.config.screenshotsDir, s.filename);
            const imageData = require('fs').readFileSync(imagePath, 'base64');
            
            return `
                <div class="screenshot">
                    <img src="data:image/png;base64,${imageData}" alt="Screenshot ${s.id}" />
                    ${includeMetadata ? `
                        <div class="metadata">
                            <p><strong>ID:</strong> ${s.id}</p>
                            <p><strong>Type:</strong> ${s.type}</p>
                            <p><strong>Bookmaker:</strong> ${s.bookmaker || 'N/A'}</p>
                            <p><strong>Bet ID:</strong> ${s.betId || 'N/A'}</p>
                            <p><strong>Timestamp:</strong> ${new Date(s.timestamp).toLocaleString()}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                    .screenshot { margin-bottom: 30px; page-break-inside: avoid; }
                    .screenshot img { max-width: 100%; border: 1px solid #ddd; }
                    .metadata { margin-top: 10px; padding: 10px; background: #f5f5f5; font-size: 12px; }
                    .metadata p { margin: 5px 0; }
                    .footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
                <p>Total Screenshots: ${screenshots.length}</p>
                ${screenshotItems}
                <div class="footer">
                    Surebet Detector - Screenshot Report
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * Export screenshot metadata as CSV
     */
    async exportAsCsv(options = {}) {
        const {
            ids,
            filters,
            filename = `screenshots_${new Date().toISOString().split('T')[0]}.csv`
        } = options;
        
        // Get screenshots to export
        let screenshots;
        if (ids && ids.length > 0) {
            screenshots = ids.map(id => this.screenshots.get(id)).filter(Boolean);
        } else {
            screenshots = this.listScreenshots(filters);
        }
        
        if (screenshots.length === 0) {
            return { success: false, error: 'No screenshots to export' };
        }
        
        // Generate CSV
        const headers = ['ID', 'Bet ID', 'Type', 'Bookmaker', 'Timestamp', 'Size (bytes)', 'Filename'];
        const rows = screenshots.map(s => [
            s.id,
            s.betId || '',
            s.type,
            s.bookmaker || '',
            s.timestamp,
            s.size || 0,
            s.filename
        ]);
        
        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const outputPath = path.join(this.config.tempDir, filename);
        await fs.writeFile(outputPath, csv);
        
        return {
            success: true,
            filepath: outputPath,
            filename,
            count: screenshots.length,
            csv
        };
    }
    
    /**
     * Create a dispute ticket with screenshots
     */
    async createDisputeTicket(options) {
        const {
            betId,
            bookmaker,
            issue,
            description,
            screenshotIds,
            priority = 'medium'
        } = options;
        
        const ticketId = this.generateId();
        const timestamp = new Date().toISOString();
        
        // Validate screenshots
        const screenshots = screenshotIds.map(id => this.screenshots.get(id)).filter(Boolean);
        
        if (screenshots.length === 0) {
            return { success: false, error: 'No valid screenshots provided' };
        }
        
        const ticket = {
            id: ticketId,
            betId,
            bookmaker,
            issue,
            description,
            priority,
            status: 'open',
            screenshotIds,
            createdAt: timestamp,
            updatedAt: timestamp,
            history: [{
                action: 'created',
                timestamp,
                details: 'Dispute ticket created'
            }]
        };
        
        this.disputes.set(ticketId, ticket);
        await this.saveIndex();
        
        this.emit('disputeCreated', ticket);
        
        return { success: true, ticket };
    }
    
    /**
     * Update dispute ticket status
     */
    async updateDisputeStatus(ticketId, status, details = '') {
        const ticket = this.disputes.get(ticketId);
        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }
        
        ticket.status = status;
        ticket.updatedAt = new Date().toISOString();
        ticket.history.push({
            action: status,
            timestamp: ticket.updatedAt,
            details
        });
        
        await this.saveIndex();
        
        this.emit('disputeUpdated', ticket);
        
        return { success: true, ticket };
    }
    
    /**
     * Get dispute ticket
     */
    getDisputeTicket(ticketId) {
        return this.disputes.get(ticketId);
    }
    
    /**
     * List dispute tickets
     */
    listDisputes(filters = {}) {
        let disputes = Array.from(this.disputes.values());
        
        if (filters.status) {
            disputes = disputes.filter(d => d.status === filters.status);
        }
        
        if (filters.bookmaker) {
            disputes = disputes.filter(d => d.bookmaker === filters.bookmaker);
        }
        
        if (filters.priority) {
            disputes = disputes.filter(d => d.priority === filters.priority);
        }
        
        if (filters.betId) {
            disputes = disputes.filter(d => d.betId === filters.betId);
        }
        
        // Sort by created date descending
        disputes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return disputes;
    }
    
    /**
     * Run cleanup of old screenshots
     */
    async runCleanup() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
        
        const screenshots = Array.from(this.screenshots.values());
        const toDelete = screenshots.filter(s => new Date(s.timestamp) < cutoffDate);
        
        const results = {
            deleted: 0,
            failed: 0,
            errors: []
        };
        
        for (const screenshot of toDelete) {
            const result = await this.deleteScreenshot(screenshot.id);
            if (result.success) {
                results.deleted++;
            } else {
                results.failed++;
                results.errors.push({ id: screenshot.id, error: result.error });
            }
        }
        
        this.emit('cleanupComplete', results);
        
        return results;
    }
    
    /**
     * Setup automatic cleanup scheduling
     */
    setupAutoCleanup() {
        const cron = require('node-cron');
        
        this.cleanupJob = cron.schedule(this.config.cleanupSchedule, async () => {
            this.emit('cleanupStarted');
            const results = await this.runCleanup();
            this.emit('cleanupComplete', results);
        });
        
        this.emit('autoCleanupEnabled', { schedule: this.config.cleanupSchedule });
    }
    
    /**
     * Stop automatic cleanup
     */
    stopAutoCleanup() {
        if (this.cleanupJob) {
            this.cleanupJob.stop();
            this.cleanupJob = null;
            this.emit('autoCleanupDisabled');
        }
    }
    
    /**
     * Get file path for screenshot
     */
    getScreenshotPath(id) {
        const screenshot = this.screenshots.get(id);
        if (!screenshot) return null;
        return path.join(this.config.screenshotsDir, screenshot.filename);
    }
    
    /**
     * Get thumbnail path for screenshot
     */
    getThumbnailPath(id) {
        const screenshot = this.screenshots.get(id);
        if (!screenshot) return null;
        return path.join(this.config.screenshotsDir, screenshot.thumbnailFilename);
    }
    
    /**
     * Generate unique ID
     */
    generateId() {
        return `scr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = ScreenshotManager;
