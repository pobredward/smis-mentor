import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '시간표 | SMIS Mentor',
  description: '캠프 시간표 관리',
};

export default function SchedulePage() {
  return <CampClient initialTab="schedule" />;
}
