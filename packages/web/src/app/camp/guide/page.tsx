import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '숙소 | SMIS Mentor',
  description: '캠프 숙소 배치도 — 방 명단·용도·선생님 위치',
};

export default function GuidePage() {
  return <CampClient initialTab="guide" />;
}
