/**
 * @fileoverview Odds Line Shopping UI Component
 * @description Dashboard UI for displaying odds line shopping opportunities
 */

class LineShoppingUI {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            refreshInterval: options.refreshInterval || 30000,
            maxDisplayItems: options.maxDisplayItems || 10,
            minImprovement: options.minImprovement || 2.0,
            ...options
        };
        this.data = [];
        this.refreshTimer = null;
    }

    /**
     * Initialize the UI component
     */
    init() {
        this.render();
        this.startAutoRefresh();
        this.fetchData();
    }

    /**
     * Render the component structure
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="line-shopping-container">
                <div class="line-shopping-header">
                    <h3>🛒 Odds Line Shopping</h3>
                    <div class="line-shopping-controls">
                        <select id="ls-sport-filter" class="filter-select">
                            <option value="">All Sports</option>
                        </select>
                        <select id="ls-min-improvement" class="filter-select">
                            <option value="1">1%+ improvement</option>
                            <option value="2" selected>2%+ improvement</option>
                            <option value="5">5%+ improvement</option>
                            <option value="10">10%+ improvement</option>
                        </select>
                        <button id="ls-refresh-btn" class="refresh-btn">🔄 Refresh</button>
                    </div>
                </div>
                <div class="line-shopping-stats" id="ls-stats">
                    <div class="stat-item">
                        <span class="stat-value" id="ls-total-opps">-</span>
                        <span class="stat-label">Opportunities</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="ls-avg-improvement">-</span>
                        <span class="stat-label">Avg Improvement</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="ls-best-improvement">-</span>
                        <span class="stat-label">Best Improvement</span>
                    </div>
                </div>
                <div class="line-shopping-list" id="ls-list">
                    <div class="loading">Loading opportunities...</div>
                </div>
            </div>
        `;

        // Attach event listeners
        const refreshBtn = document.getElementById('ls-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.fetchData());
        }

        const sportFilter = document.getElementById('ls-sport-filter');
        if (sportFilter) {
            sportFilter.addEventListener('change', () => this.filterData());
        }

        const minImprovement = document.getElementById('ls-min-improvement');
        if (minImprovement) {
            minImprovement.addEventListener('change', () => this.filterData());
        }

        this.addStyles();
    }

    /**
     * Add component styles
     */
    addStyles() {
        if (document.getElementById('line-shopping-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'line-shopping-styles';
        styles.textContent = `
            .line-shopping-container {
                background: var(--card-bg, #1a1a2e);
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
            }

            .line-shopping-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
                gap: 10px;
            }

            .line-shopping-header h3 {
                margin: 0;
                color: var(--text-primary, #fff);
                font-size: 1.3rem;
            }

            .line-shopping-controls {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }

            .filter-select {
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid var(--border-color, #333);
                background: var(--input-bg, #16213e);
                color: var(--text-primary, #fff);
                font-size: 14px;
            }

            .refresh-btn {
                padding: 8px 16px;
                border-radius: 6px;
                border: none;
                background: var(--primary-color, #0f3460);
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }

            .refresh-btn:hover {
                background: var(--primary-hover, #1a4a7a);
            }

            .line-shopping-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }

            .stat-item {
                background: var(--stat-bg, #16213e);
                padding: 15px;
                border-radius: 8px;
                text-align: center;
            }

            .stat-value {
                display: block;
                font-size: 1.5rem;
                font-weight: bold;
                color: var(--accent-color, #e94560);
            }

            .stat-label {
                display: block;
                font-size: 0.85rem;
                color: var(--text-secondary, #888);
                margin-top: 5px;
            }

            .line-shopping-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .line-shopping-item {
                background: var(--item-bg, #16213e);
                border-radius: 8px;
                padding: 15px;
                border-left: 4px solid var(--accent-color, #e94560);
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .line-shopping-item:hover {
                transform: translateX(5px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }

            .line-shopping-item.high-value {
                border-left-color: #4ade80;
            }

            .line-shopping-item.medium-value {
                border-left-color: #fbbf24;
            }

            .item-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 10px;
            }

            .event-info h4 {
                margin: 0 0 5px 0;
                color: var(--text-primary, #fff);
                font-size: 1rem;
            }

            .event-meta {
                font-size: 0.85rem;
                color: var(--text-secondary, #888);
            }

            .improvement-badge {
                background: var(--accent-color, #e94560);
                color: white;
                padding: 5px 10px;
                border-radius: 20px;
                font-size: 0.9rem;
                font-weight: bold;
            }

            .odds-comparison {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                gap: 10px;
                align-items: center;
                margin: 10px 0;
                padding: 10px;
                background: rgba(0,0,0,0.2);
                border-radius: 6px;
            }

            .odds-box {
                text-align: center;
            }

            .odds-box.best {
                background: rgba(74, 222, 128, 0.1);
                border-radius: 6px;
                padding: 8px;
            }

            .odds-value {
                font-size: 1.3rem;
                font-weight: bold;
                color: var(--text-primary, #fff);
            }

            .odds-value.best {
                color: #4ade80;
            }

            .bookmaker-name {
                font-size: 0.8rem;
                color: var(--text-secondary, #888);
            }

            .vs-divider {
                color: var(--text-secondary, #888);
                font-size: 0.9rem;
            }

            .outcome-info {
                font-size: 0.9rem;
                color: var(--text-secondary, #888);
                margin-bottom: 10px;
            }

            .alternative-odds {
                font-size: 0.85rem;
                color: var(--text-secondary, #888);
            }

            .alternative-odds strong {
                color: var(--text-primary, #fff);
            }

            .loading, .empty-state {
                text-align: center;
                padding: 40px;
                color: var(--text-secondary, #888);
            }

            .error-state {
                text-align: center;
                padding: 40px;
                color: #ef4444;
            }

            @media (max-width: 600px) {
                .line-shopping-header {
                    flex-direction: column;
                    align-items: flex-start;
                }

                .odds-comparison {
                    grid-template-columns: 1fr;
                    gap: 5px;
                }

                .vs-divider {
                    transform: rotate(90deg);
                }
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Fetch data from API
     */
    async fetchData() {
        try {
            const response = await fetch('/api/analysis');
            if (!response.ok) throw new Error('Failed to fetch data');
            
            const data = await response.json();
            this.data = data.lineShopping || [];
            
            // Extract unique sports for filter
            this.updateSportFilter(data);
            
            this.updateStats(data);
            this.renderList();
        } catch (err) {
            console.error('Error fetching line shopping data:', err);
            this.renderError(err.message);
        }
    }

    /**
     * Update sport filter options
     */
    updateSportFilter(data) {
        const sportFilter = document.getElementById('ls-sport-filter');
        if (!sportFilter || !data.lineShopping) return;

        const sports = [...new Set(data.lineShopping.map(item => item.sport))];
        const currentValue = sportFilter.value;
        
        sportFilter.innerHTML = '<option value="">All Sports</option>';
        sports.forEach(sport => {
            const option = document.createElement('option');
            option.value = sport;
            option.textContent = this.formatSportName(sport);
            sportFilter.appendChild(option);
        });
        
        sportFilter.value = currentValue;
    }

    /**
     * Format sport name for display
     */
    formatSportName(sport) {
        return sport
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Update statistics display
     */
    updateStats(data) {
        const totalEl = document.getElementById('ls-total-opps');
        const avgEl = document.getElementById('ls-avg-improvement');
        const bestEl = document.getElementById('ls-best-improvement');

        if (data.lineShoppingSummary) {
            if (totalEl) totalEl.textContent = data.lineShoppingSummary.totalOpportunities || 0;
            if (avgEl) avgEl.textContent = (data.lineShoppingSummary.avgImprovement || 0) + '%';
            if (bestEl) bestEl.textContent = (data.lineShoppingSummary.bestImprovement || 0) + '%';
        } else if (data.lineShopping) {
            const opportunities = data.lineShopping;
            if (totalEl) totalEl.textContent = opportunities.length;
            
            if (opportunities.length > 0) {
                const avg = opportunities.reduce((sum, o) => sum + o.evImprovement, 0) / opportunities.length;
                if (avgEl) avgEl.textContent = avg.toFixed(1) + '%';
                if (bestEl) bestEl.textContent = Math.max(...opportunities.map(o => o.evImprovement)).toFixed(1) + '%';
            } else {
                if (avgEl) avgEl.textContent = '0%';
                if (bestEl) bestEl.textContent = '0%';
            }
        }
    }

    /**
     * Filter data based on user selections
     */
    filterData() {
        this.renderList();
    }

    /**
     * Get filtered data
     */
    getFilteredData() {
        const sportFilter = document.getElementById('ls-sport-filter');
        const minImprovementFilter = document.getElementById('ls-min-improvement');
        
        let filtered = [...this.data];
        
        if (sportFilter && sportFilter.value) {
            filtered = filtered.filter(item => item.sport === sportFilter.value);
        }
        
        if (minImprovementFilter && minImprovementFilter.value) {
            const min = parseFloat(minImprovementFilter.value);
            filtered = filtered.filter(item => item.evImprovement >= min);
        }
        
        return filtered.slice(0, this.options.maxDisplayItems);
    }

    /**
     * Render the opportunities list
     */
    renderList() {
        const listContainer = document.getElementById('ls-list');
        if (!listContainer) return;

        const filtered = this.getFilteredData();

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    No line shopping opportunities found matching your criteria.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filtered.map(item => this.renderItem(item)).join('');
    }

    /**
     * Render a single opportunity item
     */
    renderItem(item) {
        const valueClass = item.evImprovement >= 10 ? 'high-value' : 
                          item.evImprovement >= 5 ? 'medium-value' : '';
        
        const worstOdds = item.worstOdds || (item.bestOdds / (1 + item.evImprovement / 100));
        
        return `
            <div class="line-shopping-item ${valueClass}">
                <div class="item-header">
                    <div class="event-info">
                        <h4>${this.escapeHtml(item.eventName)}</h4>
                        <div class="event-meta">
                            ${this.formatSportName(item.sport)} • ${this.formatDate(item.commenceTime)}
                        </div>
                    </div>
                    <div class="improvement-badge">+${item.evImprovement}% EV</div>
                </div>
                
                <div class="outcome-info">
                    Outcome: <strong>${this.escapeHtml(item.outcome)}</strong> (${item.market})
                </div>
                
                <div class="odds-comparison">
                    <div class="odds-box best">
                        <div class="odds-value best">${item.bestOdds.toFixed(2)}</div>
                        <div class="bookmaker-name">${this.escapeHtml(item.bestBookmaker)} ✓</div>
                    </div>
                    <div class="vs-divider">vs</div>
                    <div class="odds-box">
                        <div class="odds-value">${worstOdds.toFixed(2)}</div>
                        <div class="bookmaker-name">Worst available</div>
                    </div>
                </div>
                
                ${item.alternativeBookmakers && item.alternativeBookmakers.length > 0 ? `
                    <div class="alternative-odds">
                        <strong>Also available at:</strong> 
                        ${item.alternativeBookmakers.map(alt => 
                            `${this.escapeHtml(alt.name)} (${alt.odds.toFixed(2)})`
                        ).join(', ')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = date - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        
        if (hours < 0) return 'Started';
        if (hours < 1) return 'Starting soon';
        if (hours < 24) return `In ${hours}h`;
        return `In ${Math.floor(hours / 24)}d ${hours % 24}h`;
    }

    /**
     * Render error state
     */
    renderError(message) {
        const listContainer = document.getElementById('ls-list');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="error-state">
                    Error loading data: ${this.escapeHtml(message)}
                </div>
            `;
        }
    }

    /**
     * Start auto-refresh timer
     */
    startAutoRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this.fetchData(), this.options.refreshInterval);
    }

    /**
     * Stop auto-refresh timer
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Destroy the component
     */
    destroy() {
        this.stopAutoRefresh();
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LineShoppingUI };
}
