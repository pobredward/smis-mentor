import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationTestScreen } from '../screens/NotificationTestScreen';
import { PrivacyPolicyScreen } from '../screens/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '../screens/TermsOfServiceScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// 라이트 테마 설정
const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#3b82f6',
    background: '#ffffff',
    card: '#ffffff',
    text: '#1e293b',
    border: '#e2e8f0',
    notification: '#3b82f6',
  },
};

// 딥링킹 설정
const linking = {
  prefixes: ['smismentor://', 'https://smis-mentor.com'],
  config: {
    screens: {
      MainTabs: 'tabs',
      TaskDetail: 'camp/tasks/:taskId',
      Settings: 'settings',
      NotificationTest: 'notification-test',
      PrivacyPolicy: 'privacy-policy',
      TermsOfService: 'terms-of-service',
    },
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={CustomLightTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen 
          name="TaskDetail" 
          component={TaskDetailScreen}
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{
            headerShown: true,
            title: '설정',
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="NotificationTest" 
          component={NotificationTestScreen}
          options={{
            headerShown: true,
            title: '푸시 알림 테스트',
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="PrivacyPolicy" 
          component={PrivacyPolicyScreen}
          options={{
            headerShown: true,
            title: '개인정보처리방침',
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="TermsOfService" 
          component={TermsOfServiceScreen}
          options={{
            headerShown: true,
            title: '서비스 이용약관',
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
