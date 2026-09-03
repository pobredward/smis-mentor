import { redirect } from 'next/navigation';

// 방명단 URL은 명단 탭으로 리다이렉트
export default function RoomPage() {
  redirect('/camp/roster');
}
