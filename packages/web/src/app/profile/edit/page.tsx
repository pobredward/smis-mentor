import { redirect } from 'next/navigation';

/**
 * 예전 프로필 수정 페이지 — 이제 마이페이지(/profile)에서 섹션마다 제자리 수정한다.
 * 기존 링크·북마크를 위해 /profile 로 보낸다.
 */
export default function EditProfileRedirect() {
  redirect('/profile');
}
