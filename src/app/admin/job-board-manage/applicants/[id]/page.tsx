import { ApplicantsManageClient } from './ApplicantsManageClient';

export default function Page({ params }: { params: { id: string } }) {
  return <ApplicantsManageClient jobBoardId={params.id} />;
} 