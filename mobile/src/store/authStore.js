import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';

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
        // Validate token with server
        const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const user = await response.json();
          set({ 
            user, 
            isAuthenticated: true, 
            isLoading: false,
            biometricEnabled: biometricEnabled === 'true'
          });
        } else {
          await AsyncStorage.removeItem('auth_token');
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      set({ isLoading: false });
    }
  },
  
  login: async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }
      
      const { token, user } = await response.json();
      await AsyncStorage.setItem('auth_token', token);
      
      set({ user, isAuthenticated: true });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },
  
  logout: async () => {
    await AsyncStorage.removeItem('auth_token');
    set({ user: null, isAuthenticated: false });
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
        set({ biometricEnabled: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric enable failed:', error);
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
  }
}));
