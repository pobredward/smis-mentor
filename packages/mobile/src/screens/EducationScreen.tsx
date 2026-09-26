import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CampContentList } from '../components/CampContentList';
import { L } from '@smis-mentor/shared';

export function EducationScreen() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  return (
    <CampContentList
      category="education"
      linkType="educationLinks"
      categoryTitle={L('content.educationMaterials')}
      isForeign={isForeign}
    />
  );
}
