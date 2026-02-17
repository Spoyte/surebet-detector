/**
 * Push Notification Service for Surebet Detector
 * Browser push notifications for high-value opportunities
 */

const webpush = require('web-push');
const fs = require('fs').promises;
const path = require('path');

class PushNotificationService {
    constructor(options = {}) {
        this.options = {
            vapidSubject: options.vapidSubject || 'mailto:surebet@example.com',
            dataDir: options.dataDir || './data',
            maxSubscriptions: options.maxSubscriptions || 1000,
            batchWindowMs: options.batchWindowMs || 30000, // 30 seconds
            ...options
        };
        
        this.subscriptions = new Map();
        this.notificationQueue = [];
        this.preferences = new Map();
        this.history = [];
        this.batchTimer = null;
        
        this.init();
    }
    
    async init() {
        await this.loadVapidKeys();
        await this.loadSubscriptions();
        await this.loadPreferences();
        this.setupWebPush();
    }
    
    /**
     * Generate or load VAPID keys
     */
    async loadVapidKeys() {
        const keysPath = path.join(this.options.dataDir, 'vapid-keys.json');
        
        try {
            const data = await fs.readFile(keysPath, 'utf8');
            this.vapidKeys = JSON.parse(data);
        } catch (error) {
            // Generate new keys
            this.vapidKeys = webpush.generateVAPIDKeys();
            await fs.mkdir(this.options.dataDir, { recursive: true });
            await fs.writeFile(keysPath, JSON.stringify(this.vapidKeys, null, 2));
        }
    }
    
    /**
     * Setup web-push with VAPID keys
     */
    setupWebPush() {
        webpush.setVapidDetails(
            this.options.vapidSubject,
            this.vapidKeys.publicKey,
            this.vapidKeys.privateKey
        );
    }
    
    /**
     * Get VAPID public key for client subscription
     */
    getPublicKey() {
        return this.vapidKeys.publicKey;
    }
    
    /**
     * Load saved subscriptions
     */
    async loadSubscriptions() {
        try {
            const data = await fs.readFile(
                path.join(this.options.dataDir, 'push-subscriptions.json'),
                'utf8'
            );
            const subs = JSON.parse(data);
            subs.forEach(sub => this.subscriptions.set(sub.endpoint, sub));
        } catch (error) {
            // No existing subscriptions
        }
    }
    
    /**
     * Save subscriptions to disk
     */
    async saveSubscriptions() {
        const subs = Array.from(this.subscriptions.values());
        await fs.writeFile(
            path.join(this.options.dataDir, 'push-subscriptions.json'),
            JSON.stringify(subs, null, 2)
        );
    }
    
    /**
     * Load user preferences
     */
    async loadPreferences() {
        try {
            const data = await fs.readFile(
                path.join(this.options.dataDir, 'notification-preferences.json'),
                'utf8'
            );
            const prefs = JSON.parse(data);
            Object.entries(prefs).forEach(([key, value]) => {
                this.preferences.set(key, value);
            });
        } catch (error) {
            // No existing preferences
        }
    }
    
    /**
     * Save preferences to disk
     */
    async savePreferences() {
        const prefs = Object.fromEntries(this.preferences);
        await fs.writeFile(
            path.join(this.options.dataDir, 'notification-preferences.json'),
            JSON.stringify(prefs, null, 2)
        );
    }
    
    /**
     * Subscribe a client to push notifications
     */
    async subscribe(subscription, userId = 'default') {
        if (this.subscriptions.size >= this.options.maxSubscriptions) {
            throw new Error('Maximum subscriptions reached');
        }
        
        const subWithMeta = {
            ...subscription,
            userId,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };
        
        this.subscriptions.set(subscription.endpoint, subWithMeta);
        await this.saveSubscriptions();
        
        // Set default preferences if not exists
        if (!this.preferences.has(userId)) {
            this.preferences.set(userId, this.getDefaultPreferences());
            await this.savePreferences();
        }
        
        return { success: true, subscription: subWithMeta };
    }
    
