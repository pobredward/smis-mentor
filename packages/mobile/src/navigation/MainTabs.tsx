import React from 'react';
import { Text, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabsParamList } from './types';
import { RecruitmentNavigator } from './RecruitmentNavigator';
import { AdminNavigator } from './AdminNavigator';
import {
  HomeScreen,
  CampScreen,
  ProfileScreen,
} from '../screens';
import { useAuth } from '../context/AuthContext';
import { CampTabProvider } from '../context/CampTabContext';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  return (
    <CampTabProvider>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#94a3b8',
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: '600',
          },
          headerStyle: {
            height: Platform.OS === 'android' ? 80 : undefined,
          },
        }}
      >
        {/* 원어민이 아닌 경우에만 '홈' 탭 표시 */}
        {!isForeign && (
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: '홈',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
            }}
          />
        )}
        {/* 원어민이 아닌 경우에만 '채용' 탭 표시 */}
        {!isForeign && (
          <Tab.Screen
            name="Recruitment"
            component={RecruitmentNavigator}
            options={{
              title: '채용',
              headerShown: true,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="briefcase" size={size} color={color} />
              ),
            }}
          />
        )}
        <Tab.Screen
          name="Camp"
          component={CampScreen}
          options={{
            title: '캠프',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="school" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: '마이페이지',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
        {isAdmin && (
          <Tab.Screen
            name="Admin"
            component={AdminNavigator}
            options={{
              title: '관리자',
              headerShown: false,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings" size={size} color={color} />
              ),
            }}
          />
        )}
      </Tab.Navigator>
    </CampTabProvider>
  );
}
