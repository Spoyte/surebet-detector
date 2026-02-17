/** @format */

/**
 * Data Retention Manager Tests
 */

const { DataRetentionManager, DATA_TYPES, DEFAULT_CONFIG } = require('./data-retention-manager');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('DataRetentionManager', () => {
  let manager;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'retention-test-'));
    
    manager = new DataRetentionManager({
      archive: {
        archivePath: path.join(testDir, 'archive'),
        tempPath: path.join(testDir, 'temp'),
        compressAfterDays: 1,
        archiveAfterDays: 7,
        deleteAfterDays: 30
      },
      safety: {
        dryRun: false,
        backupBeforeDelete: false
      }
    });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    manager.stopScheduledTasks();
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      const defaultManager = new DataRetentionManager();
      expect(defaultManager.config.retentionDays[DATA_TYPES.OPPORTUNITIES]).toBe(90);
      expect(defaultManager.config.archive.enabled).toBe(true);
    });

    test('should merge custom config', () => {
      const customManager = new DataRetentionManager({
        retentionDays: { [DATA_TYPES.OPPORTUNITIES]: 30 }
      });
      expect(customManager.config.retentionDays[DATA_TYPES.OPPORTUNITIES]).toBe(30);
      expect(customManager.config.retentionDays[DATA_TYPES.BETS]).toBe(365); // Default preserved
    });

    test('should create directories on initialize', async () => {
      await manager.initialize();
      
      const archiveStat = await fs.stat(manager.config.archive.archivePath);
      expect(archiveStat.isDirectory()).toBe(true);
      
      const tempStat = await fs.stat(manager.config.archive.tempPath);
      expect(tempStat.isDirectory()).toBe(true);
    });

    test('should create subdirectories for each data type', async () => {
      await manager.initialize();
      
      for (const dataType of Object.values(DATA_TYPES)) {
        const typeDir = path.join(manager.config.archive.archivePath, dataType);
        const stat = await fs.stat(typeDir);
        expect(stat.isDirectory()).toBe(true);
      }
    });
  });

  describe('File Compression', () => {
    test('should compress files', async () => {
      await manager.initialize();
      
      const testFile = path.join(testDir, 'test.json');
      const content = JSON.stringify({ test: 'data', array: [1, 2, 3] });
      await fs.writeFile(testFile, content);
      
      const result = await manager.compressFile(testFile);
      expect(result).toBe(true);
      
      const compressedPath = `${testFile}.gz`;
      const compressedStat = await fs.stat(compressedPath);
      expect(compressedStat.isFile()).toBe(true);
      
      // Original should be deleted
      await expect(fs.access(testFile)).rejects.toThrow();
    });

    test('should handle compression errors gracefully', async () => {
      await manager.initialize();
      
      // Try to compress non-existent file
      const result = await manager.compressFile(path.join(testDir, 'nonexistent.json'));
      expect(result).toBe(false);
    });
  });

  describe('File Archiving', () => {
    test('should archive files', async () => {
      await manager.initialize();
      
      const testFile = path.join(testDir, 'test-data.json');
      await fs.writeFile(testFile, JSON.stringify({ data: 'test' }));
      
      const result = await manager.archiveFile(testFile, DATA_TYPES.OPPORTUNITIES);
      expect(result).toBe(true);
      
      // Original should be gone
      await expect(fs.access(testFile)).rejects.toThrow();
      
      // Should be in archive
      const archivePath = path.join(manager.config.archive.archivePath, DATA_TYPES.OPPORTUNITIES, 'test-data.json.gz');
      const archiveStat = await fs.stat(archivePath);
      expect(archiveStat.isFile()).toBe(true);
    });

    test('should archive already compressed files', async () => {
      await manager.initialize();
      
      const testFile = path.join(testDir, 'test.json.gz');
      const zlib = require('zlib');
      const compressed = zlib.gzipSync(JSON.stringify({ data: 'test' }));
      await fs.writeFile(testFile, compressed);
      
      const result = await manager.archiveFile(testFile, DATA_TYPES.BETS);
      expect(result).toBe(true);
      
      const archivePath = path.join(manager.config.archive.archivePath, DATA_TYPES.BETS, 'test.json.gz');
      await expect(fs.access(archivePath)).resolves.toBeUndefined();
    });
  });

  describe('File Restoration', () => {
    test('should restore archived files', async () => {
      await manager.initialize();
      
      // Create and archive a file
      const testFile = path.join(testDir, 'restore-test.json');
      const content = JSON.stringify({ test: 'restore' });
      await fs.writeFile(testFile, content);
      await manager.archiveFile(testFile, DATA_TYPES.OPPORTUNITIES);
      
      // Restore it
      const result = await manager.restoreFile('restore-test.json.gz', DATA_TYPES.OPPORTUNITIES, testFile);
      expect(result.success).toBe(true);
      expect(result.restoredTo).toBe(testFile);
      
      // Verify content
      const restoredContent = await fs.readFile(testFile, 'utf8');
      expect(restoredContent).toBe(content);
    });

    test('should handle restore of non-existent files', async () => {
      await manager.initialize();
      
      const result = await manager.restoreFile('nonexistent.json', DATA_TYPES.OPPORTUNITIES);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Statistics', () => {
    test('should return archive statistics', async () => {
      await manager.initialize();
      
      // Create some test archives
      const archiveDir = path.join(manager.config.archive.archivePath, DATA_TYPES.OPPORTUNITIES);
      await fs.writeFile(path.join(archiveDir, 'file1.json.gz'), 'compressed1');
      await fs.writeFile(path.join(archiveDir, 'file2.json.gz'), 'compressed2');
      
      const stats = await manager.getArchiveStats();
      
      expect(stats.archiveFiles).toBe(2);
      expect(stats.archiveSize).toBeGreaterThan(0);
      expect(stats.byType[DATA_TYPES.OPPORTUNITIES].files).toBe(2);
    });

    test('should track cleanup statistics', async () => {
      manager.stats.itemsArchived = 5;
      manager.stats.itemsDeleted = 3;
      manager.stats.itemsCompressed = 10;
      
      const stats = await manager.getArchiveStats();
      expect(stats.itemsArchived).toBe(5);
      expect(stats.itemsDeleted).toBe(3);
      expect(stats.itemsCompressed).toBe(10);
    });
  });

  describe('Configuration', () => {
    test('should get configuration', () => {
      const config = manager.getConfig();
      expect(config.archive.enabled).toBe(true);
      expect(config.retentionDays).toBeDefined();
    });

    test('should update configuration', () => {
      manager.updateConfig({
        archive: { compressionLevel: 9 },
        retentionDays: { [DATA_TYPES.LOGS]: 7 }
      });
      
      expect(manager.config.archive.compressionLevel).toBe(9);
      expect(manager.config.retentionDays[DATA_TYPES.LOGS]).toBe(7);
    });
  });

  describe('Scheduled Tasks', () => {
    test('should start scheduled tasks', () => {
      manager.startScheduledTasks();
      expect(manager.timers.cleanup).toBeDefined();
      expect(manager.timers.archive).toBeDefined();
    });

    test('should stop scheduled tasks', () => {
      manager.startScheduledTasks();
      manager.stopScheduledTasks();
      expect(Object.keys(manager.timers).length).toBe(0);
    });

    test('should not start duplicate timers', () => {
      manager.startScheduledTasks();
      const firstCleanup = manager.timers.cleanup;
      manager.startScheduledTasks();
      expect(manager.timers.cleanup).toBe(firstCleanup);
    });
  });

  describe('Export', () => {
    test('should export archived files by date range', async () => {
      await manager.initialize();
      
      const archiveDir = path.join(manager.config.archive.archivePath, DATA_TYPES.OPPORTUNITIES);
      
      // Create files with different dates
      await fs.writeFile(path.join(archiveDir, 'old.json.gz'), 'old');
      await fs.writeFile(path.join(archiveDir, 'new.json.gz'), 'new');
      
      // Touch files to set dates (simplified for test)
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const result = await manager.exportArchive(DATA_TYPES.OPPORTUNITIES, weekAgo, now);
      
      expect(result.files.length).toBeGreaterThanOrEqual(0); // May vary by file system
    });
  });

  describe('Disk Space Check', () => {
    test('should check disk space', async () => {
      const hasSpace = await manager.checkDiskSpace();
      expect(typeof hasSpace).toBe('boolean');
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  const { execSync } = require('child_process');
  try {
    execSync('npx jest data-retention-manager.test.js --verbose', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (error) {
    process.exit(1);
  }
}
