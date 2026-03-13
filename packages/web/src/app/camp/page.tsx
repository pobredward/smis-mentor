import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: '캠프 | SMIS Mentor',
  description: '캠프 관리 페이지',
};

interface PageProps {
  searchParams: Promise<{
    date?: string;
  }>;
}

export default async function CampPage({ searchParams }: PageProps) {
  const { date } = await searchParams;
  
  // 기본 탭인 '업무'로 리다이렉트
  if (date) {
    redirect(`/camp/tasks?date=${date}`);
  } else {
    redirect('/camp/tasks');
  }

}
