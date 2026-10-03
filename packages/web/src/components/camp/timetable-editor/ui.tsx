'use client';

/**
 * 시간표 통합 편집기 — 작은 공용 조각들 (팝오버 · 대화상자 · 세그먼트 · 범위 배지 · 색 고르기 …)
 * 새 npm 의존성 없이 Tailwind 만 쓴다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_SUBJECTS,
  ROTATION_COLORS,
  booksFor,
  type EslBookList,
  type SubjectPartner,
  type TimetableSubject,
  timetableWorkspace as W,
  type CampTimetable,
} from '@smis-mentor/shared';

// ─── 편집기 공용 타입 ──────────────────────────────────────────────────

/** 작업 공간 갱신 — fn 은 정확히 한 번 불린다 (ref 기반이라 StrictMode 이중 호출 걱정 없음) */
export type WsUpdate = (fn: (w: W.Workspace) => W.Workspace) => W.Workspace;
/** 지금 표 고치기 — 빈 뼈대면 새 표가 생기고 그 id 를 돌려준다 */
export type TableEdit = (fn: (t: CampTimetable) => void, key?: string) => string | null;

// ─── 위치 ──────────────────────────────────────────────────────────────

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function rectOf(el: Element | null | undefined): AnchorRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

export function unionRect(els: ArrayLike<Element>): AnchorRect | null {
  let out: AnchorRect | null = null;
  for (let i = 0; i < els.length; i++) {
    const r = rectOf(els[i]);
    if (!r) continue;
    if (!out) out = r;
    else {
      const left = Math.min(out.left, r.left);
      const top = Math.min(out.top, r.top);
      const right = Math.max(out.right, r.right);
      const bottom = Math.max(out.bottom, r.bottom);
      out = { left, top, right, bottom, width: right - left, height: bottom - top };
    }
  }
  return out;
}

// ─── 팝오버 ────────────────────────────────────────────────────────────

/**
 * 가벼운 떠 있는 카드 — 기준 칸 아래(자리가 없으면 위)에 붙고 화면 밖으로 나가지 않는다.
 * 바깥을 누르거나 Esc 를 누르면 닫힌다. `data-keep-popover` 가 붙은 요소를 누를 때는 닫지 않는다
 * (그 버튼이 스스로 열고 닫는 토글일 때).
 */
