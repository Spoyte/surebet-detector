import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { apiClient } from '../api/client';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  biometricEnabled: false,
  
  checkAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
      
      if (token) {
        // Validate token with server using API client
        const { data } = await apiClient.post('/api/mobile/auth/verify');
        
        set({ 
          user: data.user, 
          isAuthenticated: true, 
          isLoading: false,
          biometricEnabled: biometricEnabled === 'true'
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Token invalid, clear it
      await AsyncStorage.removeItem('auth_token');
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },
  
  login: async (email, password) => {
    try {
      const { data } = await apiClient.post('/api/mobile/auth/login', { email, password });
      
      const { token, refreshToken, user } = data;
      await AsyncStorage.setItem('auth_token', token);
      if (refreshToken) {
        await AsyncStorage.setItem('refresh_token', refreshToken);
      }
      
      set({ user, isAuthenticated: true });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },
  
  logout: async () => {
    try {
      // Notify server of logout
      await apiClient.post('/api/mobile/auth/logout');
    } catch (error) {
      // Ignore error, still logout locally
    } finally {
      await AsyncStorage.multiRemove(['auth_token', 'refresh_token', 'biometric_enabled']);
      // Clear API cache on logout
      await apiClient.clearCache();
      set({ user: null, isAuthenticated: false, biometricEnabled: false });
    }
  },
  
  enableBiometric: async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        throw new Error('Biometric authentication not available');
      }
      
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        throw new Error('No biometric credentials enrolled');
      }
      
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric login',
        fallbackLabel: 'Use passcode',
      });
      
      if (result.success) {
        await AsyncStorage.setItem('biometric_enabled', 'true');
        // Update server
        await apiClient.post('/api/mobile/auth/biometric', { enabled: true });
        set({ biometricEnabled: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric enable failed:', error);
      throw error;
    }
  },
  
  disableBiometric: async () => {
    try {
      await AsyncStorage.removeItem('biometric_enabled');
      await apiClient.post('/api/mobile/auth/biometric', { enabled: false });
      set({ biometricEnabled: false });
    } catch (error) {
      console.error('Failed to disable biometric:', error);
      throw error;
    }
  },
  
  authenticateWithBiometric: async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access Surebet Detector',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      
      return result.success;
    } catch (error) {
      console.error('Biometric auth failed:', error);
      return false;
    }
  },
  
  updateUser: (updates) => {
    set((state) => ({
      user: { ...state.user, ...updates }
    }));
  },
  
  getAuthToken: async () => {
    return await AsyncStorage.getItem('auth_token');
  }
}));
