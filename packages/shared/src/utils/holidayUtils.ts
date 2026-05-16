import { isHoliday } from 'korean-holidays';

/**
 * korean-holidays 라이브러리에 아직 반영되지 않은 공휴일을 수동으로 관리합니다.
 * 라이브러리 업데이트 후 해당 항목을 제거하세요.
 *
 * - 2026-05-01: 노동절(근로자의 날) — 2026년 3월 국회 통과·4월 국무회의 의결로 법정 공휴일 지정,
 *               korean-holidays 1.0.0 (2026년 2월 출시)에 미반영
 */
const LIBRARY_MISSING_HOLIDAYS: Record<string, string> = {
  '2026-05-01': '노동절',
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 주어진 날짜가 대한민국 공휴일(대체공휴일 포함)인지 확인합니다.
 * korean-holidays 라이브러리를 사용하며, 라이브러리 미반영 공휴일은 별도 처리합니다.
 */
export function isKoreanHoliday(date: Date): boolean {
  if (isHoliday(date) !== null) return true;
  return toDateKey(date) in LIBRARY_MISSING_HOLIDAYS;
}

/**
 * 주어진 날짜의 공휴일 이름을 반환합니다. 공휴일이 아니면 null을 반환합니다.
 */
export function getKoreanHolidayName(date: Date): string | null {
  return isHoliday(date)?.nameKo ?? LIBRARY_MISSING_HOLIDAYS[toDateKey(date)] ?? null;
}
