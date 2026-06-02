import { Metadata } from 'next';
import { StudentSearchClient } from './StudentSearchClient';

export const metadata: Metadata = {
  title: '학생 조회 - SMIS Mentor',
};

export default function StudentSearchPage() {
  return <StudentSearchClient />;
}
