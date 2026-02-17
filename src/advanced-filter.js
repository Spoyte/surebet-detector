/**
 * Advanced Filter Engine for Surebet Detector
 * Multi-criteria filtering with full-text search support
 */

class AdvancedFilterEngine {
    constructor(options = {}) {
        this.options = {
            fuzzyThreshold: options.fuzzyThreshold || 0.6,
            maxSavedFilters: options.maxSavedFilters || 50,
            ...options
        };
        
        this.savedFilters = new Map();
        this.searchHistory = [];
        this.filterId = 0;
    }
    
    /**
     * Apply a filter to a list of opportunities
     * @param {Array} opportunities - List of opportunities to filter
     * @param {Object} filter - Filter criteria
     * @returns {Object} Filtered results with metadata
     */
    apply(opportunities, filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return {
                results: opportunities,
                total: opportunities.length,
                filtered: 0,
                appliedFilters: []
            };
        }
        
        const startTime = Date.now();
        let results = [...opportunities];
        const appliedFilters = [];
        
        // Apply text search
        if (filter.search) {
            results = this.applyTextSearch(results, filter.search);
            appliedFilters.push({ type: 'search', value: filter.search });
        }
        
        // Apply criteria filters
        if (filter.criteria) {
            results = this.applyCriteria(results, filter.criteria, filter.operator || 'AND');
            appliedFilters.push({ type: 'criteria', value: filter.criteria });
        }
        
        // Apply quick filters
        if (filter.quickFilter) {
            results = this.applyQuickFilter(results, filter.quickFilter);
            appliedFilters.push({ type: 'quick', value: filter.quickFilter });
        }
        
        const duration = Date.now() - startTime;
        
