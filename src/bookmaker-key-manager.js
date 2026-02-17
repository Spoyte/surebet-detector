/**
 * Bookmaker API Key Management Service
 * Securely stores, manages, and monitors API keys for bookmaker integrations
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class BookmakerKeyManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.keysFile = path.join(this.dataDir, 'bookmaker-keys.enc');
    this.encryptionKey = options.encryptionKey || process.env.KEY_ENCRYPTION_SECRET;
    this.keys = new Map();
    this.keyHistory = new Map();
    this.rateLimitStats = new Map();
    this.initialized = false;
    
    // Default bookmaker configurations
    this.bookmakerDefaults = {
      'unibet': { 
        name: 'Unibet', 
        baseUrl: 'https://api.unibet.com',
        rateLimit: { requests: 100, window: 60 },
        supportsLive: true,
        markets: ['1X2', 'asian_handicap', 'over_under', 'btts']
      },
      'betclic': { 
        name: 'Betclic', 
        baseUrl: 'https://api.betclic.com',
        rateLimit: { requests: 80, window: 60 },
        supportsLive: true,
        markets: ['1X2', 'asian_handicap', 'over_under']
      },
      'winamax': { 
        name: 'Winamax', 
        baseUrl: 'https://api.winamax.fr',
        rateLimit: { requests: 120, window: 60 },
        supportsLive: true,
        markets: ['1X2', 'asian_handicap', 'over_under', 'btts', 'correct_score']
      },
      'fdj': { 
        name: 'FDJ', 
        baseUrl: 'https://api.fdj.fr',
        rateLimit: { requests: 60, window: 60 },
        supportsLive: false,
        markets: ['1X2', 'over_under']
      },
      'parionssport': { 
        name: 'ParionsSport', 
        baseUrl: 'https://api.parionssport.fdj.fr',
        rateLimit: { requests: 60, window: 60 },
        supportsLive: true,
        markets: ['1X2', 'asian_handicap', 'over_under']
      },
      'zebet': { 
        name: 'ZEbet', 
        baseUrl: 'https://api.zebet.fr',
        rateLimit: { requests: 70, window: 60 },
        supportsLive: false,
        markets: ['1X2', 'over_under', 'btts']
      },
      'betfair': {
        name: 'Betfair',
        baseUrl: 'https://api.betfair.com',
        rateLimit: { requests: 200, window: 60 },
        supportsLive: true,
        isExchange: true,
        markets: ['1X2', 'asian_handicap', 'over_under', 'btts', 'lay']
      },
      'smarkets': {
        name: 'Smarkets',
        baseUrl: 'https://api.smarkets.com',
        rateLimit: { requests: 150, window: 60 },
        supportsLive: true,
        isExchange: true,
        markets: ['1X2', 'asian_handicap', 'over_under', 'lay']
      }
    };
  }

  /**
   * Initialize the key manager
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.loadKeys();
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Generate a secure encryption key from password
   */
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData, key) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Load encrypted keys from file
   */
  async loadKeys() {
    try {
      const data = await fs.readFile(this.keysFile, 'utf8');
      const { salt, keys: encryptedKeys } = JSON.parse(data);
      
      if (!this.encryptionKey) {
        throw new Error('Encryption key not provided');
      }
      
      const key = this.deriveKey(this.encryptionKey, Buffer.from(salt, 'hex'));
      
      for (const [bookmakerId, encryptedKeyData] of Object.entries(encryptedKeys)) {
        const decryptedKey = this.decrypt(encryptedKeyData, key);
        this.keys.set(bookmakerId, JSON.parse(decryptedKey));
      }
      
      // Load history if exists
      const historyFile = path.join(this.dataDir, 'key-history.json');
      try {
        const historyData = await fs.readFile(historyFile, 'utf8');
        const history = JSON.parse(historyData);
        for (const [bookmakerId, entries] of Object.entries(history)) {
          this.keyHistory.set(bookmakerId, entries);
        }
      } catch (e) {
        // History file may not exist yet
      }
      
      this.emit('keysLoaded', this.keys.size);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No keys file yet, start fresh
        this.emit('keysLoaded', 0);
      } else {
        throw error;
      }
    }
  }

  /**
   * Save encrypted keys to file
   */
  async saveKeys() {
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(this.encryptionKey, salt);
    
    const encryptedKeys = {};
    for (const [bookmakerId, keyData] of this.keys) {
      encryptedKeys[bookmakerId] = this.encrypt(JSON.stringify(keyData), key);
    }
    
    await fs.writeFile(
      this.keysFile,
      JSON.stringify({ salt: salt.toString('hex'), keys: encryptedKeys }, null, 2)
    );
    
    // Save history separately (not encrypted, just access logs)
    const historyObj = Object.fromEntries(this.keyHistory);
    await fs.writeFile(
      path.join(this.dataDir, 'key-history.json'),
      JSON.stringify(historyObj, null, 2)
    );
    
    this.emit('keysSaved');
  }

  /**
   * Add or update a bookmaker API key
   */
  async addKey(bookmakerId, keyData) {
    if (!this.initialized) await this.initialize();
    
    const defaults = this.bookmakerDefaults[bookmakerId];
    if (!defaults) {
      throw new Error(`Unknown bookmaker: ${bookmakerId}`);
    }
    
    const keyEntry = {
      id: crypto.randomUUID(),
      bookmakerId,
      bookmakerName: defaults.name,
      apiKey: keyData.apiKey,
      apiSecret: keyData.apiSecret || null,
      appKey: keyData.appKey || null,
      sessionToken: keyData.sessionToken || null,
      baseUrl: keyData.baseUrl || defaults.baseUrl,
      rateLimit: keyData.rateLimit || defaults.rateLimit,
      isActive: keyData.isActive !== false,
      isExchange: defaults.isExchange || false,
      supportsLive: defaults.supportsLive,
      markets: defaults.markets,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: null,
      lastTested: null,
      testStatus: 'never_tested',
      testError: null,
      requestCount: 0,
      errorCount: 0,
      lastError: null,
      metadata: keyData.metadata || {}
    };
    
    // Add to history
    if (!this.keyHistory.has(bookmakerId)) {
      this.keyHistory.set(bookmakerId, []);
    }
    this.keyHistory.get(bookmakerId).push({
      action: this.keys.has(bookmakerId) ? 'updated' : 'created',
      timestamp: new Date().toISOString(),
      keyId: keyEntry.id
    });
    
    this.keys.set(bookmakerId, keyEntry);
    await this.saveKeys();
    
    this.emit('keyAdded', { bookmakerId, keyId: keyEntry.id });
    return keyEntry;
  }

  /**
   * Get a key (with optional decryption for use)
   */
  getKey(bookmakerId, includeSensitive = false) {
    if (!this.initialized) throw new Error('Key manager not initialized');
    
    const key = this.keys.get(bookmakerId);
    if (!key) return null;
    
    if (!includeSensitive) {
      // Return sanitized version
      const { apiKey, apiSecret, appKey, sessionToken, ...safe } = key;
      return {
        ...safe,
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
        apiSecretMasked: apiSecret ? '***' : null,
        hasApiSecret: !!apiSecret,
        hasAppKey: !!appKey,
        hasSessionToken: !!sessionToken
      };
    }
    
    return key;
  }

  /**
   * Get all keys
   */
  getAllKeys(includeSensitive = false) {
    if (!this.initialized) throw new Error('Key manager not initialized');
    
    const result = [];
    for (const [bookmakerId, key] of this.keys) {
      result.push(this.getKey(bookmakerId, includeSensitive));
    }
    return result;
  }

  /**
   * Get key for API usage (includes sensitive data)
   */
  getKeyForUse(bookmakerId) {
    const key = this.getKey(bookmakerId, true);
    if (!key || !key.isActive) return null;
    
    // Update last used
    key.lastUsed = new Date().toISOString();
    key.requestCount++;
    
    // Track rate limit
    this.trackRateLimit(bookmakerId);
    
    // Save asynchronously (don't wait)
    this.saveKeys().catch(err => this.emit('error', err));
    
    return key;
  }

  /**
   * Track rate limit usage
   */
  trackRateLimit(bookmakerId) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    if (!this.rateLimitStats.has(bookmakerId)) {
      this.rateLimitStats.set(bookmakerId, []);
    }
    
    const stats = this.rateLimitStats.get(bookmakerId);
    stats.push(now);
    
    // Clean old entries
    const cutoff = now - windowMs;
    while (stats.length > 0 && stats[0] < cutoff) {
      stats.shift();
    }
    
    return stats.length;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(bookmakerId) {
    const key = this.keys.get(bookmakerId);
    if (!key) return null;
    
    const stats = this.rateLimitStats.get(bookmakerId) || [];
    const now = Date.now();
    const windowMs = 60000;
    const cutoff = now - windowMs;
    
    // Clean and count
    const recentRequests = stats.filter(t => t > cutoff);
    
    return {
      bookmakerId,
      currentUsage: recentRequests.length,
      limit: key.rateLimit.requests,
      remaining: Math.max(0, key.rateLimit.requests - recentRequests.length),
      resetAt: new Date(recentRequests[0] + windowMs).toISOString(),
      utilizationPercent: (recentRequests.length / key.rateLimit.requests * 100).toFixed(1)
    };
  }

  /**
   * Test a key connection
   */
  async testKey(bookmakerId) {
    const key = this.keys.get(bookmakerId);
    if (!key) throw new Error(`Key not found for ${bookmakerId}`);
    
    try {
      // Simulate API test - in real implementation, make actual API call
      const testResult = await this.simulateApiTest(key);
      
      key.lastTested = new Date().toISOString();
      key.testStatus = testResult.success ? 'working' : 'failed';
      key.testError = testResult.error || null;
      
      await this.saveKeys();
      
      this.emit('keyTested', { bookmakerId, success: testResult.success });
      
      return {
        success: testResult.success,
        bookmakerId,
        bookmakerName: key.bookmakerName,
        latency: testResult.latency,
        error: testResult.error,
        timestamp: key.lastTested
      };
    } catch (error) {
      key.lastTested = new Date().toISOString();
      key.testStatus = 'failed';
      key.testError = error.message;
      key.errorCount++;
      key.lastError = error.message;
      
      await this.saveKeys();
      
      throw error;
    }
  }

  /**
   * Simulate API test (replace with actual implementation)
   */
  async simulateApiTest(key) {
    // In real implementation, make actual API call to test endpoint
    const latency = Math.floor(Math.random() * 500) + 50;
    await new Promise(r => setTimeout(r, latency));
    
    // Simulate occasional failures
    if (Math.random() > 0.9) {
      return {
        success: false,
        latency,
        error: 'Invalid API key or rate limit exceeded'
      };
    }
    
    return {
      success: true,
      latency,
      error: null
    };
  }

  /**
   * Test all keys
   */
  async testAllKeys() {
    const results = [];
    for (const bookmakerId of this.keys.keys()) {
      try {
        const result = await this.testKey(bookmakerId);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          bookmakerId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    return results;
  }

  /**
   * Update key status
   */
  async updateKeyStatus(bookmakerId, updates) {
    const key = this.keys.get(bookmakerId);
    if (!key) throw new Error(`Key not found for ${bookmakerId}`);
    
    Object.assign(key, updates, { updatedAt: new Date().toISOString() });
    await this.saveKeys();
    
    this.emit('keyUpdated', { bookmakerId, updates });
    return this.getKey(bookmakerId);
  }

  /**
   * Activate/deactivate key
   */
  async setKeyActive(bookmakerId, isActive) {
    return this.updateKeyStatus(bookmakerId, { isActive });
  }

  /**
   * Rotate a key (update API key)
   */
  async rotateKey(bookmakerId, newKeyData) {
    const key = this.keys.get(bookmakerId);
    if (!key) throw new Error(`Key not found for ${bookmakerId}`);
    
    // Archive old key
    if (!this.keyHistory.has(bookmakerId)) {
      this.keyHistory.set(bookmakerId, []);
    }
    this.keyHistory.get(bookmakerId).push({
      action: 'rotated',
      timestamp: new Date().toISOString(),
      oldKeyId: key.id,
      newKeyId: crypto.randomUUID()
    });
    
    // Update key
    key.id = crypto.randomUUID();
    key.apiKey = newKeyData.apiKey;
    if (newKeyData.apiSecret) key.apiSecret = newKeyData.apiSecret;
    if (newKeyData.appKey) key.appKey = newKeyData.appKey;
    key.updatedAt = new Date().toISOString();
    key.requestCount = 0;
    key.errorCount = 0;
    key.lastError = null;
    key.testStatus = 'never_tested';
    
    await this.saveKeys();
    
    this.emit('keyRotated', { bookmakerId, newKeyId: key.id });
    return this.getKey(bookmakerId);
  }

  /**
   * Delete a key
   */
  async deleteKey(bookmakerId) {
    const key = this.keys.get(bookmakerId);
    if (!key) throw new Error(`Key not found for ${bookmakerId}`);
    
    // Archive deletion
    if (!this.keyHistory.has(bookmakerId)) {
      this.keyHistory.set(bookmakerId, []);
    }
    this.keyHistory.get(bookmakerId).push({
      action: 'deleted',
      timestamp: new Date().toISOString(),
      keyId: key.id
    });
    
    this.keys.delete(bookmakerId);
    await this.saveKeys();
    
    this.emit('keyDeleted', { bookmakerId });
    return { success: true, bookmakerId };
  }

  /**
   * Get key usage statistics
   */
  getKeyStats(bookmakerId) {
    const key = this.keys.get(bookmakerId);
    if (!key) return null;
    
    const history = this.keyHistory.get(bookmakerId) || [];
    const rateLimitStatus = this.getRateLimitStatus(bookmakerId);
    
    return {
      bookmakerId,
      bookmakerName: key.bookmakerName,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      lastUsed: key.lastUsed,
      lastTested: key.lastTested,
      testStatus: key.testStatus,
      requestCount: key.requestCount,
      errorCount: key.errorCount,
      errorRate: key.requestCount > 0 
        ? (key.errorCount / key.requestCount * 100).toFixed(2) 
        : 0,
      isActive: key.isActive,
      history: history.slice(-10), // Last 10 events
      rateLimit: rateLimitStatus
    };
  }

  /**
   * Get all bookmaker configurations (available to add)
   */
  getAvailableBookmakers() {
    const configured = new Set(this.keys.keys());
    
    return Object.entries(this.bookmakerDefaults).map(([id, config]) => ({
      id,
      ...config,
      isConfigured: configured.has(id)
    }));
  }

  /**
   * Get system-wide statistics
   */
  getSystemStats() {
    const keys = this.getAllKeys();
    const activeKeys = keys.filter(k => k.isActive);
    const workingKeys = keys.filter(k => k.testStatus === 'working');
    
    return {
      totalKeys: keys.length,
      activeKeys: activeKeys.length,
      inactiveKeys: keys.length - activeKeys.length,
      workingKeys: workingKeys.length,
      failedKeys: keys.filter(k => k.testStatus === 'failed').length,
      untestedKeys: keys.filter(k => k.testStatus === 'never_tested').length,
      totalRequests: keys.reduce((sum, k) => sum + (k.requestCount || 0), 0),
      totalErrors: keys.reduce((sum, k) => sum + (k.errorCount || 0), 0),
      bookmakers: keys.map(k => ({
        id: k.bookmakerId,
        name: k.bookmakerName,
        isActive: k.isActive,
        testStatus: k.testStatus,
        requestCount: k.requestCount,
        errorCount: k.errorCount
      }))
    };
  }

  /**
   * Record an API error
   */
  async recordError(bookmakerId, error) {
    const key = this.keys.get(bookmakerId);
    if (!key) return;
    
    key.errorCount++;
    key.lastError = error.message || String(error);
    
    // Auto-disable on too many errors
    if (key.errorCount > 50 && key.errorCount / key.requestCount > 0.5) {
      key.isActive = false;
      this.emit('keyAutoDisabled', { bookmakerId, reason: 'high_error_rate' });
    }
    
    await this.saveKeys();
  }
}

module.exports = BookmakerKeyManager;
