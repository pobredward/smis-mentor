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
 *
 * 보는 사람에 따라 설명이 다르다.
 *  - summary·sections (맨 바깥) = 멘토·부매니저에게 보이는 설명 (원래 있던 값 그대로)
 *  - foreign = 원어민 선생님용 설명.
 * 누구나 칸 설명 화면의 Mentor / Foreign 버튼으로 두 벌을 오가며 볼 수 있고, 처음에는 자기 쪽
 * (원어민 → foreign, 그 밖 → 멘토·부매니저용)이 열린다. 자기 쪽이 비어 있으면 다른 쪽이 열린다.
 * 관리자는 둘 다 본다. 원어민용은 몇 칸에만 붙는 게 보통이라 따로 두지 않고 한 칸 안에 둔다.
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

/** 한 사람에게 보이는 설명 한 벌 — 요약 + 섹션 */
export interface GuideBody {
  /** 맨 위 한 줄 — 이 시간이 무엇을 하는 시간인지 */
  summary?: string;
  sections?: GuideSection[];
}

/** 맨 바깥 summary·sections 는 멘토·부매니저용 (예전 값과 같은 자리) */
export interface TimetableGuide extends GuideBody {
  /** 원어민 선생님용 설명 — 없으면 원어민 선생님에게도 멘토·부매니저용이 열린다 */
  foreign?: GuideBody;
  updatedAt?: string;
  updatedBy?: string;
}

/** 누구에게 보이는 설명인가 — 멘토·부매니저(한국인 스태프) / 원어민 */
export type GuideAudience = 'mentor' | 'foreign';

/** 새 설명을 만들 때 깔아 주는 기본 섹션 (제목은 지우거나 바꿔도 된다) */
export const DEFAULT_GUIDE_SECTIONS = ['설명', '진행 방법', '준비물'];
/** 원어민용 설명을 새로 만들 때 깔아 주는 기본 섹션 (영어로) */
export const DEFAULT_FOREIGN_GUIDE_SECTIONS = ['Description', 'How it works', 'Materials'];

/** 역할 → 보이는 설명 (원어민 foreign·foreign_temp 만 원어민용, 나머지는 멘토·부매니저용) */
export function guideAudienceOf(role: string | null | undefined): GuideAudience {
  return role === 'foreign' || role === 'foreign_temp' ? 'foreign' : 'mentor';
}

/** 이 사람에게 보일 설명 한 벌 — 원어민용이 없으면 undefined */
export function guideBodyFor(g: TimetableGuide | undefined, audience: GuideAudience): GuideBody | undefined {
  if (!g) return undefined;
  if (audience === 'foreign') return g.foreign;
  return {
    ...(g.summary !== undefined ? { summary: g.summary } : {}),
    ...(g.sections !== undefined ? { sections: g.sections } : {}),
  };
}

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

/** 설명 한 벌에 보여 줄 게 있는지 */
export function hasBodyContent(b: GuideBody | undefined): boolean {
  if (!b) return false;
  if (b.summary?.trim()) return true;
  return !!b.sections?.some((s) => s.items?.some(hasItemContent));
}

/**
 * 보여 줄 내용이 실제로 있는지 (빈 껍데기면 칸을 누를 수 있게 하지 않는다)
 * - audience 를 주면 그 사람에게 보이는 설명만 본다 (멘토 → 멘토·부매니저용, 원어민 → 원어민용)
 * - 안 주면 둘 중 하나라도 있으면 true (관리자 — 둘 다 본다)
 */
export function hasGuideContent(g: TimetableGuide | undefined, audience?: GuideAudience): boolean {
  if (!g) return false;
  if (audience) return hasBodyContent(guideBodyFor(g, audience));
  return hasBodyContent(g) || hasBodyContent(g.foreign);
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

  const body = normalizeBody(g, id, '');
  // 원어민용도 같은 모양으로 맞춘다 (id 가 겹치지 않게 앞에 f 를 붙인다)
  const foreign = g.foreign && typeof g.foreign === 'object'
    ? normalizeBody(g.foreign as Record<string, unknown>, id, 'f')
    : undefined;

  return {
    ...body,
    ...(foreign ? { foreign } : {}),
    ...(typeof g.updatedAt === 'string' ? { updatedAt: g.updatedAt } : {}),
    ...(typeof g.updatedBy === 'string' ? { updatedBy: g.updatedBy } : {}),
  };
}

