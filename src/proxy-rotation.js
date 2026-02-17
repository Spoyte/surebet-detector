/**
 * VPN/Proxy Rotation System
 * 
 * Manages a pool of VPN/proxy connections to avoid detection and access
 * geo-restricted bookmakers. Includes automatic rotation, health checks,
 * and intelligent routing based on bookmaker requirements.
 */

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Proxy types supported
 */
const PROXY_TYPES = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
  VPN: 'vpn'
};

/**
 * Proxy health status
 */
const PROXY_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  BANNED: 'banned',
  RATE_LIMITED: 'rate_limited'
};

/**
 * Rotation strategies
 */
const ROTATION_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',
  RANDOM: 'random',
  LEAST_USED: 'least_used',
  GEOGRAPHIC: 'geographic',
  BOOKMAKER_AFFINITY: 'bookmaker_affinity'
};

/**
 * VPN/Proxy Rotation Manager
 */
class ProxyRotationManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      rotationStrategy: config.rotationStrategy || ROTATION_STRATEGIES.ROUND_ROBIN,
      rotationInterval: config.rotationInterval || 300000, // 5 minutes
      healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
      maxFailures: config.maxFailures || 3,
      cooldownPeriod: config.cooldownPeriod || 300000, // 5 minutes
      banDuration: config.banDuration || 3600000, // 1 hour
      enableRotation: config.enableRotation !== false,
      enableHealthChecks: config.enableHealthChecks !== false,
      ...config
    };
    
    this.proxies = new Map();
    this.proxyUsage = new Map();
    this.bookmakerProxyMap = new Map();
    this.currentIndex = 0;
    this.healthCheckTimer = null;
    this.rotationTimer = null;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rotations: 0,
      bans: 0
    };
  }

  /**
   * Add a proxy to the pool
   */
  addProxy(proxyConfig) {
    const id = proxyConfig.id || crypto.randomUUID();
    
    const proxy = {
      id,
      type: proxyConfig.type || PROXY_TYPES.HTTP,
      host: proxyConfig.host,
      port: proxyConfig.port,
      username: proxyConfig.username,
      password: proxyConfig.password,
      country: proxyConfig.country,
      city: proxyConfig.city,
      provider: proxyConfig.provider,
      tags: proxyConfig.tags || [],
      
      // Status tracking
      status: PROXY_STATUS.HEALTHY,
      lastUsed: null,
      useCount: 0,
      failureCount: 0,
      lastFailure: null,
      bannedUntil: null,
      rateLimitedUntil: null,
      
      // Health metrics
      responseTime: null,
      successRate: 100,
      consecutiveFailures: 0,
      
      // Bookmaker affinity
      preferredBookmakers: proxyConfig.preferredBookmakers || [],
      blockedBookmakers: proxyConfig.blockedBookmakers || [],
      
      // Metadata
      addedAt: new Date(),
      metadata: proxyConfig.metadata || {}
    };
    
    this.proxies.set(id, proxy);
    this.proxyUsage.set(id, []);
    
    this.emit('proxy:added', { proxy });
    return id;
  }

  /**
   * Remove a proxy from the pool
   */
  removeProxy(proxyId) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return false;
    
    this.proxies.delete(proxyId);
    this.proxyUsage.delete(proxyId);
    
    // Remove from bookmaker mappings
    for (const [bookmaker, pid] of this.bookmakerProxyMap.entries()) {
      if (pid === proxyId) {
        this.bookmakerProxyMap.delete(bookmaker);
      }
    }
    
    this.emit('proxy:removed', { proxyId, proxy });
    return true;
  }

  /**
   * Get the next proxy based on rotation strategy
   */
  getProxy(bookmaker, options = {}) {
    const availableProxies = this.getAvailableProxies(bookmaker);
    
    if (availableProxies.length === 0) {
      this.emit('proxy:unavailable', { bookmaker });
      return null;
    }
    
    let selectedProxy;
    
    switch (this.config.rotationStrategy) {
      case ROTATION_STRATEGIES.RANDOM:
        selectedProxy = availableProxies[Math.floor(Math.random() * availableProxies.length)];
        break;
        
      case ROTATION_STRATEGIES.LEAST_USED:
        selectedProxy = availableProxies.reduce((min, proxy) => 
          proxy.useCount < min.useCount ? proxy : min
        );
        break;
        
      case ROTATION_STRATEGIES.GEOGRAPHIC:
        selectedProxy = this.selectByGeography(availableProxies, options.country);
        break;
        
      case ROTATION_STRATEGIES.BOOKMAKER_AFFINITY:
        selectedProxy = this.selectByAffinity(availableProxies, bookmaker);
        break;
        
      case ROTATION_STRATEGIES.ROUND_ROBIN:
      default:
        selectedProxy = availableProxies[this.currentIndex % availableProxies.length];
        this.currentIndex = (this.currentIndex + 1) % availableProxies.length;
        break;
    }
    
    // Update usage tracking
    selectedProxy.lastUsed = new Date();
    selectedProxy.useCount++;
    
    if (bookmaker) {
      this.bookmakerProxyMap.set(bookmaker, selectedProxy.id);
      this.proxyUsage.get(selectedProxy.id).push({
        bookmaker,
        timestamp: new Date()
      });
    }
    
    this.stats.totalRequests++;
    this.emit('proxy:selected', { proxy: selectedProxy, bookmaker });
    
    return this.formatProxyForUse(selectedProxy);
  }

  /**
   * Get all available (healthy) proxies for a bookmaker
   */
  getAvailableProxies(bookmaker) {
    const now = Date.now();
    const available = [];
    
    for (const proxy of this.proxies.values()) {
      // Skip banned proxies
      if (proxy.bannedUntil && proxy.bannedUntil > now) continue;
      
      // Skip rate-limited proxies
      if (proxy.rateLimitedUntil && proxy.rateLimitedUntil > now) continue;
      
      // Skip blocked bookmakers
      if (bookmaker && proxy.blockedBookmakers.includes(bookmaker)) continue;
      
      // Skip unhealthy proxies unless no other option
      if (proxy.status === PROXY_STATUS.UNHEALTHY && this.proxies.size > 1) continue;
      
      available.push(proxy);
    }
    
    return available;
  }

  /**
   * Select proxy by geographic location
   */
  selectByGeography(proxies, targetCountry) {
    if (!targetCountry) return proxies[0];
    
    // Prefer proxies in target country
    const countryMatch = proxies.filter(p => p.country === targetCountry);
    if (countryMatch.length > 0) return countryMatch[0];
    
    // Fall back to any available
    return proxies[0];
  }

  /**
   * Select proxy by bookmaker affinity
   */
  selectByAffinity(proxies, bookmaker) {
    if (!bookmaker) return proxies[0];
    
    // Prefer proxies with affinity for this bookmaker
    const affinityMatch = proxies.filter(p => 
      p.preferredBookmakers.includes(bookmaker)
    );
    if (affinityMatch.length > 0) {
      // Pick the least used among affinity matches
      return affinityMatch.reduce((min, p) => p.useCount < min.useCount ? p : min);
    }
    
    // Check current mapping
    const currentProxyId = this.bookmakerProxyMap.get(bookmaker);
    if (currentProxyId) {
      const currentProxy = proxies.find(p => p.id === currentProxyId);
      if (currentProxy) return currentProxy;
    }
    
    return proxies[0];
  }

  /**
   * Format proxy for use in HTTP requests
   */
  formatProxyForUse(proxy) {
    const proxyUrl = proxy.username 
      ? `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      : `${proxy.type}://${proxy.host}:${proxy.port}`;
    
    return {
      id: proxy.id,
      url: proxyUrl,
      host: proxy.host,
      port: proxy.port,
      type: proxy.type,
      country: proxy.country,
      ...this.getAgentConfig(proxy)
    };
  }

  /**
   * Get agent configuration for different HTTP libraries
   */
  getAgentConfig(proxy) {
    const baseConfig = {
      host: proxy.host,
      port: proxy.port
    };
    
    if (proxy.username) {
      baseConfig.auth = `${proxy.username}:${proxy.password}`;
    }
    
    switch (proxy.type) {
      case PROXY_TYPES.SOCKS4:
      case PROXY_TYPES.SOCKS5:
        return {
          agent: 'socks-proxy-agent',
          protocol: proxy.type,
          ...baseConfig
        };
        
      case PROXY_TYPES.VPN:
        return {
          agent: 'vpn',
          interface: proxy.metadata.interface || 'tun0',
          ...baseConfig
        };
        
      case PROXY_TYPES.HTTP:
      case PROXY_TYPES.HTTPS:
      default:
        return {
          protocol: proxy.type,
          ...baseConfig
        };
    }
  }

  /**
   * Report success for a proxy
   */
  reportSuccess(proxyId, responseTime) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;
    
    proxy.consecutiveFailures = 0;
    proxy.responseTime = responseTime;
    
    // Update success rate with exponential moving average
    proxy.successRate = proxy.successRate * 0.9 + 100 * 0.1;
    
    if (proxy.status !== PROXY_STATUS.HEALTHY) {
      proxy.status = PROXY_STATUS.HEALTHY;
      this.emit('proxy:recovered', { proxy });
    }
    
    this.stats.successfulRequests++;
  }

  /**
   * Report failure for a proxy
   */
  reportFailure(proxyId, error, bookmaker) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;
    
    proxy.failureCount++;
    proxy.consecutiveFailures++;
    proxy.lastFailure = new Date();
    proxy.successRate = proxy.successRate * 0.9;
    
    // Check for specific error types
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      proxy.status = PROXY_STATUS.UNHEALTHY;
    } else if (error.statusCode === 403 || error.message?.includes('banned')) {
      this.banProxy(proxyId, this.config.banDuration);
    } else if (error.statusCode === 429) {
      this.rateLimitProxy(proxyId);
    }
    
    // Mark as degraded if too many consecutive failures
    if (proxy.consecutiveFailures >= this.config.maxFailures) {
      proxy.status = PROXY_STATUS.DEGRADED;
      this.emit('proxy:degraded', { proxy, error });
    }
    
    this.stats.failedRequests++;
    this.emit('proxy:failure', { proxy, error, bookmaker });
  }

  /**
   * Ban a proxy temporarily
   */
  banProxy(proxyId, duration) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;
    
    proxy.status = PROXY_STATUS.BANNED;
    proxy.bannedUntil = Date.now() + duration;
    
    this.stats.bans++;
    this.emit('proxy:banned', { proxy, duration });
    
    // Auto-unban after duration
    setTimeout(() => {
      this.unbanProxy(proxyId);
    }, duration);
  }

  /**
   * Unban a proxy
   */
  unbanProxy(proxyId) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;
    
    proxy.status = PROXY_STATUS.HEALTHY;
    proxy.bannedUntil = null;
    proxy.consecutiveFailures = 0;
    
    this.emit('proxy:unbanned', { proxy });
  }

  /**
   * Rate limit a proxy
   */
  rateLimitProxy(proxyId, duration = 60000) {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;
    
    proxy.status = PROXY_STATUS.RATE_LIMITED;
    proxy.rateLimitedUntil = Date.now() + duration;
    
    this.emit('proxy:rateLimited', { proxy, duration });
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    if (!this.config.enableHealthChecks) return;
    
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Run health checks on all proxies
   */
  async runHealthChecks() {
    const checkPromises = [];
    
    for (const proxy of this.proxies.values()) {
      checkPromises.push(this.checkProxyHealth(proxy));
    }
    
    await Promise.allSettled(checkPromises);
  }

  /**
   * Check health of a single proxy
   */
  async checkProxyHealth(proxy) {
    const startTime = Date.now();
    
    try {
      // Simple connectivity check - can be customized
      const isHealthy = await this.pingProxy(proxy);
      
      if (isHealthy) {
        proxy.status = PROXY_STATUS.HEALTHY;
        proxy.responseTime = Date.now() - startTime;
        proxy.consecutiveFailures = 0;
      } else {
        proxy.consecutiveFailures++;
        if (proxy.consecutiveFailures >= this.config.maxFailures) {
          proxy.status = PROXY_STATUS.UNHEALTHY;
        }
      }
    } catch (error) {
      proxy.consecutiveFailures++;
      if (proxy.consecutiveFailures >= this.config.maxFailures) {
        proxy.status = PROXY_STATUS.UNHEALTHY;
      }
    }
  }

  /**
   * Ping a proxy to check connectivity
   */
  async pingProxy(proxy) {
    // This is a placeholder - actual implementation would depend on
    // the HTTP library being used (axios, fetch, etc.)
    return new Promise((resolve) => {
      // Simulate ping - in real implementation, make actual request
      setTimeout(() => resolve(true), 100);
    });
  }

  /**
   * Start automatic rotation
   */
  startRotation() {
    if (!this.config.enableRotation) return;
    
    this.rotationTimer = setInterval(() => {
      this.rotateProxies();
    }, this.config.rotationInterval);
  }

  /**
   * Stop automatic rotation
   */
  stopRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * Force rotation of all proxy assignments
   */
  rotateProxies() {
    this.bookmakerProxyMap.clear();
    this.stats.rotations++;
    this.emit('proxies:rotated');
  }

  /**
   * Get proxy statistics
   */
  getStats() {
    const proxyStats = [];
    
    for (const proxy of this.proxies.values()) {
      proxyStats.push({
        id: proxy.id,
        type: proxy.type,
        country: proxy.country,
        status: proxy.status,
        useCount: proxy.useCount,
        failureCount: proxy.failureCount,
        successRate: proxy.successRate.toFixed(2),
        responseTime: proxy.responseTime,
        lastUsed: proxy.lastUsed
      });
    }
    
    return {
      ...this.stats,
      proxyCount: this.proxies.size,
      healthyCount: this.getHealthyProxyCount(),
      proxies: proxyStats
    };
  }

  /**
   * Get count of healthy proxies
   */
  getHealthyProxyCount() {
    return Array.from(this.proxies.values()).filter(
      p => p.status === PROXY_STATUS.HEALTHY
    ).length;
  }

  /**
   * Get proxy pool summary
   */
  getPoolSummary() {
    const byCountry = {};
    const byType = {};
    const byStatus = {};
    
    for (const proxy of this.proxies.values()) {
      byCountry[proxy.country || 'unknown'] = (byCountry[proxy.country || 'unknown'] || 0) + 1;
      byType[proxy.type] = (byType[proxy.type] || 0) + 1;
      byStatus[proxy.status] = (byStatus[proxy.status] || 0) + 1;
    }
    
    return {
      total: this.proxies.size,
      byCountry,
      byType,
      byStatus,
      rotationStrategy: this.config.rotationStrategy
    };
  }

  /**
   * Load proxies from configuration
   */
  loadFromConfig(proxyConfigs) {
    for (const config of proxyConfigs) {
      this.addProxy(config);
    }
    
    this.emit('proxies:loaded', { count: proxyConfigs.length });
  }

  /**
   * Export proxy pool to configuration format
   */
  exportConfig() {
    const configs = [];
    
    for (const proxy of this.proxies.values()) {
      configs.push({
        id: proxy.id,
        type: proxy.type,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        country: proxy.country,
        city: proxy.city,
        provider: proxy.provider,
        tags: proxy.tags,
        preferredBookmakers: proxy.preferredBookmakers,
        blockedBookmakers: proxy.blockedBookmakers,
        metadata: proxy.metadata
      });
    }
    
    return configs;
  }

  /**
   * Start the manager
   */
  start() {
    this.startHealthChecks();
    this.startRotation();
    this.emit('manager:started');
  }

  /**
   * Stop the manager
   */
  stop() {
    this.stopHealthChecks();
    this.stopRotation();
    this.emit('manager:stopped');
  }
}

