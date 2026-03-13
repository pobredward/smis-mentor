import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '반명단 | SMIS Mentor',
  description: '캠프 반명단 관리',
};

export default function ClassPage() {
  return <CampClient initialTab="class" />;
}
