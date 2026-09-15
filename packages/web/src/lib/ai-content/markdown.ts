/**
 * 마크다운 생성 유틸리티 — HTML(TipTap) → Markdown, 날짜 포맷, 페이지 조립
 */
import TurndownService from 'turndown';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - 타입 정의 없음 (src/types/turndown-plugin-gfm.d.ts 참고)
import { gfm } from 'turndown-plugin-gfm';
import {
  ACCESS_LABEL,
  LLMS_TXT_URL,
  MCP_ENDPOINT,
  RenderedPage,
  SITE_URL,
  toMarkdownUrl,
  toUrl,
} from './site';

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  td.use(gfm);
  // 장식용 요소 제거
  td.remove(['script', 'style', 'iframe', 'noscript']);
  td.addRule('svg', {
    filter: (node) => node.nodeName.toLowerCase() === 'svg',
    replacement: () => '',
  });
  // TipTap 의 <p><br></p> 빈 문단 제거
  td.addRule('emptyParagraph', {
    filter: (node) =>
      node.nodeName === 'P' && node.textContent?.trim() === '' && node.querySelector('img') === null,
    replacement: () => '\n',
  });
  turndown = td;
  return td;
}

/** TipTap/HTML 문자열을 마크다운으로 변환 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';
  try {
    // TipTap 은 <li><p>…</p></li> 형태로 저장 → 느슨한 목록이 되지 않도록 문단 태그 제거
    const normalized = html.replace(/<li>\s*<p>/gi, '<li>').replace(/<\/p>\s*<\/li>/gi, '</li>');
    const md = getTurndown().turndown(normalized);
    return md
      .replace(/^(\s*)-   /gm, '$1- ')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    // 변환 실패 시 태그만 제거
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** HTML → 순수 텍스트 (검색·요약용) */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

type DateLike = Date | { toDate: () => Date } | { _seconds: number } | string | number | null | undefined;

export function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'object' && '_seconds' in value) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const KST = 'Asia/Seoul';

/** YYYY-MM-DD (KST) */
export function fmtDate(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '-';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // sv-SE 로케일은 YYYY-MM-DD 형식
}

/** YYYY-MM-DD (요일) (KST) */
export function fmtDateWithDay(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '-';
  const day = new Intl.DateTimeFormat('ko-KR', { timeZone: KST, weekday: 'short' }).format(d);
  return `${fmtDate(d)} (${day})`;
}

/** YYYY-MM-DD HH:mm (KST) */
export function fmtDateTime(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '-';
  const date = fmtDate(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date} ${time}`;
}

export function fmtRange(start: DateLike, end: DateLike): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s === '-' && e === '-') return '-';
  if (s === e) return s;
  return `${s} ~ ${e}`;
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** GFM 표 생성 */
export function table(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return '_(항목 없음)_';
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

export function bulletLinks(links: { path: string; title: string; description?: string }[]): string {
  if (links.length === 0) return '_(없음)_';
  return links
    .map((l) => `- [${l.title}](${toMarkdownUrl(l.path)})${l.description ? ` — ${l.description}` : ''}`)
    .join('\n');
}

/** 모든 마크다운 문서 상단에 붙는 안내 (claude.com 문서 사이트 방식) */
export function indexPointer(): string {
  return [
    `> **전체 목차:** ${LLMS_TXT_URL} — 세부 페이지를 탐색하기 전에 이 파일을 먼저 읽으세요.`,
    `> 어떤 페이지든 URL 뒤에 \`.md\` 를 붙이면 마크다운 버전을 받을 수 있습니다 (예: ${SITE_URL}/job-board.md).`,
    `> 로그인이 필요한 페이지(캠프 운영·관리자)는 MCP 커넥터 ${MCP_ENDPOINT} 로 연결하세요.`,
  ].join('\n');
}

/** RenderedPage → 완성된 마크다운 문서 */
export function composePage(page: RenderedPage, options: { withPointer?: boolean } = {}): string {
  const withPointer = options.withPointer ?? true;
  const lines: string[] = [];
  if (withPointer) {
    lines.push(indexPointer(), '');
  }
  lines.push(`# ${page.title}`, '');
  if (page.description) lines.push(page.description, '');
  lines.push(
    `- 원본 URL: ${toUrl(page.path)}`,
    `- 마크다운: ${toMarkdownUrl(page.path)}`,
    `- 접근 권한: ${ACCESS_LABEL[page.access]}`,
  );
  if (page.updatedAt) lines.push(`- 최종 수정: ${fmtDateTime(page.updatedAt)}`);
  if (page.tags.length) lines.push(`- 태그: ${page.tags.join(', ')}`);
  lines.push('', page.body.trim(), '');
  if (page.children.length) {
    lines.push('## 하위 · 관련 페이지', '');
    lines.push(
      page.children
        .map(
          (c) =>
            `- [${c.title}](${toMarkdownUrl(c.path)})${c.description ? ` — ${c.description}` : ''} _(${ACCESS_LABEL[c.access]})_`
        )
        .join('\n'),
      ''
    );
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
