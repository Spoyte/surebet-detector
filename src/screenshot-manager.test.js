/**
 * Screenshot Manager Tests
 */

const ScreenshotManager = require('./screenshot-manager');
const path = require('path');
const fs = require('fs').promises;

describe('ScreenshotManager', () => {
    let manager;
    const testDir = path.join(__dirname, '../../test/screenshots');
    
    beforeEach(async () => {
        manager = new ScreenshotManager({
            screenshotsDir: testDir,
            tempDir: path.join(testDir, 'temp'),
            retentionDays: 30,
            enableAutoCleanup: false
        });
        await manager.init();
    });
    
    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });
    
    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(manager.screenshots).toBeInstanceOf(Map);
            expect(manager.betScreenshots).toBeInstanceOf(Map);
            expect(manager.disputes).toBeInstanceOf(Map);
        });
        
        test('should create directories on init', async () => {
            const stats = await fs.stat(testDir);
            expect(stats.isDirectory()).toBe(true);
        });
    });
    
    describe('Screenshot Capture', () => {
        test('should capture screenshot from HTML', async () => {
            const html = `
                <!DOCTYPE html>
                <html>
                <body>
                    <h1>Test Bet Slip</h1>
                    <p>Stake: $100</p>
                    <p>Odds: 2.5</p>
                </body>
                </html>
            `;
            
            const screenshot = await manager.captureScreenshot({
                betId: 'bet_123',
                type: 'placement',
                bookmaker: 'TestBookmaker',
                html,
                metadata: { match: 'Team A vs Team B' }
            });
            
            expect(screenshot).toBeDefined();
            expect(screenshot.id).toBeDefined();
            expect(screenshot.betId).toBe('bet_123');
            expect(screenshot.type).toBe('placement');
            expect(screenshot.bookmaker).toBe('TestBookmaker');
            expect(screenshot.filename).toBeDefined();
            expect(screenshot.thumbnailFilename).toBeDefined();
        });
        
        test('should store screenshot in index', async () => {
            const html = '<html><body>Test</body></html>';
            
            const screenshot = await manager.captureScreenshot({
                betId: 'bet_456',
                type: 'confirmation',
                html
            });
            
            const stored = manager.getScreenshot(screenshot.id);
            expect(stored).toBeDefined();
            expect(stored.id).toBe(screenshot.id);
        });
        
        test('should associate screenshot with bet', async () => {
            const html = '<html><body>Test</body></html>';
            
            await manager.captureScreenshot({
                betId: 'bet_multi',
                type: 'placement',
                html
            });
            
            await manager.captureScreenshot({
                betId: 'bet_multi',
                type: 'confirmation',
                html
            });
            
            const betScreenshots = manager.getScreenshotsForBet('bet_multi');
            expect(betScreenshots.length).toBe(2);
        });
    });
    
    describe('Screenshot Listing', () => {
        beforeEach(async () => {
            const html = '<html><body>Test</body></html>';
            
            await manager.captureScreenshot({
                betId: 'bet_1',
                type: 'placement',
                bookmaker: 'BookmakerA',
                html
            });
            
            await manager.captureScreenshot({
                betId: 'bet_2',
                type: 'confirmation',
                bookmaker: 'BookmakerB',
                html
            });
            
            await manager.captureScreenshot({
                betId: 'bet_3',
                type: 'error',
                bookmaker: 'BookmakerA',
                html
            });
        });
        
        test('should list all screenshots', () => {
            const screenshots = manager.listScreenshots();
            expect(screenshots.length).toBe(3);
        });
        
        test('should filter by type', () => {
            const screenshots = manager.listScreenshots({ type: 'placement' });
            expect(screenshots.length).toBe(1);
            expect(screenshots[0].type).toBe('placement');
        });
        
        test('should filter by bookmaker', () => {
            const screenshots = manager.listScreenshots({ bookmaker: 'BookmakerA' });
            expect(screenshots.length).toBe(2);
        });
        
        test('should filter by betId', () => {
            const screenshots = manager.listScreenshots({ betId: 'bet_1' });
            expect(screenshots.length).toBe(1);
        });
        
        test('should limit results', () => {
            const screenshots = manager.listScreenshots({ limit: 2 });
            expect(screenshots.length).toBe(2);
        });
    });
    
    describe('Statistics', () => {
        beforeEach(async () => {
            const html = '<html><body>Test</body></html>';
            
            await manager.captureScreenshot({
                betId: 'bet_1',
                type: 'placement',
                bookmaker: 'BookmakerA',
                html
            });
            
            await manager.captureScreenshot({
                betId: 'bet_2',
                type: 'confirmation',
                bookmaker: 'BookmakerB',
                html
            });
        });
        
        test('should return correct stats', () => {
            const stats = manager.getStats();
            expect(stats.totalCount).toBe(2);
            expect(stats.byType.placement).toBe(1);
            expect(stats.byType.confirmation).toBe(1);
            expect(stats.byBookmaker.BookmakerA).toBe(1);
            expect(stats.byBookmaker.BookmakerB).toBe(1);
        });
    });
    
    describe('Export', () => {
        beforeEach(async () => {
            const html = `
                <!DOCTYPE html>
                <html>
                <body>
                    <h1>Test Screenshot</h1>
                </body>
                </html>
            `;
            
            await manager.captureScreenshot({
                betId: 'bet_export_1',
                type: 'placement',
                bookmaker: 'BookmakerA',
                html
            });
            
            await manager.captureScreenshot({
                betId: 'bet_export_2',
                type: 'confirmation',
                bookmaker: 'BookmakerB',
                html
            });
        });
        
        test('should export as CSV', async () => {
            const result = await manager.exportAsCsv();
            
            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.csv).toBeDefined();
            expect(result.csv).toContain('ID,Bet ID,Type,Bookmaker');
        });
        
        test('should export specific IDs as CSV', async () => {
            const screenshots = manager.listScreenshots();
            const ids = [screenshots[0].id];
            
            const result = await manager.exportAsCsv({ ids });
            
            expect(result.success).toBe(true);
            expect(result.count).toBe(1);
        });
        
        test('should export as ZIP', async () => {
            const result = await manager.exportAsZip();
            
            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.filepath).toBeDefined();
            expect(result.size).toBeGreaterThan(0);
        });
        
        test('should export as PDF', async () => {
            const result = await manager.exportAsPdf();
            
            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.filepath).toBeDefined();
        }, 30000); // Increase timeout for PDF generation
    });
    
    describe('Dispute Management', () => {
        let screenshotId;
        
        beforeEach(async () => {
            const html = '<html><body>Test Dispute</body></html>';
            
            const screenshot = await manager.captureScreenshot({
                betId: 'bet_dispute',
                type: 'error',
                bookmaker: 'BookmakerA',
                html
            });
            
            screenshotId = screenshot.id;
        });
        
        test('should create dispute ticket', async () => {
            const result = await manager.createDisputeTicket({
                betId: 'bet_dispute',
                bookmaker: 'BookmakerA',
                issue: 'Wrong odds applied',
                description: 'The odds shown were different from what was applied',
                screenshotIds: [screenshotId],
                priority: 'high'
            });
            
            expect(result.success).toBe(true);
            expect(result.ticket).toBeDefined();
            expect(result.ticket.id).toBeDefined();
            expect(result.ticket.status).toBe('open');
            expect(result.ticket.priority).toBe('high');
        });
        
        test('should get dispute ticket', async () => {
            const createResult = await manager.createDisputeTicket({
                betId: 'bet_dispute',
                bookmaker: 'BookmakerA',
                issue: 'Wrong odds',
                screenshotIds: [screenshotId]
            });
            
            const ticket = manager.getDisputeTicket(createResult.ticket.id);
            expect(ticket).toBeDefined();
            expect(ticket.id).toBe(createResult.ticket.id);
        });
        
        test('should update dispute status', async () => {
            const createResult = await manager.createDisputeTicket({
                betId: 'bet_dispute',
                bookmaker: 'BookmakerA',
                issue: 'Wrong odds',
                screenshotIds: [screenshotId]
            });
            
            const result = await manager.updateDisputeStatus(
                createResult.ticket.id,
                'resolved',
                'Bookmaker corrected the odds'
            );
            
            expect(result.success).toBe(true);
            expect(result.ticket.status).toBe('resolved');
            expect(result.ticket.history.length).toBe(2);
        });
        
        test('should list disputes', async () => {
            await manager.createDisputeTicket({
                betId: 'bet_1',
                bookmaker: 'BookmakerA',
                issue: 'Issue 1',
                screenshotIds: [screenshotId],
                priority: 'high'
            });
            
            await manager.createDisputeTicket({
                betId: 'bet_2',
                bookmaker: 'BookmakerB',
                issue: 'Issue 2',
                screenshotIds: [screenshotId],
                priority: 'low'
            });
            
            const allDisputes = manager.listDisputes();
            expect(allDisputes.length).toBe(2);
            
            const highPriority = manager.listDisputes({ priority: 'high' });
            expect(highPriority.length).toBe(1);
            
            const bookmakerA = manager.listDisputes({ bookmaker: 'BookmakerA' });
            expect(bookmakerA.length).toBe(1);
        });
    });
    
    describe('Cleanup', () => {
        test('should delete old screenshots', async () => {
            // This test would need to mock dates or use a shorter retention period
            // For now, just verify the method exists and returns proper structure
            const result = await manager.runCleanup();
            
            expect(result).toHaveProperty('deleted');
            expect(result).toHaveProperty('failed');
            expect(result).toHaveProperty('errors');
        });
    });
    
    describe('Delete Screenshot', () => {
        test('should delete screenshot', async () => {
            const html = '<html><body>Test</body></html>';
            
            const screenshot = await manager.captureScreenshot({
                betId: 'bet_delete',
                type: 'placement',
                html
            });
            
            const result = await manager.deleteScreenshot(screenshot.id);
            
            expect(result.success).toBe(true);
            expect(manager.getScreenshot(screenshot.id)).toBeUndefined();
        });
        
        test('should return error for non-existent screenshot', async () => {
            const result = await manager.deleteScreenshot('non_existent_id');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Screenshot not found');
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    const { execSync } = require('child_process');
    try {
        execSync('npx jest screenshot-manager.test.js --verbose', {
            cwd: path.join(__dirname, '../..'),
            stdio: 'inherit'
        });
    } catch (error) {
        process.exit(1);
    }
}
