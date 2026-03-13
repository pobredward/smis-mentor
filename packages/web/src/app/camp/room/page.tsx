import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '방명단 | SMIS Mentor',
  description: '캠프 방명단 관리',
};

export default function RoomPage() {
  return <CampClient initialTab="room" />;
}
