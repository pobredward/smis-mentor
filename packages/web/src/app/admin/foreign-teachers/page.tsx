'use client';

/** 원어민 선생님 (관리자 · 캠프 설명회용) — 멘토는 /admin/user-check */
import CampTeachersShowcase from '@/components/admin/CampTeachersShowcase';

export default function ForeignTeachersPage() {
  return <CampTeachersShowcase kind="foreign" />;
}