/**
 * Proxy Pool Builder - Helper for creating proxy pools
 */
class ProxyPoolBuilder {
  constructor() {
    this.proxies = [];
  }

  addHttpProxy(host, port, options = {}) {
    this.proxies.push({
      type: PROXY_TYPES.HTTP,
      host,
      port,
      ...options
    });
    return this;
  }

  addSocks5Proxy(host, port, options = {}) {
    this.proxies.push({
      type: PROXY_TYPES.SOCKS5,
      host,
      port,
      ...options
    });
    return this;
  }

  addVpnProxy(interface_name, options = {}) {
    this.proxies.push({
      type: PROXY_TYPES.VPN,
      host: interface_name,
      port: 0,
      metadata: { interface: interface_name },
      ...options
    });
    return this;
  }

  addResidentialProxies(country, count, provider, options = {}) {
    for (let i = 0; i < count; i++) {
      this.proxies.push({
        type: PROXY_TYPES.HTTP,
        country,
        provider,
        tags: ['residential', ...options.tags || []],
        ...options
      });
    }
    return this;
  }

  addDatacenterProxies(country, count, provider, options = {}) {
    for (let i = 0; i < count; i++) {
      this.proxies.push({
        type: PROXY_TYPES.HTTP,
        country,
        provider,
        tags: ['datacenter', ...options.tags || []],
        ...options
      });
    }
    return this;
  }

