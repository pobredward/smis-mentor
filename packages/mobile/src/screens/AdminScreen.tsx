import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackScreenProps } from '../navigation/types';

type AdminMenuItem = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  screenName: keyof import('../navigation/types').AdminStackParamList;
};

const adminMenuItems: AdminMenuItem[] = [
  {
    id: '1',
    title: '임시 사용자 생성',
    description: '교육생을 위한 임시 계정을 생성합니다.',
    icon: 'person-add',
    iconColor: '#10b981',
    screenName: 'UserGenerate',
  },
  {
    id: '2',
    title: '업무 생성 & 관리',
    description: '새로운 업무를 생성하고 관리합니다.',
    icon: 'briefcase',
    iconColor: '#3b82f6',
    screenName: 'JobGenerate',
  },
  {
    id: '3',
    title: '지원 유저 관리',
    description: '공고별 지원자를 확인하고 관리합니다.',
    icon: 'document-text',
    iconColor: '#8b5cf6',
    screenName: 'JobBoardManage',
  },
  {
    id: '4',
    title: '면접 관리',
    description: '면접 일정 및 링크를 관리합니다.',
    icon: 'videocam',
    iconColor: '#ec4899',
    screenName: 'InterviewManage',
  },
  {
    id: '5',
    title: '사용자 관리',
    description: '사용자 정보를 수정, 삭제 및 기타 기능 수행.',
    icon: 'people',
    iconColor: '#eab308',
    screenName: 'UserManage',
  },
  {
    id: '6',
    title: '사용자 조회',
    description: '캠프에 참여했던 유저를 기수별로 조회합니다.',
    icon: 'search',
    iconColor: '#ef4444',
    screenName: 'UserCheck',
  },
  {
    id: '7',
    title: '사용자 지도',
    description: '사용자 주소를 지도에 시각화합니다.',
    icon: 'map',
    iconColor: '#14b8a6',
    screenName: 'UserMap',
  },
  {
    id: '8',
    title: '수업자료 템플릿 관리',
    description: '수업자료 템플릿을 관리합니다.',
    icon: 'folder',
    iconColor: '#06b6d4',
    screenName: 'Upload',
  },
  {
    id: '9',
    title: '앱 설정 관리',
    description: '스플래시 로딩 문구를 관리합니다.',
    icon: 'settings',
    iconColor: '#f59e0b',
    screenName: 'AppConfig',
  },
];

import { AdminStackParamList } from '../navigation/types';

export function AdminScreen({ navigation }: AdminStackScreenProps<'AdminDashboard'>) {
  const handleMenuPress = (screenName: keyof AdminStackParamList) => {
    navigation.navigate(screenName as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>관리자 대시보드</Text>
          <Text style={styles.headerSubtitle}>업무 및 멘토 관리를 위한 관리자 기능</Text>
        </View>

        <View style={styles.menuGrid}>
          {adminMenuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuCard}
              onPress={() => handleMenuPress(item.screenName)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${item.iconColor}15` }]}>
                <Ionicons name={item.icon} size={24} color={item.iconColor} />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  menuGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  menuDescription: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 15,
  },
});