        return {
            results,
            total: opportunities.length,
            filtered: opportunities.length - results.length,
            duration,
            appliedFilters
        };
    }
    
    /**
     * Apply full-text search
     */
    applyTextSearch(opportunities, query) {
        if (!query || query.trim() === '') return opportunities;
        
        const searchTerms = query.toLowerCase().split(/\s+/);
        
        return opportunities.filter(opp => {
            const searchableText = this.getSearchableText(opp).toLowerCase();
            return searchTerms.every(term => searchableText.includes(term));
        });
    }
    
    /**
     * Get searchable text from an opportunity
     */
    getSearchableText(opportunity) {
        const parts = [];
        
        if (opportunity.match) parts.push(opportunity.match);
        if (opportunity.matchName) parts.push(opportunity.matchName);
        if (opportunity.sport) parts.push(opportunity.sport);
        if (opportunity.market) parts.push(opportunity.market);
        
        if (opportunity.legs) {
            opportunity.legs.forEach(leg => {
                if (leg.bookmaker) parts.push(leg.bookmaker);
                if (leg.selection) parts.push(leg.selection);
            });
        }
        
        if (opportunity.bookmakers) {
            parts.push(...opportunity.bookmakers);
        }
        
        return parts.join(' ');
    }
    
    /**
     * Apply criteria filters with AND/OR logic
     */
    applyCriteria(opportunities, criteria, operator = 'AND') {
        if (!Array.isArray(criteria) || criteria.length === 0) {
            return opportunities;
        }
        
        if (operator === 'OR') {
            // OR logic: opportunity matches if ANY criterion matches
            const matched = new Set();
            criteria.forEach(criterion => {
                const matches = opportunities.filter(opp => this.matchesCriterion(opp, criterion));
                matches.forEach(m => matched.add(m));
            });
            return Array.from(matched);
        } else {
            // AND logic: opportunity matches if ALL criteria match
            return opportunities.filter(opp => 
                criteria.every(criterion => this.matchesCriterion(opp, criterion))
            );
        }
    }
    
    /**
     * Check if an opportunity matches a single criterion
     */
    matchesCriterion(opportunity, criterion) {
        const { field, operator, value } = criterion;
        const fieldValue = this.getFieldValue(opportunity, field);
        
        switch (operator) {
            case '=':
            case 'eq':
                return fieldValue === value;
                
            case '!=':
            case 'neq':
                return fieldValue !== value;
                
            case '>':
            case 'gt':
                return fieldValue > value;
                
            case '>=':
            case 'gte':
                return fieldValue >= value;
                
            case '<':
            case 'lt':
                return fieldValue < value;
                
            case '<=':
            case 'lte':
                return fieldValue <= value;
                
            case 'contains':
                return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
                
            case 'startsWith':
                return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
                
            case 'endsWith':
                return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
                
            case 'in':
                return Array.isArray(value) && value.includes(fieldValue);
                
            case 'notIn':
                return Array.isArray(value) && !value.includes(fieldValue);
                
            case 'excludes':
                if (Array.isArray(fieldValue)) {
                    return !fieldValue.some(v => value.includes(v));
                }
                return !value.includes(fieldValue);
                
            case 'includes':
                if (Array.isArray(fieldValue)) {
                    return fieldValue.some(v => value.includes(v));
                }
                return value.includes(fieldValue);
                
            case 'between':
                return Array.isArray(value) && value.length === 2 && 
                       fieldValue >= value[0] && fieldValue <= value[1];
                
            case 'exists':
                return value ? fieldValue !== undefined && fieldValue !== null : 
                              fieldValue === undefined || fieldValue === null;
                
            default:
                return false;
        }
    }
    
    /**
     * Get field value from opportunity (supports nested paths)
     */
    getFieldValue(opportunity, field) {
        if (field.includes('.')) {
            const parts = field.split('.');
            let value = opportunity;
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }
            return value;
        }
        return opportunity[field];
    }
    
    /**
     * Apply quick filter presets
     */
    applyQuickFilter(opportunities, quickFilterId) {
        const quickFilters = this.getQuickFilters();
        const filter = quickFilters.find(f => f.id === quickFilterId);
        
        if (!filter) return opportunities;
        
        return this.apply(opportunities, filter.filter).results;
    }
    
    /**
     * Get built-in quick filter presets
     */
    getQuickFilters() {
        return [
            {
                id: 'high-profit',
                name: 'High Profit (5%+)',
                description: 'Opportunities with 5% or higher profit',
                filter: {
                    criteria: [
                        { field: 'profitPercent', operator: '>=', value: 5 }
                    ]
                }
            },
            {
                id: 'tennis-only',
                name: 'Tennis Only',
                description: 'Only tennis matches',
                filter: {
                    criteria: [
                        { field: 'sport', operator: 'eq', value: 'tennis' }
                    ]
                }
            },
            {
                id: 'soccer-only',
                name: 'Soccer Only',
                description: 'Only soccer/football matches',
                filter: {
                    criteria: [
                        { field: 'sport', operator: 'in', value: ['soccer', 'football'] }
                    ]
                }
            },
            {
                id: 'today-only',
                name: 'Today Only',
                description: 'Matches happening today',
                filter: {
                    criteria: [
                        { field: 'eventDate', operator: 'eq', value: new Date().toISOString().split('T')[0] }
                    ]
                }
            },
            {
                id: 'live-matches',
                name: 'Live Matches',
                description: 'Currently in-play matches',
                filter: {
                    criteria: [
                        { field: 'isLive', operator: 'eq', value: true }
                    ]
                }
            },
            {
                id: 'quality-high',
                name: 'High Quality Only',
                description: 'Quality score 80+ with 2%+ profit',
                filter: {
                    criteria: [
                        { field: 'qualityScore', operator: '>=', value: 80 },
                        { field: 'profitPercent', operator: '>=', value: 2 }
                    ]
                }
            },
            {
                id: 'major-bookmakers',
                name: 'Major Bookmakers',
                description: 'Only opportunities with major bookmakers',
                filter: {
                    criteria: [
                        { field: 'bookmakers', operator: 'includes', 
                          value: ['unibet', 'betclic', 'winamax', 'fdj'] }
                    ]
                }
            },
            {
                id: 'arbitrage-only',
                name: 'Arbitrage Only',
                description: 'Only pure arbitrage opportunities (no +EV)',
                filter: {
                    criteria: [
                        { field: 'type', operator: 'eq', value: 'arbitrage' }
                    ]
                }
            }
        ];
    }
    
    /**
     * Save a filter preset
     */
    saveFilter(name, filter, description = '') {
        if (this.savedFilters.size >= this.options.maxSavedFilters) {
            // Remove oldest filter
            const firstKey = this.savedFilters.keys().next().value;
            this.savedFilters.delete(firstKey);
        }
        
        const id = `filter-${++this.filterId}`;
        const savedFilter = {
            id,
            name,
            description,
            filter,
            createdAt: new Date().toISOString(),
            usageCount: 0
        };
        
        this.savedFilters.set(id, savedFilter);
        return savedFilter;
    }
    
    /**
     * Get a saved filter by ID
     */
    getSavedFilter(id) {
        return this.savedFilters.get(id);
    }
    
    /**
     * Get all saved filters
     */
    getAllSavedFilters() {
        return Array.from(this.savedFilters.values());
    }
    
    /**
     * Delete a saved filter
     */
    deleteSavedFilter(id) {
        return this.savedFilters.delete(id);
    }
    
    /**
     * Record search in history
     */
    recordSearch(query) {
        if (!query || query.trim() === '') return;
        
        this.searchHistory.unshift({
            query: query.trim(),
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 100 searches
        if (this.searchHistory.length > 100) {
            this.searchHistory = this.searchHistory.slice(0, 100);
        }
    }
    
    /**
     * Get search suggestions based on partial query
     */
    getSearchSuggestions(partialQuery, opportunities = []) {
        if (!partialQuery || partialQuery.length < 2) return [];
        
        const suggestions = new Set();
        const lowerQuery = partialQuery.toLowerCase();
        
        // From search history
        this.searchHistory.forEach(item => {
            if (item.query.toLowerCase().includes(lowerQuery)) {
                suggestions.add(item.query);
            }
        });
        
        // From opportunities
        opportunities.forEach(opp => {
            if (opp.match && opp.match.toLowerCase().includes(lowerQuery)) {
                suggestions.add(opp.match);
            }
            if (opp.sport && opp.sport.toLowerCase().includes(lowerQuery)) {
                suggestions.add(opp.sport);
            }
        });
        
        return Array.from(suggestions).slice(0, 10);
    }
    
    /**
     * Get filter statistics
     */
    getFilterStats(opportunities, filter) {
        const result = this.apply(opportunities, filter);
        
        // Calculate additional statistics
        const stats = {
            ...result,
            avgProfit: 0,
            profitRange: { min: 0, max: 0 },
            sportDistribution: {},
            bookmakerDistribution: {}
        };
        
        if (result.results.length > 0) {
            const profits = result.results.map(r => r.profitPercent || 0);
            stats.avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
            stats.profitRange = {
                min: Math.min(...profits),
                max: Math.max(...profits)
            };
            
            // Sport distribution
            result.results.forEach(r => {
                const sport = r.sport || 'unknown';
                stats.sportDistribution[sport] = (stats.sportDistribution[sport] || 0) + 1;
            });
            
            // Bookmaker distribution
            result.results.forEach(r => {
                const bookmakers = r.bookmakers || (r.legs ? r.legs.map(l => l.bookmaker) : []);
                bookmakers.forEach(bm => {
                    stats.bookmakerDistribution[bm] = (stats.bookmakerDistribution[bm] || 0) + 1;
                });
            });
        }
        
        return stats;
    }
    
    /**
     * Export filter results
     */
    exportResults(results, format = 'json') {
        switch (format.toLowerCase()) {
            case 'csv':
                return this.toCSV(results);
            case 'json':
            default:
                return JSON.stringify(results, null, 2);
        }
    }
    
    /**
     * Convert results to CSV
     */
    toCSV(results) {
        if (results.length === 0) return '';
        
        const headers = Object.keys(results[0]);
        const rows = results.map(r => 
            headers.map(h => {
                const val = r[h];
                if (Array.isArray(val)) return `"${val.join(',')}"`;
                if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );
        
        return [headers.join(','), ...rows].join('\n');
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedFilterEngine;
}

if (typeof window !== 'undefined') {
    window.AdvancedFilterEngine = AdvancedFilterEngine;
}
