/**
 * State Persistence Module
 * Handles saving and restoring application state for graceful shutdown/startup
 */

const fs = require('fs').promises;
const path = require('path');

class StatePersistence {
    constructor(options = {}) {
        this.config = {
            stateDir: options.stateDir || path.join(__dirname, '../data/state'),
            autoSaveInterval: options.autoSaveInterval || 5 * 60 * 1000, // 5 minutes
            maxBackups: options.maxBackups || 5,
            ...options
        };
        
        this.state = {
            version: '1.0.0',
            timestamp: null,
            bankroll: null,
            pendingBets: [],
            activeOpportunities: [],
            liveMatches: [],
            rateLimiter: null,
            healthMonitor: null,
            session: {
                startTime: null,
                totalAnalyses: 0,
                opportunitiesFound: 0,
                betsPlaced: 0
            }
        };
        
        this.autoSaveTimer = null;
        this.isShuttingDown = false;
    }

    /**
     * Initialize state persistence
     */
    async init() {
        await this.ensureStateDir();
        
        // Try to restore previous state
        const restored = await this.restore();
        if (restored) {
            console.log('✅ Previous state restored');
        }
        
        // Start auto-save
        this.startAutoSave();
        
        // Record session start
        this.state.session.startTime = new Date().toISOString();
        
        return restored;
    }

    /**
     * Ensure state directory exists
     */
    async ensureStateDir() {
        try {
            await fs.mkdir(this.config.stateDir, { recursive: true });
        } catch (e) {
            // Directory exists or error
        }
    }

    /**
     * Get state file path
     */
    getStateFile() {
        return path.join(this.config.stateDir, 'current-state.json');
    }

    /**
     * Get backup file path
     */
    getBackupFile(index) {
        return path.join(this.config.stateDir, `state-backup-${index}.json`);
    }

    /**
     * Save current state to disk
     */
    async save(source = 'manual') {
        if (this.isShuttingDown && source !== 'shutdown') {
            return false;
        }

        try {
            // Update timestamp
            this.state.timestamp = new Date().toISOString();
            
            // Create backup of current state file if it exists
            await this.rotateBackups();
            
            // Write new state
            const stateFile = this.getStateFile();
            await fs.writeFile(
                stateFile,
                JSON.stringify(this.state, null, 2),
                'utf8'
            );
            
            console.log(`💾 State saved (${source})`);
            return true;
        } catch (error) {
            console.error('Failed to save state:', error.message);
            return false;
        }
    }

    /**
     * Rotate backup files
     */
    async rotateBackups() {
        try {
            const stateFile = this.getStateFile();
            
            // Check if current state exists
            try {
                await fs.access(stateFile);
            } catch {
                return; // No current state to backup
            }
            
            // Shift backups
            for (let i = this.config.maxBackups - 1; i > 0; i--) {
                const oldBackup = this.getBackupFile(i - 1);
                const newBackup = this.getBackupFile(i);
                
                try {
                    await fs.rename(oldBackup, newBackup);
                } catch {
                    // Old backup might not exist
                }
            }
            
            // Copy current to backup-0
            const currentContent = await fs.readFile(stateFile, 'utf8');
            await fs.writeFile(this.getBackupFile(0), currentContent, 'utf8');
            
        } catch (error) {
            console.error('Failed to rotate backups:', error.message);
        }
    }

    /**
     * Restore state from disk
     */
    async restore() {
        try {
            const stateFile = this.getStateFile();
            const data = await fs.readFile(stateFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // Validate version
            if (parsed.version !== this.state.version) {
                console.warn(`State version mismatch: ${parsed.version} vs ${this.state.version}`);
                // Attempt migration if needed
            }
            
            this.state = { ...this.state, ...parsed };
            
            // Update restoration timestamp
            this.state.session.restoredAt = new Date().toISOString();
            
            return true;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to restore state:', error.message);
            }
            return false;
        }
    }

    /**
     * Restore from a specific backup
     */
    async restoreFromBackup(backupIndex = 0) {
        try {
            const backupFile = this.getBackupFile(backupIndex);
            const data = await fs.readFile(backupFile, 'utf8');
            const parsed = JSON.parse(data);
            
            this.state = { ...this.state, ...parsed };
            
            // Save as current state
            await this.save('backup-restore');
            
            return true;
        } catch (error) {
            console.error(`Failed to restore from backup ${backupIndex}:`, error.message);
            return false;
        }
    }

