import { Metadata } from 'next';
import { SharedApplicantsClient } from './client';

export const metadata: Metadata = {
  title: '공유 지원자 정보 - SMIS Mentor',
  description: '임시로 공유된 지원자 정보를 확인할 수 있습니다.',
};

type SegmentParams = { token: string };

interface PageProps {
  params: Promise<SegmentParams>;
}

export default async function SharedApplicantsPage({ params }: PageProps) {
  const { token } = await params;
  return <SharedApplicantsClient token={token} />;
}
