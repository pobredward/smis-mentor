'use client';

/**
 * 캠프 → 수업 탭 — 내가 올려야 할 수업 자료와 올린 링크.
 *
 * - 어떤 템플릿(주제)이 보이는지는 템플릿 대상(한국인 멘토·원어민, 담임·수업…)으로 정한다 — 규칙은 shared/utils/lessonPlan.ts
 * - 원어민 레슨플랜처럼 '반별로 만들기' 템플릿은 맡은 그룹의 반마다 칸이 생긴다 (보조 교재 반은 하나 더)
 * - 맨 위 진행률 · 칸마다 올림/아직 표시 · '링크 올리기'는 창에서 (자주 하는 링크 실수를 잡아 준다)
 * - 원어민은 영어 화면 + 링크 한 칸 (구글 문서·드라이브)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  addLessonMaterial,
  addSection,
  clearTemplateSection,
  deleteLessonMaterial,
  deleteSection,
  saveTemplateSection,
  updateLessonMaterial,
  updateSection,
  type LessonMaterialData,
} from '@/lib/lessonMaterialService';
import { getUserJobCodesInfo, getUsersByJobCodeId } from '@/lib/firebaseService';
import { campQueryKeys } from '@/hooks/useCampDataPrefetch';
import LessonPlanHub from '@/components/lessonPlan/LessonPlanHub';
import {
  L,
  audienceOf,
  checkLessonLinks,
  hasLessonLink,
  lessonProgress,
  lessonViewerOf,
  loadLessonBundle,
  logger,
  resolveActiveJobCodeId,
  safeLessonUrl,
  type LessonBundle,
  type LessonLinkIssue,
  type LessonSectionView,
  type LessonTopic,
  type LessonViewer,
} from '@smis-mentor/shared';

/** 본인 수업 탭에서는 대주제 문서가 항상 있다 (없으면 불러올 때 만든다) */
type Topic = LessonTopic & { material: LessonMaterialData };
type LessonState = Omit<LessonBundle, 'topics' | 'custom'> & { topics: Topic[]; custom: Topic[] };

type LinkMode = 'canva' | 'single';

/** 원어민 자료(반별 레슨플랜 등)는 링크 한 칸, 한국인 멘토 Canva 자료는 공개보기 + 원본 */
function linkModeOf(topic: Topic, viewer: LessonViewer): LinkMode {
  if (topic.template?.perClass) return 'single';
  if (topic.template) {
    const a = audienceOf(topic.template);
    if (a.roles.length === 1 && a.roles[0] === 'foreign') return 'single';
  }
  return viewer.kind === 'foreign' ? 'single' : 'canva';
}

const processedKey = (uid: string, jobCodeId: string) => ['processedLesson2', uid, jobCodeId] as const;

/** 내 수업 자료 — 규칙·중복 처리는 shared 의 loadLessonBundle (앱과 같은 코드) */
async function loadLesson(user: { userId: string; role?: string; jobExperiences?: any[] }, jobCodeId: string): Promise<LessonState> {
  const viewer = lessonViewerOf(user as any, jobCodeId);
  const [info] = await getUserJobCodesInfo([jobCodeId]);
  const bundle = await loadLessonBundle(db, {
    userId: user.userId,
    viewer,
    code: String(info?.code ?? ''),
    jobCodeId,
    createMissing: true,
    members: () => getUsersByJobCodeId(jobCodeId) as any,
  });
  return bundle as LessonState;
}

