'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Layout from '@/components/common/Layout';
import LessonContent from '@/components/camp/LessonContent';
import EducationContent from '@/components/camp/EducationContent';
import ScheduleContent from '@/components/camp/ScheduleContent';
import GuideContent from '@/components/camp/GuideContent';
import ClassContent from '@/components/camp/ClassContent';
import RoomContent from '@/components/camp/RoomContent';
import TaskContent from '@/components/camp/TaskContent';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room';

const tabs: { id: TabName; title: string; path: string }[] = [
  { id: 'education', title: '교육', path: '/camp/education' },
  { id: 'lesson', title: '수업', path: '/camp/lesson' },
  { id: 'tasks', title: '업무', path: '/camp/tasks' },
  { id: 'schedule', title: '시간표', path: '/camp/schedule' },
  { id: 'guide', title: '인솔표', path: '/camp/guide' },
  { id: 'class', title: '반명단', path: '/camp/class' },
  { id: 'room', title: '방명단', path: '/camp/room' },
];

interface CampClientProps {
  initialTab?: string;
  initialDate?: string;
}

export default function CampClient({ initialTab, initialDate }: CampClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // URL 기반으로 현재 탭 결정
  const getCurrentTab = (): TabName => {
    if (initialTab) {
      const tab = tabs.find(t => t.id === initialTab);
      if (tab) return tab.id;
    }
    // 기본값은 '업무'
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
      // 업무 탭이고 날짜가 있으면 날짜 파라미터 포함
      if (tabId === 'tasks' && initialDate) {
        router.push(`${tab.path}?date=${initialDate}`);
      } else {
        router.push(tab.path);
      }
    }
  };

  return (
    <Layout>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6">
        {/* 커스텀 탭 바 */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
          <div className="max-w-2xl mx-auto flex">
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

        {/* 탭 컨텐츠 */}
        <div className="max-w-2xl mx-auto">
          {activeTab === 'education' ? (
            <EducationContent />
          ) : activeTab === 'lesson' ? (
            <LessonContent />
          ) : activeTab === 'tasks' ? (
            <TaskContent />
          ) : activeTab === 'schedule' ? (
            <ScheduleContent />
          ) : activeTab === 'guide' ? (
            <GuideContent />
          ) : activeTab === 'class' ? (
            <div className="h-[calc(100vh-120px)]">
              <ClassContent />
            </div>
          ) : activeTab === 'room' ? (
            <div className="h-[calc(100vh-120px)]">
              <RoomContent />
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
