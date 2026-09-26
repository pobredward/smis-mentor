/**
 * 화면 표시용 텍스트 도우미 (web·mobile 공용)
 */

/** 리치 텍스트(HTML) → 줄바꿈을 살린 일반 텍스트 (후기·소개글 미리보기) */
export const htmlToPlainText = (html: string): string =>
  html
    .replace(/<p><br><\/p>/g, '\n') // 빈 줄
    .replace(/<p>/g, '')
    .replace(/<\/p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();

/** HTML → 한 줄 텍스트 (검색용, 태그·주요 엔티티 제거) */
export const htmlToSearchText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** 검색어 주변 문장 발췌 (앞 40자 · 뒤 90자, 없으면 앞 120자) */
export function snippetAround(text: string, query: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const q = query.trim().toLowerCase();
  const index = q ? t.toLowerCase().indexOf(q) : -1;
  if (index === -1) return t.length > 120 ? t.slice(0, 120) + '...' : t;
  const start = Math.max(0, index - 40);
  const end = Math.min(t.length, index + q.length + 90);
  return (start > 0 ? '...' : '') + t.slice(start, end) + (end < t.length ? '...' : '');
}

/** Timestamp · Date · 문자열 → 'YYYY. M. D. HH:mm' (한국어 표기, 잘못된 값이면 null) */
export function formatDateTimeKo(val: unknown): string | null {
  if (!val) return null;
  const d = typeof val === 'object' && val !== null && typeof (val as { toDate?: unknown }).toDate === 'function'
    ? (val as { toDate: () => Date }).toDate()
    : new Date(val as string | number | Date);
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('ko-KR');
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}
