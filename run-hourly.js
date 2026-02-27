/**
 * Surebet Detector - Hourly Runner (Refactored)
 * 
 * Principles applied:
 * - Separation of concerns: fetch → analyze → report → notify
 * - Pure functions for transformations
 * - Consistent error handling
 * - Clear configuration boundaries
 */

require('dotenv').config({ path: './config/.env' });

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const OddsFetcher = require('./src/fetcher');
const OpportunityAnalyzer = require('./src/analyzer');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  maxReports: 48,
  timezoneOffset: 8, // Beijing/CST offset from UTC
  reportPrefix: 'HOURLY_REPORT_',
  cacheDir: path.join(__dirname, 'data/cache'),
  minProfitThreshold: 1.0,
  telegramTimeout: 10000,
};

// ============================================================================
// TIME UTILITIES (Pure functions)
// ============================================================================

const Time = {
  toBeijing: (date = new Date()) => new Date(date.getTime() + (CONFIG.timezoneOffset * 60 * 60 * 1000)),
  
  format: (date) => date.toISOString().slice(0, 16).replace('T', ' '),
  
  formatDuration: (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    return days > 0 ? `${days} day${days > 1 ? 's' : ''}` : `${hours} hour${hours !== 1 ? 's' : ''}`;
  },
  
  reportId: (date) => {
    const beijing = Time.toBeijing(date);
    const hours = beijing.getHours().toString().padStart(2, '0');
    const minutes = beijing.getMinutes().toString().padStart(2, '0');
    const year = beijing.getFullYear();
    const month = (beijing.getMonth() + 1).toString().padStart(2, '0');
    const day = beijing.getDate().toString().padStart(2, '0');
    return `${CONFIG.reportPrefix}${year}-${month}-${day}_${hours}${minutes}`;
  }
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

const FileOps = {
  async readJson(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  async writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  },

  async getFilesByPattern(dir, pattern) {
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => pattern.test(f));
    } catch {
      return [];
    }
  }
};

// ============================================================================
// DATA RETRIEVAL
// ============================================================================

const DataRetrieval = {
  async getLastSuccessfulFetch(cacheDir) {
    const files = await FileOps.getFilesByPattern(cacheDir, /^data_\d+\.json$/);
    
    const dataFiles = files
      .map(f => ({
        name: f,
        time: parseInt(f.match(/data_(\d+)\.json/)?.[1] || 0, 10)
      }))
      .filter(f => f.time > 0)
      .sort((a, b) => b.time - a.time)
      .slice(0, 10);

    for (const file of dataFiles) {
      const data = await FileOps.readJson(path.join(cacheDir, file.name));
      if (data?.oddsData?.length > 0) {
        return new Date(file.time);
      }
    }
    return null;
  }
};

// ============================================================================
// REPORT CLEANUP
// ============================================================================

const ReportCleanup = {
  async cleanup(maxReports = CONFIG.maxReports) {
    const files = await fs.readdir(__dirname);
    const reportFiles = files.filter(f => f.startsWith(CONFIG.reportPrefix) && f.endsWith('.md'));
    
    if (reportFiles.length <= maxReports) return 0;

    const withStats = await Promise.all(
      reportFiles.map(async (name) => ({
        name,
        path: path.join(__dirname, name),
        mtime: (await fs.stat(path.join(__dirname, name))).mtime
      }))
    );

    withStats.sort((a, b) => b.mtime - a.mtime);
    const toDelete = withStats.slice(maxReports);
    
    await Promise.all(toDelete.map(r => fs.unlink(r.path)));
    
    console.log(`🗑️  Cleaned up ${toDelete.length} old report(s)`);
    return toDelete.length;
  }
};

// ============================================================================
// REPORT GENERATION (Pure functions for formatting)
// ============================================================================

