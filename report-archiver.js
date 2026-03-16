/**
 * Surebet Detector - Report Archiver
 * 
 * A maintenance utility for managing historical reports.
 * Moves reports from root to organized storage with optional compression.
 * 
 * Principles:
 * - Separation of concerns: reports ≠ application code
 * - Progressive enhancement: recent reports accessible, old reports archived
 * - Idempotent operations: safe to run multiple times
 */

const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  reportPrefix: 'HOURLY_REPORT_',
  reportExtension: '.md',
  reportsDir: path.join(__dirname, 'reports', 'hourly'),
  archiveDir: path.join(__dirname, 'reports', 'archive'),
  compressAfterDays: 7,
  deleteCompressedAfterDays: 90,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// ============================================================================
// UTILITIES
// ============================================================================

const Log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  dryRun: (action, target) => console.log(`[DRY RUN] Would ${action}: ${target}`),
};

const Time = {
  daysAgo: (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  },
  
  parseReportDate: (filename) => {
    // HOURLY_REPORT_2026-03-16_2033.md → Date
    const match = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{4})/);
    if (!match) return null;
    const [_, datePart, timePart] = match;
    const year = parseInt(datePart.slice(0, 4));
    const month = parseInt(datePart.slice(5, 7)) - 1;
    const day = parseInt(datePart.slice(8, 10));
    const hour = parseInt(timePart.slice(0, 2));
    const minute = parseInt(timePart.slice(2, 4));
    return new Date(year, month, day, hour, minute);
  },
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

const FileOps = {
  async ensureDir(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  },

  async compressFile(sourcePath, destPath) {
    const source = createReadStream(sourcePath);
    const gzip = zlib.createGzip({ level: 9 });
    const dest = createWriteStream(destPath);
    
    await pipeline(source, gzip, dest);
  },

  async getReportFiles(dir) {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.startsWith(CONFIG.reportPrefix) && (f.endsWith(CONFIG.reportExtension) || f.endsWith('.gz')))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        isCompressed: f.endsWith('.gz'),
      }));
  },
};

// ============================================================================
// ARCHIVE OPERATIONS
// ============================================================================

const Archive = {
  async organizeReports() {
    const rootFiles = await FileOps.getReportFiles(__dirname);
    const reports = [];
    
    for (const file of rootFiles) {
      const stat = await fs.stat(file.path);
      const reportDate = Time.parseReportDate(file.name);
      
      reports.push({
        ...file,
        size: stat.size,
        mtime: stat.mtime,
        reportDate,
        age: Math.floor((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)),
      });
    }

    return reports.sort((a, b) => b.mtime - a.mtime);
  },

  async moveToReportsDir(report) {
    const destPath = path.join(CONFIG.reportsDir, report.name);
    
    if (CONFIG.dryRun) {
      Log.dryRun('move', `${report.name} → reports/hourly/`);
      return;
    }
    
    await fs.rename(report.path, destPath);
    Log.success(`Moved ${report.name} to reports/hourly/`);
  },

  async compressAndArchive(report) {
    const compressedName = `${report.name}.gz`;
    const compressedPath = path.join(CONFIG.archiveDir, compressedName);
    
    if (CONFIG.dryRun) {
      Log.dryRun('compress', `${report.name} → reports/archive/${compressedName}`);
      return;
    }

    try {
      await FileOps.compressFile(report.path, compressedPath);
      await fs.unlink(report.path);
      Log.success(`Compressed and archived ${report.name}`);
    } catch (err) {
      Log.error(`Failed to compress ${report.name}: ${err.message}`);
    }
  },

  async deleteOldArchive(filename) {
    const filePath = path.join(CONFIG.archiveDir, filename);
    
    if (CONFIG.dryRun) {
      Log.dryRun('delete', `reports/archive/${filename}`);
      return;
    }

    await fs.unlink(filePath);
    Log.success(`Deleted old archive ${filename}`);
  },
};

// ============================================================================
// STATISTICS
// ============================================================================

