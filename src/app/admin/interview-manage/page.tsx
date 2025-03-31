import { InterviewManageClient } from './InterviewManageClient';

export const metadata = {
  title: '면접 관리 - SMIS Mentor',
  description: '면접일 및 면접 대상 유저들을 관리합니다.',
};

export default function InterviewManagePage() {
  return (
    <>
      <InterviewManageClient />
    </>
  );
} 