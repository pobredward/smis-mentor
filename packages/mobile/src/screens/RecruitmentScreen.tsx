import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecruitmentListScreen } from './RecruitmentListScreen';
import { ApplicationStatusScreen, MentorReviewScreen, RecruitmentInquiryScreen } from './RecruitmentTabs';
import { RecruitmentStackParamList } from '../navigation/types';

type TabName = 'jobBoard' | 'application' | 'review' | 'inquiry';

const tabs: { id: TabName; title: string }[] = [
  { id: 'jobBoard', title: '캠프 공고' },
  { id: 'application', title: '지원 현황' },
  { id: 'review', title: '멘토 후기' },
  { id: 'inquiry', title: '채용 문의' },
];

type RecruitmentNavigationProp = NativeStackNavigationProp<RecruitmentStackParamList, 'RecruitmentList'>;
type RecruitmentRouteProp = RouteProp<RecruitmentStackParamList, 'RecruitmentList'>;

export function RecruitmentScreen() {
  const [activeTab, setActiveTab] = useState<TabName>('jobBoard');
  const [refreshKey, setRefreshKey] = useState(0);
  const navigation = useNavigation<RecruitmentNavigationProp>();
  const route = useRoute<RecruitmentRouteProp>();

  // 파라미터로 지원 현황 탭 열기가 전달되면 해당 탭으로 이동
  useEffect(() => {
    if (route.params?.openApplicationTab) {
      setActiveTab('application');
      setRefreshKey(prev => prev + 1);
      
      // 파라미터 초기화 (다음 방문 시 자동으로 열리지 않도록)
      navigation.setParams({ openApplicationTab: undefined });
    }
  }, [route.params?.openApplicationTab, navigation]);

  // 화면이 포커스될 때마다 실행
  useFocusEffect(
    useCallback(() => {
      // 지원 현황 탭이 활성화되어 있으면 새로고침
      if (activeTab === 'application') {
        setRefreshKey(prev => prev + 1);
      }
    }, [activeTab])
  );

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

      {/* 탭 컨텐츠 */}
      <View style={styles.content}>
        <View style={[styles.tabContent, activeTab !== 'jobBoard' && styles.hiddenTab]}>
          <RecruitmentListScreen 
            navigation={navigation as any} 
            route={{ key: 'RecruitmentList', name: 'RecruitmentList' } as any} 
          />
        </View>
        <View style={[styles.tabContent, activeTab !== 'application' && styles.hiddenTab]}>
          <ApplicationStatusScreen key={refreshKey} />
        </View>
        <View style={[styles.tabContent, activeTab !== 'review' && styles.hiddenTab]}>
          <MentorReviewScreen />
        </View>
        <View style={[styles.tabContent, activeTab !== 'inquiry' && styles.hiddenTab]}>
          <RecruitmentInquiryScreen />
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
    minHeight: 48,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  tabActive: {
    // 활성 탭 추가 스타일
  },
  tabText: {
    fontSize: 13,
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
