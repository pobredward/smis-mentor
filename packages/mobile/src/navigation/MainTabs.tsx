import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabsParamList } from './types';
import { RecruitmentNavigator } from './RecruitmentNavigator';
import { AdminNavigator } from './AdminNavigator';
import {
  HomeScreen,
  CampScreen,
  ProfileScreen,
} from '../screens';
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: '홈' }}
      />
      <Tab.Screen
        name="Recruitment"
        component={RecruitmentNavigator}
        options={{ title: '채용' }}
      />
      <Tab.Screen
        name="Camp"
        component={CampScreen}
        options={{ title: '캠프' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: '마이페이지' }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminNavigator}
          options={{ title: '관리자', headerShown: false }}
        />
      )}
    </Tab.Navigator>
  );
}
