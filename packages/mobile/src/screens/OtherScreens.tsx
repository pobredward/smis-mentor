import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MainTabScreenProps } from '../navigation/types';

export function SettingsScreen({ navigation }: MainTabScreenProps<'Settings'>) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>설정 화면 (추후 구현)</Text>
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
  text: {
    fontSize: 16,
    color: '#6b7280',
  },
});
