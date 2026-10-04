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
  ChatListScreen,
} from '../screens';
import { useAuth } from '../context/AuthContext';
import { useChatUnread } from '../hooks/useChatUnread';
import { useChatPushNavigation } from '../hooks/useChatPushNavigation';
import { L, isChatStaff, unreadBadgeText } from '@smis-mentor/shared';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const hasAnyJobCode = (userData?.jobExperiences?.length ?? 0) > 0;
  // 채팅 — 관리자·멘토·원어민(활성) 계정. 탭은 캠프가 하나라도 있거나 관리자일 때
  const chatStaff = isChatStaff(userData);
  const showChatTab = chatStaff && (hasAnyJobCode || isAdmin);
  // 방 목록·안 읽은 수 구독은 여기 한 곳에서 (탭 배지 · 앱 아이콘 배지 · 채팅 화면들이 같이 쓴다)
  const chatUnread = useChatUnread(userData?.userId, chatStaff);
  // 채팅 알림을 눌렀을 때 그 방 열기
  useChatPushNavigation(chatStaff, showChatTab);

  return (
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
            title: L('nav.camp'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="school" size={size} color={color} />
            ),
          }}
        />
        {/* 채팅 (카톡방 대체) — 게시판 탭 자리. 게시판 화면·코드는 남겨 두었다 */}
        {showChatTab && (
          <Tab.Screen
            name="Chat"
            component={ChatListScreen}
            options={{
              title: L('nav.chat'),
              tabBarBadge: chatUnread > 0 ? unreadBadgeText(chatUnread) : undefined,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
              ),
            }}
          />
        )}
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: L('common.myPage'),
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
  );
}