/** normalizeGuide 의 설명 한 벌 부분 — 멘토·부매니저용과 원어민용이 같이 쓴다 */
function normalizeBody(
  g: Record<string, unknown>,
  id: (p: string) => string,
  pre: string
): GuideBody {
  const sections: GuideSection[] = Array.isArray(g.sections)
    ? (g.sections as Record<string, unknown>[]).map((s, si) => ({
        id: typeof s?.id === 'string' ? s.id : id(`${pre}s${si}-`),
        title: typeof s?.title === 'string' ? s.title : '',
        items: Array.isArray(s?.items)
          ? (s.items as unknown[]).map((it, ii) =>
              typeof it === 'string'
                ? { id: id(`${pre}i${si}-${ii}-`), type: 'text' as const, text: it }
                : ({
                    id: typeof (it as GuideItem)?.id === 'string' ? (it as GuideItem).id : id(`${pre}i${si}-${ii}-`),
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
      id: id(`${pre}links-`),
      title: '자료',
      items: legacyLinks
        .filter((l) => typeof l?.url === 'string' && l.url)
        .map((l, li) => ({
          id: typeof l.id === 'string' ? l.id : id(`${pre}l${li}-`),
          type: 'link' as const,
          text: typeof l.label === 'string' ? l.label : '',
          url: l.url as string,
        })),
    });
  }

  return {
    ...(typeof g.summary === 'string' && g.summary ? { summary: g.summary } : {}),
    ...(sections.length ? { sections } : {}),
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

/** 저장 전 정리 — 빈 줄·빈 섹션은 버린다. 원어민용은 보여 줄 게 없으면 통째로 뺀다 */
export function cleanGuide(g: TimetableGuide): TimetableGuide {
  const foreign = g.foreign ? cleanBody(g.foreign) : undefined;
  return {
    ...cleanBody(g),
    ...(foreign && hasBodyContent(foreign) ? { foreign } : {}),
  };
}

/** cleanGuide 의 설명 한 벌 부분 */
function cleanBody(b: GuideBody): GuideBody {
  const sections = (b.sections ?? [])
    .map((s) => ({
      id: s.id,
      title: (s.title ?? '').trim(),
      items: (s.items ?? []).filter(hasItemContent).map((i) => ({
        id: i.id,
        type: i.type,
        ...(i.text?.trim() ? { text: i.text.trim() } : {}),
        ...(i.url?.trim() ? { url: i.url.trim() } : {}),
        ...(i.storagePath ? { storagePath: i.storagePath } : {}),
      })),
    }))
    .filter((s) => s.title || s.items.length);
  return {
    ...(b.summary?.trim() ? { summary: b.summary.trim() } : {}),
    ...(sections.length ? { sections } : {}),
  };
}

/**
 * 설명 한 벌을 그대로 베낀다 (관리자 편집기의 '위 내용 복사' — 멘토용 → 원어민용).
 * id 는 새로 받고, 올린 파일은 주소(url)만 같이 쓰고 storagePath 는 넘기지 않는다
 * — 한쪽 줄을 지우며 파일까지 지우더라도 다른 쪽 그림이 깨지지 않게.
 */
export function copyGuideBody(b: GuideBody | undefined, newId: () => string): GuideBody {
  return {
    ...(b?.summary !== undefined ? { summary: b.summary } : {}),
    sections: (b?.sections ?? []).map((s) => ({
      id: newId(),
      title: s.title,
      items: (s.items ?? []).map((i) => ({
        id: newId(),
        type: i.type,
        ...(i.text !== undefined ? { text: i.text } : {}),
        ...(i.url !== undefined ? { url: i.url } : {}),
      })),
    })),
  };
}