export default function LessonContent() {
  const { userData, loading: authLoading } = useAuth();
  const jobCodeId = resolveActiveJobCodeId(userData);
  const queryClient = useQueryClient();
  const [state, setState] = useState<LessonState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<{ topicId: string; section: LessonSectionView | null } | null>(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');

  const uid = userData?.userId ?? '';
  // 역할·그룹·반이 바뀌면(관리자가 배정을 고치면) 다시 불러온다
  const viewerKey = JSON.stringify(lessonViewerOf(userData as any, jobCodeId));
  /** 불러오기 차례 — 늦게 끝난 옛 요청이 새 결과를 덮지 않게 */
  const loadSeq = useRef(0);
  /** 화면에서 고친 횟수 — 불러오는 사이에 저장했으면 그 결과(저장 전 값)는 버린다 */
  const editSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!userData || !jobCodeId) return;
    const seq = ++loadSeq.current;
    const edits = editSeq.current;
    try {
      const next = await loadLesson(userData as any, jobCodeId);
      if (seq !== loadSeq.current || edits !== editSeq.current) return;
      setState(next);
      setFailed(false);
      queryClient.setQueryData(processedKey(userData.userId, jobCodeId), next);
      queryClient.invalidateQueries({ queryKey: campQueryKeys.lessonMaterials(userData.userId) });
    } catch (e) {
      if (seq !== loadSeq.current) return;
      logger.error('수업 자료 불러오기 실패:', e);
      setFailed(true);
      toast.error(L('lesson.loadFailed'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, jobCodeId, viewerKey]);

  useEffect(() => {
    if (!userData || !jobCodeId) { setLoading(false); return; }
    // 탭을 다시 열면 지난번 결과를 먼저 보여 주고 뒤에서 새로 불러온다 (다른 캠프의 결과는 보이지 않게)
    const cached = queryClient.getQueryData<LessonState>(processedKey(userData.userId, jobCodeId));
    setState(cached ?? null);
    setLoading(!cached);
    setFailed(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  /** 화면 상태 고치기 + 캐시도 같이 */
  const patch = (fn: (s: LessonState) => LessonState) => {
    editSeq.current += 1;
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (uid && jobCodeId) queryClient.setQueryData(processedKey(uid, jobCodeId), next);
      return next;
    });
  };
  const patchTopic = (topicId: string, fn: (t: Topic) => Topic) =>
    patch((s) => ({
      ...s,
      topics: s.topics.map((t) => (t.material.id === topicId ? fn(t) : t)),
      custom: s.custom.map((t) => (t.material.id === topicId ? fn(t) : t)),
    }));

  const findTopic = (topicId: string) => state?.topics.find((t) => t.material.id === topicId) ?? state?.custom.find((t) => t.material.id === topicId);

  // ── 저장 · 삭제 ───────────────────────────────────────────────
  /** 템플릿 칸은 칸 id(templateSectionId)로 찾는다 — 창을 연 뒤 다른 기기에서 먼저 채웠어도 같은 칸 */
  const sameSlot = (a: LessonSectionView, b: LessonSectionView) =>
    a.isFromTemplate && b.isFromTemplate && !!a.templateSectionId ? a.templateSectionId === b.templateSectionId : a.id === b.id;

  const saveSection = async (topicId: string, section: LessonSectionView | null, data: { title: string; viewUrl: string; originalUrl: string }) => {
    const topic = findTopic(topicId);
    if (!topic) return false;
    try {
      if (!section) {
        // 직접 추가하는 소제목
        const order = topic.sections.length;
        const id = await addSection(topicId, { title: data.title, viewUrl: data.viewUrl, originalUrl: data.originalUrl, order });
        patchTopic(topicId, (t) => ({ ...t, sections: [...t.sections, { id, title: data.title, viewUrl: data.viewUrl, originalUrl: data.originalUrl, order, isFromTemplate: false, links: [] }] }));
      } else if (section.isFromTemplate && section.templateSectionId) {
        // 템플릿 칸 — 이미 문서가 있으면(다른 기기 포함) 그걸 고치고, 없으면 만든다
        const id = await saveTemplateSection(topicId, section.templateSectionId, { title: section.title, order: section.order, viewUrl: data.viewUrl, originalUrl: data.originalUrl });
        patchTopic(topicId, (t) => ({ ...t, sections: t.sections.map((s) => (sameSlot(s, section) ? { ...s, id, viewUrl: data.viewUrl, originalUrl: data.originalUrl, isPlaceholder: false } : s)) }));
      } else {
        await updateSection(topicId, section.id, { viewUrl: data.viewUrl, originalUrl: data.originalUrl, title: data.title });
        patchTopic(topicId, (t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, title: data.title, viewUrl: data.viewUrl, originalUrl: data.originalUrl } : s)) }));
      }
      toast.success(L('lesson.saved'));
      return true;
    } catch (e) {
      logger.error('수업 자료 저장 실패:', e);
      toast.error(L('lesson.saveFailed'));
      return false;
    }
  };

  /** 템플릿 칸의 링크 지우기 — 그 칸의 문서를 지우면 빈 칸으로 돌아간다 */
  const clearSection = async (topicId: string, section: LessonSectionView) => {
    if (!section.templateSectionId) return false;
    try {
      await clearTemplateSection(topicId, section.templateSectionId);
      patchTopic(topicId, (t) => ({
        ...t,
        sections: t.sections.map((s) => (sameSlot(s, section) ? { ...s, id: `template-${section.templateSectionId}`, viewUrl: '', originalUrl: '', isPlaceholder: true } : s)),
      }));
      toast.success(L('lesson.cleared'));
      return true;
    } catch (e) {
      logger.error('링크 지우기 실패:', e);
      toast.error(L('lesson.saveFailed'));
      return false;
    }
  };

  const removeSection = async (topicId: string, section: LessonSectionView) => {
    if (!confirm(L('lesson.confirmDeleteItem'))) return false;
    try {
      await deleteSection(topicId, section.id);
      patchTopic(topicId, (t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }));
      toast.success(L('lesson.deleted'));
      return true;
    } catch (e) {
      logger.error('자료 삭제 실패:', e);
      toast.error(L('lesson.saveFailed'));
      return false;
    }
  };

  const addTopic = async () => {
    const title = topicTitle.trim();
    if (!title || !state || !uid) return;
    try {
      const order = state.topics.length + state.custom.length;
      const id = await addLessonMaterial(uid, title, order);
      await updateLessonMaterial(id, { userCode: state.code } as Partial<LessonMaterialData>);
      patch((s) => ({ ...s, custom: [...s.custom, { material: { id, userId: uid, title, order, userCode: s.code }, sections: [] }] }));
      setTopicTitle('');
      setAddingTopic(false);
      toast.success(L('lesson.saved'));
    } catch (e) {
      logger.error('주제 추가 실패:', e);
      toast.error(L('lesson.saveFailed'));
    }
  };

  const removeTopic = async (topicId: string) => {
    if (!confirm(L('lesson.confirmDeleteTopic'))) return;
    try {
      await deleteLessonMaterial(topicId);
      patch((s) => ({ ...s, custom: s.custom.filter((t) => t.material.id !== topicId) }));
      toast.success(L('lesson.deleted'));
    } catch (e) {
      logger.error('주제 삭제 실패:', e);
      toast.error(L('lesson.saveFailed'));
    }
  };

  const progress = useMemo(() => {
    const list = state?.topics.flatMap((t) => t.sections) ?? [];
    return lessonProgress(list);
  }, [state]);

  // ── 화면 ───────────────────────────────────────────────────────
  if (authLoading || (loading && !state)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        <p className="mt-3 text-sm">{L('lesson.loading')}</p>
      </div>
    );
  }
  if (!userData) return <EmptyState title={L('lesson.loginRequired')} />;
  if (!jobCodeId) {
    return (
      <EmptyState title={L('lesson.noActiveCamp')} hint={L('lesson.noActiveCampHint')}>
        <a href="/profile" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">{L('lesson.goProfile')}</a>
      </EmptyState>
    );
  }
  if (failed && !state) {
    return (
      <EmptyState title={L('lesson.loadFailed')}>
        <button onClick={() => { setLoading(true); refresh(); }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{L('lesson.retry')}</button>
      </EmptyState>
    );
  }
  if (!state) return null;

  const { viewer, topics, custom, code } = state;
  const roleLine = viewer.kind === 'admin'
    ? L('lesson.adminPreview')
    : viewer.kind === 'foreign'
      ? [viewer.groupRole, viewer.group && viewer.group.charAt(0).toUpperCase() + viewer.group.slice(1)].filter(Boolean).join(' · ')
      : viewer.groupRole ? L('lesson.mentorRole', { role: viewer.groupRole }) : '';
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const dialogTopic = dialog ? findTopic(dialog.topicId) : undefined;

  return (
    <div className="py-4 px-3 sm:px-4 space-y-4">
      {/* 머리 — 누구 기준인지와 진행률 */}
      <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600">{code}</p>
            <h2 className="text-lg font-bold text-gray-900 leading-tight mt-0.5">{L('lesson.title')}</h2>
            {roleLine && <p className="text-sm text-gray-500 mt-1">{roleLine}</p>}
          </div>
          {progress.total > 0 && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-extrabold text-gray-900 leading-none">
                {progress.done}<span className="text-base font-bold text-gray-400">/{progress.total}</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">{progress.done === progress.total ? L('lesson.allDone') : L('lesson.uploadedCount')}</p>
            </div>
          )}
        </div>
        {progress.total > 0 && (
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* 원어민 — 앱에서 쓰는 레슨플랜 (교재마다) */}
      {viewer.kind === 'foreign' && jobCodeId && <LessonPlanHub jobCodeId={jobCodeId} />}

      {topics.length === 0 && custom.length === 0 && (
        <EmptyState title={L('lesson.noTemplates')} hint={L('lesson.noTemplatesHint')} />
      )}

      {topics.map((t) => (
        <TopicCard
          key={t.material.id}
          topic={t}
          mode={linkModeOf(t, viewer)}
          perClassEmpty={!!t.template?.perClass && !state.classes.length}
          onOpen={(section) => setDialog({ topicId: t.material.id, section })}
        />
      ))}

      {/* 직접 추가한 주제 */}
      {(custom.length > 0 || code) && (
        <div className="pt-2">
          <p className="text-xs font-semibold text-gray-400 tracking-wide px-1 mb-2">{L('lesson.myTopics')}</p>
          <div className="space-y-3">
            {custom.map((t) => (
              <TopicCard
                key={t.material.id}
                topic={t}
                mode={linkModeOf(t, viewer)}
                onOpen={(section) => setDialog({ topicId: t.material.id, section })}
                onDeleteTopic={() => removeTopic(t.material.id)}
              />
            ))}
          </div>
          {addingTopic ? (
            <div className="mt-3 rounded-xl bg-white ring-1 ring-blue-200 p-3 flex gap-2">
              <input
                autoFocus
                value={topicTitle}
                onChange={(e) => setTopicTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); if (e.key === 'Escape') setAddingTopic(false); }}
                placeholder={L('lesson.topicPlaceholder')}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => setAddingTopic(false)} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L('lesson.cancel')}</button>
              <button onClick={addTopic} disabled={!topicTitle.trim()} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40">{L('lesson.add')}</button>
            </div>
          ) : (
            <button onClick={() => setAddingTopic(true)} className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700">
              + {L('lesson.addTopic')}
            </button>
          )}
        </div>
      )}

      {dialog && dialogTopic && (
        <LinkDialog
          topic={dialogTopic}
          section={dialog.section}
          mode={linkModeOf(dialogTopic, viewer)}
          onClose={() => setDialog(null)}
          onSave={async (data) => { if (await saveSection(dialog.topicId, dialog.section, data)) setDialog(null); }}
          onClear={dialog.section?.isFromTemplate && hasLessonLink(dialog.section)
            ? async () => { if (await clearSection(dialog.topicId, dialog.section!)) setDialog(null); }
            : undefined}
          onDelete={dialog.section && !dialog.section.isFromTemplate
            ? async () => { if (await removeSection(dialog.topicId, dialog.section!)) setDialog(null); }
            : undefined}
        />
      )}
    </div>
  );
}

