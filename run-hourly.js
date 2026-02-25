/**
 * Standalone script to fetch odds and analyze opportunities
 */
require('dotenv').config({ path: './config/.env' });

const OddsFetcher = require('./src/fetcher');
const OpportunityAnalyzer = require('./src/analyzer');
const fs = require('fs').promises;
const path = require('path');

function formatDate(date) {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Clean up old hourly report files, keeping only the most recent N reports
 */
async function cleanupOldReports(maxReports = 48) {
    try {
        const files = await fs.readdir(__dirname);
        const reportFiles = files
            .filter(f => f.startsWith('HOURLY_REPORT_') && f.endsWith('.md'))
            .map(f => ({
                name: f,
                path: path.join(__dirname, f),
                time: fs.stat(path.join(__dirname, f)).then(s => s.mtime)
            }));

        // Wait for all stat calls
        const reportsWithTime = await Promise.all(
            reportFiles.map(async r => ({
                name: r.name,
                path: r.path,
                time: await r.time
            }))
        );

        // Sort by modification time (newest first)
        reportsWithTime.sort((a, b) => b.time - a.time);

        // Delete old reports
        if (reportsWithTime.length > maxReports) {
            const toDelete = reportsWithTime.slice(maxReports);
            for (const report of toDelete) {
                await fs.unlink(report.path);
                console.log(`🗑️  Cleaned up old report: ${report.name}`);
            }
            return toDelete.length;
        }
        return 0;
    } catch (e) {
        console.error('Report cleanup error:', e.message);
        return 0;
    }
}

function generateMarkdownReport(opportunities, data, apiStatus = {}) {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const timestamp = beijingTime.toISOString().slice(0, 16).replace('T', ' ');
    
    // Determine API status indicators
    const oddsApiStatus = apiStatus.oddsApi > 0 ? '✅' : '❌';
    const polymarketStatus = apiStatus.polymarket > 0 ? '✅' : '❌';
    const forexStatus = opportunities.forex?.USD_EUR ? '✅' : '❌';
    
    let md = `# Surebet Detector - Hourly Report
**Time:** ${timestamp} (Asia/Shanghai)  
**Report ID:** HOURLY_REPORT_${beijingTime.toISOString().slice(0, 10)}_${beijingTime.getHours().toString().padStart(2, '0')}${beijingTime.getMinutes().toString().padStart(2, '0')}

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| **Arbitrage Opportunities** | ${opportunities.arbitrage.length} |
| **+EV Opportunities** | ${opportunities.positiveEV.length} |
| **Suspicious Odds** | ${opportunities.suspicious?.length || 0} |
| **Forex Rate** | 1 USD = ${opportunities.forex.USD_EUR} EUR |

---

## 🔌 API Status

| Service | Status | Details |
|---------|--------|---------|
| **Odds API** | ${oddsApiStatus} | ${apiStatus.oddsApi || 0} events fetched |
| **Polymarket** | ${polymarketStatus} | ${apiStatus.polymarket || 0} markets fetched |
| **Forex API** | ${forexStatus} | USD/EUR rate active |

---
`;;

    if (opportunities.arbitrage.length > 0) {
        md += `\n## 🎯 Arbitrage Opportunities\n`;
        opportunities.arbitrage.forEach((arb, i) => {
            const startTime = new Date(arb.commenceTime);
            const startBeijing = new Date(startTime.getTime() + (8 * 60 * 60 * 1000));
            md += `\n### ${i + 1}. ${arb.event} (${arb.sport.charAt(0).toUpperCase() + arb.sport.slice(1)})\n`;
            md += `- **Profit:** ${arb.profitPercent}%\n`;
            md += `- **Starts:** ${startBeijing.toISOString().slice(0, 16).replace('T', ' ')} CST\n`;
            md += `- **Strategy:**\n`;
            arb.legs.forEach(leg => {
                md += `  - Bet **${leg.outcome}** @ ${leg.bookmaker} (odds: ${leg.odds}) — Stake: €${leg.stake}\n`;
            });
            md += `- **Guaranteed Profit:** €${arb.stakes.guaranteedProfit} on €${arb.stakes.totalStake} total stake\n`;
        });
        md += '\n---\n';
    }

    if (opportunities.positiveEV.length > 0) {
        md += `\n## 💰 +EV Opportunities\n`;
        opportunities.positiveEV.forEach((ev, i) => {
            md += `\n### ${i + 1}. ${ev.outcome} @ ${ev.bookmaker}\n`;
            md += `- **Event:** ${ev.event}\n`;
            md += `- **Odds:** ${ev.odds} (${ev.bookmaker}) vs ${ev.pinnacleOdds} (Pinnacle)\n`;
            md += `- **EV:** +${ev.evPercent}%\n`;
            md += `- **True Probability:** ${ev.trueProbability}%\n`;
        });
        md += '\n---\n';
    }

    if (opportunities.suspicious?.length > 0) {
        md += `\n## ⚠️ Suspicious Odds\n`;
        md += `*These odds have been flagged for manual review:*\n`;
        opportunities.suspicious.forEach((s, i) => {
            md += `\n### ${i + 1}. ${s.outcome} @ ${s.bookmaker}\n`;
            md += `- **Event:** ${s.event}\n`;
            md += `- **Odds:** ${s.odds}`;
            if (s.pinnacleOdds) {
                md += ` vs ${s.pinnacleOdds} (Pinnacle)`;
            } else if (s.consensusOdds) {
                md += ` vs ${s.consensusOdds} (consensus median)`;
            }
            md += `\n`;
            if (s.ratio) {
                md += `- **Ratio:** ${s.ratio}x\n`;
            }
            md += `- **Note:** ${s.note}\n`;
        });
        md += '\n---\n';
    }

    md += `\n## 📈 API Usage\n\n`;
    md += `- **Odds API Requests:** Data fetched successfully\n`;
    md += `- **Polymarket:** ${data.polymarketData.length} sports-related markets fetched\n`;
    md += `- **Forex API:** ✅ Operational\n`;
    md += `- **Events Tracked:** ${data.oddsData.length} from Odds API\n`;

    md += `\n---\n\n*Report generated by Surebet Detector v2.0.0*\n`;
    
    return md;
}

async function main() {
    console.log('🎯 Surebet Detector - Hourly Update\n');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('');

    const config = {
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

    console.log('Configuration:');
    console.log(`  Sports: ${config.SPORTS}`);
    console.log(`  Markets: ${config.MARKETS}`);
    console.log(`  Min EV: ${config.MIN_EV_THRESHOLD}%`);
    console.log('');

    const fetcher = new OddsFetcher(config);
    const analyzer = new OpportunityAnalyzer(config);

    // Fetch fresh data
    console.log('📡 Fetching latest odds data...\n');
    const data = await fetcher.fetchAll();

    // Initialize analyzer (needed for value betting detector and other components)
    console.log('⚙️  Initializing analyzer...');
    await analyzer.init();

    // Analyze opportunities
    console.log('\n🔍 Analyzing opportunities...\n');
    const opportunities = analyzer.analyze(data);

    // Track API status for report
    const apiStatus = {
        oddsApi: data.oddsData?.length || 0,
        polymarket: data.polymarketData?.length || 0
    };

    // Save analysis
    const analysisFile = path.join(__dirname, 'data/cache/latest_analysis.json');
    await fs.writeFile(analysisFile, JSON.stringify(opportunities, null, 2));

    // Generate markdown report with API status
    const reportMd = generateMarkdownReport(opportunities, data, apiStatus);
    const beijingTime = new Date(Date.now() + (8 * 60 * 60 * 1000));
    const reportId = `HOURLY_REPORT_${beijingTime.toISOString().slice(0, 10)}_${beijingTime.getHours().toString().padStart(2, '0')}${beijingTime.getMinutes().toString().padStart(2, '0')}`;
    const reportFile = path.join(__dirname, `${reportId}.md`);
    await fs.writeFile(reportFile, reportMd);

    // Generate report
    console.log('\n📊 REPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Timestamp: ${opportunities.timestamp}`);
    console.log(`Forex: 1 USD = ${opportunities.forex.USD_EUR} EUR`);
    console.log('');
    console.log(`🎯 Arbitrage Opportunities: ${opportunities.arbitrage.length}`);
    console.log(`💰 +EV Opportunities: ${opportunities.positiveEV.length}`);
    console.log(`⚠️  Suspicious Odds: ${opportunities.suspicious?.length || 0}`);
    console.log('');

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

    // Send Telegram notification if high-value opportunities found
    if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        const axios = require('axios');
        
        const highValueArbs = opportunities.arbitrage.filter(a => a.profitPercent >= 1);
        const highValueEV = opportunities.positiveEV.filter(e => e.evPercent >= config.MIN_EV_THRESHOLD);
        
        if (highValueArbs.length > 0 || highValueEV.length > 0) {
            let message = '🎯 *Surebet Detector Update*\n\n';
            
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

            try {
                await axios.post(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: config.TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown'
                });
                console.log('✅ Telegram notification sent');
            } catch (error) {
                const errorMsg = error.response?.data?.description || error.message || 'Unknown error';
                console.error('❌ Telegram notification failed:', errorMsg);
            }
        } else {
            console.log('ℹ️  No high-value opportunities to notify');
        }
    }

    console.log('\n✅ Hourly update complete');
    console.log(`Analysis saved to: ${analysisFile}`);
    console.log(`ReportFile: ${reportFile}`);

    // Clean up old reports (keep last 48 = ~2 days of hourly reports)
    const cleaned = await cleanupOldReports(48);
    if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} old report(s)`);
    }
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
