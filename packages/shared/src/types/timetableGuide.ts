/**
 * 칸 설명 — 시간표에서 칸을 눌렀을 때 뜨는 세부 내용.
 *
 * 설명이 붙는 대상은 "과목" 만이 아니다. 입소·퇴소처럼 과목이 없는 Day 도
 * 칸마다 손으로 넣은 활동이 있고, Breakfast·P.E 같은 공통 줄도 설명이 필요하다.
 * 그래서 키는 과목 id 가 아니라 "칸에 찍히는 이름" 그대로다.
 *
 * 저장은 캠프당 한 벌(campSettings/{campCode}.timetableGuides). 같은 이름이면
 * Day 가 달라도 같은 설명을 쓴다 — Breakfast 를 Day 수만큼 다시 쓸 이유가 없다.
 *
 * 화면에 나가는 건 전부 관리자가 쓴 값이다. 담당·강의실·교재처럼 시간표가
 * 이미 아는 값은 여기서 되풀이하지 않는다.
 */

export type GuideItemType = 'text' | 'link' | 'image' | 'video';

/**
 * 섹션 안의 한 줄. 글일 수도, 링크일 수도, 올린 사진·동영상일 수도 있다.
 * 줄 단위로 종류가 섞일 수 있어야 해서 따로 묶지 않고 한 배열에 둔다.
 */
export interface GuideItem {
  id: string;
  type: GuideItemType;
  /** text 면 본문, 그 외에는 보여 줄 이름(캡션) */
  text?: string;
  /** link·image·video 의 주소 */
  url?: string;
  /** Storage 에 올린 파일이면 나중에 지울 때 쓸 경로 */
  storagePath?: string;
}

export interface GuideSection {
  id: string;
  title: string;
  items: GuideItem[];
}

export interface TimetableGuide {
  /** 맨 위 한 줄 — 이 시간이 무엇을 하는 시간인지 */
  summary?: string;
  sections?: GuideSection[];
  updatedAt?: string;
  updatedBy?: string;
}

/** 새 설명을 만들 때 깔아 주는 기본 섹션 (제목은 지우거나 바꿔도 된다) */
export const DEFAULT_GUIDE_SECTIONS = ['설명', '진행 방법', '준비물'];

/** 파일을 올릴 Storage 경로 — 캠프·칸별로 묶어 둔다 */
export function guideMediaPath(campCode: string, guideKey: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_');
  return `timetableGuides/${campCode}/${guideKey || 'etc'}/${Date.now()}_${safe}`;
}

/**
 * 칸 이름 → 저장 키.
 * 띄어쓰기·대소문자가 조금 달라도 같은 것으로 본다 ("P.E" / "p.e", "Breakfast " ).
 */
export function guideKeyOf(label: string | undefined | null): string {
  return (label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 이 줄이 실제로 보여 줄 게 있는지 */
export function hasItemContent(item: GuideItem | undefined): boolean {
  if (!item) return false;
  return item.type === 'text' ? !!item.text?.trim() : !!item.url?.trim();
}

/** 보여 줄 내용이 실제로 있는지 (빈 껍데기면 칸을 누를 수 있게 하지 않는다) */
export function hasGuideContent(g: TimetableGuide | undefined): boolean {
  if (!g) return false;
  if (g.summary?.trim()) return true;
  return !!g.sections?.some((s) => s.items?.some(hasItemContent));
}

/**
 * 예전 모양으로 저장된 값을 지금 모양으로 읽어 준다.
 *
 * 처음에는 줄이 그냥 문자열이었고 링크는 따로 모아 뒀다. 그 뒤로 줄마다
 * 글·링크·사진을 섞을 수 있게 바뀌었으므로, 읽을 때 조용히 맞춰 준다.
 * (저장된 문서도 스크립트로 한 번 정리하지만, 남아 있어도 깨지지 않게)
 */
export function normalizeGuide(raw: unknown): TimetableGuide | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  let n = 0;
  const id = (p: string) => `${p}${(n += 1)}`;

  const sections: GuideSection[] = Array.isArray(g.sections)
    ? (g.sections as Record<string, unknown>[]).map((s, si) => ({
        id: typeof s?.id === 'string' ? s.id : id(`s${si}-`),
        title: typeof s?.title === 'string' ? s.title : '',
        items: Array.isArray(s?.items)
          ? (s.items as unknown[]).map((it, ii) =>
              typeof it === 'string'
                ? { id: id(`i${si}-${ii}-`), type: 'text' as const, text: it }
                : ({
                    id: typeof (it as GuideItem)?.id === 'string' ? (it as GuideItem).id : id(`i${si}-${ii}-`),
                    type: ((it as GuideItem)?.type ?? 'text') as GuideItemType,
                    text: (it as GuideItem)?.text,
                    url: (it as GuideItem)?.url,
                    storagePath: (it as GuideItem)?.storagePath,
                  } as GuideItem)
            )
          : [],
      }))
    : [];

  // 예전에 따로 모아 두던 links 는 "자료" 섹션으로 옮긴다
  const legacyLinks = Array.isArray(g.links) ? (g.links as Record<string, unknown>[]) : [];
  if (legacyLinks.length) {
    sections.push({
      id: id('links-'),
      title: '자료',
      items: legacyLinks
        .filter((l) => typeof l?.url === 'string' && l.url)
        .map((l, li) => ({
          id: typeof l.id === 'string' ? l.id : id(`l${li}-`),
          type: 'link' as const,
          text: typeof l.label === 'string' ? l.label : '',
          url: l.url as string,
        })),
    });
  }

  return {
    ...(typeof g.summary === 'string' && g.summary ? { summary: g.summary } : {}),
    ...(sections.length ? { sections } : {}),
    ...(typeof g.updatedAt === 'string' ? { updatedAt: g.updatedAt } : {}),
    ...(typeof g.updatedBy === 'string' ? { updatedBy: g.updatedBy } : {}),
  };
}

/** 이 이름에 쓸 설명 — 캠프 것이 먼저, 없으면 전사 공용 */
export function findGuide(
  label: string | undefined | null,
  campGuides: Record<string, unknown> | undefined,
  sharedGuides?: Record<string, unknown> | undefined
): TimetableGuide | undefined {
  const key = guideKeyOf(label);
  if (!key) return undefined;
  return normalizeGuide(campGuides?.[key] ?? sharedGuides?.[key]);
}

/** 저장 전 정리 — 빈 줄·빈 섹션은 버린다 */
export function cleanGuide(g: TimetableGuide): TimetableGuide {
  const sections = (g.sections ?? [])
    .map((s) => ({
      id: s.id,
      title: s.title.trim(),
      items: s.items.filter(hasItemContent).map((i) => ({
        id: i.id,
        type: i.type,
        ...(i.text?.trim() ? { text: i.text.trim() } : {}),
        ...(i.url?.trim() ? { url: i.url.trim() } : {}),
        ...(i.storagePath ? { storagePath: i.storagePath } : {}),
      })),
    }))
    .filter((s) => s.title || s.items.length);
  return {
    ...(g.summary?.trim() ? { summary: g.summary.trim() } : {}),
    ...(sections.length ? { sections } : {}),
  };
}
