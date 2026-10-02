'use client';

/**
 * 관리자 → 수업 템플릿 관리 (/admin/lesson-templates, 예전 /admin/upload)
 *
 * 캠프 코드마다 '수업' 탭에서 올릴 자료의 틀(주제 · 소제목 · 안내 링크)을 만든다.
 * - 누가 올리는지(대상): 한국인 멘토 / 원어민, 그 안의 역할(담임·수업·Speaking…) — 규칙은 shared/utils/lessonPlan.ts
 * - 반별로 만들기: 원어민 레슨플랜 — 맡은 그룹의 반마다 칸 + 보조 교재 반은 하나 더
 * - 차례: 끌어서 바꾸면 수업 탭의 주제 순서도 같이 바뀐다
 * - 다른 캠프에서 가져오기: 지난 기수 템플릿을 한 번에 복사 (제목의 캠프 코드도 바꿔 준다)
 * - 수정은 오른쪽 창 하나에서 (새로 만들기·고치기 같은 화면)
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import {
  addLessonMaterialTemplate,
  deleteLessonMaterialTemplate,
  getLessonMaterialTemplates,
  updateLessonMaterialTemplate,
  type LessonMaterialTemplate,
  type LessonMaterialTemplateSection,
} from '@/lib/lessonMaterialService';
import { getAllJobCodes } from '@/lib/firebaseService';
import type { JobCodeWithId } from '@/types';
import {
  FOREIGN_GROUP_ROLES,
  MENTOR_GROUP_ROLES,
  audienceLabel,
  audienceOf,
  compareCampCodes,
  copyTemplatePreset,
  importTemplateArgs,
  isHttpUrl,
  lessonGenNum,
  lessonImportSources,
  lessonPlanPreset,
  lessonTemplatePayload,
  lessonTemplateProblem,
  lessonTemplateSummary,
  logger,
  newTemplateDraft,
  reorderTemplateSections,
  sortLessonTemplates,
  suggestLessonAudience,
  swapTemplateCode,
  templateCopyChoices,
  templateDraftOf,
  templateSectionsFromText,
  type LessonAudienceRole,
  type LessonMaterialAudience,
  type LessonTemplateDraft,
  type LessonTemplateLink,
} from '@smis-mentor/shared';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** 만들기·고치기·가져오기 규칙(검사·복사·요약)은 shared/utils/lessonTemplateEditor.ts — 앱과 같은 코드 */
type Link_ = LessonTemplateLink;
type Draft = LessonTemplateDraft;

const NO_CODE = '__none__';
const genNum = lessonGenNum;
const swapCode = swapTemplateCode;

