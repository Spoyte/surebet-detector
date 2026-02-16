/**
 * Standalone script to fetch odds and analyze opportunities
 */
require('dotenv').config({ path: './config/.env' });

const OddsFetcher = require('./src/fetcher');
const OpportunityAnalyzer = require('./src/analyzer');
const fs = require('fs').promises;
const path = require('path');

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

    // Analyze opportunities
    console.log('\n🔍 Analyzing opportunities...\n');
    const opportunities = analyzer.analyze(data);

    // Save analysis
    const analysisFile = path.join(__dirname, 'data/cache/latest_analysis.json');
    await fs.writeFile(analysisFile, JSON.stringify(opportunities, null, 2));

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
                console.error('❌ Telegram notification failed:', error.message);
            }
        } else {
            console.log('ℹ️  No high-value opportunities to notify');
        }
    }

    console.log('\n✅ Hourly update complete');
    console.log(`Analysis saved to: ${analysisFile}`);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
