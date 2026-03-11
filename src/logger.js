/**
 * Comprehensive Logging and Audit Trail Module
 * Provides structured logging, audit trails, and debug capabilities
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Log levels
 */
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

const LogLevelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

/**
 * Main Logger Class
 */
class Logger {
    constructor(options = {}) {
        this.config = {
            level: options.level || LogLevel.INFO,
            console: options.console !== false,
            file: options.file !== false,
            logDir: options.logDir || path.join(__dirname, '../logs'),
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles || 10,
            includeTimestamp: options.includeTimestamp !== false,
            includeLevel: options.includeLevel !== false,
            includeContext: options.includeContext !== false,
            structured: options.structured !== false,
            ...options
        };

        this.logBuffer = [];
        this.bufferSize = options.bufferSize || 100;
        this.flushInterval = options.flushInterval || 5000;
        
        this.currentLogFile = null;
        this.currentFileSize = 0;
        
        // Ensure log directory exists
        this.ensureLogDir();
        
        // Start flush interval
        this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
        
        // Track log statistics
        this.stats = {
            totalLogs: 0,
            byLevel: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 },
            byCategory: new Map(),
            errors: []
        };
    }

    async ensureLogDir() {
        try {
            await fs.mkdir(this.config.logDir, { recursive: true });
        } catch (e) {
            // Directory exists or error
        }
    }

    /**
     * Get current log file path
     */
    async getLogFile() {
        if (this.currentLogFile && this.currentFileSize < this.config.maxFileSize) {
            return this.currentLogFile;
        }

        const date = new Date().toISOString().split('T')[0];
        const timestamp = Date.now();
        this.currentLogFile = path.join(this.config.logDir, `app-${date}-${timestamp}.log`);
        this.currentFileSize = 0;
        
        // Clean up old log files
        await this.cleanupOldLogs();
        
        return this.currentLogFile;
    }

    /**
     * Clean up old log files
     */
    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.config.logDir);
            const logFiles = files
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.config.logDir, f),
                    stat: fs.stat(path.join(this.config.logDir, f))
                }));

            const stats = await Promise.all(logFiles.map(async f => ({
                ...f,
                stat: await f.stat.catch(() => null)
            })));

            const sorted = stats
                .filter(f => f.stat)
                .sort((a, b) => b.stat.mtime - a.stat.mtime);

            if (sorted.length > this.config.maxFiles) {
                const toDelete = sorted.slice(this.config.maxFiles);
                for (const file of toDelete) {
                    await fs.unlink(file.path).catch(() => {});
                }
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    /**
     * Create a child logger with additional context
     */
    child(context = {}) {
        const childLogger = new Logger({
            ...this.config,
            level: this.config.level,
            console: this.config.console,
            file: this.config.file
        });
        
        // Copy parent logger's state
        childLogger.stats = this.stats;
        childLogger.logBuffer = this.logBuffer;
        childLogger.currentLogFile = this.currentLogFile;
        childLogger.currentFileSize = this.currentFileSize;
        
        // Create wrapped methods that include the context
        const originalWrite = childLogger.write.bind(childLogger);
        childLogger.write = async (level, message, ctx = {}) => {
            return originalWrite(level, message, { ...context, ...ctx });
        };
        
        return childLogger;
    }

    /**
     * Format log entry
     */
    formatEntry(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const levelName = LogLevelNames[level] || 'UNKNOWN';
        
        if (this.config.structured) {
            return JSON.stringify({
                timestamp,
                level: levelName,
                message,
                ...context
            });
        }
        
        let formatted = '';
        if (this.config.includeTimestamp) formatted += `[${timestamp}] `;
        if (this.config.includeLevel) formatted += `[${levelName}] `;
        formatted += message;
        if (this.config.includeContext && Object.keys(context).length > 0) {
            formatted += ' ' + JSON.stringify(context);
        }
        return formatted;
    }

    /**
     * Write log entry
     */
    async write(level, message, context = {}) {
        if (level > this.config.level) return;

        const entry = this.formatEntry(level, message, context);
        
        // Update statistics
        this.stats.totalLogs++;
        const levelName = LogLevelNames[level];
        if (levelName) this.stats.byLevel[levelName]++;
        
        const category = context.category || 'general';
        const catStats = this.stats.byCategory.get(category) || { count: 0, lastLog: null };
        catStats.count++;
        catStats.lastLog = new Date().toISOString();
        this.stats.byCategory.set(category, catStats);

        // Console output
        if (this.config.console) {
            const consoleMethod = level <= LogLevel.ERROR ? 'error' : 
                                 level <= LogLevel.WARN ? 'warn' : 'log';
            console[consoleMethod](entry);
        }

        // File output
        if (this.config.file) {
            this.logBuffer.push(entry);
            if (this.logBuffer.length >= this.bufferSize) {
                await this.flush();
            }
        }

        // Track errors for quick access
        if (level <= LogLevel.ERROR) {
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                message,
                context
            });
            if (this.stats.errors.length > 100) {
                this.stats.errors.shift();
            }
        }
    }

    /**
     * Flush buffer to file
     */
    async flush() {
        if (this.logBuffer.length === 0) return;

        const entries = this.logBuffer.splice(0);
        const content = entries.join('\n') + '\n';
        
        try {
            const logFile = await this.getLogFile();
            await fs.appendFile(logFile, content, 'utf8');
            this.currentFileSize += Buffer.byteLength(content, 'utf8');
        } catch (e) {
            console.error('Failed to write log:', e.message);
        }
    }

    /**
     * Log methods
     */
    error(message, context) { return this.write(LogLevel.ERROR, message, context); }
    warn(message, context) { return this.write(LogLevel.WARN, message, context); }
    info(message, context) { return this.write(LogLevel.INFO, message, context); }
    debug(message, context) { return this.write(LogLevel.DEBUG, message, context); }
    trace(message, context) { return this.write(LogLevel.TRACE, message, context); }

    /**
     * Get statistics
     */
    getStats() {
        const categoryStats = {};
        for (const [cat, stats] of this.stats.byCategory) {
            categoryStats[cat] = stats;
        }
        
        return {
            totalLogs: this.stats.totalLogs,
            byLevel: { ...this.stats.byLevel },
            byCategory: categoryStats,
            recentErrors: this.stats.errors.slice(-10),
            bufferSize: this.logBuffer.length,
            currentLogFile: this.currentLogFile
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalLogs: 0,
            byLevel: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 },
            byCategory: new Map(),
            errors: []
        };
    }

    /**
     * Search logs
     */
    async search(options = {}) {
        const {
            level,
            category,
            startTime,
            endTime,
            searchText,
            limit = 100
        } = options;

        try {
            const files = await fs.readdir(this.config.logDir);
            const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
            
            const results = [];
            
            for (const file of logFiles) {
                if (results.length >= limit) break;
                
                const content = await fs.readFile(
                    path.join(this.config.logDir, file), 
                    'utf8'
                );
                
                const lines = content.split('\n').filter(l => l.trim());
                
                for (const line of lines) {
                    if (results.length >= limit) break;
                    
                    try {
                        const entry = JSON.parse(line);
                        
                        // Apply filters
                        if (level && LogLevel[entry.level] !== level) continue;
                        if (category && entry.category !== category) continue;
                        if (startTime && new Date(entry.timestamp) < new Date(startTime)) continue;
                        if (endTime && new Date(entry.timestamp) > new Date(endTime)) continue;
                        if (searchText && !line.includes(searchText)) continue;
                        
                        results.push(entry);
                    } catch (e) {
                        // Non-structured log line
                        if (searchText && line.includes(searchText)) {
                            results.push({ raw: line });
                        }
                    }
                }
            }
            
            return results;
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Shutdown logger
     */
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
}

/**
 * Audit Trail Class for tracking important actions
 */
class AuditTrail {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.config = {
            logDir: options.logDir || path.join(__dirname, '../logs'),
            maxEntries: options.maxEntries || 10000,
            ...options
        };
        
        this.auditLogFile = path.join(this.config.logDir, 'audit.log');
        this.entries = [];
        this.flushTimer = setInterval(() => this.flush(), 10000);
    }

    /**
     * Record an audit event
     */
    async record(action, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            ...details
        };

        this.entries.push(entry);
        
        // Log to main logger
        this.logger.info(`AUDIT: ${action}`, { category: 'audit', ...details });

        // Keep only recent entries in memory
        if (this.entries.length > this.config.maxEntries) {
            await this.flush();
            this.entries = this.entries.slice(-1000);
        }

        return entry;
    }

    /**
     * Record bet placement
     */
    async recordBetPlaced(betDetails) {
        return this.record('BET_PLACED', {
            type: 'bet',
            betId: betDetails.id,
            bookmaker: betDetails.bookmaker,
            event: betDetails.event,
            stake: betDetails.stake,
            odds: betDetails.odds,
            expectedProfit: betDetails.expectedProfit,
            timestamp: betDetails.timestamp
        });
    }

    /**
     * Record bet settlement
     */
    async recordBetSettled(betDetails, outcome) {
        return this.record('BET_SETTLED', {
            type: 'bet',
            betId: betDetails.id,
            bookmaker: betDetails.bookmaker,
            outcome: outcome.result,
            profit: outcome.profit,
            settledAt: outcome.settledAt
        });
    }

    /**
     * Record opportunity detection
     */
    async recordOpportunityDetected(opportunity) {
        return this.record('OPPORTUNITY_DETECTED', {
            type: 'opportunity',
            opportunityId: opportunity.id,
            event: opportunity.event,
            profit: opportunity.profit,
            ev: opportunity.ev,
            bookmakers: opportunity.bookmakers
        });
    }

    /**
     * Record configuration change
     */
    async recordConfigChange(changes, user = 'system') {
        return this.record('CONFIG_CHANGED', {
            type: 'config',
            user,
            changes
        });
    }

    /**
     * Record user login/logout
     */
    async recordAuthEvent(event, userId, details = {}) {
        return this.record(`AUTH_${event.toUpperCase()}`, {
            type: 'auth',
            userId,
            ...details
        });
    }

    /**
     * Record API error
     */
    async recordApiError(bookmaker, error, context = {}) {
        return this.record('API_ERROR', {
            type: 'error',
            bookmaker,
            error: error.message || error,
            ...context
        });
    }

    /**
     * Flush entries to file
     */
    async flush() {
        if (this.entries.length === 0) return;

        const entries = this.entries.splice(0);
        const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
        
        try {
            await fs.appendFile(this.auditLogFile, content, 'utf8');
        } catch (e) {
            this.logger.error('Failed to write audit log:', { error: e.message });
        }
    }

    /**
     * Search audit trail
     */
    async search(options = {}) {
        const {
            action,
            type,
            startTime,
            endTime,
            limit = 100
        } = options;

        // First check in-memory entries
        let results = [...this.entries];

        // Then read from file
        try {
            const content = await fs.readFile(this.auditLogFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    results.push(entry);
                } catch (e) {
                    // Skip invalid lines
                }
            }
        } catch (e) {
            // File might not exist yet
        }

        // Apply filters
        if (action) {
            results = results.filter(e => e.action === action);
        }
        if (type) {
            results = results.filter(e => e.type === type);
        }
        if (startTime) {
            results = results.filter(e => new Date(e.timestamp) >= new Date(startTime));
        }
        if (endTime) {
            results = results.filter(e => new Date(e.timestamp) <= new Date(endTime));
        }

        // Sort by timestamp descending and limit
        return results
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Get audit statistics
     */
    async getStats(timeRange = '24h') {
        const hours = parseInt(timeRange) || 24;
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        const entries = await this.search({ startTime: cutoff.toISOString(), limit: 10000 });
        
        const stats = {
            total: entries.length,
            byAction: {},
            byType: {},
            recent: entries.slice(0, 10)
        };

        for (const entry of entries) {
            stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
            stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
        }

        return stats;
    }

    /**
     * Shutdown audit trail
     */
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
}

