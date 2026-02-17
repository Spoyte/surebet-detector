import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const useNotificationStore = create((set, get) => ({
  pushToken: null,
  notifications: [],
  unreadCount: 0,
  settings: {
    highValueOpportunities: true,
    minProfitPercent: 2.0,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    enabledSports: [],
    enabledBookmakers: [],
  },
  
  initializeNotifications: async () => {
    try {
      // Load saved settings
      const savedSettings = await AsyncStorage.getItem('notification_settings');
      if (savedSettings) {
        set({ settings: JSON.parse(savedSettings) });
      }
      
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return;
      }
      
      // Get push token
      if (Device.isDevice) {
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: 'your-project-id'
        });
        set({ pushToken: token.data });
        
        // Register with server
        const authToken = await AsyncStorage.getItem('auth_token');
        if (authToken) {
          await fetch(`${API_BASE_URL}/api/notifications/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              pushToken: token.data,
              platform: Device.osName,
            })
          });
        }
      }
      
      // Listen for notifications
      Notifications.addNotificationReceivedListener(notification => {
        get().addNotification(notification);
      });
      
      Notifications.addNotificationResponseReceivedListener(response => {
        const { opportunityId } = response.notification.request.content.data;
        if (opportunityId) {
          // Navigate to opportunity detail
          get().handleNotificationTap(opportunityId);
        }
      });
      
    } catch (error) {
      console.error('Notification initialization failed:', error);
    }
  },
  
  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1
    }));
  },
  
  markAsRead: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.map(n =>
        n.request.identifier === notificationId
          ? { ...n, read: true }
          : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1)
    }));
  },
  
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0
    }));
  },
  
  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    await AsyncStorage.setItem('notification_settings', JSON.stringify(updated));
    set({ settings: updated });
    
    // Sync with server
    try {
      const authToken = await AsyncStorage.getItem('auth_token');
      if (authToken) {
        await fetch(`${API_BASE_URL}/api/notifications/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(updated)
        });
      }
    } catch (error) {
      console.error('Failed to sync notification settings:', error);
    }
  },
  
  handleNotificationTap: (opportunityId) => {
    // This will be handled by navigation
    console.log('Notification tapped:', opportunityId);
  },
  
  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  }
}));
