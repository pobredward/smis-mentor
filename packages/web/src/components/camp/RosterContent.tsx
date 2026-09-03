'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ClassContent from './ClassContent';
import RoomContent from './RoomContent';
import FamilyContent from './FamilyContent';
import DepartureContent from './DepartureContent';
import ArrivalContent from './ArrivalContent';

type RosterSubTab = 'class' | 'room' | 'departure' | 'arrival';

interface RosterContentProps {
  isFamilyCamp: boolean;
  isEJCamp: boolean;
}

export default function RosterContent({ isFamilyCamp, isEJCamp }: RosterContentProps) {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  const [activeSubTab, setActiveSubTab] = useState<RosterSubTab>('class');

  const subTabs: { id: RosterSubTab; title: string }[] = [
    { id: 'class', title: isForeign ? 'Class' : '반명단' },
    {
      id: 'room',
      title: isForeign
        ? (isFamilyCamp ? 'Family' : 'Room')
        : (isFamilyCamp ? '가족명단' : '방명단'),
    },
    // 입소/퇴소 명단은 E/J 캠프에만 노출
    ...(isEJCamp
      ? [
          { id: 'departure' as RosterSubTab, title: '입소명단' },
          { id: 'arrival' as RosterSubTab, title: '퇴소명단' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 세부탭 바 */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
                activeSubTab === tab.id
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.title}
              {activeSubTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 세부탭 컨텐츠 */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'class' ? (
          <ClassContent />
        ) : activeSubTab === 'room' ? (
          isFamilyCamp ? <FamilyContent /> : <RoomContent />
        ) : activeSubTab === 'departure' ? (
          <DepartureContent />
        ) : activeSubTab === 'arrival' ? (
          <ArrivalContent />
        ) : null}
      </div>
    </div>
  );
}
