/**
 * 학년별 ESL 교재 리스트
 *
 * L-Code(Ba, Cd …) 하나가 Speaking·Reading·Writing 세 권을 결정한다.
 * 반에는 코드만 붙이고 교재명은 여기서 조회하므로, 리스트를 고치면
 * 그 코드를 쓰는 모든 반의 교재가 한 번에 따라 바뀐다.
 */
export interface EslBookSet {
  speaking?: string;
  reading?: string;
  writing?: string;
}

export interface EslBookList {
  /** L-Code → 세 과목 교재 */
  codes: Record<string, EslBookSet>;
  /** 코드 첫 글자 → 학년대 이름. 예: { A: '0-2학년', B: '3-4학년' } */
  bands?: Record<string, string>;
  updatedAt?: string;
}

/** 코드가 속한 학년대 글자 (Ba → B) */
export function bookBandOf(code: string | undefined): string {
  return (code ?? '').trim().charAt(0).toUpperCase();
}

/** 코드의 교재 세 권. 리스트에 없는 코드면 undefined */
export function booksFor(
  list: EslBookList | undefined,
  code: string | undefined
): EslBookSet | undefined {
  const key = (code ?? '').trim();
  if (!key || !list?.codes) return undefined;
  return list.codes[key];
}

/** 이 코드가 리스트에 있는지 */
export function isKnownBookCode(list: EslBookList | undefined, code: string | undefined): boolean {
  return !!booksFor(list, code);
}

/** 화면에 늘어놓을 코드 목록 — 학년대 → 코드 순 */
export function sortedBookCodes(list: EslBookList | undefined): string[] {
  return Object.keys(list?.codes ?? {}).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
  );
}

/** 교재가 한 권도 없는 코드인지 (부모님용처럼 일부만 채워진 코드 구분용) */
export function isEmptyBookSet(set: EslBookSet | undefined): boolean {
  return !set?.speaking && !set?.reading && !set?.writing;
}
