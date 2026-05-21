import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CampContentList } from '../components/CampContentList';

export function EducationScreen() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  return (
    <CampContentList
      category="education"
      linkType="educationLinks"
      categoryTitle={isForeign ? 'Education Materials' : '교육 자료'}
      isForeign={isForeign}
    />
  );
}
