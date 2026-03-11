/** @format */

/**
 * Data Retention and Archiving Manager
 *
 * Handles automatic archiving of old data, configurable retention policies,
 * data compression, and cleanup of historical records.
 */

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Data types that can be archived
 */
const DATA_TYPES = {
  OPPORTUNITIES: 'opportunities',
  BETS: 'bets',
  ODDS_HISTORY: 'odds_history',
  ALERTS: 'alerts',
  LOGS: 'logs',
  METRICS: 'metrics',
  HOURLY_REPORTS: 'hourly_reports',
  SETTLEMENTS: 'settlements'
};

/**
 * Default retention configuration
 */
const DEFAULT_CONFIG = {
  // Retention periods in days
  retentionDays: {
    [DATA_TYPES.OPPORTUNITIES]: 90,
    [DATA_TYPES.BETS]: 365,
    [DATA_TYPES.ODDS_HISTORY]: 30,
    [DATA_TYPES.ALERTS]: 30,
    [DATA_TYPES.LOGS]: 14,
    [DATA_TYPES.METRICS]: 180,
    [DATA_TYPES.HOURLY_REPORTS]: 60,
    [DATA_TYPES.SETTLEMENTS]: 365 * 2 // 2 years for tax purposes
  },

  // Archive settings
  archive: {
    enabled: true,
    compressAfterDays: 7,        // Compress data older than this
    archiveAfterDays: 30,        // Move to archive folder after this
    deleteAfterDays: 365,        // Permanently delete after this (if not archived)
    compressionLevel: 6,         // Gzip compression level (1-9)
    archivePath: './data/archive',
    tempPath: './data/temp'
  },

  // Scheduling
  schedule: {
    cleanupIntervalHours: 24,    // Run cleanup every X hours
    archiveIntervalHours: 168,   // Run full archive every week
    maxCleanupDurationMs: 300000 // Max 5 minutes for cleanup
  },

  // Safety
  safety: {
    dryRun: false,               // If true, only log what would be done
    backupBeforeDelete: true,    // Create backup before permanent deletion
    minFreeSpaceGb: 1,           // Minimum free space before archiving
    maxArchiveSizeGb: 10         // Max total archive size
  }
};

class DataRetentionManager {
  constructor(config = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.stats = {
      lastCleanup: null,
      lastArchive: null,
      itemsArchived: 0,
      itemsDeleted: 0,
      itemsCompressed: 0,
      spaceSaved: 0,
      errors: []
    };
    this.timers = {};
    this.running = false;
  }

