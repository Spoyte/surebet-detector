import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import { useAuthStore } from './store/authStore';
import { useNotificationStore } from './store/notificationStore';
import { useOfflineStore } from './store/offlineStore';
import { useLanguageStore } from './store/languageStore';
import { ThemeProvider } from './theme/ThemeProvider';

import { OpportunitiesScreen } from './screens/OpportunitiesScreen';
import { OpportunityDetailScreen } from './screens/OpportunityDetailScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { BetsScreen } from './screens/BetsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { LoginScreen } from './screens/LoginScreen';
import { QuickBetScreen } from './screens/QuickBetScreen';

import { TabBarIcon } from './components/TabBarIcon';
import { BiometricGuard } from './components/BiometricGuard';
import { OfflineIndicator } from './components/OfflineIndicator';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function OpportunitiesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen 
        name="OpportunitiesList" 
        component={OpportunitiesScreen}
        options={{ title: 'Arbitrage Opportunities' }}
      />
      <Stack.Screen 
        name="OpportunityDetail" 
        component={OpportunityDetailScreen}
        options={{ title: 'Opportunity Details' }}
      />
      <Stack.Screen 
        name="QuickBet" 
        component={QuickBetScreen}
        options={{ title: 'Quick Bet' }}
      />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333',
        },
        tabBarActiveTintColor: '#00ff88',
        tabBarInactiveTintColor: '#888',
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Opportunities"
        component={OpportunitiesStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="trending-up" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="pie-chart" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="My Bets"
        component={BetsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="list" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="person" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { initializeNotifications } = useNotificationStore();
  const { initialize: initializeOffline } = useOfflineStore();
  const { initialize: initializeLanguage } = useLanguageStore();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function init() {
      await checkAuth();
      await initializeNotifications();
      await initializeOffline();
      await initializeLanguage();
      setAppReady(true);
    }
    init();
  }, []);

  if (!appReady || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <OfflineIndicator />
        {isAuthenticated ? (
          <BiometricGuard>
            <MainTabs />
          </BiometricGuard>
        ) : (
          <LoginScreen />
        )}
      </NavigationContainer>
    </ThemeProvider>
  );
}
