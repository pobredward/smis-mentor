import React from 'react';
import { CampContentList } from '../components/CampContentList';

export function EducationScreen() {
  return (
    <CampContentList
      category="education"
      linkType="educationLinks"
      categoryTitle="교육 자료"
    />
  );
}
