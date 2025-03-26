'use client';

import Layout from '@/components/common/Layout';

interface Props {
  jobBoardId: string;
}

export function ApplicantsManageClient({ jobBoardId }: Props) {
  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 컨텐츠는 ApplicantsManageClient.tsx에서 관리됩니다 */}
      </div>
    </Layout>
  );
} 