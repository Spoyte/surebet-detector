/**
 * @fileoverview Opportunity Watchlist Manager
 * @description Bookmark opportunities and create watchlists for teams/leagues
 * @module surebet-detector/watchlist-manager
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

/**
 * Manages bookmarked opportunities and watchlists
 * Allows users to track specific opportunities, teams, and leagues
 */
class WatchlistManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.dataDir = config.dataDir || './data';
        this.watchlistPath = path.join(this.dataDir, 'watchlist.json');
        this.bookmarksPath = path.join(this.dataDir, 'bookmarks.json');
        this.notificationsPath = path.join(this.dataDir, 'watchlist-notifications.json');
        
        // In-memory storage
        this.watchlists = new Map(); // name -> { teams: [], leagues: [], sports: [], createdAt }
        this.bookmarks = new Map(); // id -> bookmarked opportunity
        this.notifications = []; // notification history
        this.priceAlerts = new Map(); // id -> { targetOdds, direction, triggered }
        
        // Auto-save interval
        this.autoSaveInterval = config.autoSaveInterval || 60000; // 1 minute
        this.autoSaveTimer = null;
    }
    
    /**
     * Initialize the watchlist manager
     */
    async init() {
        await this.ensureDirectories();
        await this.loadData();
        this.startAutoSave();
        console.log('📋 Watchlist Manager initialized');
    }
    
    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
        } catch (err) {
            // Directory may already exist
        }
    }
    
    /**
     * Load saved data from disk
     */
    async loadData() {
        // Load watchlists
        try {
            const data = await fs.readFile(this.watchlistPath, 'utf8');
            const parsed = JSON.parse(data);
            for (const [key, value] of Object.entries(parsed)) {
                this.watchlists.set(key, value);
            }
        } catch (err) {
            // No saved watchlists
        }
        
        // Load bookmarks
        try {
            const data = await fs.readFile(this.bookmarksPath, 'utf8');
            const parsed = JSON.parse(data);
            for (const [key, value] of Object.entries(parsed)) {
                this.bookmarks.set(key, value);
            }
        } catch (err) {
            // No saved bookmarks
        }
        
        // Load notifications
        try {
            const data = await fs.readFile(this.notificationsPath, 'utf8');
            this.notifications = JSON.parse(data);
        } catch (err) {
            // No saved notifications
        }
    }
    
    /**
     * Save data to disk
     */
    async save() {
        try {
            // Save watchlists
            const watchlistObj = Object.fromEntries(this.watchlists);
            await fs.writeFile(this.watchlistPath, JSON.stringify(watchlistObj, null, 2), 'utf8');
            
            // Save bookmarks
            const bookmarksObj = Object.fromEntries(this.bookmarks);
            await fs.writeFile(this.bookmarksPath, JSON.stringify(bookmarksObj, null, 2), 'utf8');
            
            // Save notifications
            await fs.writeFile(this.notificationsPath, JSON.stringify(this.notifications, null, 2), 'utf8');
            
            this.emit('saved', {
                watchlists: this.watchlists.size,
                bookmarks: this.bookmarks.size,
                notifications: this.notifications.length
            });
        } catch (err) {
            console.error('Failed to save watchlist data:', err);
            this.emit('error', { type: 'save', error: err });
        }
    }
    
    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        this.autoSaveTimer = setInterval(() => this.save(), this.autoSaveInterval);
    }
    
    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
    
    // ==================== BOOKMARK METHODS ====================
    
    /**
     * Bookmark an opportunity
     */
    bookmarkOpportunity(opportunity, notes = '') {
        const id = opportunity.id || this.generateId(opportunity);
        
        const bookmark = {
            id,
            type: opportunity.type || 'arbitrage', // 'arbitrage', 'ev', 'promotion'
            event: opportunity.event || opportunity.eventName,
            sport: opportunity.sport,
            bookmakers: opportunity.legs?.map(l => l.bookmaker) || [opportunity.bookmaker],
            profitPercent: opportunity.profitPercent,
            evPercent: opportunity.evPercent,
            odds: opportunity.legs?.map(l => ({ outcome: l.outcome, odds: l.odds })) || 
                  [{ outcome: opportunity.outcome, odds: opportunity.odds }],
            stakes: opportunity.stakes,
            notes,
            bookmarkedAt: Date.now(),
            status: 'active', // 'active', 'expired', 'placed', 'won', 'lost'
            tags: []
        };
        
        this.bookmarks.set(id, bookmark);
        this.emit('bookmarked', bookmark);
        
        // Add notification
        this.addNotification('bookmark', `Bookmarked: ${bookmark.event}`, bookmark);
        
        return bookmark;
    }
    
    /**
     * Remove a bookmark
     */
    removeBookmark(id) {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) return false;
        
        this.bookmarks.delete(id);
        this.emit('unbookmarked', { id, bookmark });
        return true;
    }
    
    /**
     * Get a specific bookmark
     */
    getBookmark(id) {
        return this.bookmarks.get(id);
    }
    
    /**
     * Get all bookmarks
     */
    getAllBookmarks(options = {}) {
        let bookmarks = Array.from(this.bookmarks.values());
        
        // Filter by type
        if (options.type) {
            bookmarks = bookmarks.filter(b => b.type === options.type);
        }
        
        // Filter by status
        if (options.status) {
            bookmarks = bookmarks.filter(b => b.status === options.status);
        }
        
        // Filter by sport
        if (options.sport) {
            bookmarks = bookmarks.filter(b => b.sport === options.sport);
        }
        
        // Filter by tags
        if (options.tags && options.tags.length > 0) {
            bookmarks = bookmarks.filter(b => 
                options.tags.some(tag => b.tags.includes(tag))
            );
        }
        
        // Search by text
        if (options.search) {
            const search = options.search.toLowerCase();
            bookmarks = bookmarks.filter(b => 
                b.event.toLowerCase().includes(search) ||
                b.bookmakers.some(bm => bm.toLowerCase().includes(search))
            );
        }
        
        // Sort
        const sortBy = options.sortBy || 'bookmarkedAt';
        const sortOrder = options.sortOrder || 'desc';
        bookmarks.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });
        
        // Pagination
        const limit = options.limit || 50;
        const offset = options.offset || 0;
        
        return {
            bookmarks: bookmarks.slice(offset, offset + limit),
            total: bookmarks.length,
            limit,
            offset
        };
    }
    
    /**
     * Update bookmark status
     */
    updateBookmarkStatus(id, status, details = {}) {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) return null;
        
        bookmark.status = status;
        bookmark.updatedAt = Date.now();
        
        if (status === 'placed') {
            bookmark.placedAt = Date.now();
            bookmark.placedDetails = details;
        } else if (status === 'won' || status === 'lost') {
            bookmark.settledAt = Date.now();
            bookmark.result = details;
        }
        
        this.emit('statusChanged', { id, status, bookmark });
        return bookmark;
    }
    
    /**
     * Add tags to a bookmark
     */
    addTags(id, tags) {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) return null;
        
        for (const tag of tags) {
            if (!bookmark.tags.includes(tag)) {
                bookmark.tags.push(tag);
            }
        }
        
        bookmark.updatedAt = Date.now();
        return bookmark;
    }
    
    /**
     * Remove tags from a bookmark
     */
    removeTags(id, tags) {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) return null;
        
        bookmark.tags = bookmark.tags.filter(t => !tags.includes(t));
        bookmark.updatedAt = Date.now();
        return bookmark;
    }
    
    /**
     * Update bookmark notes
     */
    updateNotes(id, notes) {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) return null;
        
        bookmark.notes = notes;
        bookmark.updatedAt = Date.now();
        return bookmark;
    }
    
    // ==================== WATCHLIST METHODS ====================
    
    /**
     * Create a new watchlist
     */
    createWatchlist(name, options = {}) {
        if (this.watchlists.has(name)) {
            throw new Error(`Watchlist "${name}" already exists`);
        }
        
        const watchlist = {
            name,
            description: options.description || '',
            teams: options.teams || [],
            leagues: options.leagues || [],
            sports: options.sports || [],
            bookmakers: options.bookmakers || [],
            minProfit: options.minProfit || 0,
            minEV: options.minEV || 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            notifyOn: options.notifyOn || ['arbitrage', 'ev'], // 'arbitrage', 'ev', 'odds_change'
            isActive: true
        };
        
        this.watchlists.set(name, watchlist);
        this.emit('watchlistCreated', watchlist);
        
        this.addNotification('watchlist', `Created watchlist: ${name}`, watchlist);
        
        return watchlist;
    }
    
    /**
     * Delete a watchlist
     */
    deleteWatchlist(name) {
        const watchlist = this.watchlists.get(name);
        if (!watchlist) return false;
        
        this.watchlists.delete(name);
        this.emit('watchlistDeleted', { name, watchlist });
        return true;
    }
    
    /**
     * Get a specific watchlist
     */
    getWatchlist(name) {
        return this.watchlists.get(name);
    }
    
    /**
     * Get all watchlists
     */
    getAllWatchlists(options = {}) {
        let lists = Array.from(this.watchlists.values());
        
        if (options.activeOnly) {
            lists = lists.filter(w => w.isActive);
        }
        
        if (options.sport) {
            lists = lists.filter(w => w.sports.includes(options.sport));
        }
        
        return lists;
    }
    
    /**
     * Update a watchlist
     */
    updateWatchlist(name, updates) {
        const watchlist = this.watchlists.get(name);
        if (!watchlist) return null;
        
        Object.assign(watchlist, updates, { updatedAt: Date.now() });
        this.emit('watchlistUpdated', watchlist);
        return watchlist;
    }
    
    /**
     * Add teams to a watchlist
     */
    addTeams(watchlistName, teams) {
        const watchlist = this.watchlists.get(watchlistName);
        if (!watchlist) return null;
        
        for (const team of teams) {
            if (!watchlist.teams.includes(team)) {
                watchlist.teams.push(team);
            }
        }
        
        watchlist.updatedAt = Date.now();
        this.emit('watchlistUpdated', watchlist);
        return watchlist;
    }
    
    /**
     * Remove teams from a watchlist
     */
    removeTeams(watchlistName, teams) {
        const watchlist = this.watchlists.get(watchlistName);
        if (!watchlist) return null;
        
        watchlist.teams = watchlist.teams.filter(t => !teams.includes(t));
        watchlist.updatedAt = Date.now();
        return watchlist;
    }
    
    /**
     * Add leagues to a watchlist
     */
    addLeagues(watchlistName, leagues) {
        const watchlist = this.watchlists.get(watchlistName);
        if (!watchlist) return null;
        
        for (const league of leagues) {
            if (!watchlist.leagues.includes(league)) {
                watchlist.leagues.push(league);
            }
        }
        
        watchlist.updatedAt = Date.now();
        return watchlist;
    }
    
    /**
     * Remove leagues from a watchlist
     */
    removeLeagues(watchlistName, leagues) {
        const watchlist = this.watchlists.get(watchlistName);
        if (!watchlist) return null;
        
        watchlist.leagues = watchlist.leagues.filter(l => !leagues.includes(l));
        watchlist.updatedAt = Date.now();
        return watchlist;
    }
    
    /**
     * Check if an opportunity matches a watchlist
     */
    matchesWatchlist(opportunity, watchlist) {
        // Check if watchlist is active
        if (!watchlist.isActive) return false;
        
        // Check sport
        if (watchlist.sports.length > 0 && 
            !watchlist.sports.includes(opportunity.sport)) {
            return false;
        }
        
        // Check bookmakers
        if (watchlist.bookmakers.length > 0) {
            const oppBookmakers = opportunity.legs?.map(l => l.bookmaker) || 
                                  [opportunity.bookmaker];
            const hasMatchingBookmaker = oppBookmakers.some(bm => 
                watchlist.bookmakers.includes(bm)
            );
            if (!hasMatchingBookmaker) return false;
        }
        
        // Check teams
        if (watchlist.teams.length > 0) {
            const eventName = opportunity.event || opportunity.eventName || '';
            const hasMatchingTeam = watchlist.teams.some(team => 
                eventName.toLowerCase().includes(team.toLowerCase())
            );
            if (!hasMatchingTeam) return false;
        }
        
        // Check profit/EV thresholds
        if (watchlist.minProfit > 0 && 
            (opportunity.profitPercent || 0) < watchlist.minProfit) {
            return false;
        }
        
        if (watchlist.minEV > 0 && 
            (opportunity.evPercent || 0) < watchlist.minEV) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Check opportunities against all watchlists
     */
    checkOpportunities(opportunities) {
        const matches = [];
        
        for (const opportunity of opportunities) {
            for (const [name, watchlist] of this.watchlists) {
                if (this.matchesWatchlist(opportunity, watchlist)) {
                    matches.push({
                        watchlist: name,
                        opportunity,
                        matchedAt: Date.now()
                    });
                    
                    // Emit match event
                    this.emit('watchlistMatch', {
                        watchlist: name,
                        watchlistData: watchlist,
                        opportunity
                    });
                    
                    // Add notification
                    this.addNotification(
                        'watchlist_match',
                        `Watchlist "${name}" match: ${opportunity.event || opportunity.eventName}`,
                        { watchlist: name, opportunity }
                    );
                }
            }
        }
        
        return matches;
    }
    
    // ==================== PRICE ALERTS ====================
    
    /**
     * Set a price alert for a bookmarked opportunity
     */
    setPriceAlert(bookmarkId, targetOdds, direction = 'above') {
        const bookmark = this.bookmarks.get(bookmarkId);
        if (!bookmark) return null;
        
        const alert = {
            bookmarkId,
            targetOdds,
            direction, // 'above' or 'below'
            createdAt: Date.now(),
            triggered: false,
            triggeredAt: null
        };
        
        this.priceAlerts.set(bookmarkId, alert);
        return alert;
    }
    
    /**
     * Remove a price alert
     */
    removePriceAlert(bookmarkId) {
        return this.priceAlerts.delete(bookmarkId);
    }
    
    /**
     * Check price alerts against current odds
     */
    checkPriceAlerts(currentOdds) {
        const triggered = [];
        
        for (const [bookmarkId, alert] of this.priceAlerts) {
            if (alert.triggered) continue;
            
            const current = currentOdds[bookmarkId];
            if (!current) continue;
            
            const shouldTrigger = alert.direction === 'above' 
                ? current >= alert.targetOdds
                : current <= alert.targetOdds;
            
            if (shouldTrigger) {
                alert.triggered = true;
                alert.triggeredAt = Date.now();
                
                const bookmark = this.bookmarks.get(bookmarkId);
                triggered.push({ alert, bookmark });
                
                this.emit('priceAlert', { alert, bookmark, currentOdds: current });
                this.addNotification(
                    'price_alert',
                    `Price alert triggered for ${bookmark?.event}`,
                    { alert, bookmark, current }
                );
            }
        }
        
        return triggered;
    }
    
    // ==================== NOTIFICATIONS ====================
    
    /**
     * Add a notification
     */
    addNotification(type, message, data = {}) {
        const notification = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            message,
            data,
            createdAt: Date.now(),
            read: false
        };
        
        this.notifications.unshift(notification);
        
        // Keep only last 1000 notifications
        if (this.notifications.length > 1000) {
            this.notifications = this.notifications.slice(0, 1000);
        }
        
        this.emit('notification', notification);
        return notification;
    }
    
    /**
     * Get notifications
     */
    getNotifications(options = {}) {
        let notifs = [...this.notifications];
        
        // Filter by type
        if (options.type) {
            notifs = notifs.filter(n => n.type === options.type);
        }
        
        // Filter by read status
        if (options.read !== undefined) {
            notifs = notifs.filter(n => n.read === options.read);
        }
        
        // Pagination
        const limit = options.limit || 50;
        const offset = options.offset || 0;
        
        return {
            notifications: notifs.slice(offset, offset + limit),
            total: notifs.length,
            unread: notifs.filter(n => !n.read).length,
            limit,
            offset
        };
    }
    
    /**
     * Mark notifications as read
     */
    markAsRead(ids) {
        for (const id of ids) {
            const notif = this.notifications.find(n => n.id === id);
            if (notif) {
                notif.read = true;
                notif.readAt = Date.now();
            }
        }
        return true;
    }
    
    /**
     * Mark all notifications as read
     */
    markAllAsRead() {
        for (const notif of this.notifications) {
            if (!notif.read) {
                notif.read = true;
                notif.readAt = Date.now();
            }
        }
        return true;
    }
    
    /**
     * Clear old notifications
     */
    clearOldNotifications(olderThanMs = 7 * 24 * 60 * 60 * 1000) { // 7 days
        const cutoff = Date.now() - olderThanMs;
        this.notifications = this.notifications.filter(n => n.createdAt > cutoff);
        return this.notifications.length;
    }
    
    // ==================== UTILITY METHODS ====================
    
    /**
     * Generate an ID for an opportunity
     */
    generateId(opportunity) {
        const event = opportunity.event || opportunity.eventName || 'unknown';
        const bookmakers = opportunity.legs?.map(l => l.bookmaker).join('_') || 
                          opportunity.bookmaker || 'unknown';
        return `${event}_${bookmakers}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
    }
    
    /**
     * Get statistics
     */
    getStats() {
        const bookmarksByStatus = {};
        for (const bookmark of this.bookmarks.values()) {
            bookmarksByStatus[bookmark.status] = (bookmarksByStatus[bookmark.status] || 0) + 1;
        }
        
        const bookmarksByType = {};
        for (const bookmark of this.bookmarks.values()) {
            bookmarksByType[bookmark.type] = (bookmarksByType[bookmark.type] || 0) + 1;
        }
        
        return {
            bookmarks: {
                total: this.bookmarks.size,
                byStatus: bookmarksByStatus,
                byType: bookmarksByType
            },
            watchlists: {
                total: this.watchlists.size,
                active: Array.from(this.watchlists.values()).filter(w => w.isActive).length
            },
            notifications: {
                total: this.notifications.length,
                unread: this.notifications.filter(n => !n.read).length
            },
            priceAlerts: {
                total: this.priceAlerts.size,
                triggered: Array.from(this.priceAlerts.values()).filter(a => a.triggered).length
            }
        };
    }
    
    /**
     * Export data
     */
    async exportData(format = 'json') {
        const data = {
            bookmarks: Array.from(this.bookmarks.values()),
            watchlists: Array.from(this.watchlists.entries()).map(([name, w]) => ({ name, ...w })),
            notifications: this.notifications,
            priceAlerts: Array.from(this.priceAlerts.values()),
            exportedAt: Date.now()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        if (format === 'csv') {
            // Export bookmarks as CSV
            const headers = ['id', 'type', 'event', 'sport', 'bookmakers', 'profitPercent', 
                           'evPercent', 'bookmarkedAt', 'status', 'tags', 'notes'];
            const rows = data.bookmarks.map(b => [
                b.id,
                b.type,
                b.event,
                b.sport,
                b.bookmakers.join(';'),
                b.profitPercent,
                b.evPercent,
                new Date(b.bookmarkedAt).toISOString(),
                b.status,
                b.tags.join(';'),
                `"${(b.notes || '').replace(/"/g, '""')}"`
            ]);
            
            return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        
        throw new Error(`Unsupported format: ${format}`);
    }
    
    /**
     * Import data
     */
    async importData(data) {
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        // Import bookmarks
        if (data.bookmarks) {
            for (const bookmark of data.bookmarks) {
                this.bookmarks.set(bookmark.id, bookmark);
            }
        }
        
        // Import watchlists
        if (data.watchlists) {
            for (const watchlist of data.watchlists) {
                const { name, ...rest } = watchlist;
                this.watchlists.set(name, rest);
            }
        }
        
        // Import price alerts
        if (data.priceAlerts) {
            for (const alert of data.priceAlerts) {
                this.priceAlerts.set(alert.bookmarkId, alert);
            }
        }
        
        this.emit('imported', {
            bookmarks: data.bookmarks?.length || 0,
            watchlists: data.watchlists?.length || 0,
            priceAlerts: data.priceAlerts?.length || 0
        });
        
        await this.save();
        return true;
    }
    
    /**
     * Shutdown the manager
     */
    async shutdown() {
        this.stopAutoSave();
        await this.save();
        this.removeAllListeners();
    }
}

module.exports = { WatchlistManager };
