import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';

export function BetsScreen() {
  const [bets, setBets] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState('active'); // active, settled, all

  useEffect(() => {
    loadBets();
  }, []);

  async function loadBets() {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/api/bets`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBets(data.bets || []);
      }
    } catch (error) {
      console.error('Failed to load bets:', error);
    }
  }

  async function onRefresh() {
    setIsRefreshing(true);
    await loadBets();
    setIsRefreshing(false);
  }

  function getFilteredBets() {
    switch (filter) {
      case 'active':
        return bets.filter(b => b.status === 'pending' || b.status === 'placed');
      case 'settled':
        return bets.filter(b => b.status === 'won' || b.status === 'lost');
      default:
        return bets;
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'won':
        return '#00ff88';
      case 'lost':
        return '#ff4444';
      case 'placed':
        return '#00ccff';
      case 'pending':
        return '#ffcc00';
      default:
        return '#888';
    }
  }

  function renderBet({ item }) {
    const isWin = item.status === 'won';
    const profit = isWin ? item.stake * (item.odds - 1) : -item.stake;
    
    return (
      <View style={styles.betCard}>
        <View style={styles.betHeader}>
          <View style={styles.matchInfo}>
            <Text style={styles.match}>{item.match}</Text>
            <Text style={styles.league}>{item.league}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.betDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bookmaker</Text>
            <Text style={styles.detailValue}>{item.bookmaker}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Selection</Text>
            <Text style={styles.detailValue}>{item.selection}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Odds</Text>
            <Text style={styles.detailValue}>{item.odds.toFixed(2)}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stake</Text>
            <Text style={styles.detailValue}>${item.stake.toFixed(2)}</Text>
          </View>
          
          {item.status !== 'pending' && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Profit/Loss</Text>
              <Text style={[styles.profitValue, { color: profit >= 0 ? '#00ff88' : '#ff4444' }]}>
                {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.betFooter}>
          <Text style={styles.timestamp}>
            Placed {format(new Date(item.placedAt), 'MMM d, HH:mm')}
          </Text>
          {item.arbitrageId && (
            <View style={styles.arbitrageBadge}>
              <Text style={styles.arbitrageText}>Arbitrage #{item.arbitrageId.slice(-4)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  const filtered = getFilteredBets();
  const totalProfit = filtered
    .filter(b => b.status === 'won' || b.status === 'lost')
    .reduce((sum, b) => sum + (b.status === 'won' ? b.stake * (b.odds - 1) : -b.stake), 0);

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{filtered.length}</Text>
          <Text style={styles.summaryLabel}>Bets</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: totalProfit >= 0 ? '#00ff88' : '#ff4444' }]}>
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </Text>
          <Text style={styles.summaryLabel}>Total P/L</Text>
        </View>
      </View>

      <View style={styles.filterContainer}>
        {['active', 'settled', 'all'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderBet}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#00ff88" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No bets found</Text>
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
  summary: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  summaryValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
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
  betCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  betHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  matchInfo: {
    flex: 1,
  },
  match: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  league: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  betDetails: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    color: '#666',
    fontSize: 13,
  },
  detailValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  profitValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  betFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
  arbitrageBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  arbitrageText: {
    color: '#888',
    fontSize: 11,
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