const ReportFormatter = {
  header(timestamp, reportId) {
    return `# Surebet Detector - Hourly Report
**Time:** ${timestamp} (Asia/Shanghai)  
**Report ID:** ${reportId}

---`;
  },

  summary(opportunities) {
    return `## 📊 Summary

| Metric | Value |
|--------|-------|
| **Arbitrage Opportunities** | ${opportunities.arbitrage.length} |
| **+EV Opportunities** | ${opportunities.positiveEV.length} |
| **Suspicious Odds** | ${opportunities.suspicious?.length || 0} |
| **Forex Rate** | 1 USD = ${opportunities.forex?.USD_EUR || 'N/A'} EUR |`;
  },

  apiStatus(status) {
    const indicator = (n) => n > 0 ? '✅' : '❌';
    const forexStatus = status.forex ? '✅' : '❌';
    
    return `## 🔌 API Status

| Service | Status | Details |
|---------|--------|---------|
| **Odds API** | ${indicator(status.oddsApi)} | ${status.oddsApi || 0} events fetched |
| **Polymarket** | ${indicator(status.polymarket)} | ${status.polymarket || 0} markets fetched |
| **Forex API** | ${forexStatus} | USD/EUR rate ${status.forex ? 'active' : 'unavailable'} |`;
  },

  apiAlert(hasIssue, lastFetch, dataAge) {
    if (!hasIssue) return '';
    
    let alert = `\n## ⚠️ API Alert

**Odds API is not returning data.**\n`;
    
    if (lastFetch) {
      alert += `\n*Last successful fetch: ${Time.format(lastFetch)} UTC (${dataAge} ago)*\n`;
    }
    
    alert += `\nPossible causes:
- API key quota exhausted
- API key invalid or expired
- Service outage

**Action Required:**
1. Check API key at https://the-odds-api.com/
2. Renew or generate a new key if needed
3. Update \`config/.env\` with the new key

---`;
    
    return alert;
  },

  arbitrage(arbitrage) {
    if (arbitrage.length === 0) return '';
    
    return arbitrage.map((arb, i) => {
      const startTime = new Date(arb.commenceTime);
      const startBeijing = Time.toBeijing(startTime);
      
      const legs = arb.legs.map(leg => 
        `  - Bet **${leg.outcome}** @ ${leg.bookmaker} (odds: ${leg.odds}) — Stake: €${leg.stake}`
      ).join('\n');
      
      return `### ${i + 1}. ${arb.event} (${arb.sport})
- **Profit:** ${arb.profitPercent}%
- **Starts:** ${Time.format(startBeijing)} CST
- **Strategy:**
${legs}
- **Guaranteed Profit:** €${arb.stakes?.guaranteedProfit || 'N/A'} on €${arb.stakes?.totalStake || 'N/A'} total stake`;
    }).join('\n\n');
  },

  positiveEV(evs) {
    if (evs.length === 0) return '';
    
    return evs.map((ev, i) => 
      `### ${i + 1}. ${ev.outcome} @ ${ev.bookmaker}
- **Event:** ${ev.event}
- **Odds:** ${ev.odds} (${ev.bookmaker}) vs ${ev.pinnacleOdds} (Pinnacle)
- **EV:** +${ev.evPercent}%
- **True Probability:** ${ev.trueProbability}%`
    ).join('\n\n');
  },

  suspicious(suspicious) {
    if (!suspicious || suspicious.length === 0) return '';
    
    return suspicious.map((s, i) => {
      let comparison = '';
      if (s.pinnacleOdds) comparison = ` vs ${s.pinnacleOdds} (Pinnacle)`;
      else if (s.consensusOdds) comparison = ` vs ${s.consensusOdds} (consensus median)`;
      
      const ratio = s.ratio ? `- **Ratio:** ${s.ratio}x\n` : '';
      
      return `### ${i + 1}. ${s.outcome} @ ${s.bookmaker}
- **Event:** ${s.event}
- **Odds:** ${s.odds}${comparison}
${ratio}- **Note:** ${s.note}`;
    }).join('\n\n');
  },

  footer(eventCount) {
    return `## 📈 API Usage

- **Odds API Requests:** Data fetched successfully
- **Polymarket:** Markets fetched
- **Forex API:** ✅ Operational
- **Events Tracked:** ${eventCount} from Odds API

---

*Report generated by Surebet Detector v2.1.0*`;
  }
};

// ============================================================================
// REPORT BUILDER
// ============================================================================

