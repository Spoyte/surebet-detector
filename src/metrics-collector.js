/**
 * Metrics and Monitoring Module
 * Provides Prometheus-compatible metrics and health monitoring endpoints
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class MetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            dataDir: options.dataDir || path.join(__dirname, '../data'),
            retentionHours: options.retentionHours || 24,
            ...options
        };
        
        // Metrics storage
        this.metrics = {
            counters: new Map(),
            gauges: new Map(),
            histograms: new Map(),
            timers: new Map()
        };
        
        // Historical data for trends
        this.history = {
            system: [],
            opportunities: [],
            bets: [],
            apiCalls: [],
            errors: []
        };
        
        this.startTime = Date.now();
        this.lastSnapshot = null;
        
        // Start periodic snapshot
        this.snapshotInterval = setInterval(() => this.takeSnapshot(), 60000); // Every minute
    }

    /**
     * Initialize metrics collector
     */
    async init() {
        await this.loadHistory();
        this.takeSnapshot();
        return true;
    }

    /**
     * Counter operations
     */
    increment(name, labels = {}, value = 1) {
        const key = this.getKey(name, labels);
        const current = this.metrics.counters.get(key) || 0;
        this.metrics.counters.set(key, current + value);
        return current + value;
    }

    /**
     * Gauge operations
     */
    setGauge(name, value, labels = {}) {
        const key = this.getKey(name, labels);
        this.metrics.gauges.set(key, { value, timestamp: Date.now() });
        return value;
    }

    getGauge(name, labels = {}) {
        const key = this.getKey(name, labels);
        const gauge = this.metrics.gauges.get(key);
        return gauge ? gauge.value : null;
    }

    /**
     * Histogram operations
     */
    observeHistogram(name, value, labels = {}) {
        const key = this.getKey(name, labels);
        
        if (!this.metrics.histograms.has(key)) {
            this.metrics.histograms.set(key, {
                values: [],
                sum: 0,
                count: 0,
                buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
            });
        }
        
        const hist = this.metrics.histograms.get(key);
        hist.values.push(value);
        hist.sum += value;
        hist.count++;
        
        // Keep only last 1000 values
        if (hist.values.length > 1000) {
            hist.values.shift();
        }
        
        return hist;
    }

    /**
     * Timer operations
     */
    startTimer(name, labels = {}) {
        const startTime = Date.now();
        return {
            end: () => {
                const duration = (Date.now() - startTime) / 1000; // Convert to seconds
                this.observeHistogram(name, duration, labels);
                return duration;
            }
        };
    }

    /**
     * Get composite key for metric
     */
    getKey(name, labels) {
        if (Object.keys(labels).length === 0) return name;
        const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }

    /**
     * Parse key back to name and labels
     */
    parseKey(key) {
        const match = key.match(/^(.+?)\{(.+)\}$/);
        if (!match) return { name: key, labels: {} };
        
        const name = match[1];
        const labels = {};
        match[2].split(',').forEach(pair => {
            const [k, v] = pair.split('=');
            labels[k] = v.replace(/"/g, '');
        });
        
        return { name, labels };
    }

    /**
     * Take a snapshot of current metrics
     */
    takeSnapshot() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            counters: Object.fromEntries(this.metrics.counters),
            gauges: Object.fromEntries(
                Array.from(this.metrics.gauges.entries()).map(([k, v]) => [k, v.value])
            ),
            histograms: this.getHistogramSummary()
        };
        
        this.lastSnapshot = snapshot;
        this.history.system.push({
            timestamp: snapshot.timestamp,
            uptime: snapshot.uptime,
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        });
        
        // Trim old history
        const cutoff = Date.now() - this.config.retentionHours * 60 * 60 * 1000;
        this.history.system = this.history.system.filter(
            h => new Date(h.timestamp).getTime() > cutoff
        );
        
        this.emit('snapshot', snapshot);
        return snapshot;
    }

    /**
     * Get histogram summary statistics
     */
    getHistogramSummary() {
        const summary = {};
        
        for (const [key, hist] of this.metrics.histograms) {
            const values = [...hist.values].sort((a, b) => a - b);
            const count = values.length;
            
            if (count === 0) continue;
            
            summary[key] = {
                count,
                sum: hist.sum,
                avg: hist.sum / count,
                min: values[0],
                max: values[count - 1],
                p50: this.percentile(values, 0.5),
                p95: this.percentile(values, 0.95),
                p99: this.percentile(values, 0.99),
                buckets: hist.buckets.map(b => ({
                    le: b,
                    count: values.filter(v => v <= b).length
                }))
            };
        }
        
        return summary;
    }

    /**
     * Calculate percentile
     */
    percentile(sortedValues, p) {
        const index = Math.ceil(sortedValues.length * p) - 1;
        return sortedValues[Math.max(0, index)];
    }

    /**
     * Get all metrics in Prometheus format
     */
    getPrometheusMetrics() {
        let output = [];
        
        // Add header
        output.push('# Surebet Detector Metrics');
        output.push(`# Generated at ${new Date().toISOString()}`);
        output.push('');
        
        // Counters
        output.push('# Counters');
        for (const [key, value] of this.metrics.counters) {
            const { name, labels } = this.parseKey(key);
            output.push(`# TYPE ${name} counter`);
            if (Object.keys(labels).length > 0) {
                const labelStr = Object.entries(labels)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(',');
                output.push(`${name}{${labelStr}} ${value}`);
            } else {
                output.push(`${name} ${value}`);
            }
        }
        output.push('');
        
        // Gauges
        output.push('# Gauges');
        for (const [key, gauge] of this.metrics.gauges) {
            const { name, labels } = this.parseKey(key);
            output.push(`# TYPE ${name} gauge`);
            if (Object.keys(labels).length > 0) {
                const labelStr = Object.entries(labels)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(',');
                output.push(`${name}{${labelStr}} ${gauge.value}`);
            } else {
                output.push(`${name} ${gauge.value}`);
            }
        }
        output.push('');
        
        // Histograms
        output.push('# Histograms');
        for (const [key, hist] of this.metrics.histograms) {
            const { name, labels } = this.parseKey(key);
            output.push(`# TYPE ${name} histogram`);
            
            for (const bucket of hist.buckets) {
                const count = hist.values.filter(v => v <= bucket).length;
                if (Object.keys(labels).length > 0) {
                    const labelStr = Object.entries(labels)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(',');
                    output.push(`${name}_bucket{${labelStr},le="${bucket}"} ${count}`);
                } else {
                    output.push(`${name}_bucket{le="${bucket}"} ${count}`);
                }
            }
            
            if (Object.keys(labels).length > 0) {
                const labelStr = Object.entries(labels)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(',');
                output.push(`${name}_sum{${labelStr}} ${hist.sum}`);
                output.push(`${name}_count{${labelStr}} ${hist.count}`);
            } else {
                output.push(`${name}_sum ${hist.sum}`);
                output.push(`${name}_count ${hist.count}`);
            }
            output.push('');
        }
        
        return output.join('\n');
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        return {
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            counters: Object.fromEntries(this.metrics.counters),
            gauges: Object.fromEntries(
                Array.from(this.metrics.gauges.entries()).map(([k, v]) => [k, v.value])
            ),
            histograms: this.getHistogramSummary()
        };
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        const memory = process.memoryUsage();
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        
        // Determine health based on various factors
        let status = 'healthy';
        const checks = {
            memory: memory.heapUsed < 512 * 1024 * 1024 ? 'pass' : 'warn', // 512MB threshold
            uptime: uptime > 0 ? 'pass' : 'fail',
            metrics: this.metrics.counters.size > 0 ? 'pass' : 'warn'
        };
        
        if (Object.values(checks).some(c => c === 'fail')) {
            status = 'unhealthy';
        } else if (Object.values(checks).some(c => c === 'warn')) {
            status = 'degraded';
        }
        
        return {
            status,
            timestamp: new Date().toISOString(),
            uptime,
            checks,
            memory: {
                used: memory.heapUsed,
                total: memory.heapTotal,
                rss: memory.rss,
                external: memory.external
            }
        };
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const memory = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            timestamp: new Date().toISOString(),
            memory: {
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                rss: memory.rss,
                external: memory.external,
                arrayBuffers: memory.arrayBuffers
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            eventLoopLag: this.estimateEventLoopLag()
        };
    }

    /**
     * Estimate event loop lag (rough approximation)
     */
    estimateEventLoopLag() {
        const start = process.hrtime.bigint();
        return new Promise((resolve) => {
            setImmediate(() => {
                const end = process.hrtime.bigint();
                const lag = Number(end - start) / 1000000; // Convert to ms
                resolve(lag);
            });
        });
    }

    /**
     * Get historical trends
     */
    getTrends(timeRange = '1h') {
        const hours = parseInt(timeRange) || 1;
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        
        const systemHistory = this.history.system.filter(
            h => new Date(h.timestamp).getTime() > cutoff
        );
        
        if (systemHistory.length === 0) {
            return { error: 'No data available for time range' };
        }
        
        // Calculate trends
        const memoryTrend = systemHistory.map(h => ({
            timestamp: h.timestamp,
            heapUsed: h.memory.heapUsed,
            rss: h.memory.rss
        }));
        
        const avgMemory = memoryTrend.reduce((sum, h) => sum + h.heapUsed, 0) / memoryTrend.length;
        const maxMemory = Math.max(...memoryTrend.map(h => h.heapUsed));
        const minMemory = Math.min(...memoryTrend.map(h => h.heapUsed));
        
        return {
            timeRange: `${hours}h`,
            dataPoints: systemHistory.length,
            memory: {
                trend: memoryTrend,
                average: avgMemory,
                max: maxMemory,
                min: minMemory
            }
        };
    }

    /**
     * Record opportunity metrics
     */
    recordOpportunity(type, opportunity) {
        this.increment('opportunities_total', { type });
        this.increment('opportunities_by_sport', { sport: opportunity.sport || 'unknown' });
        
        if (opportunity.profitPercent) {
            this.observeHistogram('opportunity_profit_percent', opportunity.profitPercent, { type });
        }
        if (opportunity.evPercent) {
            this.observeHistogram('opportunity_ev_percent', opportunity.evPercent, { type });
        }
        
        this.history.opportunities.push({
            timestamp: new Date().toISOString(),
            type,
            sport: opportunity.sport,
            profit: opportunity.profitPercent || opportunity.evPercent
        });
    }

    /**
     * Record bet metrics
     */
    recordBet(bet, result = null) {
        this.increment('bets_total', { status: result ? 'settled' : 'placed' });
        
        if (result) {
            this.increment('bets_by_result', { result: result.result });
            if (result.actualProfit !== undefined) {
                this.observeHistogram('bet_profit', result.actualProfit);
            }
        }
        
        this.history.bets.push({
            timestamp: new Date().toISOString(),
            betId: bet.id,
            bookmaker: bet.bookmaker,
            stake: bet.stake,
            result: result?.result,
            profit: result?.actualProfit
        });
    }

    /**
     * Record API call metrics
     */
    recordApiCall(bookmaker, duration, success) {
        this.increment('api_calls_total', { bookmaker, status: success ? 'success' : 'error' });
        this.observeHistogram('api_call_duration_seconds', duration, { bookmaker });
        
        this.history.apiCalls.push({
            timestamp: new Date().toISOString(),
            bookmaker,
            duration,
            success
        });
    }

    /**
     * Record error
     */
    recordError(type, message) {
        this.increment('errors_total', { type });
        
        this.history.errors.push({
            timestamp: new Date().toISOString(),
            type,
            message: message.substring(0, 200) // Truncate long messages
        });
        
        // Keep only last 1000 errors
        if (this.history.errors.length > 1000) {
            this.history.errors.shift();
        }
    }

    /**
     * Load historical data from disk
     */
    async loadHistory() {
        try {
            const historyFile = path.join(this.config.dataDir, 'metrics-history.json');
            const data = await fs.readFile(historyFile, 'utf8');
            const parsed = JSON.parse(data);
            
            this.history = {
                ...this.history,
                ...parsed
            };
        } catch (error) {
            // History file might not exist yet
        }
    }

    /**
     * Save historical data to disk
     */
    async saveHistory() {
        try {
            const historyFile = path.join(this.config.dataDir, 'metrics-history.json');
            await fs.writeFile(
                historyFile,
                JSON.stringify(this.history, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('Failed to save metrics history:', error.message);
        }
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics.counters.clear();
        this.metrics.gauges.clear();
        this.metrics.histograms.clear();
        this.startTime = Date.now();
    }

    /**
     * Shutdown
     */
    async shutdown() {
        clearInterval(this.snapshotInterval);
        await this.saveHistory();
    }
}

module.exports = MetricsCollector;
