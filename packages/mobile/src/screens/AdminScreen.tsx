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
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  screenName: keyof import('../navigation/types').AdminStackParamList;
};

type AdminSection = {
  title: string;
  items: AdminMenuItem[];
};

const adminSections: AdminSection[] = [
  {
    title: '채용 관련',
    items: [
      {
        id: '1',
        title: '지원 유저 관리',
        icon: 'document-text',
        iconColor: '#8b5cf6',
        screenName: 'JobBoardManage',
      },
      {
        id: '2',
        title: '면접 관리',
        icon: 'videocam',
        iconColor: '#ec4899',
        screenName: 'InterviewManage',
      },
      {
        id: '3',
        title: '사용자 관리',
        icon: 'people',
        iconColor: '#eab308',
        screenName: 'UserManage',
      },
    ],
  },
  {
    title: '교육 관련',
    items: [
      {
        id: '4',
        title: '캠프별 유저 조회',
        icon: 'search',
        iconColor: '#ef4444',
        screenName: 'UserCheck',
      },
      {
        id: '5',
        title: '수업 템플릿 관리',
        icon: 'folder',
        iconColor: '#06b6d4',
        screenName: 'Upload',
      },
    ],
  },
  {
    title: '기타',
    items: [
      {
        id: '6',
        title: '로딩문구 관리',
        icon: 'settings',
        iconColor: '#f59e0b',
        screenName: 'AppConfig',
      },
      {
        id: '7',
        title: '사용자 지도',
        icon: 'map',
        iconColor: '#14b8a6',
        screenName: 'UserMap',
      },
      {
        id: '8',
        title: '임시 사용자 생성',
        icon: 'person-add',
        iconColor: '#10b981',
        screenName: 'UserGenerate',
      },
      {
        id: '9',
        title: '업무 생성',
        icon: 'briefcase',
        iconColor: '#3b82f6',
        screenName: 'JobGenerate',
      },
    ],
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
        </View>

        {adminSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuGrid}>
              {section.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuCard}
                  onPress={() => handleMenuPress(item.screenName)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: `${item.iconColor}15` }]}>
                    <Ionicons name={item.icon} size={20} color={item.iconColor} />
                  </View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
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
    marginBottom: 20,
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
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  menuTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
});
