/**
 * Filter UI Component for Surebet Dashboard
 */

class FilterUI {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            onFilterChange: options.onFilterChange || (() => {}),
            onSearch: options.onSearch || (() => {}),
            ...options
        };
        
        this.activeFilters = [];
        this.savedFilters = [];
        this.searchQuery = '';
        
        this.init();
    }
    
    init() {
        this.render();
        this.attachEventListeners();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="filter-panel">
                <div class="filter-header">
                    <h3>🔍 Filters & Search</h3>
                    <button class="btn-clear" id="clearFilters">Clear All</button>
                </div>
                
                <div class="search-section">
                    <div class="search-box">
                        <input type="text" 
                               id="searchInput" 
                               placeholder="Search matches, teams, bookmakers..."
                               autocomplete="off">
                        <button id="searchBtn">🔍</button>
                    </div>
                    <div class="search-suggestions" id="searchSuggestions"></div>
                </div>
                
                <div class="quick-filters">
                    <h4>Quick Filters</h4>
                    <div class="quick-filter-chips" id="quickFilterChips"></div>
                </div>
                
                <div class="filter-criteria">
                    <h4>Filter Criteria</h4>
                    <div class="criteria-list" id="criteriaList"></div>
                    <button class="btn-add" id="addCriterion">+ Add Criterion</button>
                </div>
                
                <div class="filter-actions">
                    <button class="btn-save" id="saveFilter">💾 Save Filter</button>
                    <button class="btn-export" id="exportResults">📥 Export</button>
                </div>
                
                <div class="saved-filters" id="savedFiltersSection">
                    <h4>Saved Filters</h4>
                    <div class="saved-filter-list" id="savedFilterList"></div>
                </div>
                
                <div class="filter-stats" id="filterStats">
                    <div class="stat-item">
                        <span class="stat-label">Total:</span>
                        <span class="stat-value" id="statTotal">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Filtered:</span>
                        <span class="stat-value" id="statFiltered">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Avg Profit:</span>
                        <span class="stat-value" id="statAvgProfit">0%</span>
                    </div>
                </div>
            </div>
            
            <div class="active-filters" id="activeFilters"></div>
        `;
        
        this.renderQuickFilters();
        this.renderCriteriaList();
    }
    
    renderQuickFilters() {
        const quickFilters = [
            { id: 'high-profit', label: 'High Profit (5%+)', icon: '📈' },
            { id: 'tennis-only', label: 'Tennis', icon: '🎾' },
            { id: 'soccer-only', label: 'Soccer', icon: '⚽' },
            { id: 'live-matches', label: 'Live', icon: '🔴' },
            { id: 'quality-high', label: 'High Quality', icon: '⭐' },
            { id: 'today-only', label: 'Today', icon: '📅' }
        ];
        
        const container = document.getElementById('quickFilterChips');
        container.innerHTML = quickFilters.map(f => `
            <button class="quick-filter-chip" data-id="${f.id}">
                ${f.icon} ${f.label}
            </button>
        `).join('');
    }
    
    renderCriteriaList() {
        const container = document.getElementById('criteriaList');
        if (this.activeFilters.length === 0) {
            container.innerHTML = '<p class="no-filters">No criteria added yet</p>';
            return;
        }
        
        container.innerHTML = this.activeFilters.map((filter, index) => `
            <div class="criterion-row" data-index="${index}">
                <select class="field-select" data-index="${index}">
                    ${this.getFieldOptions(filter.field)}
                </select>
                <select class="operator-select" data-index="${index}">
                    ${this.getOperatorOptions(filter.operator)}
                </select>
                <input type="text" 
                       class="value-input" 
                       data-index="${index}"
                       value="${filter.value || ''}"
                       placeholder="Value">
                
                <button class="btn-remove" data-index="${index}">✕</button>
            </div>
        `).join('');
    }
    
    getFieldOptions(selected) {
        const fields = [
            { value: 'sport', label: 'Sport' },
            { value: 'market', label: 'Market Type' },
            { value: 'profitPercent', label: 'Profit %' },
            { value: 'odds', label: 'Odds' },
            { value: 'qualityScore', label: 'Quality Score' },
            { value: 'eventDate', label: 'Event Date' },
            { value: 'isLive', label: 'Live Status' },
            { value: 'bookmakers', label: 'Bookmakers' },
            { value: 'matchName', label: 'Match Name' }
        ];
        
        return fields.map(f => 
            `<option value="${f.value}" ${f.value === selected ? 'selected' : ''}>${f.label}</option>`
        ).join('');
    }
    
    getOperatorOptions(selected) {
        const operators = [
            { value: 'eq', label: '=' },
            { value: 'neq', label: '!=' },
            { value: 'gt', label: '>' },
            { value: 'gte', label: '>=' },
            { value: 'lt', label: '<' },
            { value: 'lte', label: '<=' },
            { value: 'contains', label: 'Contains' },
            { value: 'in', label: 'In List' },
            { value: 'excludes', label: 'Excludes' },
            { value: 'between', label: 'Between' }
        ];
        
        return operators.map(o => 
            `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`
        ).join('');
    }
    
    attachEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.debouncedSearch();
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
        
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.performSearch();
        });
        
        // Quick filters
        document.getElementById('quickFilterChips').addEventListener('click', (e) => {
            const chip = e.target.closest('.quick-filter-chip');
            if (chip) {
                chip.classList.toggle('active');
                this.applyQuickFilter(chip.dataset.id, chip.classList.contains('active'));
            }
        });
        
        // Add criterion
        document.getElementById('addCriterion').addEventListener('click', () => {
            this.addCriterion();
        });
        
        // Criteria list events (delegation)
        document.getElementById('criteriaList').addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (e.target.classList.contains('field-select')) {
                this.activeFilters[index].field = e.target.value;
            } else if (e.target.classList.contains('operator-select')) {
                this.activeFilters[index].operator = e.target.value;
            }
            this.notifyFilterChange();
        });
        
        document.getElementById('criteriaList').addEventListener('input', (e) => {
            if (e.target.classList.contains('value-input')) {
                const index = parseInt(e.target.dataset.index);
                this.activeFilters[index].value = e.target.value;
            }
        });
        
        document.getElementById('criteriaList').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove')) {
                const index = parseInt(e.target.dataset.index);
                this.removeCriterion(index);
            }
        });
        
        // Clear filters
        document.getElementById('clearFilters').addEventListener('click', () => {
            this.clearAllFilters();
        });
        
        // Save filter
        document.getElementById('saveFilter').addEventListener('click', () => {
            this.showSaveFilterDialog();
        });
        
        // Export
        document.getElementById('exportResults').addEventListener('click', () => {
            this.exportResults();
        });
    }
    
    debouncedSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.performSearch(), 300);
    }
    
    performSearch() {
        this.options.onSearch(this.searchQuery);
    }
    
    addCriterion() {
        this.activeFilters.push({
            field: 'sport',
            operator: 'eq',
            value: ''
        });
        this.renderCriteriaList();
        this.notifyFilterChange();
    }
    
    removeCriterion(index) {
        this.activeFilters.splice(index, 1);
        this.renderCriteriaList();
        this.notifyFilterChange();
    }
    
    clearAllFilters() {
        this.activeFilters = [];
        this.searchQuery = '';
        document.getElementById('searchInput').value = '';
        document.querySelectorAll('.quick-filter-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        this.renderCriteriaList();
        this.notifyFilterChange();
    }
    
    applyQuickFilter(filterId, active) {
        if (active) {
            // Add quick filter to active filters
            this.activeFilters.push({
                type: 'quick',
                id: filterId
            });
        } else {
            // Remove quick filter
            this.activeFilters = this.activeFilters.filter(f => !(f.type === 'quick' && f.id === filterId));
        }
        this.notifyFilterChange();
    }
    
    notifyFilterChange() {
        const filter = this.buildFilterObject();
        this.options.onFilterChange(filter);
        this.renderActiveFilters();
    }
    
    buildFilterObject() {
        const criteria = this.activeFilters.filter(f => !f.type);
        const quickFilters = this.activeFilters.filter(f => f.type === 'quick').map(f => f.id);
        
        return {
            search: this.searchQuery,
            criteria: criteria.length > 0 ? criteria : undefined,
            quickFilter: quickFilters.length > 0 ? quickFilters[0] : undefined,
            operator: 'AND'
        };
    }
    
    renderActiveFilters() {
        const container = document.getElementById('activeFilters');
        if (this.activeFilters.length === 0 && !this.searchQuery) {
            container.innerHTML = '';
            return;
        }
        
        const chips = [];
        
        if (this.searchQuery) {
            chips.push(`
                <span class="filter-chip search">
                    🔍 "${this.searchQuery}"
                    <button onclick="filterUI.clearSearch()">✕</button>
                </span>
            `);
        }
        
        this.activeFilters.forEach((filter, index) => {
            if (filter.type === 'quick') {
                chips.push(`
                    <span class="filter-chip quick">
                        ${filter.id}
                        <button onclick="filterUI.removeFilter(${index})">✕</button>
                    </span>
                `);
            } else {
                chips.push(`
                    <span class="filter-chip">
                        ${filter.field} ${filter.operator} ${filter.value}
                        <button onclick="filterUI.removeFilter(${index})">✕</button>
                    </span>
                `);
            }
        });
        
        container.innerHTML = `
            <div class="active-filters-label">Active Filters:</div>
            ${chips.join('')}
        `;
    }
    
    clearSearch() {
        this.searchQuery = '';
        document.getElementById('searchInput').value = '';
        this.notifyFilterChange();
    }
    
    removeFilter(index) {
        this.activeFilters.splice(index, 1);
        this.renderCriteriaList();
        this.notifyFilterChange();
    }
    
    showSaveFilterDialog() {
        const name = prompt('Enter a name for this filter:');
        if (name) {
            const filter = this.buildFilterObject();
            this.savedFilters.push({
                name,
                filter,
                createdAt: new Date().toISOString()
            });
            this.renderSavedFilters();
        }
    }
    
    renderSavedFilters() {
        const container = document.getElementById('savedFilterList');
        if (this.savedFilters.length === 0) {
            container.innerHTML = '<p class="no-saved">No saved filters</p>';
            return;
        }
        
        container.innerHTML = this.savedFilters.map((f, index) => `
            <div class="saved-filter-item">
                <span class="saved-filter-name">${f.name}</span>
                <div class="saved-filter-actions">
                    <button onclick="filterUI.loadSavedFilter(${index})">Load</button>
                    <button onclick="filterUI.deleteSavedFilter(${index})">Delete</button>
                </div>
            </div>
        `).join('');
    }
    
    loadSavedFilter(index) {
        const saved = this.savedFilters[index];
        if (saved) {
            this.activeFilters = saved.filter.criteria || [];
            this.searchQuery = saved.filter.search || '';
            document.getElementById('searchInput').value = this.searchQuery;
            this.renderCriteriaList();
            this.notifyFilterChange();
        }
    }
    
    deleteSavedFilter(index) {
        this.savedFilters.splice(index, 1);
        this.renderSavedFilters();
    }
    
    exportResults() {
        const event = new CustomEvent('exportFilteredResults', {
            detail: { filter: this.buildFilterObject() }
        });
        document.dispatchEvent(event);
    }
    
    updateStats(stats) {
        document.getElementById('statTotal').textContent = stats.total || 0;
        document.getElementById('statFiltered').textContent = stats.filtered || 0;
        document.getElementById('statAvgProfit').textContent = 
            stats.avgProfit ? `${stats.avgProfit.toFixed(2)}%` : '0%';
    }
}

// Make it globally available
window.FilterUI = FilterUI;
