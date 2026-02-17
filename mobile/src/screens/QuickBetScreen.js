import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

export function QuickBetScreen({ route, navigation }) {
  const { opportunity } = route.params;
  const [stake, setStake] = useState('');
  const [selectedBet, setSelectedBet] = useState(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const totalStake = parseFloat(stake) || 0;
  
  function calculateStakes() {
    if (!totalStake) return [];
    
    // Calculate proportional stakes based on odds
    const totalImpliedProb = opportunity.bets.reduce((sum, bet) => sum + (1 / bet.odds), 0);
    
    return opportunity.bets.map(bet => ({
      ...bet,
      stake: (totalStake * (1 / bet.odds)) / totalImpliedProb,
      profit: (totalStake * (1 / bet.odds)) / totalImpliedProb * bet.odds - totalStake,
    }));
  }

  async function placeBet() {
    if (!selectedBet || !totalStake) {
      Alert.alert('Error', 'Please select a bet and enter stake amount');
      return;
    }

    setIsPlacing(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      Alert.alert(
        'Bet Placed!',
        `Your bet has been placed with ${selectedBet.bookmaker}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to place bet. Please try again.');
    } finally {
      setIsPlacing(false);
    }
  }

  const calculatedStakes = calculateStakes();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.match}>{opportunity.homeTeam} vs {opportunity.awayTeam}</Text>
        <View style={styles.profitBadge}>
          <Text style={styles.profitText}>+{opportunity.profitPercent.toFixed(2)}% Profit</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Total Stake</Text>
        <View style={styles.stakeInput}>
          <Text style={styles.currency}>€</Text>
          <TouchableOpacity style={styles.stakeButton} onPress={() => setStake('50')}>
            <Text style={styles.stakeButtonText}>50</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stakeButton} onPress={() => setStake('100')}>
            <Text style={styles.stakeButtonText}>100</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stakeButton} onPress={() => setStake('250')}>
            <Text style={styles.stakeButtonText}>250</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stakeButton} onPress={() => setStake('500')}>
            <Text style={styles.stakeButtonText}>500</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Bookmaker</Text>
        <View style={styles.betsList}>
          {opportunity.bets.map((bet, index) => {
            const calculated = calculatedStakes[index];
            const isSelected = selectedBet?.bookmaker === bet.bookmaker;
            
            return (
              <TouchableOpacity
                key={index}
                style={[styles.betCard, isSelected && styles.betCardSelected]}
                onPress={() => setSelectedBet(bet)}
              >
                <View style={styles.betHeader}>
                  <Text style={styles.bookmakerName}>{bet.bookmaker}</Text>
                  <Text style={styles.odds}>{bet.odds.toFixed(2)}</Text>
                </View>
                
                <Text style={styles.outcome}>{bet.outcome}</Text>
                
                {calculated && (
                  <View style={styles.calculatedStake}>
                    <Text style={styles.stakeLabel}>Stake:</Text>
                    <Text style={styles.stakeValue}>€{calculated.stake.toFixed(2)}</Text>
                    <Text style={styles.profitLabel}>Profit:</Text>
                    <Text style={styles.profitValue}>+€{calculated.profit.toFixed(2)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Stake</Text>
          <Text style={styles.summaryValue}>€{totalStake.toFixed(2)}</Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Expected Profit</Text>
          <Text style={[styles.summaryValue, styles.profitValue]}>
            +€{(totalStake * opportunity.profitPercent / 100).toFixed(2)}
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>ROI</Text>
          <Text style={[styles.summaryValue, styles.profitValue]}>
            {opportunity.profitPercent.toFixed(2)}%
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.placeButton, (!selectedBet || !totalStake) && styles.placeButtonDisabled]}
        onPress={placeBet}
        disabled={!selectedBet || !totalStake || isPlacing}
      >
        <Text style={styles.placeButtonText}>
          {isPlacing ? 'Placing Bet...' : 'Place Bet'}
        </Text>
      </TouchableOpacity>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          By placing this bet, you confirm you understand the risks involved 
          in sports betting. Always gamble responsibly.
        </Text>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  match: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  profitBadge: {
    backgroundColor: '#00ff88',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  profitText: {
    color: '#0a0a0a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  stakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currency: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 8,
  },
  stakeButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  stakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  betsList: {
    gap: 12,
  },
  betCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#333',
  },
  betCardSelected: {
    borderColor: '#00ff88',
    backgroundColor: '#0a2a1a',
  },
  betHeader: {
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  outcome: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  calculatedStake: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 12,
    borderRadius: 8,
  },
  stakeLabel: {
    color: '#666',
    fontSize: 12,
    marginRight: 4,
  },
  stakeValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 16,
  },
  profitLabel: {
    color: '#666',
    fontSize: 12,
    marginRight: 4,
  },
  profitValue: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    padding: 16,
    backgroundColor: '#1a1a1a',
    margin: 16,
    borderRadius: 12,
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
  placeButton: {
    backgroundColor: '#00ff88',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  placeButtonDisabled: {
    opacity: 0.5,
  },
  placeButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disclaimer: {
    padding: 16,
    paddingTop: 0,
  },
  disclaimerText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
