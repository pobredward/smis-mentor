import { redirect } from 'next/navigation';

// 반명단 URL은 명단 탭으로 리다이렉트
export default function ClassPage() {
  redirect('/camp/roster');
}
