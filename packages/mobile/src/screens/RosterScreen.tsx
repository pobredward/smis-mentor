import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ClassScreen } from './ClassScreen';
import { RoomScreen } from './RoomScreen';
import { DepartureScreen } from './DepartureScreen';
import { ArrivalScreen } from './ArrivalScreen';
import { useAuth } from '../context/AuthContext';
import { jobCodesService, stSheetService } from '../services';
import { CampCode } from '@smis-mentor/shared';

type RosterSubTab = 'class' | 'room' | 'departure' | 'arrival';

interface SubTabDef {
  id: RosterSubTab;
  title: string;
}

export function RosterScreen() {
  const { userData } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<RosterSubTab>('class');
  const [isEJCamp, setIsEJCamp] = useState(false);
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  useEffect(() => {
    if (!activeJobCodeId) { setIsEJCamp(false); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then((codes) => {
      if (codes.length > 0 && codes[0].code) {
        const type = stSheetService.getCampType(codes[0].code as CampCode);
        setIsEJCamp(type === 'EJ');
      }
    }).catch(() => {});
  }, [activeJobCodeId]);

  const subTabs: SubTabDef[] = [
    { id: 'class', title: isForeign ? 'Class' : '반명단' },
    { id: 'room', title: isForeign ? 'Room' : '방명단' },
    ...(isEJCamp
      ? [
          { id: 'departure' as const, title: isForeign ? 'Arrival' : '입소' },
          { id: 'arrival' as const, title: isForeign ? 'Departure' : '퇴소' },
        ]
      : []),
  ];

  // EJ 캠프가 아닌데 departure/arrival 탭이 활성화된 경우 초기화
  useEffect(() => {
    if (!isEJCamp && (activeSubTab === 'departure' || activeSubTab === 'arrival')) {
      setActiveSubTab('class');
    }
  }, [isEJCamp, activeSubTab]);

  return (
    <View style={styles.container}>
      {/* 세부 탭 바 */}
      <View style={styles.subTabBar}>
        {subTabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.subTab, activeSubTab === tab.id && styles.subTabActive]}
            onPress={() => setActiveSubTab(tab.id)}
          >
            <Text style={[styles.subTabText, activeSubTab === tab.id && styles.subTabTextActive]}>
              {tab.title}
            </Text>
            {activeSubTab === tab.id && <View style={styles.subTabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* 탭 콘텐츠 (opacity로 숨김 — 마운트 유지) */}
      <View style={styles.content}>
        <View style={[styles.tabContent, activeSubTab !== 'class' && styles.hiddenTab]} pointerEvents={activeSubTab !== 'class' ? 'none' : 'auto'}>
          <ClassScreen />
        </View>
        <View style={[styles.tabContent, activeSubTab !== 'room' && styles.hiddenTab]} pointerEvents={activeSubTab !== 'room' ? 'none' : 'auto'}>
          <RoomScreen />
        </View>
        {isEJCamp && (
          <>
            <View style={[styles.tabContent, activeSubTab !== 'departure' && styles.hiddenTab]} pointerEvents={activeSubTab !== 'departure' ? 'none' : 'auto'}>
              <DepartureScreen />
            </View>
            <View style={[styles.tabContent, activeSubTab !== 'arrival' && styles.hiddenTab]} pointerEvents={activeSubTab !== 'arrival' ? 'none' : 'auto'}>
              <ArrivalScreen />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 40,
  },
  subTabActive: {},
  subTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  subTabTextActive: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  subTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 1,
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