function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center text-gray-400">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <p className="font-semibold text-gray-700">{title}</p>
      {hint && <p className="text-sm text-gray-400 mt-1">{hint}</p>}
      {children}
    </div>
  );
}

/** 주제 하나 — 머리(제목·가이드 링크·진행률)와 칸 목록 */
function TopicCard({ topic, mode, perClassEmpty, onOpen, onDeleteTopic }: {
  topic: Topic;
  mode: LinkMode;
  perClassEmpty?: boolean;
  onOpen: (section: LessonSectionView | null) => void;
  onDeleteTopic?: () => void;
}) {
  const p = lessonProgress(topic.sections);
  const done = p.total > 0 && p.done === p.total;
  const guide = (topic.template?.links ?? []).map((l) => ({ ...l, url: safeLessonUrl(l.url) })).filter((l) => l.label && l.url);
  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 truncate">{topic.material.title}</h3>
            {p.total > 0 && (
              <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {done ? '✓ ' : ''}{p.done}/{p.total}
              </span>
            )}
          </div>
          {guide.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {guide.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100">
                  <ExternalIcon /> {l.label}
                </a>
              ))}
            </div>
          )}
          {topic.template?.perClass && <p className="text-[11px] text-gray-400 mt-1">{L('lesson.perClassNote')}</p>}
        </div>
        {onDeleteTopic && (
          <button onClick={onDeleteTopic} className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50" title={L('lesson.deleteTopic')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>

      {perClassEmpty && <p className="px-4 py-3 text-sm text-amber-700 bg-amber-50">{L('lesson.perClassEmpty')}</p>}

      <ul className="divide-y divide-gray-100">
        {topic.sections.map((s) => <SectionRow key={s.id} section={s} mode={mode} onOpen={() => onOpen(s)} />)}
      </ul>

      <button onClick={() => onOpen(null)} className="w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100 text-left">
        + {L('lesson.addItem')}
      </button>
    </div>
  );
}

