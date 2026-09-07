import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '환자 기록 | SMIS Mentor',
  description: '캠프 환자 기록 관리',
};

export default function PatientPage() {
  return <CampClient initialTab="patient" />;
}
