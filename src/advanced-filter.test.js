/**
 * Advanced Filter Engine Tests
 */

const AdvancedFilterEngine = require('./advanced-filter');

describe('AdvancedFilterEngine', () => {
    let engine;
    let sampleOpportunities;
    
    beforeEach(() => {
        engine = new AdvancedFilterEngine();
        sampleOpportunities = [
            {
                id: 1,
                match: 'Nadal vs Djokovic',
                matchName: 'Nadal vs Djokovic - Roland Garros',
                sport: 'tennis',
                market: '1x2',
                profitPercent: 3.5,
                odds: 2.1,
                bookmakers: ['unibet', 'betclic'],
                legs: [
                    { bookmaker: 'unibet', selection: 'Nadal', odds: 2.1 },
                    { bookmaker: 'betclic', selection: 'Djokovic', odds: 2.05 }
                ],
                eventDate: '2026-02-18',
                isLive: false,
                qualityScore: 85,
                type: 'arbitrage'
            },
            {
                id: 2,
                match: 'PSG vs Marseille',
                matchName: 'PSG vs Marseille - Ligue 1',
                sport: 'soccer',
                market: 'asian_handicap',
                profitPercent: 1.8,
                odds: 1.95,
                bookmakers: ['winamax', 'fdj'],
                legs: [
                    { bookmaker: 'winamax', selection: 'PSG -1', odds: 1.95 },
                    { bookmaker: 'fdj', selection: 'Marseille +1', odds: 2.0 }
                ],
                eventDate: '2026-02-17',
                isLive: true,
                qualityScore: 70,
                type: 'arbitrage'
            },
            {
                id: 3,
                match: 'Lakers vs Warriors',
                matchName: 'Lakers vs Warriors - NBA',
                sport: 'basketball',
                market: 'over_under',
                profitPercent: 5.2,
                odds: 1.9,
                bookmakers: ['unibet', 'zebet'],
                legs: [
                    { bookmaker: 'unibet', selection: 'Over 220.5', odds: 1.9 },
                    { bookmaker: 'zebet', selection: 'Under 220.5', odds: 2.15 }
                ],
                eventDate: '2026-02-19',
                isLive: false,
                qualityScore: 90,
                type: 'arbitrage'
            },
            {
                id: 4,
                match: 'Federer vs Murray',
                matchName: 'Federer vs Murray - Wimbledon',
                sport: 'tennis',
                market: '1x2',
                profitPercent: 2.1,
                odds: 2.0,
                bookmakers: ['betclic', 'winamax'],
                eventDate: '2026-02-20',
                isLive: false,
                qualityScore: 75,
                type: 'positiveEV'
            }
        ];
    });
    
    describe('Text Search', () => {
        test('should search by match name', () => {
            const result = engine.apply(sampleOpportunities, { search: 'Nadal' });
            expect(result.results).toHaveLength(1);
            expect(result.results[0].id).toBe(1);
        });
        
        test('should search by sport', () => {
            const result = engine.apply(sampleOpportunities, { search: 'tennis' });
            expect(result.results).toHaveLength(2);
            expect(result.results.map(r => r.id).sort()).toEqual([1, 4]);
        });
        
        test('should search by bookmaker', () => {
            const result = engine.apply(sampleOpportunities, { search: 'unibet' });
            expect(result.results).toHaveLength(2);
            expect(result.results.map(r => r.id).sort()).toEqual([1, 3]);
        });
        
        test('should handle multiple search terms', () => {
            const result = engine.apply(sampleOpportunities, { search: 'tennis unibet' });
            expect(result.results).toHaveLength(1);
            expect(result.results[0].id).toBe(1);
        });
        
        test('should return empty for no matches', () => {
            const result = engine.apply(sampleOpportunities, { search: 'nonexistent' });
            expect(result.results).toHaveLength(0);
        });
    });
    
    describe('Criteria Filters', () => {
        test('should filter by profit percentage', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'profitPercent', operator: '>=', value: 3 }]
            });
            expect(result.results).toHaveLength(2);
            expect(result.results.every(r => r.profitPercent >= 3)).toBe(true);
        });
        
        test('should filter by sport', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'sport', operator: 'eq', value: 'soccer' }]
            });
            expect(result.results).toHaveLength(1);
            expect(result.results[0].sport).toBe('soccer');
        });
        
        test('should filter by sport in list', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'sport', operator: 'in', value: ['tennis', 'basketball'] }]
            });
            expect(result.results).toHaveLength(3);
        });
        
        test('should filter by bookmaker exclusion', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'bookmakers', operator: 'excludes', value: ['unibet'] }]
            });
            expect(result.results.every(r => !r.bookmakers.includes('unibet'))).toBe(true);
        });
        
        test('should filter by contains operator', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'matchName', operator: 'contains', value: 'Grand Slam' }]
            });
            expect(result.results).toHaveLength(1);
            expect(result.results[0].id).toBe(1);
        });
        
        test('should filter by between operator', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [{ field: 'profitPercent', operator: 'between', value: [2, 4] }]
            });
            expect(result.results).toHaveLength(2);
            expect(result.results.every(r => r.profitPercent >= 2 && r.profitPercent <= 4)).toBe(true);
        });
    });
    
    describe('AND/OR Logic', () => {
        test('should apply AND logic by default', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [
                    { field: 'sport', operator: 'eq', value: 'tennis' },
                    { field: 'profitPercent', operator: '>=', value: 3 }
                ],
                operator: 'AND'
            });
            expect(result.results).toHaveLength(1);
            expect(result.results[0].id).toBe(1);
        });
        
        test('should apply OR logic', () => {
            const result = engine.apply(sampleOpportunities, {
                criteria: [
                    { field: 'sport', operator: 'eq', value: 'tennis' },
                    { field: 'profitPercent', operator: '>=', value: 5 }
                ],
                operator: 'OR'
            });
            expect(result.results).toHaveLength(3);
        });
    });
    
    describe('Quick Filters', () => {
        test('should apply high-profit quick filter', () => {
            const result = engine.apply(sampleOpportunities, { quickFilter: 'high-profit' });
            expect(result.results.every(r => r.profitPercent >= 5)).toBe(true);
        });
        
        test('should apply tennis-only quick filter', () => {
            const result = engine.apply(sampleOpportunities, { quickFilter: 'tennis-only' });
            expect(result.results.every(r => r.sport === 'tennis')).toBe(true);
        });
        
        test('should apply live matches quick filter', () => {
            const result = engine.apply(sampleOpportunities, { quickFilter: 'live-matches' });
            expect(result.results.every(r => r.isLive)).toBe(true);
        });
        
        test('should apply quality filter', () => {
            const result = engine.apply(sampleOpportunities, { quickFilter: 'quality-high' });
            expect(result.results.every(r => r.qualityScore >= 80 && r.profitPercent >= 2)).toBe(true);
        });
    });
    
    describe('Saved Filters', () => {
        test('should save and retrieve filter', () => {
            const filter = {
                criteria: [{ field: 'sport', operator: 'eq', value: 'tennis' }]
            };
            const saved = engine.saveFilter('Tennis Only', filter, 'Show only tennis matches');
            
            expect(saved.id).toBeDefined();
            expect(saved.name).toBe('Tennis Only');
            expect(engine.getSavedFilter(saved.id)).toEqual(saved);
        });
        
        test('should list all saved filters', () => {
            engine.saveFilter('Filter 1', { criteria: [] });
            engine.saveFilter('Filter 2', { criteria: [] });
            
            const filters = engine.getAllSavedFilters();
            expect(filters).toHaveLength(2);
        });
        
        test('should delete saved filter', () => {
            const saved = engine.saveFilter('To Delete', { criteria: [] });
            expect(engine.deleteSavedFilter(saved.id)).toBe(true);
            expect(engine.getSavedFilter(saved.id)).toBeUndefined();
        });
    });
    
    describe('Search History', () => {
        test('should record search', () => {
            engine.recordSearch('Nadal');
            expect(engine.searchHistory).toHaveLength(1);
            expect(engine.searchHistory[0].query).toBe('Nadal');
        });
        
        test('should provide search suggestions', () => {
            engine.recordSearch('Nadal vs Federer');
            engine.recordSearch('Nadal vs Djokovic');
            
            const suggestions = engine.getSearchSuggestions('Nadal', sampleOpportunities);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('Nadal'))).toBe(true);
        });
    });
    
    describe('Filter Statistics', () => {
        test('should calculate filter statistics', () => {
            const stats = engine.getFilterStats(sampleOpportunities, {
                criteria: [{ field: 'sport', operator: 'eq', value: 'tennis' }]
            });
            
            expect(stats.total).toBe(4);
            expect(stats.results).toHaveLength(2);
            expect(stats.avgProfit).toBeDefined();
            expect(stats.profitRange).toBeDefined();
            expect(stats.sportDistribution).toBeDefined();
        });
    });
    
    describe('Export', () => {
        test('should export to JSON', () => {
            const json = engine.exportResults(sampleOpportunities.slice(0, 2), 'json');
            const parsed = JSON.parse(json);
            expect(parsed).toHaveLength(2);
        });
        
        test('should export to CSV', () => {
            const csv = engine.exportResults(sampleOpportunities.slice(0, 2), 'csv');
            expect(csv).toContain('id,match');
            expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
        });
    });
    
    describe('Edge Cases', () => {
        test('should handle empty opportunities', () => {
            const result = engine.apply([], { search: 'test' });
            expect(result.results).toHaveLength(0);
            expect(result.total).toBe(0);
        });
        
        test('should handle empty filter', () => {
            const result = engine.apply(sampleOpportunities, {});
            expect(result.results).toHaveLength(4);
        });
        
        test('should handle null/undefined values', () => {
            const oppsWithNull = [
                ...sampleOpportunities,
                { id: 5, sport: null, profitPercent: undefined }
            ];
            const result = engine.apply(oppsWithNull, {
                criteria: [{ field: 'sport', operator: 'eq', value: 'tennis' }]
            });
            expect(result.results).toHaveLength(2);
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    const { execSync } = require('child_process');
    try {
        execSync('npx jest advanced-filter.test.js --colors', { stdio: 'inherit' });
    } catch (e) {
        process.exit(1);
    }
}
