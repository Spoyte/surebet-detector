/**
 * Offline Sync Manager for Surebet Mobile App
 * Handles queueing actions when offline and syncing when back online
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

const SYNC_QUEUE_KEY = '@surebet_sync_queue';
const LAST_SYNC_KEY = '@surebet_last_sync';

export const useOfflineStore = create((set, get) => ({
  isOnline: true,
  isSyncing: false,
  pendingActions: 0,
  lastSync: null,

  initialize: async () => {
    // Set up network listener
    const unsubscribe = NetInfo.addEventListener(state => {
      const wasOffline = !get().isOnline;
      const isOnline = state.isConnected && state.isInternetReachable;
      
      set({ isOnline });
      
      // If we just came back online, trigger sync
      if (wasOffline && isOnline) {
        get().syncPendingActions();
      }
    });

    // Load pending actions count
    const queue = await get().getSyncQueue();
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    
    set({ 
      pendingActions: queue.length,
      lastSync: lastSync ? new Date(lastSync) : null,
    });

    return unsubscribe;
  },

  getSyncQueue: async () => {
    try {
      const queueJson = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('Error loading sync queue:', error);
      return [];
    }
  },

  addToQueue: async (action) => {
    try {
      const queue = await get().getSyncQueue();
      const queueItem = {
        id: `${action.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: action.type,
        data: action.data,
        timestamp: new Date().toISOString(),
        retries: 0,
      };
      
      queue.push(queueItem);
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
      
      set({ pendingActions: queue.length });
      
      return queueItem.id;
    } catch (error) {
      console.error('Error adding to queue:', error);
      throw error;
    }
  },

  removeFromQueue: async (actionId) => {
    try {
      const queue = await get().getSyncQueue();
      const filtered = queue.filter(item => item.id !== actionId);
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
      
      set({ pendingActions: filtered.length });
    } catch (error) {
      console.error('Error removing from queue:', error);
    }
  },

  syncPendingActions: async () => {
    const { isOnline, isSyncing } = get();
    
    if (!isOnline || isSyncing) return;
    
    set({ isSyncing: true });
    
    try {
      const queue = await get().getSyncQueue();
      
      for (const action of queue) {
        try {
          await get().executeAction(action);
          await get().removeFromQueue(action.id);
        } catch (error) {
          console.error(`Failed to sync action ${action.id}:`, error);
          
          // Increment retry count
          action.retries += 1;
          
          // Remove if too many retries
          if (action.retries >= 3) {
            await get().removeFromQueue(action.id);
            // TODO: Notify user of failed action
          }
        }
      }
      
      // Update last sync time
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now);
      set({ lastSync: new Date(now) });
      
    } finally {
      set({ isSyncing: false });
    }
  },

  executeAction: async (action) => {
    const { getAuthToken } = useAuthStore.getState();
    const token = await getAuthToken();
    
    const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';
    
    switch (action.type) {
      case 'PLACE_BET':
        const response = await fetch(`${API_BASE_URL}/api/mobile/bets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(action.data),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to place bet: ${response.status}`);
        }
        break;
        
      case 'BOOKMARK_OPPORTUNITY':
        await fetch(`${API_BASE_URL}/api/mobile/opportunities/${action.data.opportunityId}/bookmark`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        break;
        
      case 'UPDATE_PROFILE':
        await fetch(`${API_BASE_URL}/api/mobile/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(action.data),
        });
        break;
        
      default:
        console.warn('Unknown action type:', action.type);
    }
  },

  clearQueue: async () => {
    await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
    set({ pendingActions: 0 });
  },
}));

// Hook for components to queue actions
export function useOfflineAction() {
  const { isOnline, addToQueue, syncPendingActions } = useOfflineStore();
  
  const executeOrQueue = async (actionType, data, immediateCallback) => {
    if (isOnline) {
      // Try to execute immediately
      try {
        const result = await immediateCallback();
        return { success: true, data: result, queued: false };
      } catch (error) {
        // If it fails, queue it
        const id = await addToQueue({ type: actionType, data });
        return { success: false, error: error.message, queued: true, queueId: id };
      }
    } else {
      // Offline - queue the action
      const id = await addToQueue({ type: actionType, data });
      return { success: false, queued: true, queueId: id };
    }
  };
  
  return { executeOrQueue, syncPendingActions };
}
