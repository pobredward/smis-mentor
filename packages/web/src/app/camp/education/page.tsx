import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '교육 | SMIS CAMP',
  description: '캠프 교육 관리',
};

export default function EducationPage() {
  return <CampClient initialTab="education" />;
}
