'use client';

import { useState } from 'react';
import Layout from '@/components/common/Layout';
import JobBoardListContent from '@/components/recruitment/JobBoardListContent';
import JobApplyStatusContent from '@/components/recruitment/JobApplyStatusContent';
import ReviewsContent from '@/components/recruitment/ReviewsContent';

type TabName = 'jobBoard' | 'application' | 'review' | 'inquiry';

const tabs: { id: TabName; title: string }[] = [
  { id: 'jobBoard', title: '캠프 공고' },
  { id: 'application', title: '지원 현황' },
  { id: 'review', title: '멘토 후기' },
  { id: 'inquiry', title: '채용 문의' },
];

export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<TabName>('jobBoard');

  return (
    <Layout>
      {/* 커스텀 탭 바 */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
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
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 mt-6">
        {activeTab === 'jobBoard' && <JobBoardListContent />}
        {activeTab === 'application' && <JobApplyStatusContent />}
        {activeTab === 'review' && <ReviewsContent />}
        {activeTab === 'inquiry' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
            <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">채용 문의</h3>
            <p className="text-gray-600 mb-4">채용 관련 문의사항이 있으시면 아래 연락처로 문의해주세요.</p>
            <div className="space-y-2">
              <a href="tel:010-7656-7933" className="block text-blue-600 hover:text-blue-700">
                📞 010-7656-7933
              </a>
              <a href="http://pf.kakao.com/_Axafxcb/chat" target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-700">
                💬 카카오톡 채널
              </a>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
