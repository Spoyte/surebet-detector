import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export function DashboardScreen() {
  // Sample data - would come from API
  const profitData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      data: [120, 180, 95, 220, 150, 310, 275],
      color: () => '#00ff88',
      strokeWidth: 2,
    }],
  };

  const sportDistribution = [
    { name: 'Soccer', value: 45, color: '#00ff88' },
    { name: 'Tennis', value: 25, color: '#00ccff' },
    { name: 'Basketball', value: 20, color: '#ffcc00' },
    { name: 'Other', value: 10, color: '#ff6666' },
  ];

  const stats = [
    { label: 'Total Profit', value: '€1,350', change: '+12.5%', positive: true },
    { label: 'Active Bets', value: '8', change: '2 pending', positive: null },
    { label: 'Win Rate', value: '94.2%', change: '+3.1%', positive: true },
    { label: 'Avg ROI', value: '2.8%', change: '+0.4%', positive: true },
  ];

  const recentActivity = [
    { type: 'win', match: 'Man City vs Liverpool', profit: '+€45', time: '2h ago' },
    { type: 'placed', match: 'Nadal vs Djokovic', stake: '€200', time: '4h ago' },
    { type: 'win', match: 'Lakers vs Warriors', profit: '+€32', time: '6h ago' },
    { type: 'opportunity', match: 'Real Madrid vs Barca', profit: '2.3%', time: '1h ago' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.statCard}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            {stat.change && (
              <Text style={[
                styles.statChange,
                stat.positive === true && styles.positive,
                stat.positive === false && styles.negative,
              ]}>
                {stat.change}
              </Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Profit Trend (7 Days)</Text>
        <LineChart
          data={profitData}
          width={screenWidth - 32}
          height={200}
          chartConfig={{
            backgroundColor: '#1a1a1a',
            backgroundGradientFrom: '#1a1a1a',
            backgroundGradientTo: '#1a1a1a',
            decimalPlaces: 0,
            color: () => '#00ff88',
            labelColor: () => '#888',
            style: {
              borderRadius: 16,
            },
            propsForDots: {
              r: '4',
              strokeWidth: '2',
              stroke: '#00ff88',
            },
          }}
          bezier
          style={styles.chart}
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Sports Distribution</Text>
        <PieChart
          data={sportDistribution.map(s => ({
            name: s.name,
            population: s.value,
            color: s.color,
            legendFontColor: '#fff',
            legendFontSize: 12,
          }))}
          width={screenWidth - 32}
          height={180}
          chartConfig={{
            color: () => '#fff',
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          absolute
        />
      </View>

      <View style={styles.activitySection}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        
        {recentActivity.map((activity, index) => (
          <View key={index} style={styles.activityItem}>
            <View style={[
              styles.activityIcon,
              activity.type === 'win' && styles.winIcon,
              activity.type === 'placed' && styles.placedIcon,
              activity.type === 'opportunity' && styles.opportunityIcon,
            ]} />
            
            <View style={styles.activityContent}>
              <Text style={styles.activityMatch}>{activity.match}</Text>
              <Text style={styles.activityTime}>{activity.time}</Text>
            </View>
            
            <Text style={[
              styles.activityValue,
              activity.profit && activity.profit.startsWith('+') && styles.positive,
            ]}>
              {activity.profit || activity.stake}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: (screenWidth - 44) / 2,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statChange: {
    fontSize: 12,
    color: '#888',
  },
  positive: {
    color: '#00ff88',
  },
  negative: {
    color: '#ff6666',
  },
  chartSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  chart: {
    borderRadius: 16,
  },
  activitySection: {
    padding: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  activityIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  winIcon: {
    backgroundColor: '#00ff88',
  },
  placedIcon: {
    backgroundColor: '#00ccff',
  },
  opportunityIcon: {
    backgroundColor: '#ffcc00',
  },
  activityContent: {
    flex: 1,
  },
  activityMatch: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  activityTime: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  activityValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