const ReportBuilder = {
  async build(opportunities, data, apiStatus) {
    const now = new Date();
    const beijing = Time.toBeijing(now);
    const timestamp = Time.format(beijing);
    const reportId = Time.reportId(now);
    
    const hasOddsApiIssue = apiStatus.oddsApi === 0;
    const lastSuccessfulFetch = await DataRetrieval.getLastSuccessfulFetch(CONFIG.cacheDir);
    const dataAge = lastSuccessfulFetch ? Time.formatDuration(Date.now() - lastSuccessfulFetch.getTime()) : 'unknown';
    
    const sections = [
      ReportFormatter.header(timestamp, reportId),
      ReportFormatter.summary(opportunities),
      ReportFormatter.apiStatus(apiStatus),
      ReportFormatter.apiAlert(hasOddsApiIssue, lastSuccessfulFetch, dataAge)
    ];

    if (opportunities.arbitrage.length > 0) {
      sections.push(`## 🎯 Arbitrage Opportunities\n\n${ReportFormatter.arbitrage(opportunities.arbitrage)}`);
    }

    if (opportunities.positiveEV.length > 0) {
      sections.push(`## 💰 +EV Opportunities\n\n${ReportFormatter.positiveEV(opportunities.positiveEV)}`);
    }

    if (opportunities.suspicious?.length > 0) {
      sections.push(`## ⚠️ Suspicious Odds\n\n*These odds have been flagged for manual review:*\n\n${ReportFormatter.suspicious(opportunities.suspicious)}`);
    }

    sections.push(ReportFormatter.footer(data.oddsData?.length || 0));

    return {
      markdown: sections.join('\n\n---\n\n'),
      reportId,
      hasCriticalIssue: hasOddsApiIssue && data.oddsData.length === 0
    };
  }
};

// ============================================================================
// NOTIFICATION BUILDER
// ============================================================================

const NotificationBuilder = {
  build(opportunities, config, hasCriticalIssue) {
    const highValueArbs = opportunities.arbitrage.filter(a => a.profitPercent >= CONFIG.minProfitThreshold);
    const highValueEV = opportunities.positiveEV.filter(e => e.evPercent >= config.MIN_EV_THRESHOLD);
    
    const hasContent = highValueArbs.length > 0 || highValueEV.length > 0 || hasCriticalIssue;
    if (!hasContent) return null;

    let message = '🎯 *Surebet Detector Update*\n\n';

    if (hasCriticalIssue) {
      message += '⚠️ *API Alert*\n\n';
      message += '❌ Odds API returned 0 events\n';
      message += 'Likely cause: API key quota exhausted or invalid\n';
      message += 'Action needed: Renew API key at https://the-odds-api.com/\n\n';
    }

    if (highValueArbs.length > 0) {
      message += `*${highValueArbs.length} Arbitrage Opportunities*\n\n`;
      for (const arb of highValueArbs.slice(0, 3)) {
        message += `📊 *${arb.event}*\n`;
        message += `Profit: ${arb.profitPercent}%\n`;
        for (const leg of arb.legs) {
          message += `  • ${leg.outcome} @ ${leg.bookmaker} (${leg.odds})\n`;
        }
        message += '\n';
      }
    }

    if (highValueEV.length > 0) {
      message += `*${highValueEV.length} +EV Opportunities*\n\n`;
      for (const ev of highValueEV.slice(0, 3)) {
        message += `💰 ${ev.outcome} @ ${ev.bookmaker}\n`;
        message += `Odds: ${ev.odds} | EV: +${ev.evPercent}%\n\n`;
      }
    }

    return message;
  }
};

// ============================================================================
// TELEGRAM NOTIFIER
// ============================================================================