function SectionRow({ section, mode, onOpen }: { section: LessonSectionView; mode: LinkMode; onOpen: () => void }) {
  const has = hasLessonLink(section);
  const view = safeLessonUrl(section.viewUrl) || safeLessonUrl(section.originalUrl);
  const original = safeLessonUrl(section.originalUrl);
  const extra = (section.links ?? []).map((l) => ({ ...l, url: safeLessonUrl(l.url) })).filter((l) => l.url);
  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${has ? 'bg-emerald-500 text-white' : 'ring-2 ring-inset ring-gray-200'}`}>
        {has ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${has ? 'text-gray-900' : 'text-gray-600'}`}>{section.title}</p>
        {extra.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {extra.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                <ExternalIcon /> {l.label || 'Link'}
              </a>
            ))}
          </div>
        )}
      </div>
      {has ? (
        <div className="flex items-center gap-1 shrink-0">
          {view && (
            <a href={view} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100">
              {L('lesson.view')}
            </a>
          )}
          {mode === 'canva' && original && (
            <a href={original} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
              {L('lesson.original')}
            </a>
          )}
          <button onClick={onOpen} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" title={L('lesson.edit')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        </div>
      ) : (
        <button onClick={onOpen} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700">
          {L('lesson.addLink')}
        </button>
      )}
    </li>
  );
}

