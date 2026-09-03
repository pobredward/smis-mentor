import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '명단 | SMIS Mentor',
  description: '캠프 반명단, 방명단, 입소명단, 퇴소명단',
};

export default function RosterPage() {
  return <CampClient initialTab="roster" />;
}