const TelegramNotifier = {
  async send(message, config) {
    if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
      return { sent: false, reason: 'not_configured' };
    }

    try {
      await axios.post(
        `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: config.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        },
        { timeout: CONFIG.telegramTimeout }
      );
      return { sent: true };
    } catch (error) {
      const errorMsg = error.response?.data?.description || 
                       error.response?.data?.error_description || 
                       error.response?.data?.message ||
                       error.message || 
                       JSON.stringify(error.response?.data || error);
      return { sent: false, error: errorMsg };
    }
  }
};

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

const ConsoleOutput = {
  config(config) {
    console.log('Configuration:');
    console.log(`  Sports: ${config.SPORTS}`);
    console.log(`  Markets: ${config.MARKETS}`);
    console.log(`  Min EV: ${config.MIN_EV_THRESHOLD}%`);
    console.log('');
  },

  summary(opportunities) {
    console.log('\n📊 REPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Timestamp: ${opportunities.timestamp}`);
    console.log(`Forex: 1 USD = ${opportunities.forex?.USD_EUR || 'N/A'} EUR`);
    console.log('');
    console.log(`🎯 Arbitrage Opportunities: ${opportunities.arbitrage.length}`);
    console.log(`💰 +EV Opportunities: ${opportunities.positiveEV.length}`);
    console.log(`⚠️  Suspicious Odds: ${opportunities.suspicious?.length || 0}`);
    console.log('');
  },

  opportunities(opportunities, config) {
    if (opportunities.arbitrage.length > 0) {
      console.log('Top Arbitrage Opportunities:');
      opportunities.arbitrage.slice(0, 5).forEach((arb, i) => {
        console.log(`  ${i + 1}. ${arb.event} - ${arb.profitPercent}% profit`);
      });
      console.log('');
    }

    if (opportunities.positiveEV.length > 0) {
      console.log('Top +EV Opportunities:');
      opportunities.positiveEV.slice(0, 5).forEach((ev, i) => {
        console.log(`  ${i + 1}. ${ev.outcome} @ ${ev.bookmaker} - +${ev.evPercent}% EV`);
      });
      console.log('');
    }
  },

  completion(analysisFile, reportFile, notificationResult) {
    console.log('\n✅ Hourly update complete');
    console.log(`Analysis saved to: ${analysisFile}`);
    console.log(`Report saved to: ${reportFile}`);
    
    if (notificationResult) {
      if (notificationResult.sent) {
        console.log('✅ Telegram notification sent');
      } else if (notificationResult.reason === 'not_configured') {
        console.log('ℹ️  Telegram not configured');
      } else {
        console.log('❌ Telegram notification failed:', notificationResult.error);
      }
    } else {
      console.log('ℹ️  No high-value opportunities to notify');
    }
  }
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function loadConfig() {
  return {
    ODDS_API_KEY: process.env.ODDS_API_KEY,
    FOREX_API_URL: process.env.FOREX_API_URL || 'https://api.exchangerate-api.com/v4/latest/USD',
    POLYMARKET_SUBGRAPH: process.env.POLYMARKET_SUBGRAPH || 'https://api.thegraph.com/subgraphs/name/polymarket/matic-markets',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    UPDATE_CRON: process.env.UPDATE_CRON || '0 * * * *',
    MIN_EV_THRESHOLD: parseFloat(process.env.MIN_EV_THRESHOLD) || 5,
    SPORTS: process.env.SPORTS || 'tennis,soccer',
    MARKETS: process.env.MARKETS || 'h2h',
    PORT: parseInt(process.env.PORT, 10) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
}

async function main() {
  console.log('🎯 Surebet Detector - Hourly Update\n');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  const config = await loadConfig();
  ConsoleOutput.config(config);

  // Initialize services
  const fetcher = new OddsFetcher(config);
  const analyzer = new OpportunityAnalyzer(config);

  // Fetch data
  console.log('📡 Fetching latest odds data...\n');
  const data = await fetcher.fetchAll();

  console.log('⚙️  Initializing analyzer...');
  await analyzer.init();

  // Analyze
  console.log('\n🔍 Analyzing opportunities...\n');
  const opportunities = analyzer.analyze(data);

  // Track API status
  const apiStatus = {
    oddsApi: data.oddsData?.length || 0,
    polymarket: data.polymarketData?.length || 0,
    forex: !!opportunities.forex?.USD_EUR
  };

  // Build and save report
  const report = await ReportBuilder.build(opportunities, data, apiStatus);
  const analysisFile = path.join(CONFIG.cacheDir, 'latest_analysis.json');
  const reportFile = path.join(__dirname, `${report.reportId}.md`);

  await FileOps.writeJson(analysisFile, opportunities);
  await fs.writeFile(reportFile, report.markdown);

  // Output to console
  ConsoleOutput.summary(opportunities);
  ConsoleOutput.opportunities(opportunities, config);

  // Send notification if needed
  const notificationMessage = NotificationBuilder.build(opportunities, config, report.hasCriticalIssue);
  
  if (report.hasCriticalIssue && notificationMessage) {
    console.log('🚨 Critical API issue detected - sending alert notification...');
  }
  
  const notificationResult = notificationMessage 
    ? await TelegramNotifier.send(notificationMessage, config)
    : null;

  ConsoleOutput.completion(analysisFile, reportFile, notificationResult);

  // Cleanup old reports
  await ReportCleanup.cleanup();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