  build() {
    return this.proxies;
  }
}

/**
 * Bookmaker-specific proxy selector
 */
class BookmakerProxySelector {
  constructor(proxyManager) {
    this.proxyManager = proxyManager;
    this.bookmakerRequirements = new Map();
    
    // Default requirements for common bookmakers
    this.setDefaultRequirements();
  }

  /**
   * Set default requirements for known bookmakers
   */
  setDefaultRequirements() {
    // Bookmakers that are strict about VPN/proxy usage
    this.setBookmakerRequirements('bet365', {
      requireResidential: true,
      blockedCountries: ['US', 'AU'],
      rotationFrequency: 'high'
    });
    
    this.setBookmakerRequirements('pinnacle', {
      requireResidential: false,
      preferredCountries: ['GB', 'MT'],
      rotationFrequency: 'medium'
    });
    
    this.setBookmakerRequirements('betfair', {
      requireResidential: true,
      preferredCountries: ['GB', 'IE'],
      rotationFrequency: 'medium'
    });
  }

  /**
   * Set requirements for a bookmaker
   */
  setBookmakerRequirements(bookmaker, requirements) {
    this.bookmakerRequirements.set(bookmaker.toLowerCase(), requirements);
  }

  /**
   * Get best proxy for a bookmaker
   */
  getProxyForBookmaker(bookmaker, options = {}) {
    const requirements = this.bookmakerRequirements.get(bookmaker.toLowerCase()) || {};
    
    // Get all available proxies
    let candidates = this.proxyManager.getAvailableProxies(bookmaker);
    
    // Filter by residential requirement
    if (requirements.requireResidential) {
      const residential = candidates.filter(p => 
        p.tags.includes('residential')
      );
      if (residential.length > 0) {
        candidates = residential;
      }
    }
    
    // Filter by preferred countries
    if (requirements.preferredCountries && !options.ignoreGeo) {
      const countryMatch = candidates.filter(p => 
        requirements.preferredCountries.includes(p.country)
      );
      if (countryMatch.length > 0) {
        candidates = countryMatch;
      }
    }
    
    // Filter out blocked countries
    if (requirements.blockedCountries) {
      candidates = candidates.filter(p => 
        !requirements.blockedCountries.includes(p.country)
      );
    }
    
    if (candidates.length === 0) {
      // Fall back to any available proxy
      candidates = this.proxyManager.getAvailableProxies(bookmaker);
    }
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Select based on rotation strategy
    return this.proxyManager.getProxy(bookmaker, { 
      ...options,
      country: requirements.preferredCountries?.[0]
    });
  }
}

module.exports = {
  ProxyRotationManager,
  ProxyPoolBuilder,
  BookmakerProxySelector,
  PROXY_TYPES,
  PROXY_STATUS,
  ROTATION_STRATEGIES
};