    /**
     * Unsubscribe a client
     */
    async unsubscribe(endpoint) {
        const deleted = this.subscriptions.delete(endpoint);
        if (deleted) {
            await this.saveSubscriptions();
        }
        return { success: deleted };
    }
    
    /**
     * Get default notification preferences
     */
    getDefaultPreferences() {
        return {
            enabled: true,
            minProfitPercent: 3.0,
            minQualityScore: 75,
            notifyLiveMatches: true,
            notifyHighValue: true,
            notifyQualityAlerts: true,
            notifyDailySummary: false,
            batchNotifications: true,
            quietHours: {
                enabled: true,
                start: '22:00',
                end: '08:00'
            },
            soundEnabled: true,
            desktopNotifications: true
        };
    }
    
    /**
     * Update user preferences
     */
    async updatePreferences(userId, preferences) {
        const current = this.preferences.get(userId) || this.getDefaultPreferences();
        const updated = { ...current, ...preferences };
        this.preferences.set(userId, updated);
        await this.savePreferences();
        return updated;
    }
    
    /**
     * Get user preferences
     */
    getPreferences(userId = 'default') {
        return this.preferences.get(userId) || this.getDefaultPreferences();
    }
    
    /**
     * Check if currently in quiet hours
     */
    isQuietHours(preferences) {
        if (!preferences.quietHours?.enabled) return false;
        
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const { start, end } = preferences.quietHours;
        
        if (start <= end) {
            return currentTime >= start && currentTime <= end;
        } else {
            // Spanning midnight
            return currentTime >= start || currentTime <= end;
        }
    }
    
    /**
     * Queue a notification for sending
     */
    queueNotification(opportunity, type = 'opportunity') {
        const notification = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            opportunity,
            timestamp: new Date().toISOString(),
            sent: false
        };
        
        this.notificationQueue.push(notification);
        
        // Start batch timer if not already running
        if (!this.batchTimer && this.shouldBatch()) {
            this.batchTimer = setTimeout(() => this.processBatch(), this.options.batchWindowMs);
        } else if (!this.shouldBatch()) {
            // Send immediately if not batching
            this.processBatch();
        }
        
