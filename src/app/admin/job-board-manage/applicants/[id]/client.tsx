'use client';

import Layout from '@/components/common/Layout';
import { ApplicantsManageClient as MainClient } from './ApplicantsManageClient';

interface Props {
  jobBoardId: string;
}

export function ApplicantsManageClient({ jobBoardId }: Props) {
  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MainClient jobBoardId={jobBoardId} />
      </div>
    </Layout>
  );
} 