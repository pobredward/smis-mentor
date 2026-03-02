'use client';

import { ApplicantsManageClient as MainClient } from './ApplicantsManageClient';

interface Props {
  jobBoardId: string;
}

export function ApplicantsManageClient({ jobBoardId }: Props) {
  return <MainClient jobBoardId={jobBoardId} />;
} 