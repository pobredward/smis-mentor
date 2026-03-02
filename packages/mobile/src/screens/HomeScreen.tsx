import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MainTabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SMIS 멘토 앱</Text>
      <Text style={styles.subtitle}>홈 화면 (추후 구현)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
});
