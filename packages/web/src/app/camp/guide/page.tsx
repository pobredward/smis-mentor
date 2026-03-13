import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '인솔표 | SMIS Mentor',
  description: '캠프 인솔표 관리',
};

export default function GuidePage() {
  return <CampClient initialTab="guide" />;
}