    /**
     * Update bankroll state
     */
    updateBankroll(bankrollData) {
        this.state.bankroll = {
            totalBankroll: bankrollData.totalBankroll,
            currency: bankrollData.currency,
            bookmakers: bankrollData.bookmakers,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Update pending bets
     */
    updatePendingBets(bets) {
        this.state.pendingBets = bets.map(bet => ({
            id: bet.id,
            event: bet.event,
            bookmaker: bet.bookmaker,
            stake: bet.stake,
            odds: bet.odds,
            expectedProfit: bet.expectedProfit,
            placedAt: bet.placedAt,
            status: bet.status
        }));
    }

    /**
     * Update active opportunities
     */
    updateActiveOpportunities(opportunities) {
        this.state.activeOpportunities = opportunities.map(opp => ({
            id: opp.id,
            event: opp.event,
            profit: opp.profitPercent || opp.evPercent,
            type: opp.type || 'arbitrage',
            timestamp: new Date().toISOString()
        }));
    }

    /**
     * Update live matches
     */
    updateLiveMatches(matches) {
        this.state.liveMatches = matches.map(match => ({
            id: match.id,
            eventName: match.eventName,
            sport: match.sport,
            status: match.status,
            score: match.score,
            period: match.period
        }));
    }

    /**
     * Update rate limiter state
     */
    updateRateLimiter(rateLimiterState) {
        this.state.rateLimiter = {
            queues: rateLimiterState.queues,
            stats: rateLimiterState.stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Update health monitor state
     */
    updateHealthMonitor(healthState) {
        this.state.healthMonitor = {
            bookmakerStatus: healthState.bookmakerStatus,
            circuitBreakers: healthState.circuitBreakers,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Record analysis run
     */
    recordAnalysis(opportunitiesFound = 0) {
        this.state.session.totalAnalyses++;
        this.state.session.opportunitiesFound += opportunitiesFound;
    }

    /**
     * Record bet placement
     */
    recordBetPlaced() {
        this.state.session.betsPlaced++;
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get session statistics
     */
    getSessionStats() {
        const now = new Date();
        const start = this.state.session.startTime 
            ? new Date(this.state.session.startTime) 
            : now;
        const uptime = Math.floor((now - start) / 1000); // seconds
        
        return {
            uptime,
            uptimeFormatted: this.formatUptime(uptime),
            ...this.state.session
        };
    }

    /**
     * Format uptime in human readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = setInterval(() => {
            this.save('auto');
        }, this.config.autoSaveInterval);
    }

    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Prepare for shutdown
     */
    async prepareShutdown() {
        this.isShuttingDown = true;
        this.stopAutoSave();
        
        // Final state save
        await this.save('shutdown');
        
        return this.getState();
    }

    /**
     * List available backups
     */
    async listBackups() {
        const backups = [];
        
        for (let i = 0; i < this.config.maxBackups; i++) {
            try {
                const backupFile = this.getBackupFile(i);
                const stat = await fs.stat(backupFile);
                const data = await fs.readFile(backupFile, 'utf8');
                const parsed = JSON.parse(data);
                
                backups.push({
                    index: i,
                    timestamp: parsed.timestamp,
                    size: stat.size,
                    version: parsed.version
                });
            } catch {
                // Backup doesn't exist
            }
        }
        
        return backups;
    }

    /**
     * Clear all state and backups
     */
    async clearAll() {
        try {
            // Delete current state
            await fs.unlink(this.getStateFile()).catch(() => {});
            
            // Delete backups
            for (let i = 0; i < this.config.maxBackups; i++) {
                await fs.unlink(this.getBackupFile(i)).catch(() => {});
            }
            
            // Reset state
            this.state = {
                version: '1.0.0',
                timestamp: null,
                bankroll: null,
                pendingBets: [],
                activeOpportunities: [],
                liveMatches: [],
                rateLimiter: null,
                healthMonitor: null,
                session: {
                    startTime: null,
                    totalAnalyses: 0,
                    opportunitiesFound: 0,
                    betsPlaced: 0
                }
            };
            
            return true;
        } catch (error) {
            console.error('Failed to clear state:', error.message);
            return false;
        }
    }
}

module.exports = StatePersistence;