  /**
   * Deep merge configuration
   */
  mergeConfig(defaults, overrides) {
    const result = { ...defaults };
    for (const key in overrides) {
      if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = this.mergeConfig(defaults[key] || {}, overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    return result;
  }

  /**
   * Initialize directories and start scheduled tasks
   */
  async initialize() {
    // Create archive and temp directories
    await this.ensureDirectory(this.config.archive.archivePath);
    await this.ensureDirectory(this.config.archive.tempPath);

    // Create subdirectories for each data type
    for (const dataType of Object.values(DATA_TYPES)) {
      await this.ensureDirectory(path.join(this.config.archive.archivePath, dataType));
    }

    console.log('✅ Data Retention Manager initialized');
    return this;
  }

  /**
   * Ensure directory exists
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  /**
   * Start scheduled cleanup and archiving
   */
  startScheduledTasks() {
    if (this.timers.cleanup) return;

    // Schedule cleanup
    const cleanupMs = this.config.schedule.cleanupIntervalHours * 60 * 60 * 1000;
    this.timers.cleanup = setInterval(() => {
      this.runCleanup().catch(err => {
        console.error('Scheduled cleanup error:', err);
        this.stats.errors.push({ time: new Date(), error: err.message, task: 'cleanup' });
      });
    }, cleanupMs);

    // Schedule full archive
    const archiveMs = this.config.schedule.archiveIntervalHours * 60 * 60 * 1000;
    this.timers.archive = setInterval(() => {
      this.runFullArchive().catch(err => {
        console.error('Scheduled archive error:', err);
        this.stats.errors.push({ time: new Date(), error: err.message, task: 'archive' });
      });
    }, archiveMs);

    console.log(`📅 Scheduled tasks: cleanup every ${this.config.schedule.cleanupIntervalHours}h, archive every ${this.config.schedule.archiveIntervalHours}h`);
  }

  /**
   * Stop scheduled tasks
   */
  stopScheduledTasks() {
    for (const timer of Object.values(this.timers)) {
      clearInterval(timer);
    }
    this.timers = {};
    console.log('⏹️ Scheduled tasks stopped');
  }

  /**
   * Run cleanup process
   */
  async runCleanup() {
    if (this.running) {
      console.log('⚠️ Cleanup already running, skipping');
      return { skipped: true, reason: 'already_running' };
    }

    this.running = true;
    const startTime = Date.now();
    const results = {
      compressed: 0,
      archived: 0,
      deleted: 0,
      errors: []
    };

    console.log('\n🧹 Starting data cleanup...');

    try {
      // Check disk space
      const hasSpace = await this.checkDiskSpace();
      if (!hasSpace) {
        console.log('⚠️ Low disk space, skipping cleanup');
        return { skipped: true, reason: 'low_disk_space' };
      }

      // Process each data type
      for (const dataType of Object.values(DATA_TYPES)) {
        try {
          const typeResults = await this.processDataType(dataType);
          results.compressed += typeResults.compressed;
          results.archived += typeResults.archived;
          results.deleted += typeResults.deleted;
        } catch (error) {
          console.error(`Error processing ${dataType}:`, error);
          results.errors.push({ dataType, error: error.message });
        }

        // Check timeout
        if (Date.now() - startTime > this.config.schedule.maxCleanupDurationMs) {
          console.log('⏱️ Cleanup timeout reached, stopping');
          break;
        }
      }

      this.stats.lastCleanup = new Date();
      this.stats.itemsCompressed += results.compressed;
      this.stats.itemsArchived += results.archived;
      this.stats.itemsDeleted += results.deleted;

      const duration = Date.now() - startTime;
      console.log(`✅ Cleanup complete in ${duration}ms: ${results.compressed} compressed, ${results.archived} archived, ${results.deleted} deleted`);

      return {
        success: true,
        duration,
        ...results
      };

    } catch (error) {
      console.error('Cleanup error:', error);
      this.stats.errors.push({ time: new Date(), error: error.message, task: 'cleanup' });
      return { success: false, error: error.message };
    } finally {
      this.running = false;
    }
  }

  /**
   * Process a specific data type
   */
  async processDataType(dataType) {
    const results = { compressed: 0, archived: 0, deleted: 0 };
    const dataPath = this.getDataPath(dataType);

    try {
      // Check if data path exists
      await fs.access(dataPath);
    } catch {
      return results; // No data for this type
    }

    const retentionDays = this.config.retentionDays[dataType] || 90;
    const compressAfterDays = this.config.archive.compressAfterDays;
    const archiveAfterDays = this.config.archive.archiveAfterDays;
    const deleteAfterDays = this.config.archive.deleteAfterDays;

    const files = await fs.readdir(dataPath);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(dataPath, file);
      const stats = await fs.stat(filePath);
      const ageDays = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      // Skip directories for now
      if (stats.isDirectory()) continue;

      // Skip already compressed files
      if (file.endsWith('.gz')) {
        // Check if should be deleted
        if (ageDays > deleteAfterDays) {
          if (this.config.safety.dryRun) {
            console.log(`[DRY RUN] Would delete: ${filePath}`);
          } else {
            await fs.unlink(filePath);
            results.deleted++;
          }
        }
        continue;
      }

      // Compress old files
      if (ageDays > compressAfterDays && ageDays <= archiveAfterDays) {
        if (this.config.safety.dryRun) {
          console.log(`[DRY RUN] Would compress: ${filePath}`);
        } else {
          const compressed = await this.compressFile(filePath);
          if (compressed) results.compressed++;
        }
        continue;
      }

      // Archive very old files
      if (ageDays > archiveAfterDays && ageDays <= deleteAfterDays) {
        if (this.config.safety.dryRun) {
          console.log(`[DRY RUN] Would archive: ${filePath}`);
        } else {
          const archived = await this.archiveFile(filePath, dataType);
          if (archived) results.archived++;
        }
        continue;
      }

      // Delete ancient files
      if (ageDays > deleteAfterDays) {
        if (this.config.safety.dryRun) {
          console.log(`[DRY RUN] Would delete: ${filePath}`);
        } else {
          if (this.config.safety.backupBeforeDelete) {
            await this.backupFile(filePath, dataType);
          }
          await fs.unlink(filePath);
          results.deleted++;
        }
      }
    }

    return results;
  }

  /**
   * Get data path for a data type
   */
  getDataPath(dataType) {
    const paths = {
      [DATA_TYPES.OPPORTUNITIES]: './data/opportunities',
      [DATA_TYPES.BETS]: './data/bets',
      [DATA_TYPES.ODDS_HISTORY]: './data/odds_history',
      [DATA_TYPES.ALERTS]: './data/alerts',
      [DATA_TYPES.LOGS]: './logs',
      [DATA_TYPES.METRICS]: './data/metrics',
      [DATA_TYPES.HOURLY_REPORTS]: '.',
      [DATA_TYPES.SETTLEMENTS]: './data/settlements'
    };
    return paths[dataType] || './data';
  }

  /**
   * Compress a file using gzip
   */
  async compressFile(filePath) {
    try {
      const content = await fs.readFile(filePath);
      const compressed = await gzip(content, { level: this.config.archive.compressionLevel });
      const compressedPath = `${filePath}.gz`;

      await fs.writeFile(compressedPath, compressed);
      await fs.unlink(filePath);

      const saved = content.length - compressed.length;
      this.stats.spaceSaved += saved;

      return true;
    } catch (error) {
      console.error(`Failed to compress ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Archive a file to archive directory
   */
  async archiveFile(filePath, dataType) {
    try {
      const fileName = path.basename(filePath);
      const archiveDir = path.join(this.config.archive.archivePath, dataType);
      const targetArchivePath = path.join(archiveDir, fileName);

      // Compress if not already
      let sourcePath = filePath;
      let finalFileName = fileName;
      if (!filePath.endsWith('.gz')) {
        const content = await fs.readFile(filePath);
        const compressed = await gzip(content, { level: this.config.archive.compressionLevel });
        const tempPath = path.join(this.config.archive.tempPath, `${fileName}.gz`);
        await fs.writeFile(tempPath, compressed);
        sourcePath = tempPath;
        finalFileName = `${fileName}.gz`;
      }

      // Move to archive
      const finalArchivePath = path.join(archiveDir, path.basename(sourcePath));
      await fs.rename(sourcePath, finalArchivePath);

      // Clean up temp if used
      if (sourcePath !== filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      return true;
    } catch (error) {
      console.error(`Failed to archive ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Backup file before deletion
   */
  async backupFile(filePath, dataType) {
    try {
      const backupDir = path.join(this.config.archive.archivePath, 'backups', dataType);
      await this.ensureDirectory(backupDir);

      const fileName = path.basename(filePath);
      const backupPath = path.join(backupDir, `${fileName}.backup.${Date.now()}`);

      await fs.copyFile(filePath, backupPath);

      // Compress backup
      const content = await fs.readFile(backupPath);
      const compressed = await gzip(content, { level: this.config.archive.compressionLevel });
      await fs.writeFile(`${backupPath}.gz`, compressed);
      await fs.unlink(backupPath);

      return true;
    } catch (error) {
      console.error(`Failed to backup ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Run full archive process
   */
  async runFullArchive() {
    console.log('\n📦 Starting full archive process...');

    const results = {
      archived: 0,
      compressed: 0,
      errors: []
    };

    try {
      // Archive all data directories
      for (const dataType of Object.values(DATA_TYPES)) {
        const dataPath = this.getDataPath(dataType);

        try {
          await fs.access(dataPath);
          const files = await fs.readdir(dataPath);

          for (const file of files) {
            const filePath = path.join(dataPath, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile() && !file.endsWith('.gz')) {
              const archived = await this.archiveFile(filePath, dataType);
              if (archived) results.archived++;
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      }

      this.stats.lastArchive = new Date();

      console.log(`✅ Full archive complete: ${results.archived} files archived`);

      return {
        success: true,
        ...results
      };

    } catch (error) {
      console.error('Full archive error:', error);
      this.stats.errors.push({ time: new Date(), error: error.message, task: 'full_archive' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check available disk space
   */
  async checkDiskSpace() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('df -BG .', { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.split(/\s+/);
      const availableGb = parseInt(parts[3]);

      return availableGb >= this.config.safety.minFreeSpaceGb;
    } catch {
      // If we can't check, assume we have space
      return true;
    }
  }

  /**
   * Get archive statistics
   */
  async getArchiveStats() {
    const stats = {
      ...this.stats,
      archiveSize: 0,
      archiveFiles: 0,
      byType: {}
    };

    try {
      for (const dataType of Object.values(DATA_TYPES)) {
        const typeDir = path.join(this.config.archive.archivePath, dataType);

        try {
          await fs.access(typeDir);
          const files = await fs.readdir(typeDir);
          let typeSize = 0;

          for (const file of files) {
            const filePath = path.join(typeDir, file);
            const fileStats = await fs.stat(filePath);
            typeSize += fileStats.size;
          }

          stats.byType[dataType] = {
            files: files.length,
            size: typeSize
          };
          stats.archiveFiles += files.length;
          stats.archiveSize += typeSize;
        } catch {
          stats.byType[dataType] = { files: 0, size: 0 };
        }
      }
    } catch (error) {
      console.error('Error getting archive stats:', error);
    }

    return stats;
  }

  /**
   * Restore archived file
   */
  async restoreFile(fileName, dataType, destinationPath = null) {
    try {
      const archiveDir = path.join(this.config.archive.archivePath, dataType);
      const archivePath = path.join(archiveDir, fileName);

      // Check if compressed
      const compressedPath = fileName.endsWith('.gz') ? archivePath : `${archivePath}.gz`;
      let sourcePath = archivePath;
      let isCompressed = false;

      try {
        await fs.access(compressedPath);
        sourcePath = compressedPath;
        isCompressed = true;
      } catch {
        await fs.access(archivePath);
      }

      // Determine destination
      const destPath = destinationPath || path.join(this.getDataPath(dataType), fileName);

      if (isCompressed) {
        // Decompress
        const compressed = await fs.readFile(sourcePath);
        const decompressed = await gunzip(compressed);
        await fs.writeFile(destPath, decompressed);
      } else {
        // Copy as-is
        await fs.copyFile(sourcePath, destPath);
      }

      return { success: true, restoredTo: destPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates) {
    this.config = this.mergeConfig(this.config, updates);
    return this.config;
  }

  /**
   * Export archived data
   */
  async exportArchive(dataType, startDate, endDate) {
    const results = {
      files: [],
      totalSize: 0
    };

    try {
      const archiveDir = path.join(this.config.archive.archivePath, dataType);
      await fs.access(archiveDir);

      const files = await fs.readdir(archiveDir);

      for (const file of files) {
        const filePath = path.join(archiveDir, file);
        const stats = await fs.stat(filePath);

        // Check date range
        const fileDate = stats.mtime;
        if (fileDate >= startDate && fileDate <= endDate) {
          results.files.push({
            name: file,
            path: filePath,
            size: stats.size,
            date: fileDate
          });
          results.totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error('Export archive error:', error);
    }

    return results;
  }
}

module.exports = {
  DataRetentionManager,
  DATA_TYPES,
  DEFAULT_CONFIG
};
