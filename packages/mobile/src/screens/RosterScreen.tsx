import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClassScreen } from './ClassScreen';
import { RoomScreen } from './RoomScreen';
import { DepartureScreen } from './DepartureScreen';
import { ArrivalScreen } from './ArrivalScreen';
import { useAuth } from '../context/AuthContext';
import { jobCodesService, stSheetService } from '../services';
import { CampCode } from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

type RosterSubTab = 'class' | 'room' | 'departure' | 'arrival';

interface SubTabDef {
  id: RosterSubTab;
  title: string;
}

export function RosterScreen() {
  const { userData } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<RosterSubTab>('class');
  // 캠프 타입 — 확인 전(null)에는 세부탭 줄을 비워 둔다 (반·방만 보였다가 입소·퇴소가 늦게 붙는 깜빡임 방지).
  // 한 번 알아낸 타입은 캠프별로 기억해 다음 진입 때 바로 쓴다.
  const [campType, setCampType] = useState<string | null>(null);
  const isEJCamp = campType === 'EJ';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함
  useEffect(() => {
    if (!activeJobCodeId) { setCampType(null); return; }
    let alive = true;
    const key = `SMIS_CAMP_TYPE_${activeJobCodeId}`;
    AsyncStorage.getItem(key).then((v) => { if (alive && v) setCampType((cur) => cur ?? v); }).catch(() => {});
    jobCodesService.campCodeOf(activeJobCodeId).then((code) => {
      if (!alive || !code) return;
      const type = stSheetService.getCampType(code as CampCode);
      setCampType(type);
      AsyncStorage.setItem(key, type).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeJobCodeId]);

  const subTabs: SubTabDef[] = [
    { id: 'class', title: L('students.class') },
    { id: 'room', title: L('students.room') },
    ...(isEJCamp
      ? [
          { id: 'departure' as const, title: L('students.arrival') },
          { id: 'arrival' as const, title: L('students.departure') },
        ]
      : []),
  ];

  // EJ 캠프가 아닌데 departure/arrival 탭이 활성화된 경우 초기화
  useEffect(() => {
    if (campType !== null && !isEJCamp && (activeSubTab === 'departure' || activeSubTab === 'arrival')) {
      setActiveSubTab('class');
    }
  }, [campType, isEJCamp, activeSubTab]);

  return (
    <View style={styles.container}>
      {/* 세부 탭 바 */}
      <View style={styles.subTabBar}>
        {campType === null && <View style={[styles.subTab, { opacity: 0 }]}><Text style={styles.subTabText}> </Text></View>}
        {campType !== null && subTabs.map((tab) => (
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