        return notification;
    }
    
    /**
     * Check if we should batch notifications
     */
    shouldBatch() {
        // Check if any user has batching enabled
        for (const prefs of this.preferences.values()) {
            if (prefs.batchNotifications) return true;
        }
        return false;
    }
    
    /**
     * Process queued notifications
     */
    async processBatch() {
        this.batchTimer = null;
        
        if (this.notificationQueue.length === 0) return;
        
        const queue = [...this.notificationQueue];
        this.notificationQueue = [];
        
        // Group by user
        const byUser = new Map();
        queue.forEach(notif => {
            this.subscriptions.forEach((sub, endpoint) => {
                const userId = sub.userId || 'default';
                if (!byUser.has(userId)) {
                    byUser.set(userId, { sub, notifications: [] });
                }
                byUser.get(userId).notifications.push(notif);
            });
        });
        
        // Send batched notifications per user
        for (const [userId, { sub, notifications }] of byUser) {
            const prefs = this.getPreferences(userId);
            
            if (!prefs.enabled || this.isQuietHours(prefs)) continue;
            
            if (notifications.length === 1) {
                await this.sendNotification(sub, notifications[0], prefs);
            } else {
                await this.sendBatchedNotification(sub, notifications, prefs);
            }
        }
    }
    
    /**
     * Send a single notification
     */
    async sendNotification(subscription, notification, preferences) {
        const payload = this.buildPayload(notification, preferences);
        
        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            notification.sent = true;
            this.recordNotification(notification, subscription.userId);
            return { success: true };
        } catch (error) {
            if (error.statusCode === 410) {
                // Subscription expired, remove it
                await this.unsubscribe(subscription.endpoint);
            }
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Send a batched notification
     */
    async sendBatchedNotification(subscription, notifications, preferences) {
        const highValueCount = notifications.filter(n => 
            n.opportunity.profitPercent >= 5
        ).length;
        
        const payload = {
            title: `${notifications.length} New Opportunities`,
            body: highValueCount > 0 
                ? `${highValueCount} high-value opportunities detected!`
                : `Check out the latest arbitrage opportunities.`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            tag: 'batch-opportunities',
            requireInteraction: highValueCount > 0,
            data: {
                type: 'batch',
                count: notifications.length,
                highValueCount,
                url: '/?filter=recent'
            },
            actions: [
                { action: 'view', title: 'View All' },
                { action: 'dismiss', title: 'Dismiss' }
            ]
        };
        
        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            notifications.forEach(n => n.sent = true);
            this.recordNotification({ 
                type: 'batch', 
                count: notifications.length,
                notifications 
            }, subscription.userId);
            return { success: true };
        } catch (error) {
            if (error.statusCode === 410) {
                await this.unsubscribe(subscription.endpoint);
            }
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Build notification payload
     */
    buildPayload(notification, preferences) {
        const { opportunity, type } = notification;
        
        const isHighValue = opportunity.profitPercent >= 5;
        const isQuality = opportunity.qualityScore >= 90;
        
        let title, body;
        
        switch (type) {
            case 'opportunity':
                title = isHighValue ? '🚨 High-Value Opportunity!' : 'New Arbitrage Opportunity';
                body = `${opportunity.match || opportunity.matchName} - ${opportunity.profitPercent.toFixed(2)}% profit`;
                break;
            case 'live':
                title = '🔴 Live Match Opportunity';
                body = `${opportunity.match} - Live arbitrage available!`;
                break;
            case 'quality':
                title = '⭐ Quality Alert';
                body = `High-quality opportunity: ${opportunity.match}`;
                break;
            default:
                title = 'Surebet Alert';
                body = 'New opportunity available';
        }
        
        return {
            title,
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            tag: `opportunity-${opportunity.id}`,
            requireInteraction: isHighValue || isQuality,
            renotify: true,
            silent: !preferences.soundEnabled,
            data: {
                type,
                opportunityId: opportunity.id,
                url: `/opportunity/${opportunity.id}`,
                profitPercent: opportunity.profitPercent
            },
            actions: [
                { action: 'view', title: 'View Details' },
                { action: 'dismiss', title: 'Dismiss' }
            ]
        };
    }
    
    /**
     * Record notification in history
     */
    recordNotification(notification, userId) {
        this.history.push({
            ...notification,
            userId,
            recordedAt: new Date().toISOString()
        });
        
        // Keep only last 1000 notifications
        if (this.history.length > 1000) {
            this.history = this.history.slice(-1000);
        }
    }
    
    /**
     * Get notification history
     */
    getHistory(userId, limit = 50) {
        let history = this.history;
        if (userId) {
            history = history.filter(h => h.userId === userId);
        }
        return history.slice(-limit).reverse();
    }
    
    /**
     * Send test notification
     */
    async sendTestNotification(subscription) {
        const payload = {
            title: '🔔 Test Notification',
            body: 'Push notifications are working correctly!',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            tag: 'test',
            data: {
                type: 'test',
                url: '/'
            }
        };
        
        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get subscription status
     */
    getSubscriptionStatus(endpoint) {
        const sub = this.subscriptions.get(endpoint);
        if (!sub) return { subscribed: false };
        
        return {
            subscribed: true,
            createdAt: sub.createdAt,
            lastUsed: sub.lastUsed
        };
    }
    
    /**
     * Get all subscriptions count
     */
    getSubscriptionCount() {
        return this.subscriptions.size;
    }
    
    /**
     * Cleanup expired subscriptions
     */
    async cleanup() {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const toRemove = [];
        this.subscriptions.forEach((sub, endpoint) => {
            const lastUsed = new Date(sub.lastUsed);
            if (lastUsed < oneMonthAgo) {
                toRemove.push(endpoint);
            }
        });
        
        for (const endpoint of toRemove) {
            await this.unsubscribe(endpoint);
        }
        
        return { removed: toRemove.length };
    }
}

module.exports = PushNotificationService;
