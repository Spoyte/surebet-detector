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
        this.apiStatus = {
            oddsApi: { healthy: true, lastError: null, errorCount: 0, quotaExhausted: false },
            polymarket: { healthy: true, lastError: null, errorCount: 0 },
            forex: { healthy: true, lastError: null, errorCount: 0 }
        };
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
     * Persist API status to disk for cross-run tracking
     */
    async persistApiStatus() {
        try {
            const statusFile = path.join(this.cacheDir, 'api-status.json');
            await fs.writeFile(statusFile, JSON.stringify({
                ...this.apiStatus,
                lastUpdated: new Date().toISOString()
            }, null, 2));
        } catch (e) {
            // Silently fail - not critical
        }
    }

    /**
     * Load persisted API status
     */
    async loadPersistedApiStatus() {
        try {
            const statusFile = path.join(this.cacheDir, 'api-status.json');
            const data = await fs.readFile(statusFile, 'utf8');
            const parsed = JSON.parse(data);
            if (parsed.oddsApi) this.apiStatus.oddsApi = parsed.oddsApi;
            if (parsed.polymarket) this.apiStatus.polymarket = parsed.polymarket;
            if (parsed.forex) this.apiStatus.forex = parsed.forex;
        } catch (e) {
            // No persisted status yet
        }
    }

    /**
     * Check if Odds API quota is exhausted (to skip unnecessary requests)
     */
    isOddsApiQuotaExhausted() {
        return this.apiStatus.oddsApi.quotaExhausted === true;
    }

    /**
     * Clean up old cache files, keeping only the most recent N files
     */
    async cleanupCache(maxFiles = 10) {
        try {
            const files = await fs.readdir(this.cacheDir);
            const dataFiles = files
                .filter(f => f.startsWith('data_') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(this.cacheDir, f),
                    time: parseInt(f.match(/data_(\d+)\.json/)?.[1] || 0)
                }))
                .sort((a, b) => b.time - a.time);

            if (dataFiles.length > maxFiles) {
                const toDelete = dataFiles.slice(maxFiles);
                for (const file of toDelete) {
                    await fs.unlink(file.path);
                    console.log(`Cleaned up old cache: ${file.name}`);
                }
                return toDelete.length;
            }
            return 0;
        } catch (e) {
            console.error('Cache cleanup error:', e.message);
            return 0;
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

        // Skip API call if quota is already known to be exhausted
        if (this.isOddsApiQuotaExhausted()) {
            console.log(`⚠️  Odds API quota exhausted - skipping ${sport} ${market}, using cache`);
            const cached = await this.getCachedOddsData(sport);
            if (cached) {
                console.log(`   Using cached data for ${sport} (${cached.length} events)`);
                return cached;
            }
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
            
            // Update API status on success
            this.apiStatus.oddsApi = { 
                healthy: true, 
                lastError: null, 
                errorCount: 0,
                quotaExhausted: false
            };
            await this.persistApiStatus();

            return this.normalizeOddsAPIData(response.data, sport);
        } catch (error) {
            const status = error.response?.status;
            const errorData = error.response?.data;
            const errorCode = errorData?.error_code;
            
            // Track API status on error
            this.apiStatus.oddsApi.healthy = false;
            this.apiStatus.oddsApi.lastError = {
                status,
                errorCode,
                message: errorData?.message || error.message,
                timestamp: new Date().toISOString()
            };
            this.apiStatus.oddsApi.errorCount++;
            
            if (status === 401) {
                // Check for specific quota exhaustion error
                if (errorCode === 'OUT_OF_USAGE_CREDITS' || 
                    errorData?.message?.includes('quota') ||
                    errorData?.message?.includes('Usage quota')) {
                    console.error('❌ Odds API error: Usage quota exhausted (401)');
                    console.error('   Your API key has reached its monthly request limit.');
                    console.error('   Error code:', errorCode || 'OUT_OF_USAGE_CREDITS');
                    console.error('   Get a new key or upgrade at: https://the-odds-api.com/');
                    // Mark quota as exhausted to skip future requests
                    this.apiStatus.oddsApi.quotaExhausted = true;
                } else {
                    console.error('❌ Odds API error: API key invalid or expired (401)');
                    console.error('   Please check your ODDS_API_KEY in config/.env');
                    console.error('   Get a new key at: https://the-odds-api.com/');
                }
            } else if (status === 429) {
                console.error('❌ Odds API error: Rate limit exceeded (429)');
                console.error('   Consider upgrading your plan or reducing request frequency');
            } else if (status === 422) {
                console.error('❌ Odds API error: Invalid parameters (422)');
                console.error('   Error details:', errorData?.message || 'Unknown');
            } else {
                console.error('❌ Odds API error:', error.message);
            }
            
            // Return cached data if available
            const cached = await this.getCachedOddsData(sport);
            if (cached) {
                console.log(`   Using cached data for ${sport} (${cached.length} events)`);
                // Persist status after using cache
                await this.persistApiStatus();
                return cached;
            }
            
            // Persist status before returning empty
            await this.persistApiStatus();
            return [];
        }
    }

    /**
     * Get cached odds data for a sport (fallback when API fails)
     */
    async getCachedOddsData(sport) {
        try {
            const latestFile = path.join(this.cacheDir, 'latest.json');
            const data = await fs.readFile(latestFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // Filter for the requested sport
            if (parsed.oddsData) {
                return parsed.oddsData.filter(event => event.sport === sport);
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Fetch markets from Polymarket (using Gamma API - subgraph deprecated)
     */
    async fetchPolymarket() {
        try {
            // Use Polymarket's Gamma API instead of deprecated subgraph
            // Note: order=desc causes 422, API defaults to desc sorting by volume
            const url = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&sort=volume';
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log(`✅ Polymarket: ${response.data.length} markets fetched`);
            
            // Update API status on success
            this.apiStatus.polymarket = { healthy: true, lastError: null, errorCount: 0 };
            
            return this.normalizePolymarketData(response.data);
        } catch (error) {
            const status = error.response?.status;
            const errorMessage = error.message || 'Unknown error';
            const errorCode = error.code || 'NO_CODE';

            // Track API status on error
            this.apiStatus.polymarket.healthy = false;
            this.apiStatus.polymarket.lastError = {
                status,
                message: errorMessage,
                code: errorCode,
                timestamp: new Date().toISOString()
            };
            this.apiStatus.polymarket.errorCount++;

            if (status === 429) {
                console.error('❌ Polymarket error: Rate limit exceeded (429)');
            } else if (status >= 500) {
                console.error('❌ Polymarket error: Server error (' + status + ')');
            } else if (error.code === 'ECONNABORTED') {
                console.error('❌ Polymarket error: Request timeout (30s exceeded)');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.error('❌ Polymarket error: Network/DNS error -', errorMessage);
            } else {
                console.error('❌ Polymarket error:', errorMessage, status ? `(HTTP ${status})` : '');
            }
            
            // Return cached Polymarket data if available
            const cached = await this.getCachedPolymarketData();
            if (cached) {
                console.log(`   Using cached Polymarket data (${cached.length} markets)`);
                return cached;
            }
            
            return [];
        }
    }

    /**
     * Get cached Polymarket data (fallback when API fails)
     */
    async getCachedPolymarketData() {
        try {
            const latestFile = path.join(this.cacheDir, 'latest.json');
            const data = await fs.readFile(latestFile, 'utf8');
            const parsed = JSON.parse(data);
            return parsed.polymarketData || null;
        } catch (e) {
            return null;
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
                // Update API status on success
                this.apiStatus.forex = { healthy: true, lastError: null, errorCount: 0 };
                
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
            // Track API status on error
            this.apiStatus.forex.healthy = false;
            this.apiStatus.forex.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            this.apiStatus.forex.errorCount++;
            
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
     * Includes major European bookmakers for arbitrage detection
     */
    normalizeOddsAPIData(data, sport) {
        // Bookmakers we care about (including regional variants like unibet_fr, winamax_de, etc.)
        // Plus Pinnacle as a sharp reference for +EV calculations
        // Expanded list to include more bookmakers available for different sports
        const allowedBookmakerPrefixes = [
            'unibet', 'betclic', 'winamax', 'pinnacle',
            'betsson', 'nordicbet', 'sport888', 'marathonbet',
            'williamhill', 'betfair', 'bet365'
        ];
        const bookmakerMap = {
            'unibet': 'Unibet',
            'betclic': 'Betclic',
            'winamax': 'Winamax',
            'pinnacle': 'Pinnacle',
            'betsson': 'Betsson',
            'nordicbet': 'NordicBet',
            'sport888': '888sport',
            'marathonbet': 'MarathonBet',
            'williamhill': 'WilliamHill',
            'betfair': 'Betfair',
            'bet365': 'Bet365'
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
                // Skip non-allowed bookmakers - check if key starts with any of our prefixes
                const matchingPrefix = allowedBookmakerPrefixes.find(prefix => 
                    bookmaker.key === prefix || bookmaker.key.startsWith(prefix + '_')
                );
                if (!matchingPrefix) continue;

                const normalizedBookmaker = {
                    name: bookmakerMap[matchingPrefix],
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

            // Only include events that have at least one tracked bookmaker
            if (eventData.bookmakers.length > 0) {
                events.push(eventData);
            }
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

            // Parse outcome prices from JSON string
            let prices = [];
            let outcomes = [];
            
            try {
                prices = JSON.parse(market.outcomePrices || '[]');
                outcomes = JSON.parse(market.outcomes || '[]');
            } catch (e) {
                // Fallback: try as-is if not JSON
                prices = market.outcomePrices || [];
                outcomes = market.outcomes || [];
            }

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

        // Load persisted API status to check for quota exhaustion
        await this.loadPersistedApiStatus();

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
            polymarketData,
            apiStatus: this.apiStatus
        };

        const cacheFile = path.join(this.cacheDir, `data_${Date.now()}.json`);
        await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
        
        // Also save as latest
        const latestFile = path.join(this.cacheDir, 'latest.json');
        await fs.writeFile(latestFile, JSON.stringify(data, null, 2));

        // Clean up old cache files
        const cleaned = await this.cleanupCache(10);
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old cache files`);
        }

        console.log(`Data saved to ${cacheFile}`);
        console.log(`- Odds API events: ${allOddsData.length}`);
        console.log(`- Polymarket events: ${polymarketData.length}`);

        return data;
    }
}

module.exports = OddsFetcher;
