import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../store/authStore';

export function BiometricGuard({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { biometricEnabled, authenticateWithBiometric } = useAuthStore();

  useEffect(() => {
    checkAuthentication();
  }, []);

  async function checkAuthentication() {
    if (!biometricEnabled) {
      setIsAuthenticated(true);
      setIsChecking(false);
      return;
    }

    try {
      const success = await authenticateWithBiometric();
      setIsAuthenticated(success);
    } catch (error) {
      console.error('Biometric check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsChecking(false);
    }
  }

  if (isChecking) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Authenticating...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <Modal visible={true} animationType="fade" transparent={true}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Authentication Required</Text>
            <Text style={styles.description}>
              Please authenticate to access Surebet Detector
            </Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={checkAuthentication}
            >
              <Text style={styles.buttonText}>Authenticate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
