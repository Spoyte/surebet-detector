import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';

export function OpportunitiesScreen() {
  const [opportunities, setOpportunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, live, high-value
  const navigation = useNavigation();

  useEffect(() => {
    loadOpportunities();
  }, []);

  async function loadOpportunities() {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/api/opportunities`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data.opportunities || []);
      }
    } catch (error) {
      console.error('Failed to load opportunities:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function onRefresh() {
    setIsRefreshing(true);
    await loadOpportunities();
    setIsRefreshing(false);
  }

  function getFilteredOpportunities() {
    switch (filter) {
      case 'live':
        return opportunities.filter(o => o.isLive);
      case 'high-value':
        return opportunities.filter(o => o.profitPercent >= 3);
      default:
        return opportunities;
    }
  }

  function renderOpportunity({ item }) {
    const profitColor = item.profitPercent >= 3 ? '#00ff88' : 
                       item.profitPercent >= 1.5 ? '#ffcc00' : '#ff6666';
    
    return (
      <TouchableOpacity
        style={styles.opportunityCard}
        onPress={() => navigation.navigate('OpportunityDetail', { opportunity: item })}
      >
        <View style={styles.header}>
          <View style={styles.sportBadge}>
            <Text style={styles.sportText}>{item.sport}</Text>
          </View>
          {item.isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveIndicator} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          <Text style={[styles.profit, { color: profitColor }]}>
            +{item.profitPercent.toFixed(2)}%
          </Text>
        </View>

        <Text style={styles.match}>{item.homeTeam} vs {item.awayTeam}</Text>
        
        <View style={styles.details}>
          <Text style={styles.detailText}>{item.league}</Text>
          <Text style={styles.detailText}>•</Text>
          <Text style={styles.detailText}>{item.market}</Text>
        </View>

        <View style={styles.bookmakers}>
          {item.bets.map((bet, index) => (
            <View key={index} style={styles.bookmakerRow}>
              <Text style={styles.bookmakerName}>{bet.bookmaker}</Text>
              <Text style={styles.odds}>{bet.odds.toFixed(2)}</Text>
              <Text style={styles.outcome}>{bet.outcome}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.time}>Starts {item.startTime}</Text>
          <TouchableOpacity
            style={styles.quickBetButton}
            onPress={() => navigation.navigate('QuickBet', { opportunity: item })}
          >
            <Text style={styles.quickBetText}>Quick Bet</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  const filtered = getFilteredOpportunities();

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        {['all', 'live', 'high-value'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1).replace('-', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderOpportunity}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#00ff88" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No opportunities found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterButtonActive: {
    backgroundColor: '#00ff88',
    borderColor: '#00ff88',
  },
  filterText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#0a0a0a',
    fontWeight: 'bold',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  opportunityCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sportBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sportText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  profit: {
    marginLeft: 'auto',
    fontSize: 18,
    fontWeight: 'bold',
  },
  match: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  detailText: {
    color: '#888',
    fontSize: 12,
  },
  bookmakers: {
    gap: 8,
    marginBottom: 12,
  },
  bookmakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 8,
    borderRadius: 8,
  },
  bookmakerName: {
    color: '#fff',
    fontSize: 14,
    width: 100,
  },
  odds: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    width: 60,
  },
  outcome: {
    color: '#888',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  time: {
    color: '#666',
    fontSize: 12,
  },
  quickBetButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickBetText: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});
