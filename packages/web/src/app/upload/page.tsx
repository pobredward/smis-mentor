import { redirect } from 'next/navigation';

/**
 * 예전 수업 자료 페이지 (어디에도 링크되지 않음) — 지금은 캠프 → 수업 탭.
 * 이 페이지는 캠프의 모든 템플릿을 대상과 상관없이 자기 자료로 만들어 버려서, 들어오면 수업 탭으로 보낸다.
 */
export default function LegacyUploadPage() {
  redirect('/camp/lesson');
}
