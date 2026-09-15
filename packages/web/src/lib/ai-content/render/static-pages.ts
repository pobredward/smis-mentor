/**
 * 정적 JSX 페이지(개인정보처리방침, 이용약관) 렌더러
 *
 * 페이지 컴포넌트를 아주 단순한 직렬화기로 HTML 문자열로 만든 뒤 마크다운으로 변환한다.
 * (Next.js 는 라우트 핸들러에서 react-dom/server 임포트를 금지하므로 자체 직렬화기를 사용.
 *  훅·클라이언트 컴포넌트가 없는 순수 JSX 페이지에만 적용할 것)
 * → JSX 를 수정하면 마크다운도 자동으로 따라온다.
 */
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { RenderedPage } from '../site';
import { htmlToMarkdown } from '../markdown';
import { getStaticPageMeta } from '../registry';
import PrivacyPolicyPage from '@/app/privacy-policy/page';
import TermsOfServicePage from '@/app/terms-of-service/page';

type Component = () => ReactElement;

const STATIC_COMPONENTS: Record<string, Component> = {
  '/privacy-policy': PrivacyPolicyPage as unknown as Component,
  '/terms-of-service': TermsOfServicePage as unknown as Component,
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
const SKIP_TAGS = new Set(['svg', 'script', 'style']);
const KEEP_ATTRS: Record<string, string> = { href: 'href', src: 'src', alt: 'alt', title: 'title', colSpan: 'colspan', rowSpan: 'rowspan' };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** React 엘리먼트 트리 → HTML (순수 JSX 전용, 훅 미지원) */
export function elementToHtml(node: ReactNode, depth = 0): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return escapeHtml(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((n) => elementToHtml(n, depth)).join('');
  if (depth > 200) return '';
  if (!isValidElement(node)) return '';

  const element = node as ReactElement<Record<string, unknown>>;
  const { type, props } = element;
  const children = props?.children as ReactNode;

  if (type === Fragment) return elementToHtml(children, depth + 1);
  if (typeof type === 'function') {
    const rendered = (type as (p: Record<string, unknown>) => ReactNode)(props ?? {});
    return elementToHtml(rendered, depth + 1);
  }
  if (typeof type !== 'string') return elementToHtml(children, depth + 1);

  const tag = type.toLowerCase();
  if (SKIP_TAGS.has(tag)) return '';

  const attrs = Object.entries(KEEP_ATTRS)
    .filter(([prop]) => props && props[prop] !== undefined && props[prop] !== null)
    .map(([prop, attr]) => ` ${attr}="${escapeHtml(String(props[prop]))}"`)
    .join('');

  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;

  const inner =
    props && typeof props.dangerouslySetInnerHTML === 'object' && props.dangerouslySetInnerHTML
      ? String((props.dangerouslySetInnerHTML as { __html?: string }).__html ?? '')
      : elementToHtml(children, depth + 1);
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

export function isStaticJsxPage(path: string): boolean {
  return path in STATIC_COMPONENTS;
}

export function renderStaticJsxPage(path: string): RenderedPage | null {
  const Component = STATIC_COMPONENTS[path];
  const meta = getStaticPageMeta(path);
  if (!Component || !meta) return null;

  let html = '';
  try {
    html = elementToHtml(createElement(Component));
  } catch (error) {
    html = `<p>페이지를 렌더링하지 못했습니다: ${error instanceof Error ? error.message : String(error)}</p>`;
  }

  // 첫 번째 h1(페이지 제목)은 composePage 가 다시 붙이므로 제거
  let body = htmlToMarkdown(html);
  body = body.replace(/^#\s+[^\n]+\n+/, '');

  return {
    path,
    title: meta.title,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [
      {
        path: path === '/privacy-policy' ? '/terms-of-service' : '/privacy-policy',
        title: path === '/privacy-policy' ? '서비스 이용약관' : '개인정보처리방침',
        access: 'public',
      },
      { path: '/', title: '홈', access: 'public' },
    ],
  };
}
