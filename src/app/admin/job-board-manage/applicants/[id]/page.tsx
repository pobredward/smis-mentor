import { Metadata } from 'next';
import { ApplicantsManageClient } from './client';

export const metadata: Metadata = {
  title: '지원자 관리 - SMIS Mentor',
  description: '지원자 정보와 지원 현황을 관리할 수 있습니다.',
};

type SegmentParams = { id: string };

interface PageProps {
  params: Promise<SegmentParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <ApplicantsManageClient jobBoardId={id} />;
}