/**
 * Debug Logger for development troubleshooting
 */
class DebugLogger {
    constructor(logger) {
        this.logger = logger;
        this.enabled = process.env.NODE_ENV === 'development';
        this.breakpoints = new Set();
        this.traceData = new Map();
    }

    /**
     * Enable/disable debugging
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Log function entry
     */
    enter(functionName, args = {}) {
        if (!this.enabled) return;
        
        this.logger.debug(`ENTER: ${functionName}`, {
            category: 'debug',
            function: functionName,
            args: this.sanitizeArgs(args)
        });
        
        this.traceData.set(functionName, {
            startTime: Date.now(),
            args
        });
    }

    /**
     * Log function exit
     */
    exit(functionName, result) {
        if (!this.enabled) return;
        
        const trace = this.traceData.get(functionName);
        const duration = trace ? Date.now() - trace.startTime : 0;
        
        this.logger.debug(`EXIT: ${functionName}`, {
            category: 'debug',
            function: functionName,
            duration,
            result: this.sanitizeResult(result)
        });
        
        this.traceData.delete(functionName);
    }

    /**
     * Log variable state
     */
    state(variableName, value) {
        if (!this.enabled) return;
        
        this.logger.debug(`STATE: ${variableName}`, {
            category: 'debug',
            variable: variableName,
            value: this.sanitizeResult(value)
        });
    }

