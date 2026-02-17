/**
 * API Client for Surebet Mobile App
 * Handles requests with offline support, caching, and error handling
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.surebet-detector.com';
const CACHE_PREFIX = '@surebet_cache_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.cache = new Map();
  }

  async getAuthToken() {
    return await AsyncStorage.getItem('auth_token');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = await this.getAuthToken();
    
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
    };

    // Check network status
    const netInfo = await NetInfo.fetch();
    const isOnline = netInfo.isConnected && netInfo.isInternetReachable;

    // Try to get cached response for GET requests
    if (options.method === 'GET' || !options.method) {
      const cached = await this.getCachedResponse(endpoint);
      if (cached && !options.skipCache) {
        // Return cached data immediately if offline
        if (!isOnline) {
          return { data: cached.data, fromCache: true, offline: true };
        }
        
        // Return cached data if not expired
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          // Trigger background refresh
          this.refreshInBackground(endpoint, config);
          return { data: cached.data, fromCache: true };
        }
      }
    }

    // If offline and no cache, throw error
    if (!isOnline) {
      throw new Error('No internet connection');
    }

    try {
      const response = await fetch(url, config);
      
      // Handle token expiration
      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry with new token
          return this.request(endpoint, options);
        } else {
          // Token refresh failed, logout
          await AsyncStorage.removeItem('auth_token');
          throw new Error('Session expired');
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Cache GET responses
      if (options.method === 'GET' || !options.method) {
        await this.cacheResponse(endpoint, data);
      }
      
      // Invalidate cache on mutations
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
        await this.invalidateCache(endpoint);
      }

      return { data, fromCache: false };
    } catch (error) {
      // Try to return stale cache on error
      if (options.method === 'GET' || !options.method) {
        const cached = await this.getCachedResponse(endpoint);
        if (cached) {
          return { data: cached.data, fromCache: true, stale: true };
        }
      }
      throw error;
    }
  }

  async refreshToken() {
    try {
      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (!refreshToken) return false;

      const response = await fetch(`${this.baseURL}/api/mobile/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const { token } = await response.json();
        await AsyncStorage.setItem('auth_token', token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  async getCachedResponse(endpoint) {
    try {
      const key = `${CACHE_PREFIX}${endpoint}`;
      const cached = await AsyncStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  async cacheResponse(endpoint, data) {
    try {
      const key = `${CACHE_PREFIX}${endpoint}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Cache error:', error);
    }
  }

  async invalidateCache(pattern) {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      // Invalidate exact match and parent resources
      const keysToDelete = cacheKeys.filter(key => {
        const endpoint = key.replace(CACHE_PREFIX, '');
        return endpoint === pattern || endpoint.startsWith(pattern.split('?')[0]);
      });
      
      if (keysToDelete.length > 0) {
        await AsyncStorage.multiRemove(keysToDelete);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  async refreshInBackground(endpoint, config) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      if (response.ok) {
        const data = await response.json();
        await this.cacheResponse(endpoint, data);
      }
    } catch (error) {
      // Silent fail for background refresh
    }
  }

  // Convenience methods
  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, data, options = {}) {
    return this.request(endpoint, { 
      ...options, 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
  }

  put(endpoint, data, options = {}) {
    return this.request(endpoint, { 
      ...options, 
      method: 'PUT', 
      body: JSON.stringify(data) 
    });
  }

  patch(endpoint, data, options = {}) {
    return this.request(endpoint, { 
      ...options, 
      method: 'PATCH', 
      body: JSON.stringify(data) 
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // Clear all cache
  async clearCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Clear cache error:', error);
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