const Stats = {
  async generate(reports) {
    const totalSize = reports.reduce((sum, r) => sum + r.size, 0);
    const compressedCount = reports.filter(r => r.isCompressed).length;
    const recentCount = reports.filter(r => r.age <= CONFIG.compressAfterDays).length;
    
    const byMonth = reports.reduce((acc, r) => {
      if (!r.reportDate) return acc;
      const monthKey = r.reportDate.toISOString().slice(0, 7);
      acc[monthKey] = (acc[monthKey] || 0) + 1;
      return acc;
    }, {});

    return {
      totalReports: reports.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      compressedCount,
      recentCount,
      byMonth,
    };
  },

  print(stats) {
    console.log('\n📊 Report Archive Statistics');
    console.log('=' .repeat(40));
    console.log(`Total reports: ${stats.totalReports}`);
    console.log(`Total size: ${stats.totalSizeMB} MB`);
    console.log(`Recent (≤${CONFIG.compressAfterDays} days): ${stats.recentCount}`);
    console.log(`Compressed: ${stats.compressedCount}`);
    console.log('\nReports by month:');
    Object.entries(stats.byMonth)
      .sort()
      .forEach(([month, count]) => console.log(`  ${month}: ${count} reports`));
    console.log('');
  },
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('📦 Surebet Detector - Report Archiver\n');
  
  if (CONFIG.dryRun) {
    Log.warning('Running in DRY RUN mode — no changes will be made\n');
  }

  // Ensure directories exist
  await FileOps.ensureDir(CONFIG.reportsDir);
  await FileOps.ensureDir(CONFIG.archiveDir);

  // Organize reports
  Log.info('Scanning for reports...');
  const reports = await Archive.organizeReports();
  
  if (reports.length === 0) {
    Log.info('No reports found to organize');
    return;
  }

  Log.success(`Found ${reports.length} reports`);

  // Move recent reports to reports/hourly/
  const recentReports = reports.filter(r => r.age <= CONFIG.compressAfterDays);
  if (recentReports.length > 0) {
    console.log(`\n📁 Moving ${recentReports.length} recent reports to reports/hourly/`);
    for (const report of recentReports) {
      await Archive.moveToReportsDir(report);
    }
  }

  // Compress older reports
  const oldReports = reports.filter(r => r.age > CONFIG.compressAfterDays && !r.isCompressed);
  if (oldReports.length > 0) {
    console.log(`\n🗜️  Compressing ${oldReports.length} older reports`);
    for (const report of oldReports) {
      await Archive.compressAndArchive(report);
    }
  }

  // Clean up very old archives
  const cutoffDate = Time.daysAgo(new Date(), CONFIG.deleteCompressedAfterDays);
  const archiveFiles = await FileOps.getReportFiles(CONFIG.archiveDir);
  const veryOldArchives = [];
  
  for (const file of archiveFiles) {
    const stat = await fs.stat(file.path);
    if (stat.mtime < cutoffDate) {
      veryOldArchives.push(file.name);
    }
  }

  if (veryOldArchives.length > 0) {
    console.log(`\n🗑️  Deleting ${veryOldArchives.length} archives older than ${CONFIG.deleteCompressedAfterDays} days`);
    for (const filename of veryOldArchives) {
      await Archive.deleteOldArchive(filename);
    }
  }

  // Generate statistics
  const allReports = [
    ...await FileOps.getReportFiles(CONFIG.reportsDir),
    ...await FileOps.getReportFiles(CONFIG.archiveDir),
  ];
  
  // Get stats for all files
  const reportsWithStats = await Promise.all(
    allReports.map(async (r) => {
      const stat = await fs.stat(r.path);
      return {
        ...r,
        size: stat.size,
        mtime: stat.mtime,
        reportDate: Time.parseReportDate(r.name.replace('.gz', '')),
        age: Math.floor((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)),
      };
    })
  );

  const stats = await Stats.generate(reportsWithStats);
  Stats.print(stats);

  console.log('✅ Archive maintenance complete');
}

main().catch(err => {
  Log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
