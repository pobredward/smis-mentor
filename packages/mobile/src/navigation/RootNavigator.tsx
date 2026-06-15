import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { navigationRef } from '../context/AuthContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import PersonalTaskDetailScreen from '../screens/PersonalTaskDetailScreen';
import { CampDetailScreen } from '../screens/CampDetailScreen';
import { CampEditorScreen } from '../screens/CampEditorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LocationSettingsScreen } from '../screens/LocationSettingsScreen';
import { NotificationTestScreen } from '../screens/NotificationTestScreen';
import { PrivacyPolicyScreen } from '../screens/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '../screens/TermsOfServiceScreen';
import { useAuth } from '../context/AuthContext';
import { ProfileEditScreen } from '../screens/ProfileEditScreen';
import { PostDetailScreen } from '../screens/PostDetailScreen';
import { PostWriteScreen } from '../screens/PostWriteScreen';

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
      CampDetail: 'camp/:category/:itemId',
      CampEditor: 'camp/:category/:itemId/edit',
      Settings: 'settings',
      LocationSettings: 'location-settings',
      NotificationTest: 'notification-test',
      PrivacyPolicy: 'privacy-policy',
      TermsOfService: 'terms-of-service',
    },
  },
};

function AppStack() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="ProfileEdit"
        component={ProfileEditScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="PersonalTaskDetail"
        component={PersonalTaskDetailScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="CampDetail"
        component={CampDetailScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.itemTitle || (isForeign ? 'Detail' : '자료 상세'),
          presentation: 'card',
          animation: 'slide_from_right',
        })}
      />
      <Stack.Screen
        name="CampEditor"
        component={CampEditorScreen}
        options={{
          headerShown: true,
          title: isForeign ? 'Edit Page' : '페이지 편집',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          title: isForeign ? 'Notification Settings' : '설정',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="LocationSettings"
        component={LocationSettingsScreen}
        options={{
          headerShown: true,
          title: isForeign ? 'Location Settings' : '위치 설정',
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
          title: isForeign ? 'Privacy Policy' : '개인정보처리방침',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{
          headerShown: true,
          title: isForeign ? 'Terms of Service' : '서비스 이용약관',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="PostWrite"
        component={PostWriteScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef} theme={CustomLightTheme} linking={linking}>
      <AppStack />
    </NavigationContainer>
  );
}
