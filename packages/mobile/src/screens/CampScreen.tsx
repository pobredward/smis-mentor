import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { EducationScreen } from './EducationScreen';
import { LessonScreen } from './CampTabs';
import { TasksScreen } from './TasksScreen';
import { ClassScreen } from './ClassScreen';
import { RoomScreen } from './RoomScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { GuideScreen } from './GuideScreen';
import { useAuth } from '../context/AuthContext';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room';

export function CampScreen() {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('schedule');
  
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  
  // 원어민 유저는 '수업' 탭 제외
  const allTabs: { id: TabName; title: string }[] = [
    { id: 'education', title: '교육' },
    { id: 'lesson', title: '수업' },
    { id: 'tasks', title: '업무' },
    { id: 'schedule', title: '시간표' },
    { id: 'guide', title: '인솔표' },
    { id: 'class', title: '반명단' },
    { id: 'room', title: '방명단' },
  ];
  
  const tabs = isForeign 
    ? allTabs.filter(tab => tab.id !== 'lesson')
    : allTabs;

  return (
    <View style={styles.container}>
      {/* 커스텀 탭 바 */}
      <View style={styles.tabBar}>
        <View style={styles.tabBarContent}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                activeTab === tab.id && styles.tabActive,
              ]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.id && styles.tabTextActive,
                ]}
              >
                {tab.title}
              </Text>
              {activeTab === tab.id && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 모든 탭 컨텐츠를 미리 마운트 (display로 제어) */}
      <View style={styles.content}>
        <View style={[styles.tabContent, activeTab !== 'education' && styles.hiddenTab]}>
          <EducationScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'lesson' && styles.hiddenTab]}>
          <LessonScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'tasks' && styles.hiddenTab]}>
          <TasksScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'schedule' && styles.hiddenTab]}>
          <ScheduleScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'guide' && styles.hiddenTab]}>
          <GuideScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'class' && styles.hiddenTab]}>
          <ClassScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'room' && styles.hiddenTab]}>
          <RoomScreen />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBarContent: {
    flexDirection: 'row',
    minHeight: 42,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 42,
  },
  tabActive: {
    // 활성 탭 추가 스타일.
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  tabContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hiddenTab: {
    opacity: 0,
    zIndex: -1,
  },
});
