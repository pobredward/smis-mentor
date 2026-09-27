'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { safeGetItem, safeSetItem } from '@/lib/cacheUtils';
import LessonContent from '@/components/camp/LessonContent';
import EducationContent from '@/components/camp/EducationContent';
import ScheduleContent from '@/components/camp/ScheduleContent';
import LodgingContent from '@/components/camp/lodging/LodgingContent';
import TaskContent from '@/components/camp/TaskContent';
import RosterContent from '@/components/camp/RosterContent';
import PatientContent from '@/components/camp/PatientContent';
import InventoryContent from '@/components/camp/InventoryContent';
import { jobCodesService, stSheetService, CampCode } from '@/lib/stSheetService';
import { hasCampAccess, isCampStaffRole, resolveActiveJobCodeId } from '@smis-mentor/shared';
import { L, isEnglishUI } from '@smis-mentor/shared';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'roster' | 'patient' | 'inventory';

// localStorage 키 정의
const LAST_CAMP_TAB_KEY = 'last_camp_tab';

interface CampClientProps {
  initialTab?: string;
  initialDate?: string;
}

export default function CampClient({ initialTab, initialDate }: CampClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userData } = useAuth();
  
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  const isAdmin = userData?.role === 'admin';
  // admin은 adminTempActiveCamp 또는 activeJobExperienceId가 있으면 캠프 접근 가능
  const adminActiveCampId =
    isAdmin
      ? ((userData as any).adminTempActiveCamp as string | undefined) ||
        userData?.activeJobExperienceId
      : undefined;

  // 활성 캠프 타입 (F 캠프, E/J 캠프 여부 판별용)
  // 캠프 코드 조회(Firestore)가 끝나기 전에는 모르는 상태(null) — 그 사이 명단 세부탭을 잘못 그리지 않도록.
  // 한 번 알아낸 타입은 캠프별로 기억해 다음 접속 때 첫 화면부터 바로 쓴다.
  const activeCampId = resolveActiveJobCodeId(userData);
  const [campType, setCampType] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!activeCampId) return;
    try {
      const cached = window.localStorage.getItem(`SMIS_CAMP_TYPE_${activeCampId}`);
      setCampType(cached || null);
    } catch {
      setCampType(null);
    }
  }, [activeCampId]);
  useEffect(() => {
    if (!activeCampId) return;
    let alive = true;
    jobCodesService.getJobCodesByIds([activeCampId]).then(codes => {
      if (!alive || !codes.length || !codes[0].code) return;
      const type = stSheetService.getCampType(codes[0].code as CampCode);
      setCampType(type);
      try { window.localStorage.setItem(`SMIS_CAMP_TYPE_${activeCampId}`, type); } catch { /* noop */ }
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeCampId, adminActiveCampId, userData?.activeJobExperienceId, userData?.jobExperiences]);
  const isFamilyCamp = campType === 'F';
  const isEJCamp = campType === 'EJ';

  // 관리자가 캠프를 아직 배정하지 않은 경우
  // admin은 임시 활성화(adminTempActiveCamp) 또는 activeJobExperienceId가 있으면 진입 허용
  // 스태프(admin · mentor · foreign)이고 활성 캠프가 있어야 한다. 가입 승인 전 임시 계정은 막는다
  const hasNoCampAssigned = !!userData && !hasCampAccess(userData);
  const isPendingAccount = !!userData && !isCampStaffRole(userData.role);
  
  // 원어민 유저는 '수업' 탭 제외
  const allTabs: { id: TabName; title: string; path: string }[] = [
    { id: 'education', title: L('nav.education'), path: '/camp/education' },
    { id: 'lesson', title: L('nav.lessons'), path: '/camp/lesson' },
    { id: 'tasks', title: L('nav.tasks'), path: '/camp/tasks' },
    { id: 'schedule', title: L('nav.schedule'), path: '/camp/schedule' },
    { id: 'guide', title: L('nav.lodging'), path: '/camp/guide' },
    { id: 'roster', title: L('nav.roster'), path: '/camp/roster' },
    { id: 'patient', title: L('nav.patient'), path: '/camp/patient' },
    { id: 'inventory', title: L('nav.inventory'), path: '/camp/inventory' },
  ];
  
  const tabs = isForeign 
    ? allTabs.filter(tab => tab.id !== 'lesson')
    : allTabs;
  
  // 저장된 탭이 현재 사용자에게 유효한지 검증
  const isValidTabForUser = (tabId: string): boolean => {
    return tabs.some(tab => tab.id === tabId);
  };

  // URL 기반으로 현재 탭 결정
  const getCurrentTab = (): TabName => {
    // 1. initialTab이 있으면 우선 사용
    if (initialTab) {
      const tab = tabs.find(t => t.id === initialTab);
      if (tab) return tab.id;
    }
    
    // 2. localStorage에서 저장된 탭 확인 (initialTab이 없을 때만)
    if (!initialTab) {
      const savedTab = safeGetItem(LAST_CAMP_TAB_KEY);
      if (savedTab && isValidTabForUser(savedTab)) {
        return savedTab as TabName;
      }
    }
    
    // 3. 기본값은 '업무'
    return 'tasks';
  };

  const [activeTab, setActiveTab] = useState<TabName>(getCurrentTab());

  // URL이 변경되면 탭 업데이트
  useEffect(() => {
    const currentTab = getCurrentTab();
    setActiveTab(currentTab);
  }, [initialTab, pathname]);

  const handleTabChange = (tabId: TabName) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      // localStorage에 현재 탭 저장
      safeSetItem(LAST_CAMP_TAB_KEY, tabId);
      
      // 업무 탭이고 날짜가 있으면 날짜 파라미터 포함
      if (tabId === 'tasks' && initialDate) {
        router.push(`${tab.path}?date=${initialDate}`);
      } else {
        router.push(tab.path);
      }
    }
  };

  if (hasNoCampAssigned) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-semibold text-gray-800">
            {isEnglishUI() ? 'Waiting for camp access' : isPendingAccount ? L('nav.awaitingApproval') : L('nav.noCampAssigned')}
          </h2>
          <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
            {isEnglishUI()
              ? 'You have not been assigned to a camp yet. Please wait until an administrator grants you access.'
              : isPendingAccount
                ? L('nav.youCanUseTheCamp')
                : isAdmin
                  ? L('nav.activateACampOnMy')
                  : L('nav.itOpensAsSoonAs')}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* 명단·환자는 화면 높이에 맞춘 고정 높이(안에서 스크롤) → 아래 여백을 빼서 페이지가 한 번 더 스크롤되지 않게.
          나머지 탭은 페이지가 스크롤되므로 아래 여백을 남겨 좁은 화면 하단 탭바(h-16)에 끝이 가리지 않게 */}
      <div className={`-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 ${activeTab === 'roster' || activeTab === 'patient' ? '-mb-6' : 'md:-mb-6'}`}>
        {/* 커스텀 탭 바 */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
          <div className="max-w-2xl mx-auto flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.title}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컨텐츠 — 숙소는 도면이 넓어서 더 넓게 */}
        <div className={`${activeTab === 'guide' ? 'max-w-6xl px-3' : 'max-w-2xl'} mx-auto`}>
          {activeTab === 'education' ? (
            <EducationContent />
          ) : activeTab === 'lesson' ? (
            <LessonContent />
          ) : activeTab === 'tasks' ? (
            <TaskContent />
          ) : activeTab === 'schedule' ? (
            // 좁은 화면에서 표가 화면 끝에 붙지 않게 좌우 여백
            <div className="px-1.5 md:px-0">
              <ScheduleContent />
            </div>
          ) : activeTab === 'guide' ? (
            <LodgingContent />
          ) : activeTab === 'roster' ? (
            <div className="h-[calc(100dvh-176px)] md:h-[calc(100vh-120px)]">
              <RosterContent isFamilyCamp={isFamilyCamp} isEJCamp={isEJCamp} campTypeReady={campType !== null} />
            </div>
          ) : activeTab === 'patient' ? (
            <div className="h-[calc(100dvh-176px)] md:h-[calc(100vh-120px)]">
              <PatientContent />
            </div>
          ) : activeTab === 'inventory' ? (
            <InventoryContent />
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