const ISSUE_TEXT: Record<LessonLinkIssue, () => string> = {
  invalid: () => L('lesson.issueInvalid'),
  canvaEditInView: () => L('lesson.issueEditInView'),
  canvaViewInOriginal: () => L('lesson.issueViewInOriginal'),
  sameLink: () => L('lesson.issueSame'),
};

/** 링크 올리기 창 — Canva(공개보기 + 원본) 또는 링크 한 칸 */
function LinkDialog({ topic, section, mode, onClose, onSave, onClear, onDelete }: {
  topic: Topic;
  section: LessonSectionView | null;
  mode: LinkMode;
  onClose: () => void;
  onSave: (data: { title: string; viewUrl: string; originalUrl: string }) => Promise<void>;
  onClear?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const fixedTitle = !!section?.isFromTemplate;
  const [title, setTitle] = useState(section?.title ?? '');
  const [viewUrl, setViewUrl] = useState(section?.viewUrl ?? '');
  const [originalUrl, setOriginalUrl] = useState(section?.originalUrl ?? '');
  const [single, setSingle] = useState(section?.viewUrl || section?.originalUrl || '');
  const [busy, setBusy] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const issues = mode === 'canva' ? checkLessonLinks(viewUrl, originalUrl) : checkLessonLinks(single, '');
  const blocking = (mode === 'canva' ? [issues.view, issues.original] : [issues.view]).includes('invalid');
  const empty = mode === 'canva' ? !viewUrl.trim() && !originalUrl.trim() : !single.trim();
  const canSave = !busy && !blocking && !empty && (fixedTitle || !!title.trim());

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    const data = mode === 'canva'
      ? { title: title.trim(), viewUrl: viewUrl.trim(), originalUrl: originalUrl.trim() }
      : { title: title.trim(), viewUrl: single.trim(), originalUrl: single.trim() };
    await onSave(data);
    setBusy(false);
  };
  const run = async (fn?: () => Promise<void>) => { if (!fn) return; setBusy(true); await fn(); setBusy(false); };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-blue-600 truncate">{topic.material.title}</p>
          {fixedTitle ? (
            <h3 className="text-lg font-bold text-gray-900 mt-0.5">{section!.title}</h3>
          ) : (
            <input
              autoFocus={!section}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={L('lesson.itemPlaceholder')}
              className="mt-1 w-full text-lg font-bold text-gray-900 border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
            />
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {mode === 'canva' ? (
            <>
              <LinkField label={L('lesson.viewLink')} help={L('lesson.viewLinkHelp')} value={viewUrl} onChange={setViewUrl}
                placeholder="https://www.canva.com/design/…/view" issue={issues.view} autoFocus={fixedTitle} onEnter={submit} />
              <LinkField label={L('lesson.originalLink')} help={L('lesson.originalLinkHelp')} value={originalUrl} onChange={setOriginalUrl}
                placeholder="https://www.canva.com/design/…/edit" issue={issues.original} onEnter={submit} />
              <div>
                <button type="button" onClick={() => setShowHow((v) => !v)} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                  {showHow ? '▾' : '▸'} {L('lesson.howTo')}
                </button>
                {showHow && (
                  <ol className="mt-2 text-xs text-gray-600 space-y-1.5 bg-gray-50 rounded-xl p-3 list-decimal pl-7">
                    <li>{L('lesson.howToView')}</li>
                    <li>{L('lesson.howToOriginal')}</li>
                    <li>{L('lesson.howToCheck')}</li>
                  </ol>
                )}
              </div>
            </>
          ) : (
            <LinkField label={L('lesson.singleLink')} help={L('lesson.singleLinkHelp')} value={single} onChange={setSingle}
              placeholder="https://docs.google.com/document/d/…" issue={issues.view} autoFocus={fixedTitle} onEnter={submit} />
          )}
        </div>

        <div className="px-5 pb-5 flex items-center gap-2">
          {onClear && <button onClick={() => run(onClear)} disabled={busy} className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50">{L('lesson.clearLink')}</button>}
          {onDelete && <button onClick={() => run(onDelete)} disabled={busy} className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50">{L('lesson.delete')}</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L('lesson.cancel')}</button>
          <button onClick={submit} disabled={!canSave} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-40">
            {busy ? '…' : L('lesson.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkField({ label, help, value, onChange, placeholder, issue, autoFocus, onEnter }: {
  label: string; help: string; value: string; onChange: (v: string) => void; placeholder: string;
  issue?: LessonLinkIssue; autoFocus?: boolean; onEnter: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1">{label}</label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
        placeholder={placeholder}
        inputMode="url"
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${issue ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-blue-500'}`}
      />
      {issue ? <p className="text-xs text-amber-700 mt-1">⚠️ {ISSUE_TEXT[issue]()}</p> : <p className="text-xs text-gray-400 mt-1">{help}</p>}
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
  );
}