export default function LessonTemplatesPage() {
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState('');
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const reload = async () => {
    try {
      setTemplates(await getLessonMaterialTemplates());
    } catch (e) {
      logger.error('템플릿 불러오기 실패:', e);
      toast.error('템플릿을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [tpls, jcs] = await Promise.all([getLessonMaterialTemplates(), getAllJobCodes()]);
        setTemplates(tpls);
        const list = (jcs as JobCodeWithId[]).filter((c) => c.code);
        setCodes(list);
        const latest = [...new Set(list.map((c) => String(c.generation)))].sort((a, b) => genNum(b) - genNum(a))[0] ?? '';
        setGen(latest);
        const first = list.filter((c) => String(c.generation) === latest).sort((a, b) => compareCampCodes(a.code, b.code))[0];
        if (first) setCode(first.code);
      } catch (e) {
        logger.error('수업 템플릿 화면 불러오기 실패:', e);
        toast.error('불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))].sort((a, b) => genNum(b) - genNum(a)), [codes]);
  const genCodes = useMemo(
    () => [...new Map(codes.filter((c) => String(c.generation) === gen).map((c) => [c.code, c])).values()].sort((a, b) => compareCampCodes(a.code, b.code)),
    [codes, gen],
  );
  const knownCodes = useMemo(() => new Set(codes.map((c) => c.code)), [codes]);
  const countOf = (c: string) => templates.filter((t) => t.code === c).length;
  /** 코드가 비었거나 없는 캠프 코드의 템플릿 — 정리용 */
  const orphans = useMemo(() => templates.filter((t) => !t.code || !knownCodes.has(t.code)), [templates, knownCodes]);
  const list = useMemo(
    () => sortLessonTemplates(code === NO_CODE ? orphans : templates.filter((t) => t.code === code)),
    [templates, code, orphans],
  );
  const jc = codes.find((c) => c.code === code);

  // 차례 바꾸기 — 이 코드의 템플릿 모두에 order 를 다시 매긴다 (수업 탭 주제 순서)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }));
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = list.findIndex((t) => t.id === e.active.id);
    const to = list.findIndex((t) => t.id === e.over!.id);
    const next = arrayMove(list, from, to);
    const orderOf = new Map(next.map((t, i) => [t.id, i]));
    setTemplates((prev) => prev.map((t) => (orderOf.has(t.id) ? { ...t, order: orderOf.get(t.id) } : t)));
    try {
      await Promise.all(next.map((t, i) => (t.order === i ? null : updateLessonMaterialTemplate(t.id, { order: i }))));
    } catch (err) {
      logger.error('템플릿 순서 저장 실패:', err);
      toast.error('순서를 저장하지 못했습니다.');
      void reload();
    }
  };

  const openNew = () => {
    if (!code || code === NO_CODE) return;
    setDraft(newTemplateDraft(code));
  };
  const openEdit = (t: LessonMaterialTemplate) => setDraft(templateDraftOf(t));

  const remove = async (t: LessonMaterialTemplate) => {
    if (!confirm(`"${t.title}" 템플릿을 삭제할까요?\n\n수업 탭에서 이 주제가 사라집니다. 멘토들이 올린 링크는 지워지지 않습니다.`)) return;
    try {
      await deleteLessonMaterialTemplate(t.id);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      toast.success('삭제했습니다.');
    } catch (e) {
      logger.error('템플릿 삭제 실패:', e);
      toast.error('삭제하지 못했습니다.');
    }
  };

  // 대상별 요약 — 누가 몇 개를 올리는지 한눈에
  const summary = useMemo(() => (code === NO_CODE ? [] : lessonTemplateSummary(list)), [list, code]);

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">수업 템플릿 관리</h1>
          <Link href="/admin/user-check" className="shrink-0 text-sm text-gray-500 hover:text-gray-800">올린 현황 보기 →</Link>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          캠프마다 멘토·원어민이 <b>캠프 → 수업</b> 탭에서 올릴 자료의 틀을 만듭니다. 대상(담임·수업·원어민…)에 맞는 사람에게만 보입니다.
        </p>

        {/* 캠프 고르기 */}
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <select value={gen} onChange={(e) => {
            setGen(e.target.value);
            const first = codes.filter((c) => String(c.generation) === e.target.value).sort((a, b) => compareCampCodes(a.code, b.code))[0];
            setCode(first?.code ?? '');
          }} className="border rounded-lg px-3 py-2 text-sm bg-white">
            {gens.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {genCodes.map((c) => (
            <button key={c.code} onClick={() => setCode(c.code)}
              className={`px-3 py-2 rounded-lg text-sm border ${c.code === code ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
              {c.code} <span className="opacity-70">{c.name}</span>
              <span className={`ml-1.5 text-xs ${c.code === code ? 'text-white/80' : 'text-gray-400'}`}>{countOf(c.code)}</span>
            </button>
          ))}
          {orphans.length > 0 && (
            <button onClick={() => setCode(NO_CODE)}
              className={`px-3 py-2 rounded-lg text-sm border ${code === NO_CODE ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>
              코드 없음 {orphans.length}
            </button>
          )}
        </div>

        {/* 도구 */}
        <div className="flex flex-wrap items-center gap-2 mt-5 mb-3">
          {code === NO_CODE ? (
            <p className="text-sm text-amber-800">캠프 코드가 없거나 지워진 캠프의 템플릿입니다. 어느 수업 탭에도 보이지 않으니 코드를 정해 주거나 지워 주세요.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {summary.map(([label, n]) => (
                <span key={label} className={`px-2 py-1 rounded-md ${n ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-600'}`}>{label} {n}개</span>
              ))}
            </div>
          )}
          <div className="flex-1" />
          {code !== NO_CODE && (
            <>
              <button onClick={() => setImportOpen(true)} disabled={!code}
                className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 disabled:opacity-40">다른 캠프에서 가져오기</button>
              <button onClick={openNew} disabled={!code}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">+ 새 템플릿</button>
            </>
          )}
        </div>

        {/* 목록 — 끌어서 차례 바꾸기 */}
        {loading ? (
          <p className="text-center text-gray-400 py-16">불러오는 중…</p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
            <p className="text-gray-600 font-medium">{jc ? `${jc.code}에 템플릿이 없습니다` : '캠프를 고르세요'}</p>
            {jc && <p className="text-sm text-gray-400 mt-1">지난 기수에서 가져오거나 새로 만드세요.</p>}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {list.map((t, i) => (
                  <TemplateCard key={t.id} t={t} index={i} draggable={code !== NO_CODE} onEdit={() => openEdit(t)} onDelete={() => remove(t)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {list.length > 1 && code !== NO_CODE && <p className="text-xs text-gray-400 mt-3">⠿ 를 끌어 차례를 바꾸면 수업 탭의 주제 순서도 바뀝니다.</p>}
      </div>

      {draft && (
        <TemplateEditor
          draft={draft}
          codes={codes}
          templates={templates}
          onClose={() => setDraft(null)}
          onSaved={async () => { setDraft(null); await reload(); }}
          nextOrder={list.length}
        />
      )}
      {importOpen && jc && (
        <ImportDialog
          target={jc}
          codes={codes}
          templates={templates}
          onClose={() => setImportOpen(false)}
          onDone={async () => { setImportOpen(false); await reload(); }}
        />
      )}
    </Layout>
  );
}

// ── 목록 카드 ────────────────────────────────────────────────────

function TemplateCard({ t, index, draggable, onEdit, onDelete }: { t: LessonMaterialTemplate; index: number; draggable: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !draggable });
  const a = audienceOf(t);
  const foreign = a.roles.includes('foreign');
  const sections = [...(t.sections ?? [])].sort((x, y) => x.order - y.order);
  const links = (t.links ?? []).filter((l) => l.label && l.url);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl bg-white ring-1 ring-gray-200 ${isDragging ? 'shadow-xl ring-blue-300 relative z-10' : 'hover:ring-gray-300'}`}>
      <div className="flex items-start gap-3 p-4">
        {draggable && (
          <button {...attributes} {...listeners} className="mt-0.5 px-1 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none" title="끌어서 차례 바꾸기">⠿</button>
        )}
        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-md bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-gray-900">{t.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${foreign ? 'bg-sky-50 text-sky-700' : 'bg-indigo-50 text-indigo-700'}`}>
              {audienceLabel(t)}{t.audience ? '' : ' (기본)'}
            </span>
            {t.perClass && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700">반별 칸</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {t.perClass && <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-100">반마다 1칸 (+Spare)</span>}
            {sections.map((s, i) => (
              <span key={s.id} className="text-xs px-2 py-0.5 rounded-md bg-gray-50 text-gray-700 ring-1 ring-gray-100">
                <span className="text-gray-400 mr-1">{i + 1}</span>{s.title}{(s.links ?? []).length ? <span className="text-blue-500 ml-1">🔗{s.links!.length}</span> : null}
              </span>
            ))}
            {!sections.length && !t.perClass && <span className="text-xs text-red-500">소제목이 없습니다 — 수업 탭에 칸이 생기지 않아요</span>}
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100">↗ {l.label}</a>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="px-2 sm:px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">수정</button>
          <button onClick={onDelete} className="px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-600 hover:bg-red-50">삭제</button>
        </div>
      </div>
    </div>
  );
}

// ── 누가 올리나요 ────────────────────────────────────────────────

function AudiencePicker({ audience, perClass, onChange }: {
  audience: LessonMaterialAudience; perClass: boolean;
  onChange: (audience: LessonMaterialAudience, perClass: boolean) => void;
}) {
  const roles = audience.roles;
  const groupRoles = audience.groupRoles ?? [];
  const listOf = (k: LessonAudienceRole): readonly string[] => (k === 'mentor' ? MENTOR_GROUP_ROLES : FOREIGN_GROUP_ROLES);
  const toggleKind = (k: LessonAudienceRole) => {
    const next = roles.includes(k) ? roles.filter((r) => r !== k) : [...roles, k];
    if (!next.length) return;   // 한 종류는 남긴다
    const gr = roles.includes(k) ? groupRoles.filter((r) => !listOf(k).includes(r)) : groupRoles;
    onChange({ roles: next, groupRoles: gr }, next.includes('foreign') ? perClass : false);
  };
  const toggleRole = (r: string) => onChange({ roles, groupRoles: groupRoles.includes(r) ? groupRoles.filter((x) => x !== r) : [...groupRoles, r] }, perClass);
  const clearKind = (k: LessonAudienceRole) => onChange({ roles, groupRoles: groupRoles.filter((r) => !listOf(k).includes(r)) }, perClass);
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-medium border transition ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`;
  const row = (k: LessonAudienceRole, label: string) => {
    const picked = groupRoles.filter((r) => listOf(k).includes(r));
    const on = roles.includes(k);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => toggleKind(k)}
          className={`w-28 whitespace-nowrap px-3 py-1 rounded-lg text-xs font-bold border text-left ${on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-300 text-gray-500'}`}>
          {on ? '✓ ' : ''}{label}
        </button>
        {on && (
          <>
            <button type="button" onClick={() => clearKind(k)} className={chip(!picked.length)}>전원</button>
            {listOf(k).map((r) => <button key={r} type="button" onClick={() => toggleRole(r)} className={chip(picked.includes(r))}>{r}</button>)}
          </>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-2">
      {row('mentor', '한국인 멘토')}
      {row('foreign', '원어민')}
      {roles.includes('foreign') && (
        <label className="flex items-start gap-2 pt-1 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={perClass} onChange={(e) => onChange(audience, e.target.checked)} className="mt-0.5" />
          <span>
            <b>반별로 만들기</b> (레슨플랜) — 맡은 그룹의 반마다 칸이 생기고, 보조 교재(Spare)가 있는 반은 하나 더 생깁니다.
            <span className="text-gray-400"> 아래 소제목(예: Outdoor Class)은 그 뒤에 붙습니다.</span>
          </span>
        </label>
      )}
      <p className="text-[11px] text-gray-400">역할을 고르지 않으면 그 종류 전원 · 지금: <b className="text-gray-600">{audienceLabel({ audience })}{perClass ? ' · 반별' : ''}</b></p>
    </div>
  );
}

// ── 링크 칸들 ────────────────────────────────────────────────────

function LinkRows({ links, onChange, addLabel = '+ 링크 추가' }: { links: Link_[]; onChange: (l: Link_[]) => void; addLabel?: string }) {
  return (
    <div className="space-y-1.5">
      {links.map((l, i) => {
        const bad = !!l.url.trim() && !isHttpUrl(l.url.trim());
        return (
          <div key={i} className="flex gap-1.5">
            <input value={l.label} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="제목 (예: 템플릿)" className="w-32 shrink-0 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={l.url} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              placeholder="https://" className={`flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${bad ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-blue-500'}`} />
            <button type="button" onClick={() => onChange(links.filter((_, j) => j !== i))} className="px-2 text-gray-400 hover:text-red-600" title="빼기">✕</button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...links, { label: '', url: '' }])} className="text-xs font-medium text-blue-600 hover:text-blue-800">{addLabel}</button>
    </div>
  );
}

// ── 소제목 편집 ──────────────────────────────────────────────────

function SectionRow({ s, index, onChange, onRemove }: {
  s: LessonMaterialTemplateSection; index: number;
  onChange: (s: LessonMaterialTemplateSection) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const [showLinks, setShowLinks] = useState(false);
  const links = s.links ?? [];
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-white ${isDragging ? 'shadow-lg border-blue-300 relative z-10' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" {...attributes} {...listeners} className="px-1 text-gray-300 hover:text-gray-600 cursor-grab touch-none" title="끌어서 차례 바꾸기">⠿</button>
        <span className="text-xs text-gray-400 w-4 text-right">{index + 1}</span>
        <input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })}
          className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none" />
        <button type="button" onClick={() => setShowLinks((v) => !v)}
          className={`text-xs px-2 py-1 rounded-md ${links.length ? 'bg-blue-50 text-blue-700' : 'text-gray-400 hover:bg-gray-100'}`}>
          🔗 {links.length || '링크'}
        </button>
        <button type="button" onClick={onRemove} className="px-1.5 text-gray-300 hover:text-red-600" title="빼기">✕</button>
      </div>
      {showLinks && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/60">
          <p className="text-[11px] text-gray-500 mb-1.5">이 칸 옆에 보일 참고 링크 (예: 모의수업 영상)</p>
          <LinkRows links={links} onChange={(l) => onChange({ ...s, links: l })} />
        </div>
      )}
    </div>
  );
}

function SectionEditor({ sections, onChange }: { sections: LessonMaterialTemplateSection[]; onChange: (s: LessonMaterialTemplateSection[]) => void }) {
  const [input, setInput] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }));
  const reorder = reorderTemplateSections;
  const add = () => {
    const added = templateSectionsFromText(input);   // 여러 줄 붙여넣기 → 한 번에 여러 칸
    if (!added.length) return;
    onChange(reorder([...sections, ...added]));
    setInput('');
  };
  return (
    <div className="space-y-1.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={(e) => {
          if (!e.over || e.active.id === e.over.id) return;
          const from = sections.findIndex((s) => s.id === e.active.id);
          const to = sections.findIndex((s) => s.id === e.over!.id);
          onChange(reorder(arrayMove(sections, from, to)));
        }}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((s, i) => (
            <SectionRow key={s.id} s={s} index={i}
              onChange={(n) => onChange(sections.map((x) => (x.id === s.id ? n : x)))}
              onRemove={() => onChange(reorder(sections.filter((x) => x.id !== s.id)))} />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex gap-1.5">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.includes('\n')) { e.preventDefault(); setInput(text); }
          }}
          placeholder="소제목 입력 후 Enter (예: 1차시 수업자료) — 여러 줄을 붙여넣으면 한 번에"
          className="flex-1 min-w-0 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-solid" />
        <button type="button" onClick={add} disabled={!input.trim()} className="px-3 py-2 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-30">추가</button>
      </div>
      {input.includes('\n') && <p className="text-[11px] text-blue-600">{input.split('\n').filter((v) => v.trim()).length}개 칸을 한 번에 추가합니다.</p>}
    </div>
  );
}

// ── 만들기·고치기 창 ─────────────────────────────────────────────

function TemplateEditor({ draft: initial, codes, templates, onClose, onSaved, nextOrder }: {
  draft: Draft; codes: JobCodeWithId[]; templates: LessonMaterialTemplate[];
  onClose: () => void; onSaved: () => Promise<void>; nextOrder: number;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [touchedAudience, setTouchedAudience] = useState(!!initial.id);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const close = () => { if (!dirty || confirm('저장하지 않은 내용이 있습니다. 닫을까요?')) onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** 새 템플릿 — 제목으로 대상 추천 (패턴 → 수업, 방OT → 담임·수업, 그 밖 → 담임, 레슨플랜 → 원어민 반별) */
  const onTitle = (title: string) => {
    if (isNew && !touchedAudience) {
      const s = suggestLessonAudience(title);
      set({ title, audience: s.audience, perClass: !!s.perClass });
    } else set({ title });
  };
  const fillLessonPlan = () => {
    setTouchedAudience(true);
    set(lessonPlanPreset(d.code));
  };
  const copyFrom = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTouchedAudience(true);
    set(copyTemplatePreset(t, d.code));
  };
  const copyChoices = useMemo(() => templateCopyChoices(templates, d.code), [templates, d.code]);

  const problem = lessonTemplateProblem(d, templates);

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    const payload = lessonTemplatePayload(d);
    const { sections } = payload;
    try {
      if (isNew) {
        await addLessonMaterialTemplate(payload.title, sections.map(({ id: _id, ...rest }) => rest), payload.code, payload.links, { audience: payload.audience, perClass: payload.perClass, order: nextOrder });
      } else {
        await updateLessonMaterialTemplate(d.id!, payload);
      }
      toast.success(isNew ? '템플릿을 만들었습니다.' : '저장했습니다.');
      await onSaved();
    } catch (e) {
      logger.error('템플릿 저장 실패:', e);
      toast.error('저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removedWithUploads = !isNew && initial.sections.some((s) => !d.sections.find((x) => x.id === s.id));
  const label = 'block text-xs font-semibold text-gray-500 tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/30" onClick={close}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600">{d.code || '코드 없음'}</p>
            <h2 className="text-lg font-bold text-gray-900">{isNew ? '새 템플릿' : '템플릿 수정'}</h2>
          </div>
          <div className="flex-1" />
          <button onClick={close} className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500" title="닫기 (Esc)">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {isNew && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">빠르게 시작</span>
              <button type="button" onClick={fillLessonPlan} className="text-xs px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium">🌏 원어민 레슨플랜</button>
              <select value="" onChange={(e) => e.target.value && copyFrom(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-white max-w-[240px]">
                <option value="">📋 다른 캠프 템플릿 복사…</option>
                {copyChoices.map((t) => <option key={t.id} value={t.id}>[{t.code}] {t.title}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={label}>이름</label>
            <input value={d.title} onChange={(e) => onTitle(e.target.value)} autoFocus={isNew} placeholder={`예: ${d.code || 'S29'} 반OT`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {!isNew && !codes.some((c) => c.code === initial.code) && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-amber-700">캠프 코드</span>
                <select value={d.code} onChange={(e) => set({ code: e.target.value })} className="text-sm border rounded-lg px-2 py-1 bg-white">
                  <option value="">고르세요</option>
                  {[...codes].sort((a, b) => genNum(String(b.generation)) - genNum(String(a.generation)) || compareCampCodes(a.code, b.code)).map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className={label}>누가 올리나요</label>
            <AudiencePicker audience={d.audience} perClass={d.perClass} onChange={(a, pc) => { setTouchedAudience(true); set({ audience: a, perClass: pc }); }} />
          </div>

          <div>
            <label className={label}>안내 링크 <span className="font-normal text-gray-400">— 주제 제목 옆 (예: Canva 템플릿, 가이드라인)</span></label>
            <LinkRows links={d.links} onChange={(links) => set({ links })} />
          </div>

          <div>
            <label className={label}>
              소제목 (칸) <span className="font-normal text-gray-400">— 하나마다 링크 한 칸{d.perClass ? ', 반별 칸 뒤에 붙습니다' : ''}</span>
            </label>
            {d.perClass && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">반별 칸은 자동으로 생깁니다. 여기에는 반과 상관없는 칸만 넣으세요 (예: Outdoor Class). 없어도 됩니다.</p>}
            <SectionEditor sections={d.sections} onChange={(sections) => set({ sections })} />
            {removedWithUploads && <p className="text-xs text-amber-700 mt-2">뺀 소제목은 수업 탭에서 칸이 사라집니다. 이미 올린 링크는 지워지지 않고, 올린 사람에게만 남아 보입니다.</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-3">
          {problem ? <p className="text-xs text-red-600 flex-1">{problem}</p> : <p className="text-xs text-gray-400 flex-1">{dirty ? '저장하면 수업 탭에 바로 반영됩니다.' : '바뀐 내용이 없습니다.'}</p>}
          <button onClick={close} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">취소</button>
          <button onClick={save} disabled={!!problem || saving || (!isNew && !dirty)} className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-40">
            {saving ? '저장 중…' : isNew ? '만들기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 다른 캠프에서 가져오기 ───────────────────────────────────────

function ImportDialog({ target, codes, templates, onClose, onDone }: {
  target: JobCodeWithId; codes: JobCodeWithId[]; templates: LessonMaterialTemplate[];
  onClose: () => void; onDone: () => Promise<void>;
}) {
  // 같은 종류(코드 첫 글자)의 지난 기수를 먼저
  const sources = useMemo(() => lessonImportSources(templates, codes, target.code), [templates, codes, target.code]);
  const [src, setSrc] = useState(sources[0] ?? '');
  const srcList = useMemo(() => sortLessonTemplates(templates.filter((t) => t.code === src)), [templates, src]);
  const existing = useMemo(() => new Set(templates.filter((t) => t.code === target.code).map((t) => t.title.trim())), [templates, target.code]);
  const titleOf = (t: LessonMaterialTemplate) => swapCode(t.title, src, target.code);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { setPicked(new Set(srcList.filter((t) => !existing.has(titleOf(t).trim())).map((t) => t.id))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [srcList]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const chosen = srcList.filter((t) => picked.has(t.id));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const base = templates.filter((t) => t.code === target.code).length;
      for (let i = 0; i < chosen.length; i++) {
        const t = chosen[i];
        await addLessonMaterialTemplate(...importTemplateArgs(t, src, target.code, base + i));
      }
      toast.success(`${chosen.length}개를 ${target.code}에 가져왔습니다.`);
      await onDone();
    } catch (e) {
      logger.error('템플릿 가져오기 실패:', e);
      toast.error('가져오다 멈췄습니다. 목록을 확인해 주세요.');
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900">다른 캠프에서 가져오기 → {target.code}</h2>
          <p className="text-sm text-gray-500 mt-0.5">소제목·안내 링크·대상까지 그대로 복사합니다. 제목 앞의 캠프 코드는 {target.code}로 바꿉니다.</p>
          <select value={src} onChange={(e) => setSrc(e.target.value)} className="mt-3 border rounded-lg px-3 py-2 text-sm bg-white">
            {sources.map((c) => {
              const info = codes.find((x) => x.code === c);
              return <option key={c} value={c}>{c} {info?.name ?? ''} ({templates.filter((t) => t.code === c).length}개)</option>;
            })}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-1">
          {srcList.map((t) => {
            const dup = existing.has(titleOf(t).trim());
            return (
              <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${dup ? 'opacity-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                <input type="checkbox" disabled={dup} checked={picked.has(t.id)}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900">{titleOf(t)}</span>
                  <span className="block text-xs text-gray-400 truncate">
                    {audienceLabel(t)}{t.perClass ? ' · 반별' : ''} · 소제목 {(t.sections ?? []).length}개{dup ? ' · 이미 있음' : ''}
                  </span>
                </span>
              </label>
            );
          })}
          {!srcList.length && <p className="text-sm text-gray-400 py-6 text-center">가져올 템플릿이 없습니다.</p>}
        </div>
        <div className="px-6 py-4 border-t flex items-center gap-2">
          <p className="text-xs text-gray-400 flex-1">{picked.size}개 선택</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">취소</button>
          <button onClick={run} disabled={!picked.size || busy} className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-40">
            {busy ? '가져오는 중…' : `${picked.size}개 가져오기`}
          </button>
        </div>
      </div>
    </div>
  );
}
