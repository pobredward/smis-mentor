'use client';

import Layout from '@/components/common/Layout';
import LessonPlanEditor from '@/components/lessonPlan/LessonPlanEditor';

export default function LessonPlanPage({ bookKey, planId, sampleKey }: { bookKey?: string; planId?: string; sampleKey?: string }) {
  return (
    <Layout requireAuth>
      <LessonPlanEditor key={`${planId ?? ''}|${bookKey ?? ''}|${sampleKey ?? ''}`} bookKey={bookKey} planId={planId} sampleKey={sampleKey} />
    </Layout>
  );
}
