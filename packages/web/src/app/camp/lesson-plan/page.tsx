import { Metadata } from 'next';
import LessonPlanPage from './LessonPlanPage';

export const metadata: Metadata = {
  title: 'Lesson Plan | SMIS CAMP',
  description: '원어민 레슨플랜 작성',
};

interface PageProps {
  searchParams: Promise<{ book?: string; id?: string; sample?: string }>;
}

/** ?book=clue-2 (내 레슨플랜) · ?id=문서id (관리자·지난 레슨플랜) · ?sample=reading (샘플) */
export default async function Page({ searchParams }: PageProps) {
  const { book, id, sample } = await searchParams;
  return <LessonPlanPage bookKey={book} planId={id} sampleKey={sample} />;
}