export function Popover({
  anchor,
  onClose,
  children,
  width = 320,
  className = '',
}: {
  anchor: AnchorRect;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // 내용 높이가 바뀌어도(모드 전환 등) 매번 다시 맞춘다 — 값이 같으면 setPos 가 이전 값을 돌려줘 다시 그리지 않는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = anchor.bottom + 6;
    if (top + h > vh - m) {
      const above = anchor.top - 6 - h;
      top = above >= m ? above : Math.max(m, vh - m - h);
    }
    const left = Math.min(Math.max(m, anchor.left), Math.max(m, vw - m - w));
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!ref.current || !t) return;
      if (ref.current.contains(t)) return;
      if (t.closest?.('[data-keep-popover]')) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    const onResize = () => closeRef.current();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      className={`fixed z-[70] max-h-[min(80vh,640px)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xl ${className}`}
      style={{
        width: Math.min(width, typeof window === 'undefined' ? width : window.innerWidth - 16),
        left: pos?.left ?? anchor.left,
        top: pos?.top ?? anchor.bottom + 6,
        // visibility:hidden 이면 autoFocus 가 먹지 않는다 — 첫 측정 전에는 투명하게만
        opacity: pos ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}

// ─── 대화상자 ──────────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/30 p-3 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ─── 세그먼트 · 배지 · 점 ──────────────────────────────────────────────

/** GuideAudienceTabs 와 같은 모양의 세그먼트 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
  size = 'xs',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean; title?: string }>;
  className?: string;
  size?: 'xs' | 'sm';
}) {
  return (
    <div role="tablist" className={`inline-flex flex-wrap rounded-lg bg-gray-100 p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
            } ${on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type Scope = 'camp' | 'group' | 'table';
const SCOPE_LABEL: Record<Scope, string> = { camp: '캠프 전체', group: '이 그룹 모든 Day', table: '이 표만' };
const SCOPE_CLASS: Record<Scope, string> = {
  camp: 'bg-violet-50 text-violet-700 ring-violet-200',
  group: 'bg-blue-50 text-blue-700 ring-blue-200',
  table: 'bg-gray-50 text-gray-600 ring-gray-200',
};

/** 이 값이 어디까지 함께 바뀌는지 */
export function ScopeBadge({ scope, className = '' }: { scope: Scope; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${SCOPE_CLASS[scope]} ${className}`}>
      {SCOPE_LABEL[scope]}
    </span>
  );
}

/** 표가 있으면 회색, 이번에 바뀌었으면 주황 */
export function StatusDot({ status, on = false }: { status: 'changed' | 'exists' | null; on?: boolean }) {
  if (!status) return null;
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        status === 'changed' ? 'bg-orange-500' : on ? 'bg-white/60' : 'bg-gray-300'
      }`}
      title={status === 'changed' ? '저장 안 한 변경' : '표 있음'}
    />
  );
}

export function SectionTitle({ children, scope, right }: { children: ReactNode; scope?: Scope; right?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h4 className="text-xs font-semibold text-gray-900">{children}</h4>
      {scope && <ScopeBadge scope={scope} />}
      {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-0.5 block text-[10px] font-medium text-gray-500">{children}</span>;
}

/** 너비 없는 입력칸 (너비를 따로 줄 때) */
export const inputBaseCls = 'rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none';
export const inputCls = `w-full ${inputBaseCls}`;
export const btnCls = 'rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';
export const btnPrimaryCls = 'rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
export const btnDangerCls = 'rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40';
export const linkBtnCls = 'text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40';

// ─── 색 ────────────────────────────────────────────────────────────────

/** 표에 쓰는 색 견본 — 기본 과목 색 + 로테이션 색 + 공통 줄 회색 */
export const SWATCHES: string[] = [
  ...new Set([...DEFAULT_SUBJECTS.map((s) => s.color ?? ''), ...ROTATION_COLORS, '#f3f4f6'].filter(Boolean)),
];

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorPicker({ value, onChange, noneLabel = '없음' }: { value?: string; onChange: (v: string | undefined) => void; noneLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded border ${value?.toLowerCase() === c.toLowerCase() ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-300'}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`h-5 rounded border px-1 text-[10px] ${!value ? 'border-blue-600 text-blue-700' : 'border-gray-300 text-gray-500'}`}
      >
        {noneLabel}
      </button>
      <input
        value={text ?? value ?? ''}
        onFocus={() => setText(value ?? '')}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          if (HEX.test(v)) onChange(v);
          else if (!v) onChange(undefined);
        }}
        onBlur={() => setText(null)}
        placeholder="#hex"
        className={`h-5 w-[70px] rounded border px-1 font-mono text-[10px] ${text && !HEX.test(text) ? 'border-amber-400' : 'border-gray-300'}`}
      />
    </div>
  );
}

// ─── 과목 · 역할 ───────────────────────────────────────────────────────

export const subjectsOf = (t: Pick<CampTimetable, 'subjects'> | null | undefined): TimetableSubject[] =>
  t?.subjects?.length ? t.subjects : DEFAULT_SUBJECTS;

/** 아래 칸 규칙을 사람 말로 */
export const PARTNER_LABELS: Record<SubjectPartner, string> = {
  foreign: '원어민 수업',
  pattern: 'Pattern',
  owner: '주제 담당 담임(돌아감)',
  ownTeacher: '그 반 담임',
  staff: '칸에 담당자 이름',
  none: '없음',
};
export const PARTNER_ORDER: SubjectPartner[] = ['foreign', 'pattern', 'owner', 'ownTeacher', 'staff', 'none'];

/** 이름을 붙일 수 있는 역할 — 수업(Pattern) 멘토 + 과목의 원어민 + 담당자 칸 역할 */
export function staffRolesOf(subjects: TimetableSubject[]): Array<{ key: string; label: string }> {
  const out = [{ key: '수업', label: '수업(Pattern)' }];
  subjects.forEach((s) => {
    if (s.partner === 'foreign') out.push({ key: s.key.toLowerCase(), label: `${s.key} 원어민` });
    if (s.partner === 'staff' && s.roleKey) out.push({ key: s.roleKey.toLowerCase(), label: `${s.roleKey} 담당` });
  });
  return out.filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i);
}

/** 과목 이름 아래 작게 붙을 담당자 — 그 반 담임이거나 그룹 역할 */
export function RoleSelect({
  value,
  onChange,
  roles,
  emptyLabel = '이름 없음',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  roles: Array<{ key: string; label: string }>;
  emptyLabel?: string;
  className?: string;
}) {
  const known = value === '' || value === 'ownTeacher' || roles.some((r) => r.key === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`}>
      <option value="">{emptyLabel}</option>
      <option value="ownTeacher">그 반 담임</option>
      {roles.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
      {!known && <option value={value}>{value}</option>}
    </select>
  );
}

/** 이 이름이 앱 배정에서 온 것인지 직접 넣은 것인지 */
export function NameTag({ manual, joined }: { manual: boolean; joined?: string }) {
  if (manual)
    return (
      <span
        className="shrink-0 rounded border border-gray-300 px-1 py-0.5 text-[10px] text-gray-600"
        title={joined ? `앱 배정: ${joined}` : '앱에 배정이 없습니다'}
      >
        직접
      </span>
    );
  if (joined) return null;
  return <span className="shrink-0 text-[10px] text-amber-600">배정 없음</span>;
}

/**
 * 교재 L-Code 입력. 리스트에 있는 코드는 교재 3권을 툴팁으로 보여 주고,
 * 없는 코드면 테두리로 알려 준다 (오타를 바로 알아채도록).
 */
export function BookCodeInput({
  value,
  onChange,
  onPaste,
  codes,
  books,
  placeholder,
  listId,
}: {
  value: string;
  onChange: (v: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  codes: string[];
  books: EslBookList | undefined;
  placeholder: string;
  listId: string;
}) {
  const set = booksFor(books, value);
  // 교재 리스트를 불러오기 전에는 경고하지 않는다
  const unknown = !!books?.codes && !!value.trim() && !set;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      list={codes.length ? listId : undefined}
      placeholder={placeholder}
      title={
        set
          ? [set.speaking, set.reading, set.writing].filter(Boolean).join(' / ') || '교재 없는 코드'
          : unknown
            ? '교재 리스트에 없는 코드입니다'
            : '학년별 ESL 교재 코드 (예: Bc)'
      }
      className={`w-full min-w-0 rounded-md border px-1.5 py-1 text-xs ${unknown ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
    />
  );
}

/** BookCodeInput 들이 함께 쓰는 datalist (한 번만 그린다) */
export function BookCodeList({ id, codes, books }: { id: string; codes: string[]; books: EslBookList | undefined }) {
  return (
    <datalist id={id}>
      {codes.map((c) => {
        const s = booksFor(books, c);
        return (
          <option key={c} value={c}>
            {[s?.speaking, s?.reading, s?.writing].filter(Boolean).join(' / ')}
          </option>
        );
      })}
    </datalist>
  );
}

/** 'YYYY-MM-DD' 의 요일 */
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayKo = (date: string) => WEEKDAYS_KO[new Date(`${date}T00:00:00`).getDay()] ?? '';

/** 짧은 id (일정표 세트·활동 줄) */
export const shortId = () => Math.random().toString(36).slice(2, 10);
