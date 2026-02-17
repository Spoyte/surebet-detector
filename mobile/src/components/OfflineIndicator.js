import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useOfflineStore } from '../store/offlineStore';

export function OfflineIndicator() {
  const { isOnline, pendingActions, isSyncing } = useOfflineStore();
  const translateY = React.useRef(new Animated.Value(-50)).current;

  React.useEffect(() => {
    Animated.spring(translateY, {
      toValue: isOnline ? -50 : 0,
      useNativeDriver: true,
    }).start();
  }, [isOnline]);

  // Don't render if online and no pending actions
  if (isOnline && pendingActions === 0) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY }] },
        isOnline && pendingActions > 0 && styles.syncContainer
      ]}
    >
      {!isOnline ? (
        <View style={styles.offlineContent}>
          <Text style={styles.icon}>📡</Text>
          <Text style={styles.text}>Offline Mode</Text>
          {pendingActions > 0 && (
            <Text style={styles.subtext}>
              {pendingActions} action{pendingActions !== 1 ? 's' : ''} queued
            </Text>
          )}
        </View>
      ) : pendingActions > 0 ? (
        <View style={styles.syncContent}>
          <Text style={styles.icon}>🔄</Text>
          <Text style={styles.syncText}>
            {isSyncing ? 'Syncing...' : `${pendingActions} pending`}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ff6b35',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  syncContainer: {
    backgroundColor: '#00ff88',
    transform: [{ translateY: 0 }],
  },
  offlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  subtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  syncText: {
    color: '#0a0a0a',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
