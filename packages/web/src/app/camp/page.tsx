'use client';

import { useState } from 'react';
import Layout from '@/components/common/Layout';
import LessonContent from '@/components/camp/LessonContent';
import EducationContent from '@/components/camp/EducationContent';
import ScheduleContent from '@/components/camp/ScheduleContent';
import GuideContent from '@/components/camp/GuideContent';
import ClassContent from '@/components/camp/ClassContent';
import RoomContent from '@/components/camp/RoomContent';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room';

const tabs: { id: TabName; title: string }[] = [
  { id: 'education', title: '교육' },
  { id: 'lesson', title: '수업' },
  { id: 'tasks', title: '업무' },
  { id: 'schedule', title: '시간표' },
  { id: 'guide', title: '인솔표' },
  { id: 'class', title: '반명단' },
  { id: 'room', title: '방명단' },
];

export default function CampPage() {
  const [activeTab, setActiveTab] = useState<TabName>('lesson');

  return (
    <Layout>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6">
        {/* 커스텀 탭 바 */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
          <div className="max-w-2xl mx-auto flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
              <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">캠프 정보</h3>
              <p className="text-gray-600">
                {activeTab === 'tasks' && '업무 정보는 추후 제공됩니다.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