    /**
     * Log API call
     */
    apiCall(url, method, payload) {
        if (!this.enabled) return;
        
        this.logger.debug(`API: ${method} ${url}`, {
            category: 'debug',
            type: 'api',
            url,
            method,
            payload: this.sanitizeArgs(payload)
        });
    }

    /**
     * Log API response
     */
    apiResponse(url, status, response) {
        if (!this.enabled) return;
        
        this.logger.debug(`API RESPONSE: ${url} (${status})`, {
            category: 'debug',
            type: 'api_response',
            url,
            status,
            response: this.sanitizeResult(response)
        });
    }

    /**
     * Set a breakpoint
     */
    breakpoint(name, condition) {
        if (!this.enabled) return;
        
        if (condition === undefined || condition) {
            this.logger.warn(`BREAKPOINT: ${name}`, {
                category: 'debug',
                breakpoint: name
            });
            
            if (typeof globalThis.debugger !== 'undefined') {
                // eslint-disable-next-line no-debugger
                debugger;
            }
        }
    }

    /**
     * Sanitize arguments for logging (remove sensitive data)
     */
    sanitizeArgs(args) {
        if (!args || typeof args !== 'object') return args;
        
        const sensitive = ['password', 'token', 'apiKey', 'secret', 'authorization'];
        const sanitized = { ...args };
        
        for (const key of Object.keys(sanitized)) {
            if (sensitive.some(s => key.toLowerCase().includes(s))) {
                sanitized[key] = '***REDACTED***';
            }
        }
        
        return sanitized;
    }

    /**
     * Sanitize result for logging
     */
    sanitizeResult(result) {
        if (typeof result === 'string' && result.length > 1000) {
            return result.substring(0, 1000) + '... [truncated]';
        }
        return result;
    }
}

/**
 * Create default logger instance
 */
function createLogger(options = {}) {
    return new Logger(options);
}

/**
 * Create logger with audit trail
 */
function createLoggerWithAudit(options = {}) {
    const logger = new Logger(options);
    const audit = new AuditTrail(logger, options);
    const debug = new DebugLogger(logger);
    
    return { logger, audit, debug };
}

// Create default logger instance for compatibility with TypeScript imports
const defaultLogger = createLogger();

module.exports = {
    Logger,
    AuditTrail,
    DebugLogger,
    LogLevel,
    LogLevelNames,
    createLogger,
    createLoggerWithAudit,
    default: defaultLogger
};
module.exports.default = defaultLogger;