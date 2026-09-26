/**
 * 내원 인솔자 판정 (web·mobile·server 공용)
 * 인솔자는 환자 기록의 hospitalVisits[].escort 에 이름으로 저장된다.
 * "내원예정" 이거나 48시간 이내 "내원완료" 된 방문의 인솔자에게 학생 카드·주민번호 원본을 보여준다.
 */
export const ESCORT_RECENT_MS = 48 * 60 * 60 * 1000;

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').trim();

interface VisitLike {
  escort?: string;
  hospitalStatus?: string;
  completedAt?: { toMillis?: () => number } | null;
}

export function isActiveEscortVisit(visit: VisitLike, myName: string | null | undefined, now = Date.now()): boolean {
  const me = norm(myName);
  if (!me || norm(visit.escort) !== me) return false;
  if (visit.hospitalStatus === '내원예정') return true;
  const done = visit.completedAt?.toMillis?.() ?? 0;
  return visit.hospitalStatus === '내원완료' && now - done <= ESCORT_RECENT_MS;
}

export function myActiveEscortVisit<V extends VisitLike>(visits: V[] | undefined, myName: string | null | undefined): V | undefined {
  return (visits ?? []).find((v) => isActiveEscortVisit(v, myName));
}
