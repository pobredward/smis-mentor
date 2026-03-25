import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStackParamList } from './types';
import { AdminScreen } from '../screens/AdminScreen';
import { UserGenerateScreen } from '../screens/UserGenerateScreen';
import { UserManageScreen } from '../screens/UserManageScreen';
import { UserManageDetailScreen } from '../screens/UserManageDetailScreen';
import { JobGenerateScreen } from '../screens/JobGenerateScreen';
import { UserCheckScreen } from '../screens/UserCheckScreen';
import { JobBoardWriteScreen } from '../screens/JobBoardWriteScreen';
import { JobBoardManageScreen } from '../screens/JobBoardManageScreen';
import { JobBoardApplicantsScreen } from '../screens/JobBoardApplicantsScreen';
import { ApplicantDetailScreen } from '../screens/ApplicantDetailScreen';
import { InterviewManageScreen } from '../screens/InterviewManageScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { UserMapScreen } from '../screens/UserMapScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerTitleStyle: {
          fontSize: 16,
          fontWeight: '600',
        },
        // Android 최적화
        ...(Platform.OS === 'android' && {
          headerStatusBarHeight: 0,
        }),
      }}
    >
      <Stack.Screen name="AdminDashboard" component={AdminScreen} />
      <Stack.Screen name="UserGenerate" component={UserGenerateScreen} />
      <Stack.Screen name="JobGenerate" component={JobGenerateScreen} />
      <Stack.Screen name="JobBoardWrite" component={JobBoardWriteScreen} />
      <Stack.Screen name="JobBoardManage" component={JobBoardManageScreen} />
      <Stack.Screen name="JobBoardApplicants" component={JobBoardApplicantsScreen} />
      <Stack.Screen name="ApplicantDetail" component={ApplicantDetailScreen} />
      <Stack.Screen name="InterviewManage" component={InterviewManageScreen} />
      <Stack.Screen name="UserManage" component={UserManageScreen} />
      <Stack.Screen name="UserManageDetail" component={UserManageDetailScreen} />
      <Stack.Screen name="UserCheck" component={UserCheckScreen} />
      <Stack.Screen name="UserMap" component={UserMapScreen} />
      <Stack.Screen name="Upload" component={UploadScreen} />
    </Stack.Navigator>
  );
}
