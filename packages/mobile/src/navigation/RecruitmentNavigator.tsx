import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RecruitmentStackParamList } from './types';
import { RecruitmentScreen, JobBoardDetailScreen } from '../screens';
import { JobBoardWriteScreen } from '../screens/JobBoardWriteScreen';

const Stack = createNativeStackNavigator<RecruitmentStackParamList>();

export function RecruitmentNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        contentStyle: {
          backgroundColor: '#f8fafc',
        },
        // 커스텀 헤더로 높이 조절
        header: ({ navigation, route, options, back }) => {
          const title = options.title ?? route.name;
          
          return (
            <View style={styles.customHeader}>
              <View style={styles.headerContent}>
                {back && (
                  <TouchableOpacity
                    onPress={navigation.goBack}
                    style={styles.backButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                  </TouchableOpacity>
                )}
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                <View style={styles.headerRight} />
              </View>
            </View>
          );
        },
      }}
    >
      <Stack.Screen
        name="RecruitmentList"
        component={RecruitmentScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="JobBoardDetail"
        component={JobBoardDetailScreen}
        options={{
          title: '공고 상세',
        }}
      />
      <Stack.Screen
        name="JobBoardWrite"
        component={JobBoardWriteScreen}
        options={{
          title: '공고 작성',
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  customHeader: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42, // 헤더 높이를 48로 줄임 (기본 56)
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerRight: {
    width: 40,
  },
});
