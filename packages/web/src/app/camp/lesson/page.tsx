import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '수업 | SMIS CAMP',
  description: '캠프 수업 관리',
};

export default function LessonPage() {
  return <CampClient initialTab="lesson" />;
}
