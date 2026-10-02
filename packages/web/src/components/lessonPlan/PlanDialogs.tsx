'use client';

/**
 * 레슨플랜 편집 화면의 창들 — 아래에서 올라오는 시트(휴대폰) · 가운데 창(PC)
 *  - Sheet: 공통 틀
 *  - ActionSheet: 행 동작 목록 (밀기 · 이어하기 · 쉬는 날 …)
 *  - ScopeSheet: 이 반만 / 이 교재의 모든 반
 *  - SkipSheet: "No class this day" — 이유 · 범위
 *  - BookItemSheet / ActivityItemSheet: 칸 고치기
 *  - TextSheet: 오리엔테이션 · Final 칸 글
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SKIP_REASONS,
  activityIdeas,
  classKeyLabel,
  shortDate,
  unitLinks,
  type BookUnit,
  type EslBookUnits,
  type PlanItem,
} from '@smis-mentor/shared';

export function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center sm:p-4 print:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {subtitle && <p className="text-xs font-semibold text-blue-600 truncate">{subtitle}</p>}
            <h3 className="text-base font-bold text-gray-900 leading-snug">{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export interface SheetAction {
  key: string;
  section: string;
  label: string;
  hint?: string;
  tone?: 'danger';
  onClick: () => void;
}

/** 행 동작 — 구역(This day · Book · Activity)별 목록 */
export function ActionSheet({ title, subtitle, actions, onClose, note }: {
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
  note?: string;
}) {
  const sections = [...new Set(actions.map((a) => a.section))];
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      {note && <p className="text-xs text-gray-500 mb-3">{note}</p>}
      {actions.length === 0 && <p className="text-sm text-gray-500">Nothing to change here.</p>}
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{s}</p>
            <div className="rounded-xl ring-1 ring-gray-200 divide-y divide-gray-100 overflow-hidden">
              {actions.filter((a) => a.section === s).map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => { a.onClick(); }}
                  className={`w-full text-left px-3.5 py-2.5 hover:bg-gray-50 active:bg-gray-100 ${a.tone === 'danger' ? 'text-red-600' : 'text-gray-900'}`}
                >
                  <span className="block text-sm font-semibold">{a.label}</span>
                  {a.hint && <span className="block text-xs text-gray-500 mt-0.5">{a.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** 이 반만 / 이 교재의 모든 반 */
export function ScopeSheet({ title, classKey, classKeys, onPick, onClose }: {
  title: string;
  classKey: string;
  classKeys: string[];
  onPick: (scope: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} subtitle="Which classes?" onClose={onClose}>
      <div className="space-y-2">
        <button type="button" onClick={() => onPick(classKey)} className="w-full text-left px-4 py-3 rounded-xl ring-1 ring-blue-200 bg-blue-50 hover:bg-blue-100">
          <span className="block text-sm font-bold text-blue-800">Only {classKeyLabel(classKey)}</span>
          <span className="block text-xs text-blue-700/80 mt-0.5">The other classes keep their plan.</span>
        </button>
        <button type="button" onClick={() => onPick('all')} className="w-full text-left px-4 py-3 rounded-xl ring-1 ring-gray-200 hover:bg-gray-50">
          <span className="block text-sm font-bold text-gray-900">All classes with this book</span>
          <span className="block text-xs text-gray-500 mt-0.5">{classKeys.map(classKeyLabel).join(', ')}</span>
        </button>
      </div>
    </Sheet>
  );
}

export type SkipScope = 'class' | 'book' | 'mine';

/** 그날 수업 없음 — 이유 · 범위 */
export function SkipSheet({ date, classKey, classKeys, otherPlans, onSave, onClose }: {
  date: string;
  classKey: string;
  classKeys: string[];
  /** 내 다른 교재 레슨플랜 수 (0 이면 '내 모든 교재' 없음) */
  otherPlans: number;
  onSave: (scope: SkipScope, note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<SkipScope>('class');
  const options: Array<{ key: SkipScope; label: string; hint: string }> = [
    { key: 'class', label: `Only ${classKeyLabel(classKey)}`, hint: 'e.g. this class went on a trip' },
    ...(classKeys.length > 1 ? [{ key: 'book' as const, label: 'All classes with this book', hint: classKeys.map(classKeyLabel).join(', ') }] : []),
    ...(otherPlans > 0 ? [{ key: 'mine' as const, label: 'All my classes (every book)', hint: `e.g. you were sick — ${otherPlans + 1} lesson plans` }] : []),
  ];
  return (
    <Sheet
      title={`No class on ${shortDate(date)}`}
      subtitle="Everything after this day moves back one lesson"
      onClose={onClose}
      footer={(
        <>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={() => onSave(scope, note)} className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600">Mark no class</button>
        </>
      )}
    >
      <p className="text-sm font-semibold text-gray-800 mb-2">Why? <span className="font-normal text-gray-400">(optional)</span></p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SKIP_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setNote(r)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${note === r ? 'bg-amber-100 ring-amber-300 text-amber-800' : 'ring-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {r}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
      {options.length > 1 && (
        <>
          <p className="text-sm font-semibold text-gray-800 mt-4 mb-2">Which classes?</p>
          <div className="space-y-1.5">
            {options.map((o) => (
              <label key={o.key} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl ring-1 cursor-pointer ${scope === o.key ? 'ring-amber-300 bg-amber-50' : 'ring-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="skip-scope" checked={scope === o.key} onChange={() => setScope(o.key)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{o.label}</span>
                  <span className="block text-xs text-gray-500">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

const PARTS = ['', 'Part 1', 'Part 2', 'Part 3'];

/** 교재 칸 고치기 — 단원 · 나누기 · 메모 · 복습 */
export function BookItemSheet({ item, rowLabel, autoReview, units, scope, catalog, bookTitle, bookCodes, classKey, multiClass, onSave, onDelete, onMove, onDropForClass, onClose }: {
  item: PlanItem;
  rowLabel: string;
  autoReview: string;
  /** 교재 단원 목록 (없으면 번호만) */
  units: BookUnit[];
  /** 캠프 합본 범위 */
  scope?: number[];
  catalog: EslBookUnits | null;
  bookTitle: string;
  bookCodes: string[];
  classKey: string;
  multiClass: boolean;
  onSave: (patch: Partial<PlanItem>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onDropForClass?: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>(item.units ?? []);
  const [part, setPart] = useState(item.part ?? '');
  const [text, setText] = useState(item.text ?? '');
  const [review, setReview] = useState(item.review ?? '');
  const [typed, setTyped] = useState('');
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => {
    const inScope = scope?.length ? units.filter((u) => scope.includes(u.no)) : units;
    return showAll ? units : inScope;
  }, [units, scope, showAll]);
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort((a, b) => a - b)));
  const addTyped = () => {
    const nums = typed.split(/[^0-9]+/).map(Number).filter((n) => n > 0 && n < 100);
    if (nums.length) setPicked((p) => [...new Set([...p, ...nums])].sort((a, b) => a - b));
    setTyped('');
  };
  const info = picked.map((n) => units.find((u) => u.no === n) ?? { no: n, title: '' });
  const save = () => onSave({ units: picked, part: part.trim(), text: text.trim(), review: review.trim() });

  return (
    <Sheet
      wide
      title="Book"
      subtitle={rowLabel}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onDelete} className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50">Delete</button>
          <button type="button" onClick={() => onMove(-1)} className="px-2.5 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100" title="Move earlier">↑</button>
          <button type="button" onClick={() => onMove(1)} className="px-2.5 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100" title="Move later">↓</button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={save} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Save</button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800">Unit</p>
            {scope?.length && units.length > scope.length ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-blue-600 font-medium">
                {showAll ? 'Camp book only' : `Show all ${units.length} units`}
              </button>
            ) : null}
          </div>
          {list.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto p-0.5">
              {list.map((u) => {
                const on = picked.includes(u.no);
                return (
                  <button key={u.no} type="button" onClick={() => toggle(u.no)}
                    className={`text-left px-3 py-2 rounded-lg ring-1 text-sm ${on ? 'bg-blue-600 text-white ring-blue-600' : 'ring-gray-200 hover:bg-gray-50 text-gray-800'}`}>
                    <span className="font-bold">U{u.no}</span> <span className={on ? 'text-white/90' : 'text-gray-600'}>{u.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No unit list for this book yet — type unit numbers.</p>
          )}
          <div className="flex gap-2 mt-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTyped(); }}
              placeholder="Unit number (e.g. 5 or 5, 6)" inputMode="numeric"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={addTyped} disabled={!typed.trim()} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 disabled:opacity-40">Add</button>
          </div>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {picked.map((n) => (
                <button key={n} type="button" onClick={() => toggle(n)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                  U{n} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Part</p>
          <div className="flex flex-wrap gap-1.5">
            {PARTS.map((p) => (
              <button key={p || 'none'} type="button" onClick={() => setPart(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${part === p ? 'bg-gray-900 text-white ring-gray-900' : 'ring-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {p || 'Whole unit'}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Notes <span className="font-normal text-gray-400">(pages, focus, worksheet…)</span></span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder={picked.length ? '' : 'e.g. Review & extension'}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Review</span>
          <input value={review} onChange={(e) => setReview(e.target.value)} placeholder={autoReview || 'Automatic: the units of the previous lesson'}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400">Leave empty to review the previous lesson automatically.</span>
        </label>

        {info.length > 0 && (
          <div className="space-y-2">
            {info.map((u) => {
              const links = unitLinks(catalog, bookCodes, bookTitle, u.no);
              return (
                <div key={u.no} className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">U{u.no} {u.title}</p>
                    <div className="flex gap-1 shrink-0">
                      {links.canva && <a href={links.canva} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded bg-white ring-1 ring-gray-200 font-semibold text-gray-700 hover:bg-gray-100">Book p.{links.page}</a>}
                      {!links.canva && links.drive && <a href={links.drive} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded bg-white ring-1 ring-gray-200 font-semibold text-gray-700 hover:bg-gray-100">PDF p.{links.page}</a>}
                    </div>
                  </div>
                  {[u.genre, u.theme].filter(Boolean).length > 0 && <p className="mt-0.5">{[u.genre, u.theme].filter(Boolean).join(' · ')}</p>}
                  {u.objective && <p className="mt-1"><span className="font-semibold text-gray-700">Goal</span> {u.objective}</p>}
                  {u.focus && <p className="mt-0.5"><span className="font-semibold text-gray-700">Focus</span> {u.focus}</p>}
                  {u.words?.length ? <p className="mt-0.5"><span className="font-semibold text-gray-700">Words</span> {u.words.join(', ')}</p> : null}
                </div>
              );
            })}
          </div>
        )}

        {multiClass && onDropForClass && (
          <button type="button" onClick={onDropForClass} className="text-xs font-semibold text-gray-500 hover:text-red-600">
            Skip this lesson for {classKeyLabel(classKey)} only
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** 액티비티 칸 고치기 */
export function ActivityItemSheet({ item, rowLabel, unit, seed, classKey, multiClass, onSave, onDelete, onMove, onDropForClass, onClose }: {
  item: PlanItem;
  rowLabel: string;
  /** 그날 교재 단원 (추천에 씀) */
  unit?: BookUnit;
  seed: number;
  classKey: string;
  multiClass: boolean;
  onSave: (patch: Partial<PlanItem>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onDropForClass?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(item.text ?? '');
  const ideas = activityIdeas(unit, seed);
  return (
    <Sheet
      title="English activity"
      subtitle={rowLabel}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onDelete} className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50">Delete</button>
          <button type="button" onClick={() => onMove(-1)} className="px-2.5 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100" title="Move earlier">↑</button>
          <button type="button" onClick={() => onMove(1)} className="px-2.5 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100" title="Move later">↓</button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={() => onSave({ text: text.trim() })} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Save</button>
        </>
      )}
    >
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Game or activity, and what it practises"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <p className="text-xs font-semibold text-gray-500 mt-3 mb-1.5">Ideas{unit ? ` with U${unit.no} words` : ''}</p>
      <div className="flex flex-wrap gap-1.5">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setText(i)} className="px-2.5 py-1 rounded-lg text-xs text-left ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50">{i}</button>
        ))}
      </div>
      {multiClass && onDropForClass && (
        <button type="button" onClick={onDropForClass} className="mt-4 text-xs font-semibold text-gray-500 hover:text-red-600">
          Skip this activity for {classKeyLabel(classKey)} only
        </button>
      )}
    </Sheet>
  );
}

/** 한 칸 글 (오리엔테이션 · Final) */
export function TextSheet({ title, subtitle, value, placeholder, onSave, onClose }: {
  title: string;
  subtitle?: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(value);
  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={(
        <>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={() => onSave(v.trim())} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Save</button>
        </>
      )}
    >
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </Sheet>
  );
}
