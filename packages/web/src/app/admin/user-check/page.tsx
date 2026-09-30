'use client';

/** 멘토 선생님 (관리자 · 캠프 설명회용) — 원어민은 /admin/foreign-teachers */
import CampTeachersShowcase from '@/components/admin/CampTeachersShowcase';

export default function MentorTeachersPage() {
  return <CampTeachersShowcase kind="mentor" />;
}
