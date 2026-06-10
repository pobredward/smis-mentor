import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { EducationScreen } from './EducationScreen';
import { LessonScreen } from './CampTabs';
import { TasksScreen } from './TasksScreen';
import { ClassScreen } from './ClassScreen';
import { RoomScreen } from './RoomScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { GuideScreen } from './GuideScreen';
import { LocationSharingScreen } from './LocationSharingScreen';
import { useAuth } from '../context/AuthContext';
import { useCampTab, registerNavigateToTasksTab, unregisterNavigateToTasksTab } from '../context/CampTabContext';
import { jobCodesService, stSheetService } from '../services';
import { CampCode } from '@smis-mentor/shared';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room' | 'location';

export function CampScreen() {
  const { userData } = useAuth();
  const { activeTab, setActiveTab } = useCampTab();
  const [isFamilyCamp, setIsFamilyCamp] = useState(false);

  useEffect(() => {
    registerNavigateToTasksTab(() => setActiveTab('tasks'));
    return () => unregisterNavigateToTasksTab();
  }, [setActiveTab]);

  // activeJobCodeId가 바뀔 때마다 F캠프 여부를 직접 판단
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  useEffect(() => {
    if (!activeJobCodeId) { setIsFamilyCamp(false); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then((codes) => {
      if (codes.length > 0 && codes[0].code) {
        setIsFamilyCamp(stSheetService.getCampType(codes[0].code as CampCode) === 'F');
      }
    }).catch(() => {});
  }, [activeJobCodeId]);
  
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  // 관리자가 캠프를 아직 배정하지 않은 경우
  const hasNoCampAssigned =
    userData && (!userData.jobExperiences || userData.jobExperiences.length === 0);

  // F캠프: 반명단(class) 탭 숨기고 방명단(room) 탭만 가족명단으로 표시
  const allTabs: { id: TabName; title: string }[] = isForeign
    ? [
        { id: 'education', title: 'Edu' },
        { id: 'tasks', title: 'Tasks' },
        { id: 'schedule', title: 'Schedule' },
        { id: 'guide', title: 'Guide' },
        ...(!isFamilyCamp ? [{ id: 'class' as TabName, title: 'Class' }] : []),
        { id: 'room', title: isFamilyCamp ? 'Family' : 'Room' },
        { id: 'location', title: 'Map' },
      ]
    : [
        { id: 'education', title: '교육' },
        { id: 'lesson', title: '수업' },
        { id: 'tasks', title: '업무' },
        { id: 'schedule', title: '시간표' },
        { id: 'guide', title: '인솔표' },
        ...(!isFamilyCamp ? [{ id: 'class' as TabName, title: '반명단' }] : []),
        { id: 'room', title: isFamilyCamp ? '가족명단' : '방명단' },
        { id: 'location', title: '위치' },
      ];

  const tabs = allTabs;

  if (hasNoCampAssigned) {
    return (
      <View style={styles.noCampContainer}>
        <Text style={styles.noCampIcon}>⏳</Text>
        <Text style={styles.noCampTitle}>Waiting for camp access</Text>
        <Text style={styles.noCampDescription}>
          You have not been assigned to a camp yet.{'\n'}
          Please wait until an administrator grants you access.
        </Text>
      </View>
    );
  }

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

      {/* 모든 탭 컨텐츠를 미리 마운트 (opacity/zIndex로 제어 — display:none 금지) */}
      <View style={styles.content}>
        <View style={[styles.tabContent, activeTab !== 'education' && styles.hiddenTab]} pointerEvents={activeTab !== 'education' ? 'none' : 'auto'}>
          <EducationScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'lesson' && styles.hiddenTab]} pointerEvents={activeTab !== 'lesson' ? 'none' : 'auto'}>
          <LessonScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'tasks' && styles.hiddenTab]} pointerEvents={activeTab !== 'tasks' ? 'none' : 'auto'}>
          <TasksScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'schedule' && styles.hiddenTab]} pointerEvents={activeTab !== 'schedule' ? 'none' : 'auto'}>
          <ScheduleScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'guide' && styles.hiddenTab]} pointerEvents={activeTab !== 'guide' ? 'none' : 'auto'}>
          <GuideScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'class' && styles.hiddenTab]} pointerEvents={activeTab !== 'class' ? 'none' : 'auto'}>
          <ClassScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'room' && styles.hiddenTab]} pointerEvents={activeTab !== 'room' ? 'none' : 'auto'}>
          <RoomScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'location' && styles.hiddenTab]} pointerEvents={activeTab !== 'location' ? 'none' : 'auto'}>
          <LocationSharingScreen />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noCampContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  noCampIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  noCampTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  noCampDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
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
    // display: 'none' 은 RN에서 컴포넌트를 완전히 언마운트시켜 탭 이동 시 재로딩이 발생함.
    // opacity + zIndex 방식으로 숨기면 마운트 상태를 유지하므로 프리마운트 효과가 보장됨.
    opacity: 0,
    zIndex: -1,
  },
});
