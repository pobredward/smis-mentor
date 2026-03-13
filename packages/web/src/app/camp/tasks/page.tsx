import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '업무 | SMIS Mentor',
  description: '캠프 업무 관리',
};

interface PageProps {
  searchParams: Promise<{
    date?: string;
  }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { date } = await searchParams;
  
  return <CampClient initialTab="tasks" initialDate={date} />;
}
