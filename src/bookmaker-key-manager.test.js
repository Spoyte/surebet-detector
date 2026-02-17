/**
 * Bookmaker Key Manager Test Suite
 */

const BookmakerKeyManager = require('./bookmaker-key-manager');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('BookmakerKeyManager', () => {
  let manager;
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'key-manager-test-'));
    manager = new BookmakerKeyManager({
      dataDir: tempDir,
      encryptionKey: 'test-encryption-key-32-chars-long!!'
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await manager.initialize();
      expect(manager.initialized).toBe(true);
    });

    test('should emit initialized event', async () => {
      const spy = jest.fn();
      manager.on('initialized', spy);
      await manager.initialize();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('key management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should add a new key', async () => {
      const keyData = {
        apiKey: 'test-api-key-12345',
        apiSecret: 'test-secret',
        isActive: true
      };

      const result = await manager.addKey('unibet', keyData);
      
      expect(result.bookmakerId).toBe('unibet');
      expect(result.bookmakerName).toBe('Unibet');
      expect(result.apiKey).toBe('test-api-key-12345');
      expect(result.isActive).toBe(true);
      expect(result.id).toBeDefined();
    });

    test('should reject unknown bookmaker', async () => {
      await expect(
        manager.addKey('unknown', { apiKey: 'test' })
      ).rejects.toThrow('Unknown bookmaker');
    });

    test('should retrieve key without sensitive data', () => {
      manager.keys.set('unibet', {
        id: 'test-id',
        bookmakerId: 'unibet',
        bookmakerName: 'Unibet',
        apiKey: 'secret-key-12345',
        apiSecret: 'super-secret',
        isActive: true
      });

      const key = manager.getKey('unibet', false);
      
      expect(key.apiKey).toBeUndefined();
      expect(key.apiKeyMasked).toBe('secr...2345');
      expect(key.apiSecretMasked).toBe('***');
      expect(key.hasApiSecret).toBe(true);
    });

    test('should retrieve key with sensitive data when requested', () => {
      manager.keys.set('unibet', {
        id: 'test-id',
        bookmakerId: 'unibet',
        bookmakerName: 'Unibet',
        apiKey: 'secret-key-12345',
        apiSecret: 'super-secret',
        isActive: true
      });

      const key = manager.getKey('unibet', true);
      
      expect(key.apiKey).toBe('secret-key-12345');
      expect(key.apiSecret).toBe('super-secret');
    });

    test('should update key status', async () => {
      await manager.addKey('unibet', { apiKey: 'test' });
      
      const updated = await manager.updateKeyStatus('unibet', { 
        testStatus: 'working',
        metadata: { region: 'EU' }
      });
      
      expect(updated.testStatus).toBe('working');
      expect(updated.metadata.region).toBe('EU');
    });

    test('should activate/deactivate key', async () => {
      await manager.addKey('unibet', { apiKey: 'test', isActive: true });
      
      let key = manager.getKey('unibet');
      expect(key.isActive).toBe(true);
      
      await manager.setKeyActive('unibet', false);
      key = manager.getKey('unibet');
      expect(key.isActive).toBe(false);
    });

    test('should rotate key', async () => {
      const original = await manager.addKey('unibet', { 
        apiKey: 'old-key',
        apiSecret: 'old-secret'
      });
      
      const rotated = await manager.rotateKey('unibet', {
        apiKey: 'new-key',
        apiSecret: 'new-secret'
      });
      
      expect(rotated.id).not.toBe(original.id);
      expect(rotated.requestCount).toBe(0);
    });

    test('should delete key', async () => {
      await manager.addKey('unibet', { apiKey: 'test' });
      expect(manager.getKey('unibet')).toBeDefined();
      
      await manager.deleteKey('unibet');
      expect(manager.getKey('unibet')).toBeNull();
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      await manager.initialize();
      await manager.addKey('unibet', { 
        apiKey: 'test',
        rateLimit: { requests: 10, window: 60 }
      });
    });

    test('should track rate limit usage', () => {
      manager.trackRateLimit('unibet');
      manager.trackRateLimit('unibet');
      manager.trackRateLimit('unibet');
      
      const status = manager.getRateLimitStatus('unibet');
      expect(status.currentUsage).toBe(3);
      expect(status.remaining).toBe(7);
    });

    test('should get key for use and track usage', () => {
      const key = manager.getKeyForUse('unibet');
      expect(key).toBeDefined();
      expect(key.lastUsed).toBeDefined();
      expect(key.requestCount).toBe(1);
    });

    test('should return null for inactive key', async () => {
      await manager.addKey('betclic', { apiKey: 'test', isActive: false });
      const key = manager.getKeyForUse('betclic');
      expect(key).toBeNull();
    });
  });

  describe('encryption', () => {
    test('should encrypt and decrypt data', () => {
      const key = Buffer.from('a'.repeat(32)); // 32 bytes for AES-256
      const text = 'sensitive-api-key-12345';
      
      const encrypted = manager.encrypt(text, key);
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      
      const decrypted = manager.decrypt(encrypted, key);
      expect(decrypted).toBe(text);
    });

    test('should derive key from password', () => {
      const salt = Buffer.from('random-salt-16-bytes');
      const key1 = manager.deriveKey('password123', salt);
      const key2 = manager.deriveKey('password123', salt);
      
      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await manager.initialize();
      await manager.addKey('unibet', { apiKey: 'test1', isActive: true });
      await manager.addKey('betclic', { apiKey: 'test2', isActive: false });
    });

    test('should get key stats', () => {
      const stats = manager.getKeyStats('unibet');
      expect(stats.bookmakerId).toBe('unibet');
      expect(stats.bookmakerName).toBe('Unibet');
      expect(stats.isActive).toBe(true);
    });

    test('should get system stats', () => {
      const stats = manager.getSystemStats();
      expect(stats.totalKeys).toBe(2);
      expect(stats.activeKeys).toBe(1);
      expect(stats.inactiveKeys).toBe(1);
    });

    test('should get available bookmakers', () => {
      const available = manager.getAvailableBookmakers();
      expect(available.length).toBeGreaterThan(0);
      expect(available.find(b => b.id === 'unibet').isConfigured).toBe(true);
      expect(available.find(b => b.id === 'betfair').isConfigured).toBe(false);
    });
  });

  describe('persistence', () => {
    test('should save and load keys', async () => {
      await manager.initialize();
      await manager.addKey('unibet', { apiKey: 'test-key-12345' });
      
      // Create new manager instance with same directory
      const manager2 = new BookmakerKeyManager({
        dataDir: tempDir,
        encryptionKey: 'test-encryption-key-32-chars-long!!'
      });
      
      await manager2.initialize();
      const key = manager2.getKey('unibet', true);
      
      expect(key).toBeDefined();
      expect(key.apiKey).toBe('test-key-12345');
    });
  });

  describe('events', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should emit keyAdded event', async () => {
      const spy = jest.fn();
      manager.on('keyAdded', spy);
      
      await manager.addKey('unibet', { apiKey: 'test' });
      
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        bookmakerId: 'unibet'
      }));
    });

    test('should emit keyDeleted event', async () => {
      await manager.addKey('unibet', { apiKey: 'test' });
      
      const spy = jest.fn();
      manager.on('keyDeleted', spy);
      
      await manager.deleteKey('unibet');
      
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        bookmakerId: 'unibet'
      }));
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const { execSync } = require('child_process');
  try {
    execSync('npx jest bookmaker-key-manager.test.js --colors', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (e) {
    process.exit(1);
  }
}
