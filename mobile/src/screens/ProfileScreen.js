import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';

export function ProfileScreen() {
  const { user, logout, enableBiometric, biometricEnabled } = useAuthStore();
  const { settings, updateSettings } = useNotificationStore();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
          }
        }
      ]
    );
  }

  async function toggleBiometric() {
    if (!biometricEnabled) {
      try {
        setIsLoading(true);
        await enableBiometric();
        Alert.alert('Success', 'Biometric authentication enabled');
      } catch (error) {
        Alert.alert('Error', error.message);
      } finally {
        setIsLoading(false);
      }
    }
  }

  async function toggleNotifications(value) {
    await updateSettings({ highValueOpportunities: value });
  }

  function renderSettingItem({ icon, title, subtitle, onPress, rightElement }) {
    return (
      <TouchableOpacity style={styles.settingItem} onPress={onPress} disabled={!onPress}>
        <View style={styles.settingIcon}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <View style={styles.settingContent}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
        {rightElement}
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
        <View style={styles.planBadge}>
          <Text style={styles.planText}>{user?.plan || 'Pro Plan'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        
        {renderSettingItem({
          icon: '🔐',
          title: 'Biometric Authentication',
          subtitle: biometricEnabled ? 'Enabled' : 'Tap to enable Face ID / Touch ID',
          onPress: !biometricEnabled ? toggleBiometric : null,
          rightElement: (
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometric}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor={biometricEnabled ? '#fff' : '#888'}
              disabled={isLoading}
            />
          )
        })}

        {renderSettingItem({
          icon: '🔑',
          title: 'Change Password',
          subtitle: 'Update your account password',
          onPress: () => Alert.alert('Coming Soon', 'Password change will be available in the next update')
        })}

        {renderSettingItem({
          icon: '📱',
          title: 'Two-Factor Authentication',
          subtitle: user?.twoFactorEnabled ? 'Enabled' : 'Add extra security',
          onPress: () => Alert.alert('Coming Soon', '2FA setup will be available in the next update')
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        {renderSettingItem({
          icon: '🔔',
          title: 'High-Value Opportunities',
          subtitle: `Alert when profit >= ${settings.minProfitPercent}%`,
          rightElement: (
            <Switch
              value={settings.highValueOpportunities}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor={settings.highValueOpportunities ? '#fff' : '#888'}
            />
          )
        })}

        {renderSettingItem({
          icon: '⏰',
          title: 'Quiet Hours',
          subtitle: `${settings.quietHoursStart} - ${settings.quietHoursEnd}`,
          onPress: () => Alert.alert('Coming Soon', 'Quiet hours configuration will be available soon')
        })}

        {renderSettingItem({
          icon: '⚽',
          title: 'Sports Preferences',
          subtitle: 'Choose which sports to monitor',
          onPress: () => Alert.alert('Coming Soon', 'Sports preferences will be available soon')
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        {renderSettingItem({
          icon: '💰',
          title: 'Default Stake',
          subtitle: '$100 per opportunity',
          onPress: () => Alert.alert('Coming Soon', 'Default stake configuration will be available soon')
        })}

        {renderSettingItem({
          icon: '🌍',
          title: 'Currency',
          subtitle: 'USD ($)',
          onPress: () => Alert.alert('Coming Soon', 'Currency selection will be available soon')
        })}

        {renderSettingItem({
          icon: '🌙',
          title: 'Dark Mode',
          subtitle: 'Always on',
          rightElement: (
            <Switch
              value={true}
              disabled={true}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor={'#fff'}
            />
          )
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        {renderSettingItem({
          icon: '📚',
          title: 'Help Center',
          onPress: () => Alert.alert('Coming Soon', 'Help center will be available soon')
        })}

        {renderSettingItem({
          icon: '💬',
          title: 'Contact Support',
          onPress: () => Alert.alert('Coming Soon', 'Support chat will be available soon')
        })}

        {renderSettingItem({
          icon: '⭐',
          title: 'Rate the App',
          onPress: () => Alert.alert('Coming Soon', 'App store rating will be available soon')
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        
        {renderSettingItem({
          icon: '📋',
          title: 'Terms of Service',
          onPress: () => Alert.alert('Coming Soon', 'Terms will be available soon')
        })}

        {renderSettingItem({
          icon: '🔒',
          title: 'Privacy Policy',
          onPress: () => Alert.alert('Coming Soon', 'Privacy policy will be available soon')
        })}

        {renderSettingItem({
          icon: '📦',
          title: 'Version',
          subtitle: '1.0.0 (Build 1)',
        })}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Surebet Detector © 2026</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0a0a0a',
  },
  email: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  planBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planText: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  settingSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    margin: 16,
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 12,
  },
});
