/**
 * Bookmaker API Health Monitor
 * Monitors API response times, error rates, data freshness for each bookmaker
 * Alerts on issues and tracks health trends over time
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class BookmakerHealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.healthFile = path.join(this.dataDir, 'bookmaker-api-health.json');
    this.alertsFile = path.join(this.dataDir, 'health-alerts.json');
    
    // Health check configuration
    this.config = {
      // Response time thresholds (ms)
      responseTime: {
        excellent: 500,
        good: 1000,
        fair: 3000,
        poor: 5000
      },
      // Error rate thresholds (%)
      errorRate: {
        excellent: 1,
        good: 5,
        fair: 10,
        poor: 20
      },
      // Data freshness thresholds (minutes)
      dataFreshness: {
        excellent: 1,
        good: 5,
        fair: 15,
        poor: 30
      },
      // Uptime thresholds (%)
      uptime: {
        excellent: 99.9,
        good: 99.0,
        fair: 95.0,
        poor: 90.0
      },
      // Check intervals
      checkIntervalMs: options.checkIntervalMs || 60000, // 1 minute
      historyRetentionDays: options.historyRetentionDays || 30,
      alertCooldownMs: options.alertCooldownMs || 300000 // 5 minutes
    };
    
    // Track current health status
    this.healthStatus = new Map();
    
    // Track active alerts
    this.activeAlerts = new Map();
    
    // Last alert timestamps (for cooldown)
    this.lastAlertTime = new Map();
    
    // Monitoring interval
    this.monitorInterval = null;
    
    // Bookmaker configurations
    this.bookmakers = new Map();
  }
  
  async init() {
    await this.loadHealthData();
    await this.loadAlerts();
    this.initializeDefaultBookmakers();
    console.log('[HealthMonitor] Initialized with', this.bookmakers.size, 'bookmakers');
    return this;
  }
  
  /**
   * Initialize default bookmaker configurations
   */
  initializeDefaultBookmakers() {
    const defaults = [
      { name: 'Unibet', apiUrl: 'https://www.unibet.fr/api', priority: 'high' },
      { name: 'Betclic', apiUrl: 'https://www.betclic.fr/api', priority: 'high' },
      { name: 'Winamax', apiUrl: 'https://www.winamax.fr/api', priority: 'high' },
      { name: 'FDJ', apiUrl: 'https://www.fdj.fr/api', priority: 'medium' },
      { name: 'ParionsSport', apiUrl: 'https://www.enligne.parionssport.fdj.fr/api', priority: 'medium' },
      { name: 'ZEbet', apiUrl: 'https://www.zebet.fr/api', priority: 'medium' },
      { name: 'Betfair', apiUrl: 'https://api.betfair.com', priority: 'high', isExchange: true },
      { name: 'Smarkets', apiUrl: 'https://api.smarkets.com', priority: 'medium', isExchange: true },
      { name: 'Pinnacle', apiUrl: 'https://api.pinnacle.com', priority: 'high' },
      { name: 'Polymarket', apiUrl: 'https://api.polymarket.com', priority: 'medium', isBlockchain: true }
    ];
    
    for (const bm of defaults) {
      if (!this.bookmakers.has(bm.name)) {
        this.bookmakers.set(bm.name, {
          ...bm,
          enabled: true,
          addedAt: new Date().toISOString()
        });
      }
    }
  }
  
  /**
   * Load health data from disk
   */
  async loadHealthData() {
    try {
      const data = await fs.readFile(this.healthFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Restore health status
      for (const [name, status] of Object.entries(parsed.healthStatus || {})) {
        this.healthStatus.set(name, status);
      }
      
      // Restore bookmaker configs
      for (const [name, config] of Object.entries(parsed.bookmakers || {})) {
        this.bookmakers.set(name, config);
      }
    } catch (error) {
      // Initialize fresh
      this.healthStatus = new Map();
    }
  }
  
  /**
   * Load alerts from disk
   */
  async loadAlerts() {
    try {
      const data = await fs.readFile(this.alertsFile, 'utf8');
      const parsed = JSON.parse(data);
      
      for (const [name, alerts] of Object.entries(parsed.activeAlerts || {})) {
        this.activeAlerts.set(name, alerts);
      }
    } catch (error) {
      this.activeAlerts = new Map();
    }
  }
  
  /**
   * Save health data to disk
   */
  async saveHealthData() {
    const data = {
      healthStatus: Object.fromEntries(this.healthStatus),
      bookmakers: Object.fromEntries(this.bookmakers),
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(this.healthFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Save alerts to disk
   */
  async saveAlerts() {
    const data = {
      activeAlerts: Object.fromEntries(this.activeAlerts),
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(this.alertsFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Record a health check result
   */
  async recordHealthCheck(bookmaker, checkResult) {
    const now = new Date().toISOString();
    
    if (!this.healthStatus.has(bookmaker)) {
      this.healthStatus.set(bookmaker, {
        name: bookmaker,
        history: [],
        current: null,
        stats: {
          totalChecks: 0,
          failedChecks: 0,
          avgResponseTime: 0,
          uptimePercent: 100
        }
      });
    }
    
    const status = this.healthStatus.get(bookmaker);
    
    // Create health entry
    const entry = {
      timestamp: now,
      responseTime: checkResult.responseTime,
      errorRate: checkResult.errorRate || 0,
      dataFreshness: checkResult.dataFreshness || 0,
      success: checkResult.success,
      error: checkResult.error || null,
      status: this.calculateHealthStatus(checkResult)
    };
    
    // Update current status
    status.current = entry;
    status.history.push(entry);
    
    // Keep only last 24 hours of history
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    status.history = status.history.filter(h => new Date(h.timestamp) > cutoff);
    
    // Update statistics
    status.stats.totalChecks++;
    if (!checkResult.success) {
      status.stats.failedChecks++;
    }
    
    // Calculate rolling averages
    const recentChecks = status.history.slice(-100);
    status.stats.avgResponseTime = recentChecks.reduce((sum, h) => sum + h.responseTime, 0) / recentChecks.length;
    status.stats.uptimePercent = ((status.stats.totalChecks - status.stats.failedChecks) / status.stats.totalChecks) * 100;
    
    // Check for alerts
    await this.checkForAlerts(bookmaker, entry, status);
    
    this.emit('healthCheckRecorded', { bookmaker, entry, status });
    
    // Periodically save
    if (status.stats.totalChecks % 10 === 0) {
      await this.saveHealthData();
    }
    
    return entry;
  }
  
  /**
   * Calculate overall health status from check result
   */
  calculateHealthStatus(checkResult) {
    const scores = {
      responseTime: this.scoreResponseTime(checkResult.responseTime),
      errorRate: this.scoreErrorRate(checkResult.errorRate || 0),
      dataFreshness: this.scoreDataFreshness(checkResult.dataFreshness || 0),
      success: checkResult.success ? 100 : 0
    };
    
    const avgScore = (scores.responseTime + scores.errorRate + scores.dataFreshness + scores.success) / 4;
    
    if (avgScore >= 90) return 'excellent';
    if (avgScore >= 75) return 'good';
    if (avgScore >= 50) return 'fair';
    if (avgScore >= 25) return 'poor';
    return 'critical';
  }
  
  /**
   * Score response time
   */
  scoreResponseTime(ms) {
    if (ms <= this.config.responseTime.excellent) return 100;
    if (ms <= this.config.responseTime.good) return 80;
    if (ms <= this.config.responseTime.fair) return 60;
    if (ms <= this.config.responseTime.poor) return 40;
    return Math.max(0, 100 - (ms / 100));
  }
  
  /**
   * Score error rate
   */
  scoreErrorRate(percent) {
    if (percent <= this.config.errorRate.excellent) return 100;
    if (percent <= this.config.errorRate.good) return 80;
    if (percent <= this.config.errorRate.fair) return 60;
    if (percent <= this.config.errorRate.poor) return 40;
    return Math.max(0, 100 - percent * 2);
  }
  
  /**
   * Score data freshness
   */
  scoreDataFreshness(minutes) {
    if (minutes <= this.config.dataFreshness.excellent) return 100;
    if (minutes <= this.config.dataFreshness.good) return 80;
    if (minutes <= this.config.dataFreshness.fair) return 60;
    if (minutes <= this.config.dataFreshness.poor) return 40;
    return Math.max(0, 100 - minutes);
  }
  
  /**
   * Check for alerts and emit if needed
   */
  async checkForAlerts(bookmaker, entry, status) {
    const alerts = [];
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(bookmaker) || 0;
    
    // Check cooldown
    if (now - lastAlert < this.config.alertCooldownMs) {
      return;
    }
    
    // Check for critical issues
    if (!entry.success) {
      alerts.push({
        type: 'error',
        severity: 'critical',
        message: `${bookmaker} API is unreachable`,
        details: entry.error
      });
    }
    
    // Check response time
    if (entry.responseTime > this.config.responseTime.poor) {
      alerts.push({
        type: 'performance',
        severity: 'warning',
        message: `${bookmaker} API response time is very slow (${Math.round(entry.responseTime)}ms)`,
        details: { responseTime: entry.responseTime }
      });
    } else if (entry.responseTime > this.config.responseTime.fair) {
      alerts.push({
        type: 'performance',
        severity: 'info',
        message: `${bookmaker} API response time is slow (${Math.round(entry.responseTime)}ms)`,
        details: { responseTime: entry.responseTime }
      });
    }
    
    // Check error rate
    if (entry.errorRate > this.config.errorRate.poor) {
      alerts.push({
        type: 'reliability',
        severity: 'critical',
        message: `${bookmaker} API error rate is very high (${entry.errorRate.toFixed(1)}%)`,
        details: { errorRate: entry.errorRate }
      });
    } else if (entry.errorRate > this.config.errorRate.fair) {
      alerts.push({
        type: 'reliability',
        severity: 'warning',
        message: `${bookmaker} API error rate is elevated (${entry.errorRate.toFixed(1)}%)`,
        details: { errorRate: entry.errorRate }
      });
    }
    
    // Check data freshness
    if (entry.dataFreshness > this.config.dataFreshness.poor) {
      alerts.push({
        type: 'freshness',
        severity: 'warning',
        message: `${bookmaker} data is stale (${Math.round(entry.dataFreshness)} minutes old)`,
        details: { dataFreshness: entry.dataFreshness }
      });
    }
    
    // Check status degradation
    if (status.history.length >= 5) {
      const recent = status.history.slice(-5);
      const degrading = recent.every((h, i) => i === 0 || h.status === 'critical' || this.statusRank(h.status) <= this.statusRank(recent[i-1].status));
      
      if (degrading && recent[recent.length - 1].status === 'critical') {
        alerts.push({
          type: 'degradation',
          severity: 'critical',
          message: `${bookmaker} API health is degrading rapidly`,
          details: { recentStatuses: recent.map(r => r.status) }
        });
      }
    }
    
    // Emit alerts
    if (alerts.length > 0) {
      this.activeAlerts.set(bookmaker, alerts);
      this.lastAlertTime.set(bookmaker, now);
      
      for (const alert of alerts) {
        this.emit('alert', { bookmaker, ...alert });
      }
      
      await this.saveAlerts();
    } else {
      // Clear alerts if resolved
      if (this.activeAlerts.has(bookmaker)) {
        this.activeAlerts.delete(bookmaker);
        this.emit('resolved', { bookmaker, message: `${bookmaker} API health issues resolved` });
        await this.saveAlerts();
      }
    }
  }
  
  /**
   * Get status rank for comparison
   */
  statusRank(status) {
    const ranks = { excellent: 5, good: 4, fair: 3, poor: 2, critical: 1 };
    return ranks[status] || 0;
  }
  
  /**
   * Get current health status for all bookmakers
   */
  getAllHealthStatus() {
    const result = {};
    for (const [name, status] of this.healthStatus) {
      result[name] = {
        name,
        current: status.current,
        stats: status.stats,
        activeAlerts: this.activeAlerts.get(name) || []
      };
    }
    return result;
  }
  
  /**
   * Get health status for specific bookmaker
   */
  getHealthStatus(bookmaker) {
    const status = this.healthStatus.get(bookmaker);
    if (!status) return null;
    
    return {
      name: bookmaker,
      current: status.current,
      history: status.history.slice(-24), // Last 24 entries
      stats: status.stats,
      activeAlerts: this.activeAlerts.get(bookmaker) || []
    };
  }
  
  /**
   * Get health summary
   */
  getHealthSummary() {
    const statuses = Array.from(this.healthStatus.values());
    
    const summary = {
      total: statuses.length,
      byStatus: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        critical: 0,
        unknown: 0
      },
      avgResponseTime: 0,
      avgUptime: 0,
      activeAlerts: 0,
      timestamp: new Date().toISOString()
    };
    
    let totalResponseTime = 0;
    let totalUptime = 0;
    
    for (const status of statuses) {
      const currentStatus = status.current?.status || 'unknown';
      summary.byStatus[currentStatus]++;
      
      if (status.stats) {
        totalResponseTime += status.stats.avgResponseTime || 0;
        totalUptime += status.stats.uptimePercent || 100;
      }
      
      summary.activeAlerts += (this.activeAlerts.get(status.name) || []).length;
    }
    
    if (statuses.length > 0) {
      summary.avgResponseTime = Math.round(totalResponseTime / statuses.length);
      summary.avgUptime = Math.round((totalUptime / statuses.length) * 100) / 100;
    }
    
    return summary;
  }
  
  /**
   * Get bookmakers by health status
   */
  getBookmakersByStatus(status) {
    const result = [];
    for (const [name, health] of this.healthStatus) {
      if (health.current?.status === status) {
        result.push(name);
      }
    }
    return result;
  }
  
  /**
   * Get performance trends
   */
  getPerformanceTrends(bookmaker, hours = 24) {
    const status = this.healthStatus.get(bookmaker);
    if (!status) return null;
    
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    const history = status.history.filter(h => new Date(h.timestamp) > cutoff);
    
    if (history.length === 0) return null;
    
    return {
      bookmaker,
      period: `${hours}h`,
      dataPoints: history.length,
      avgResponseTime: history.reduce((sum, h) => sum + h.responseTime, 0) / history.length,
      maxResponseTime: Math.max(...history.map(h => h.responseTime)),
      minResponseTime: Math.min(...history.map(h => h.responseTime)),
      errorRate: (history.filter(h => !h.success).length / history.length) * 100,
      statusChanges: history.filter((h, i) => i > 0 && h.status !== history[i-1].status).length,
      trend: this.calculateTrend(history)
    };
  }
  
  /**
   * Calculate trend direction
   */
  calculateTrend(history) {
    if (history.length < 6) return 'insufficient_data';
    
    const firstHalf = history.slice(0, Math.floor(history.length / 2));
    const secondHalf = history.slice(Math.floor(history.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, h) => sum + this.statusRank(h.status), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + this.statusRank(h.status), 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    
    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'degrading';
    return 'stable';
  }
  
  /**
   * Start continuous monitoring
   */
  startMonitoring(checkFn) {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    console.log('[HealthMonitor] Starting continuous monitoring');
    
    this.monitorInterval = setInterval(async () => {
      for (const [name, config] of this.bookmakers) {
        if (!config.enabled) continue;
        
        try {
          const checkResult = await checkFn(name, config);
          await this.recordHealthCheck(name, checkResult);
        } catch (error) {
          await this.recordHealthCheck(name, {
            responseTime: 0,
            success: false,
            error: error.message
          });
        }
      }
    }, this.config.checkIntervalMs);
    
    this.emit('monitoringStarted');
  }
  
  /**
   * Stop continuous monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('[HealthMonitor] Stopped monitoring');
      this.emit('monitoringStopped');
    }
  }
  
  /**
   * Add a new bookmaker to monitor
   */
  addBookmaker(name, config) {
    this.bookmakers.set(name, {
      name,
      enabled: true,
      addedAt: new Date().toISOString(),
      ...config
    });
    this.saveHealthData();
    this.emit('bookmakerAdded', { name, config });
  }
  
  /**
   * Remove a bookmaker from monitoring
   */
  removeBookmaker(name) {
    this.bookmakers.delete(name);
    this.healthStatus.delete(name);
    this.activeAlerts.delete(name);
    this.saveHealthData();
    this.emit('bookmakerRemoved', { name });
  }
  
  /**
   * Enable/disable bookmaker monitoring
   */
  setBookmakerEnabled(name, enabled) {
    const config = this.bookmakers.get(name);
    if (config) {
      config.enabled = enabled;
      this.bookmakers.set(name, config);
      this.saveHealthData();
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }
  
  /**
   * Get configuration
   */
  getConfig() {
    return this.config;
  }
  
  /**
   * Clear all history
   */
  async clearHistory() {
    for (const status of this.healthStatus.values()) {
      status.history = [];
      status.stats = {
        totalChecks: 0,
        failedChecks: 0,
        avgResponseTime: 0,
        uptimePercent: 100
      };
    }
    await this.saveHealthData();
  }
  
  /**
   * Export health data
   */
  async exportData(format = 'json') {
    const data = {
      bookmakers: Object.fromEntries(this.bookmakers),
      healthStatus: Object.fromEntries(this.healthStatus),
      activeAlerts: Object.fromEntries(this.activeAlerts),
      summary: this.getHealthSummary(),
      exportedAt: new Date().toISOString()
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const rows = [];
      rows.push('bookmaker,timestamp,status,response_time,error_rate,data_freshness,success');
      
      for (const [name, status] of this.healthStatus) {
        for (const entry of status.history) {
          rows.push(`${name},${entry.timestamp},${entry.status},${entry.responseTime},${entry.errorRate || 0},${entry.dataFreshness || 0},${entry.success}`);
        }
      }
      
      return rows.join('\n');
    }
    
    return JSON.stringify(data, null, 2);
  }
}

module.exports = { BookmakerHealthMonitor };
