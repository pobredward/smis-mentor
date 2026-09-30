/**
 * 원어민 경력 (users.teachingExperiences) — 마이페이지에서 본인이 쓰고, 설명회용 '원어민 선생님' 화면에 보인다.
 * 한 항목 = 역할 · 장소 · 기간(시작~끝) · 내용. 기간은 "YYYY" 또는 "YYYY.MM", 진행 중이면 end = "present".
 * (예전 자유 글은 users.teachingExperience 에 원문으로 남아 있다)
 */
export interface TeachingExperienceItem {
  role: string;
  place: string;
  start: string;
  end: string;
  description?: string;
}

export const TEACHING_PERIOD_RE = /^\d{4}(\.(0[1-9]|1[0-2]))?$/;

/** "2019 – Present" / "2015.03 – 2017" */
export function formatTeachingPeriod(it: Pick<TeachingExperienceItem, 'start' | 'end'>): string {
  const s = (it.start ?? '').trim();
  const e = (it.end ?? '').trim();
  const end = e.toLowerCase() === 'present' ? 'Present' : e;
  if (s && end) return s === end ? s : `${s} – ${end}`;
  return s || end || '';
}

/** 최신순 — 진행 중 먼저, 그다음 끝·시작 연도 큰 순 (날짜 없는 항목은 뒤) */
export function sortTeachingExperiences<T extends TeachingExperienceItem>(list: T[]): T[] {
  const key = (v: string) => (v?.toLowerCase() === 'present' ? 999999 : Number(String(v || '').replace('.', '').padEnd(6, '0')) || 0);
  return [...list].sort((a, b) => key(b.end || b.start) - key(a.end || a.start) || key(b.start) - key(a.start));
}

/** 저장 전 정리 — 빈 항목 제거, 공백 정리, 기간 형식 검사 (틀리면 에러 메시지) */
export function cleanTeachingExperiences(list: TeachingExperienceItem[]): { items: TeachingExperienceItem[]; error?: string } {
  const items = list
    .map((i) => ({ role: (i.role ?? '').trim(), place: (i.place ?? '').trim(), start: (i.start ?? '').trim(), end: (i.end ?? '').trim(), description: (i.description ?? '').trim() }))
    .filter((i) => i.role || i.place || i.start || i.end || i.description);
  for (const i of items) {
    if (!i.role && !i.place) return { items, error: 'Please enter a role or a place for each experience.' };
    if (i.start && !TEACHING_PERIOD_RE.test(i.start)) return { items, error: `Start "${i.start}" should be YYYY or YYYY.MM` };
    if (i.end && i.end.toLowerCase() !== 'present' && !TEACHING_PERIOD_RE.test(i.end)) return { items, error: `End "${i.end}" should be YYYY, YYYY.MM or Present` };
  }
  return { items: items.map((i) => ({ ...i, end: i.end.toLowerCase() === 'present' ? 'present' : i.end })) };
}
