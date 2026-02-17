/**
 * Opportunities Store for Surebet Mobile App
 * Manages arbitrage opportunities with caching and offline support
 */

import { create } from 'zustand';
import { apiClient } from '../api/client';
import { useOfflineStore } from './offlineStore';

export const useOpportunitiesStore = create((set, get) => ({
  opportunities: [],
  bookmarks: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  hasMore: true,
  nextCursor: null,
  filters: {
    minProfit: 0,
    sport: null,
    market: null,
  },

  // Load opportunities with pagination
  loadOpportunities: async (refresh = false) => {
    const { nextCursor, filters, opportunities } = get();
    
    if (refresh) {
      set({ isRefreshing: true, nextCursor: null, hasMore: true });
    } else {
      set({ isLoading: true });
    }
    
    try {
      const params = new URLSearchParams({
        limit: '20',
        minProfit: filters.minProfit.toString(),
        ...(nextCursor && !refresh && { cursor: nextCursor }),
        ...(filters.sport && { sport: filters.sport }),
        ...(filters.market && { market: filters.market }),
      });
      
      const { data, fromCache, offline } = await apiClient.get(
        `/api/mobile/opportunities?${params}`
      );
      
      set({
        opportunities: refresh ? data.items : [...opportunities, ...data.items],
        hasMore: data.hasMore,
        nextCursor: data.nextCursor,
        error: null,
      });
      
      return { fromCache, offline };
    } catch (error) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false, isRefreshing: false });
    }
  },

  // Load more opportunities (pagination)
  loadMore: async () => {
    const { hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    
    return get().loadOpportunities(false);
  },

  // Get single opportunity
  getOpportunity: async (id) => {
    try {
      const { data, fromCache } = await apiClient.get(`/api/mobile/opportunities/${id}`);
      return { opportunity: data, fromCache };
    } catch (error) {
      console.error('Failed to load opportunity:', error);
      throw error;
    }
  },

  // Bookmark an opportunity
  bookmarkOpportunity: async (opportunityId) => {
    const { bookmarks } = get();
    
    // Optimistic update
    set({ bookmarks: [...bookmarks, opportunityId] });
    
    try {
      const { isOnline } = useOfflineStore.getState();
      
      if (isOnline) {
        await apiClient.post(`/api/mobile/opportunities/${opportunityId}/bookmark`);
      } else {
        // Queue for sync
        await useOfflineStore.getState().addToQueue({
          type: 'BOOKMARK_OPPORTUNITY',
          data: { opportunityId },
        });
      }
    } catch (error) {
      // Revert optimistic update
      set({ bookmarks: bookmarks.filter(id => id !== opportunityId) });
      throw error;
    }
  },

  // Remove bookmark
  removeBookmark: async (opportunityId) => {
    const { bookmarks } = get();
    
    // Optimistic update
    set({ bookmarks: bookmarks.filter(id => id !== opportunityId) });
    
    try {
      await apiClient.delete(`/api/mobile/opportunities/${opportunityId}/bookmark`);
    } catch (error) {
      // Revert optimistic update
      set({ bookmarks: [...bookmarks, opportunityId] });
      throw error;
    }
  },

  // Update filters
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      opportunities: [],
      nextCursor: null,
      hasMore: true,
    }));
    // Reload with new filters
    get().loadOpportunities(true);
  },

  // Clear filters
  clearFilters: () => {
    set({
      filters: { minProfit: 0, sport: null, market: null },
      opportunities: [],
      nextCursor: null,
      hasMore: true,
    });
    get().loadOpportunities(true);
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
