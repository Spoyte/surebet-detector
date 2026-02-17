import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_URL || 'https://api.surebet-detector.com';

export function OpportunityDetailScreen({ route, navigation }) {
  const { opportunity } = route.params;
  const [stake, setStake] = useState(100);
  const [calculations, setCalculations] = useState(null);

  useEffect(() => {
    calculateStakes();
  }, [stake]);

  function calculateStakes() {
    const totalStake = parseFloat(stake) || 0;
    const bets = opportunity.bets.map(bet => {
      const impliedProb = 1 / bet.odds;
      const stakeAmount = (totalStake * impliedProb) / opportunity.totalImpliedProbability;
      const profit = (stakeAmount * bet.odds) - totalStake;
      return {
        ...bet,
        stake: stakeAmount,
        profit,
      };
    });
    
    setCalculations({
      totalStake,
      bets,
      guaranteedProfit: bets[0]?.profit || 0,
    });
  }

  async function placeBets() {
    Alert.alert(
      'Confirm Bet Placement',
      `Place ${opportunity.bets.length} bets with total stake $${stake}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Place Bets',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('auth_token');
              const response = await fetch(`${API_BASE_URL}/api/bets/place`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  opportunityId: opportunity.id,
                  stakes: calculations.bets.map(b => ({
                    bookmaker: b.bookmaker,
                    stake: b.stake,
                    odds: b.odds,
                    outcome: b.outcome,
                  })),
                })
              });
              
              if (response.ok) {
                Alert.alert('Success', 'Bets placed successfully!');
                navigation.navigate('My Bets');
              } else {
                throw new Error('Failed to place bets');
              }
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }

  const profitColor = opportunity.profitPercent >= 3 ? '#00ff88' : 
                     opportunity.profitPercent >= 1.5 ? '#ffcc00' : '#ff6666';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.sportBadge}>
          <Text style={styles.sportText}>{opportunity.sport}</Text>
        </View>
        {opportunity.isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        <Text style={[styles.profit, { color: profitColor }]}>
          +{opportunity.profitPercent.toFixed(2)}%
        </Text>
      </View>

      <Text style={styles.match}>
        {opportunity.homeTeam} vs {opportunity.awayTeam}
      </Text>
      
      <View style={styles.details}>
        <Text style={styles.detailText}>{opportunity.league}</Text>
        <Text style={styles.detailText}>•</Text>
        <Text style={styles.detailText}>{opportunity.market}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bookmaker Odds</Text>
        {opportunity.bets.map((bet, index) => (
          <View key={index} style={styles.bookmakerCard}>
            <View style={styles.bookmakerHeader}>
              <Text style={styles.bookmakerName}>{bet.bookmaker}</Text>
              <Text style={styles.odds}>{bet.odds.toFixed(2)}</Text>
            </View>
            <Text style={styles.outcome}>{bet.outcome}</Text>
            {calculations && (
              <View style={styles.stakeInfo}>
                <Text style={styles.stakeText}>
                  Stake: ${calculations.bets[index]?.stake.toFixed(2)}
                </Text>
                <Text style={styles.profitText}>
                  Return: ${(calculations.bets[index]?.stake * bet.odds).toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stake Calculator</Text>
        <View style={styles.stakeInput}>
          <Text style={styles.stakeLabel}>Total Stake ($)</Text>
          <View style={styles.stakeButtons}>
            {[50, 100, 200, 500, 1000].map(amount => (
              <TouchableOpacity
                key={amount}
                style={[styles.stakeButton, stake === amount && styles.stakeButtonActive]}
                onPress={() => setStake(amount)}
              >
                <Text style={[styles.stakeButtonText, stake === amount && styles.stakeButtonTextActive]}>
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        {calculations && (
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Investment</Text>
              <Text style={styles.summaryValue}>${calculations.totalStake.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Guaranteed Profit</Text>
              <Text style={[styles.summaryValue, { color: profitColor }]}>
                +${calculations.guaranteedProfit.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>ROI</Text>
              <Text style={[styles.summaryValue, { color: profitColor }]}>
                +{opportunity.profitPercent.toFixed(2)}%
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match Info</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Start Time</Text>
          <Text style={styles.infoValue}>{opportunity.startTime}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Market</Text>
          <Text style={styles.infoValue}>{opportunity.market}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Confidence</Text>
          <Text style={styles.infoValue}>{opportunity.confidence || 'High'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.placeBetButton} onPress={placeBets}>
        <Text style={styles.placeBetText}>Place All Bets</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    fontSize: 24,
    fontWeight: 'bold',
  },
  match: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  detailText: {
    color: '#888',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  bookmakerCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  bookmakerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookmakerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  odds: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: 'bold',
  },
  outcome: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  stakeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a0a',
    padding: 12,
    borderRadius: 8,
  },
  stakeText: {
    color: '#fff',
    fontSize: 14,
  },
  profitText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
  },
  stakeInput: {
    marginBottom: 16,
  },
  stakeLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  stakeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  stakeButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  stakeButtonActive: {
    backgroundColor: '#00ff88',
    borderColor: '#00ff88',
  },
  stakeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  stakeButtonTextActive: {
    color: '#0a0a0a',
  },
  summary: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    color: '#888',
    fontSize: 14,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
  },
  placeBetButton: {
    backgroundColor: '#00ff88',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  placeBetText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
