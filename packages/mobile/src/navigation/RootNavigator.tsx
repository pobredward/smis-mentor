import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import TaskDetailScreen from '../screens/TaskDetailScreen';

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
      MainTabs: {
        screens: {
          Camp: {
            screens: {
              Tasks: 'camp/tasks',
            },
          },
        },
      },
      TaskDetail: {
        path: 'camp/tasks/:taskId',
        parse: {
          taskId: (taskId: string) => taskId,
        },
      },
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
