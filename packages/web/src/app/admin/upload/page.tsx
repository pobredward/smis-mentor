import { redirect } from 'next/navigation';

/** 예전 주소 — 수업 템플릿 관리는 /admin/lesson-templates 로 옮겼다 (즐겨찾기·옛 링크용) */
export default function LegacyAdminUploadPage() {
  redirect('/admin/lesson-templates');
}
