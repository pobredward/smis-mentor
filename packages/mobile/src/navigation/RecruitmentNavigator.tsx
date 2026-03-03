import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RecruitmentStackParamList } from './types';
import { RecruitmentScreen, JobBoardDetailScreen } from '../screens';
import { JobBoardWriteScreen } from '../screens/JobBoardWriteScreen';

const Stack = createNativeStackNavigator<RecruitmentStackParamList>();

export function RecruitmentNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerBackTitleVisible: false,
        headerTintColor: '#111827',
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerShadowVisible: true,
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
