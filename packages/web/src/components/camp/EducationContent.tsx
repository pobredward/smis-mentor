'use client';

import { useAuth } from '@/contexts/AuthContext';
import CampContentList from './CampContentList';
import { L } from '@smis-mentor/shared';

export default function EducationContent() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  return (
    <CampContentList
      category="education"
      linkType="educationLinks"
      categoryTitle={L('content.education')}
      allowLinks={false}
      isForeign={isForeign}
      emptyIcon={
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      }
      emptyTitle={L('content.noEducationMaterialsYet')}
      emptyDescription={[L('content.eduEmptyLine1'), L('content.eduEmptyLine2')]}
    />
  );
}
