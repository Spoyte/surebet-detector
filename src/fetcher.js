const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * Fetches odds data from multiple sources
 */
class OddsFetcher {
    constructor(config) {
        this.config = config;
        this.cacheDir = path.join(__dirname, '../data/cache');
        this.ensureCacheDir();
    }

    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (e) {
            // Directory exists
        }
    }

    /**
     * Fetch odds from The Odds API (covers Unibet, Betclic, etc.)
     */
    async fetchOddsAPI(sport, market = 'h2h') {
        if (!this.config.ODDS_API_KEY) {
            console.warn('No ODDS_API_KEY configured, skipping Odds API');
            return [];
        }

        try {
            const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
            const response = await axios.get(url, {
                params: {
                    apiKey: this.config.ODDS_API_KEY,
                    regions: 'eu', // European bookmakers
                    markets: market,
                    oddsFormat: 'decimal',
                    dateFormat: 'iso'
                },
                timeout: 30000
            });

            // Track API usage
            const remaining = response.headers['x-requests-remaining'];
            const used = response.headers['x-requests-used'];
            console.log(`Odds API: ${used} used, ${remaining} remaining`);

            return this.normalizeOddsAPIData(response.data, sport);
        } catch (error) {
            console.error('Odds API error:', error.message);
            return [];
        }
    }

    /**
     * Fetch markets from Polymarket
     */
    async fetchPolymarket() {
        const query = `
            query {
                markets(
                    where: { 
                        active: true,
                        closed: false
                    }
                    first: 100
                    orderBy: volume
                    orderDirection: desc
                ) {
                    id
                    question
                    description
                    outcomes
                    outcomePrices
                    volume
                    liquidity
                    category
                    endDate
                    resolutionSource
                }
            }
        `;

        try {
            const response = await axios.post(
                this.config.POLYMARKET_SUBGRAPH,
                { query },
                { timeout: 30000 }
            );

            return this.normalizePolymarketData(response.data.data.markets);
        } catch (error) {
            console.error('Polymarket error:', error.message);
            return [];
        }
    }

    /**
     * Fetch current EUR/USD exchange rate
     */
    async fetchForexRate() {
        try {
            const response = await axios.get(this.config.FOREX_API_URL, {
                timeout: 10000
            });
            
            // If using exchangerate-api
            if (response.data.rates && response.data.rates.EUR) {
                return {
                    USD_EUR: response.data.rates.EUR,
                    EUR_USD: 1 / response.data.rates.EUR,
                    timestamp: new Date().toISOString()
                };
            }
            
            // Fallback rates
            return {
                USD_EUR: 0.92,
                EUR_USD: 1.09,
                timestamp: new Date().toISOString(),
                note: 'Using fallback rate'
            };
        } catch (error) {
            console.error('Forex error:', error.message);
            return {
                USD_EUR: 0.92,
                EUR_USD: 1.09,
                timestamp: new Date().toISOString(),
                note: 'Using fallback rate (API failed)'
            };
        }
    }

    /**
     * Normalize Odds API data to common format
     */
    normalizeOddsAPIData(data, sport) {
        const bookmakerMap = {
            'unibet': 'Unibet',
            'betclic': 'Betclic',
            'winamax': 'Winamax',
            'pinnacle': 'Pinnacle'
        };

        const events = [];

        for (const event of data) {
            const eventData = {
                id: event.id,
                source: 'odds_api',
                sport: sport,
                eventName: `${event.away_team} vs ${event.home_team}`,
                commenceTime: event.commence_time,
                bookmakers: []
            };

            for (const bookmaker of event.bookmakers) {
                const normalizedBookmaker = {
                    name: bookmakerMap[bookmaker.key] || bookmaker.title,
                    key: bookmaker.key,
                    lastUpdate: bookmaker.last_update,
                    markets: []
                };

                for (const market of bookmaker.markets) {
                    const marketData = {
                        type: market.key,
                        outcomes: market.outcomes.map(o => ({
                            name: o.name,
                            odds: o.price,
                            impliedProbability: this.decimalToImpliedProbability(o.price)
                        }))
                    };
                    normalizedBookmaker.markets.push(marketData);
                }

                eventData.bookmakers.push(normalizedBookmaker);
            }

            events.push(eventData);
        }

        return events;
    }

    /**
     * Normalize Polymarket data to common format
     */
    normalizePolymarketData(markets) {
        const events = [];

        for (const market of markets) {
            // Skip non-sports markets for now
            if (!this.isSportsMarket(market)) continue;

            const prices = JSON.parse(market.outcomePrices || '[]');
            const outcomes = market.outcomes || [];

            const eventData = {
                id: market.id,
                source: 'polymarket',
                sport: this.categorizePolymarketSport(market),
                eventName: market.question,
                description: market.description,
                category: market.category,
                endDate: market.endDate,
                volume: parseFloat(market.volume || 0),
                liquidity: parseFloat(market.liquidity || 0),
                bookmakers: [{
                    name: 'Polymarket',
                    key: 'polymarket',
                    lastUpdate: new Date().toISOString(),
                    markets: [{
                        type: 'h2h',
                        outcomes: outcomes.map((name, i) => ({
                            name: name,
                            odds: prices[i] ? 1 / parseFloat(prices[i]) : 0,
                            impliedProbability: prices[i] ? parseFloat(prices[i]) * 100 : 0
                        }))
                    }]
                }]
            };

            events.push(eventData);
        }

        return events;
    }

    /**
     * Check if Polymarket market is sports-related
     */
    isSportsMarket(market) {
        const sportsKeywords = [
            'tennis', 'soccer', 'football', 'nba', 'nfl', 'mlb', 
            'fifa', 'world cup', 'champions league', 'premier league',
            'wimbledon', 'us open', 'french open', 'australian open'
        ];
        
        const text = `${market.question} ${market.description || ''} ${market.category || ''}`.toLowerCase();
        return sportsKeywords.some(kw => text.includes(kw));
    }

    /**
     * Categorize Polymarket market by sport
     */
    categorizePolymarketSport(market) {
        const text = market.question.toLowerCase();
        if (text.includes('tennis')) return 'tennis';
        if (text.includes('soccer') || text.includes('fifa') || text.includes('world cup')) return 'soccer';
        if (text.includes('nba') || text.includes('basketball')) return 'basketball';
        return 'other';
    }

    /**
     * Convert decimal odds to implied probability
     */
    decimalToImpliedProbability(decimalOdds) {
        return (1 / decimalOdds) * 100;
    }

    /**
     * Fetch all data and save to cache
     */
    async fetchAll() {
        console.log('Starting data fetch...');
        const timestamp = new Date().toISOString();

        // Fetch forex rate
        const forex = await this.fetchForexRate();
        console.log(`Forex rate: 1 USD = ${forex.USD_EUR} EUR`);

        // Fetch sports data
        const sports = this.config.SPORTS ? this.config.SPORTS.split(',') : ['tennis', 'soccer'];
        const markets = this.config.MARKETS ? this.config.MARKETS.split(',') : ['h2h'];
        
        const allOddsData = [];
        
        for (const sport of sports) {
            for (const market of markets) {
                console.log(`Fetching ${sport} ${market} odds...`);
                const odds = await this.fetchOddsAPI(sport, market);
                allOddsData.push(...odds);
            }
        }

        // Fetch Polymarket data
        console.log('Fetching Polymarket data...');
        const polymarketData = await this.fetchPolymarket();

        // Combine and save
        const data = {
            timestamp,
            forex,
            oddsData: allOddsData,
            polymarketData
        };

        const cacheFile = path.join(this.cacheDir, `data_${Date.now()}.json`);
        await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
        
        // Also save as latest
        const latestFile = path.join(this.cacheDir, 'latest.json');
        await fs.writeFile(latestFile, JSON.stringify(data, null, 2));

        console.log(`Data saved to ${cacheFile}`);
        console.log(`- Odds API events: ${allOddsData.length}`);
        console.log(`- Polymarket events: ${polymarketData.length}`);

        return data;
    }
}

module.exports = OddsFetcher;
