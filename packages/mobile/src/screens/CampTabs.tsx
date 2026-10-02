/**
 * 캠프 → 수업 탭 (앱) — 내가 올려야 할 수업 자료와 올린 링크. web 의 LessonContent 와 같은 규칙.
 *
 * - 어떤 주제가 보이는지는 템플릿 대상(한국인 멘토·원어민, 담임·수업…)이 정한다 — shared/utils/lessonPlan.ts
 * - '반별로 만들기' 템플릿(원어민 레슨플랜)은 맡은 그룹의 반마다 칸이 생긴다 (보조 교재 반은 하나 더)
 * - 맨 위 진행률 · 칸마다 올림/아직 · '링크 올리기'는 아래에서 올라오는 창에서 (링크 실수를 잡아 준다)
 * - 원어민은 영어 화면 + 링크 한 칸
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
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
} from '../services/lessonMaterialService';
import { getUserJobCodesInfo } from '../services/authService';
import { getUsersByJobCodeId } from '../services/userService';
import { LessonPlanHubCard } from './LessonPlanScreen';
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

const BLUE = '#2563eb';
const GREEN = '#10b981';

function linkModeOf(topic: Topic, viewer: LessonViewer): LinkMode {
  if (topic.template?.perClass) return 'single';
  if (topic.template) {
    const a = audienceOf(topic.template);
    if (a.roles.length === 1 && a.roles[0] === 'foreign') return 'single';
  }
  return viewer.kind === 'foreign' ? 'single' : 'canva';
}

/** 내 수업 자료 — 규칙·중복 처리는 shared 의 loadLessonBundle (web 과 같은 코드) */
async function loadLesson(user: any, jobCodeId: string): Promise<LessonState> {
  const viewer = lessonViewerOf(user, jobCodeId);
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

/** http(s) 주소만 연다 — 사용자가 넣은 링크는 그대로 믿지 않는다 */
const openUrl = (url?: string) => { const u = safeLessonUrl(url); if (u) Linking.openURL(u).catch(() => undefined); };

export function LessonScreen() {
  const { userData, loading: authLoading } = useAuth();
  const jobCodeId = resolveActiveJobCodeId(userData);
  const [state, setState] = useState<LessonState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    if (!userData || !jobCodeId) { setLoading(false); setRefreshing(false); return; }
    const seq = ++loadSeq.current;
    const edits = editSeq.current;
    try {
      const next = await loadLesson(userData, jobCodeId);
      if (seq !== loadSeq.current || edits !== editSeq.current) return;
      setState(next);
      setFailed(false);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      logger.error('수업 자료 불러오기 실패:', e);
      setFailed(true);
    } finally {
      if (seq === loadSeq.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, jobCodeId, viewerKey]);

  // 캠프·역할이 바뀌면 지난 화면을 비우고 새로
  useEffect(() => { setState(null); setLoading(true); refresh(); }, [refresh]);

  const patchTopic = (topicId: string, fn: (t: Topic) => Topic) => {
    editSeq.current += 1;
    setState((s) => s && {
      ...s,
      topics: s.topics.map((t) => (t.material.id === topicId ? fn(t) : t)),
      custom: s.custom.map((t) => (t.material.id === topicId ? fn(t) : t)),
    });
  };
  const findTopic = (topicId: string) => state?.topics.find((t) => t.material.id === topicId) ?? state?.custom.find((t) => t.material.id === topicId);

  /** 템플릿 칸은 칸 id(templateSectionId)로 찾는다 — 창을 연 뒤 다른 기기에서 먼저 채웠어도 같은 칸 */
  const sameSlot = (a: LessonSectionView, b: LessonSectionView) =>
    a.isFromTemplate && b.isFromTemplate && !!a.templateSectionId ? a.templateSectionId === b.templateSectionId : a.id === b.id;

  const saveSection = async (topicId: string, section: LessonSectionView | null, data: { title: string; viewUrl: string; originalUrl: string }) => {
    const topic = findTopic(topicId);
    if (!topic) return false;
    try {
      if (!section) {
        const order = topic.sections.length;
        const id = await addSection(topicId, { ...data, order });
        patchTopic(topicId, (t) => ({ ...t, sections: [...t.sections, { id, ...data, order, isFromTemplate: false, links: [] }] }));
      } else if (section.isFromTemplate && section.templateSectionId) {
        const id = await saveTemplateSection(topicId, section.templateSectionId, { title: section.title, order: section.order, viewUrl: data.viewUrl, originalUrl: data.originalUrl });
        patchTopic(topicId, (t) => ({ ...t, sections: t.sections.map((s) => (sameSlot(s, section) ? { ...s, id, viewUrl: data.viewUrl, originalUrl: data.originalUrl, isPlaceholder: false } : s)) }));
      } else {
        await updateSection(topicId, section.id, { viewUrl: data.viewUrl, originalUrl: data.originalUrl, title: data.title });
        patchTopic(topicId, (t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, title: data.title, viewUrl: data.viewUrl, originalUrl: data.originalUrl } : s)) }));
      }
      return true;
    } catch (e) {
      logger.error('수업 자료 저장 실패:', e);
      Alert.alert(L('lesson.saveFailed'));
      return false;
    }
  };

  const clearSection = async (topicId: string, section: LessonSectionView) => {
    if (!section.templateSectionId) return false;
    try {
      await clearTemplateSection(topicId, section.templateSectionId);
      patchTopic(topicId, (t) => ({
        ...t,
        sections: t.sections.map((s) => (sameSlot(s, section) ? { ...s, id: `template-${section.templateSectionId}`, viewUrl: '', originalUrl: '', isPlaceholder: true } : s)),
      }));
      return true;
    } catch (e) {
      logger.error('링크 지우기 실패:', e);
      Alert.alert(L('lesson.saveFailed'));
      return false;
    }
  };

  const removeSection = (topicId: string, section: LessonSectionView) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(L('lesson.confirmDeleteItem'), undefined, [
        { text: L('lesson.cancel'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: L('lesson.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSection(topicId, section.id);
              patchTopic(topicId, (t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }));
              resolve(true);
            } catch (e) {
              logger.error('자료 삭제 실패:', e);
              Alert.alert(L('lesson.saveFailed'));
              resolve(false);
            }
          },
        },
      ]);
    });

  const addTopic = async () => {
    const title = topicTitle.trim();
    if (!title || !state || !uid) return;
    try {
      const order = state.topics.length + state.custom.length;
      const id = await addLessonMaterial(uid, title, order);
      await updateLessonMaterial(id, { userCode: state.code } as Partial<LessonMaterialData>);
      editSeq.current += 1;
      setState((s) => s && { ...s, custom: [...s.custom, { material: { id, userId: uid, title, order, userCode: s.code }, sections: [] }] });
      setTopicTitle('');
      setAddingTopic(false);
    } catch (e) {
      logger.error('주제 추가 실패:', e);
      Alert.alert(L('lesson.saveFailed'));
    }
  };

  const removeTopic = (topicId: string) =>
    Alert.alert(L('lesson.confirmDeleteTopic'), undefined, [
      { text: L('lesson.cancel'), style: 'cancel' },
      {
        text: L('lesson.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLessonMaterial(topicId);
            editSeq.current += 1;
            setState((s) => s && { ...s, custom: s.custom.filter((t) => t.material.id !== topicId) });
          } catch (e) {
            logger.error('주제 삭제 실패:', e);
            Alert.alert(L('lesson.saveFailed'));
          }
        },
      },
    ]);

  const progress = useMemo(() => lessonProgress(state?.topics.flatMap((t) => t.sections) ?? []), [state]);

  if (authLoading || (loading && !state)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.centerHint}>{L('lesson.loading')}</Text>
      </View>
    );
  }
  if (!userData) return <Empty icon="lock-closed-outline" title={L('lesson.loginRequired')} />;
  if (!jobCodeId) return <Empty icon="settings-outline" title={L('lesson.noActiveCamp')} hint={L('lesson.noActiveCampHint')} />;
  if (failed && !state) {
    return (
      <Empty icon="cloud-offline-outline" title={L('lesson.loadFailed')}>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={() => { setLoading(true); refresh(); }}>
          <Text style={styles.primaryBtnText}>{L('lesson.retry')}</Text>
        </TouchableOpacity>
      </Empty>
    );
  }
  if (!state) return null;

  const { viewer, topics, custom, code } = state;
  const roleLine = viewer.kind === 'admin'
    ? L('lesson.adminPreview')
    : viewer.kind === 'foreign'
      ? [viewer.groupRole, viewer.group && viewer.group.charAt(0).toUpperCase() + viewer.group.slice(1)].filter(Boolean).join(' · ')
      : viewer.groupRole ? L('lesson.mentorRole', { role: viewer.groupRole }) : '';
  const pct = progress.total ? progress.done / progress.total : 0;
  const dialogTopic = dialog ? findTopic(dialog.topicId) : undefined;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} />}
      >
        {/* 머리 — 누구 기준인지와 진행률 */}
        <View style={styles.card}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headCode}>{code}</Text>
              <Text style={styles.headTitle}>{L('lesson.title')}</Text>
              {!!roleLine && <Text style={styles.headRole}>{roleLine}</Text>}
            </View>
            {progress.total > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.headCount}>
                  {progress.done}<Text style={styles.headCountTotal}>/{progress.total}</Text>
                </Text>
                <Text style={styles.headCountLabel}>{progress.done === progress.total ? L('lesson.allDone') : L('lesson.uploadedCount')}</Text>
              </View>
            )}
          </View>
          {progress.total > 0 && (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: pct === 1 ? GREEN : BLUE }]} />
            </View>
          )}
        </View>

        {/* 원어민 — 앱에서 쓰는 레슨플랜 (교재마다) */}
        {viewer.kind === 'foreign' && <LessonPlanHubCard jobCodeId={jobCodeId} />}

        {topics.length === 0 && custom.length === 0 && (
          <Empty icon="document-outline" title={L('lesson.noTemplates')} hint={L('lesson.noTemplatesHint')} />
        )}

        {topics.map((t) => (
          <TopicCard key={t.material.id} topic={t} mode={linkModeOf(t, viewer)}
            perClassEmpty={!!t.template?.perClass && !state.classes.length}
            onOpen={(section) => setDialog({ topicId: t.material.id, section })} />
        ))}

        {/* 직접 추가한 주제 */}
        {!!code && (
          <View style={{ marginTop: 6 }}>
            <Text style={styles.sectionLabel}>{L('lesson.myTopics')}</Text>
            {custom.map((t) => (
              <TopicCard key={t.material.id} topic={t} mode={linkModeOf(t, viewer)}
                onOpen={(section) => setDialog({ topicId: t.material.id, section })}
                onDeleteTopic={() => removeTopic(t.material.id)} />
            ))}
            {addingTopic ? (
              <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <TextInput
                  autoFocus
                  value={topicTitle}
                  onChangeText={setTopicTitle}
                  onSubmitEditing={addTopic}
                  placeholder={L('lesson.topicPlaceholder')}
                  style={[styles.input, { flex: 1 }]}
                />
                <TouchableOpacity onPress={addTopic} disabled={!topicTitle.trim()} style={[styles.primaryBtn, !topicTitle.trim() && { opacity: 0.4 }]}>
                  <Text style={styles.primaryBtnText}>{L('lesson.add')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAddingTopic(false)}>
                  <Ionicons name="close" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.dashedBtn} onPress={() => setAddingTopic(true)}>
                <Text style={styles.dashedBtnText}>+ {L('lesson.addTopic')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {dialog && dialogTopic && (
        <LinkSheet
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
    </View>
  );
}

function Empty({ icon, title, hint, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={52} color="#cbd5e1" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!hint && <Text style={styles.centerHint}>{hint}</Text>}
      {children}
    </View>
  );
}

function TopicCard({ topic, mode, perClassEmpty, onOpen, onDeleteTopic }: {
  topic: Topic; mode: LinkMode; perClassEmpty?: boolean;
  onOpen: (section: LessonSectionView | null) => void; onDeleteTopic?: () => void;
}) {
  const p = lessonProgress(topic.sections);
  const done = p.total > 0 && p.done === p.total;
  const guide = (topic.template?.links ?? []).filter((l) => l.label && l.url);
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
      <View style={styles.topicHead}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.topicTitle} numberOfLines={1}>{topic.material.title}</Text>
            {p.total > 0 && (
              <View style={[styles.pill, done ? styles.pillDone : null]}>
                <Text style={[styles.pillText, done ? { color: '#047857' } : null]}>{done ? '✓ ' : ''}{p.done}/{p.total}</Text>
              </View>
            )}
          </View>
          {guide.length > 0 && (
            <View style={styles.chips}>
              {guide.map((l, i) => (
                <TouchableOpacity key={i} style={styles.guideChip} onPress={() => openUrl(l.url)}>
                  <Ionicons name="open-outline" size={11} color="#1d4ed8" />
                  <Text style={styles.guideChipText}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!!topic.template?.perClass && <Text style={styles.note}>{L('lesson.perClassNote')}</Text>}
        </View>
        {onDeleteTopic && (
          <TouchableOpacity onPress={onDeleteTopic} style={{ padding: 6 }}>
            <Ionicons name="trash-outline" size={16} color="#d1d5db" />
          </TouchableOpacity>
        )}
      </View>
      {perClassEmpty && <Text style={styles.warn}>{L('lesson.perClassEmpty')}</Text>}
      {topic.sections.map((s) => <SectionRow key={s.id} section={s} mode={mode} onOpen={() => onOpen(s)} />)}
      <TouchableOpacity style={styles.addItem} onPress={() => onOpen(null)}>
        <Text style={styles.addItemText}>+ {L('lesson.addItem')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionRow({ section, mode, onOpen }: { section: LessonSectionView; mode: LinkMode; onOpen: () => void }) {
  const has = hasLessonLink(section);
  const view = safeLessonUrl(section.viewUrl) || safeLessonUrl(section.originalUrl);
  const original = safeLessonUrl(section.originalUrl);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, has ? styles.dotDone : null]}>{has && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, !has && { color: '#4b5563' }]} numberOfLines={2}>{section.title}</Text>
        {(section.links ?? []).filter((l) => l.url).length > 0 && (
          <View style={styles.chips}>
            {section.links!.filter((l) => l.url).map((l, i) => (
              <TouchableOpacity key={i} style={styles.linkChip} onPress={() => openUrl(l.url)}>
                <Ionicons name="open-outline" size={10} color="#4b5563" />
                <Text style={styles.linkChipText}>{l.label || 'Link'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {has ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {!!view && (
            <TouchableOpacity style={styles.softBtn} onPress={() => openUrl(view)}>
              <Text style={styles.softBtnText}>{L('lesson.view')}</Text>
            </TouchableOpacity>
          )}
          {mode === 'canva' && !!original && (
            <TouchableOpacity style={[styles.softBtn, { backgroundColor: '#f3f4f6' }]} onPress={() => openUrl(original)}>
              <Text style={[styles.softBtnText, { color: '#374151' }]}>{L('lesson.original')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onOpen} style={{ padding: 6 }}>
            <Ionicons name="pencil-outline" size={14} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.primaryBtnSm} onPress={onOpen}>
          <Text style={styles.primaryBtnText}>{L('lesson.addLink')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const ISSUE_TEXT: Record<LessonLinkIssue, () => string> = {
  invalid: () => L('lesson.issueInvalid'),
  canvaEditInView: () => L('lesson.issueEditInView'),
  canvaViewInOriginal: () => L('lesson.issueViewInOriginal'),
  sameLink: () => L('lesson.issueSame'),
};

function LinkSheet({ topic, section, mode, onClose, onSave, onClear, onDelete }: {
  topic: Topic; section: LessonSectionView | null; mode: LinkMode; onClose: () => void;
  onSave: (data: { title: string; viewUrl: string; originalUrl: string }) => Promise<void>;
  onClear?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const fixedTitle = !!section?.isFromTemplate;
  const [title, setTitle] = useState(section?.title ?? '');
  const [viewUrl, setViewUrl] = useState(section?.viewUrl ?? '');
  const [originalUrl, setOriginalUrl] = useState(section?.originalUrl ?? '');
  const [single, setSingle] = useState(section?.viewUrl || section?.originalUrl || '');
  const [busy, setBusy] = useState(false);
  const [showHow, setShowHow] = useState(false);

  const issues = mode === 'canva' ? checkLessonLinks(viewUrl, originalUrl) : checkLessonLinks(single, '');
  const blocking = (mode === 'canva' ? [issues.view, issues.original] : [issues.view]).includes('invalid');
  const empty = mode === 'canva' ? !viewUrl.trim() && !originalUrl.trim() : !single.trim();
  const canSave = !busy && !blocking && !empty && (fixedTitle || !!title.trim());

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    await onSave(mode === 'canva'
      ? { title: title.trim(), viewUrl: viewUrl.trim(), originalUrl: originalUrl.trim() }
      : { title: title.trim(), viewUrl: single.trim(), originalUrl: single.trim() });
    setBusy(false);
  };
  const run = async (fn?: () => Promise<void>) => { if (!fn) return; setBusy(true); await fn(); setBusy(false); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTopic} numberOfLines={1}>{topic.material.title}</Text>
          {fixedTitle ? (
            <Text style={styles.sheetTitle}>{section!.title}</Text>
          ) : (
            <TextInput value={title} onChangeText={setTitle} placeholder={L('lesson.itemPlaceholder')} style={styles.sheetTitleInput} autoFocus={!section} />
          )}
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {mode === 'canva' ? (
              <>
                <Field label={L('lesson.viewLink')} help={L('lesson.viewLinkHelp')} value={viewUrl} onChange={setViewUrl} issue={issues.view} autoFocus={fixedTitle} />
                <Field label={L('lesson.originalLink')} help={L('lesson.originalLinkHelp')} value={originalUrl} onChange={setOriginalUrl} issue={issues.original} />
                <TouchableOpacity onPress={() => setShowHow((v) => !v)} style={{ paddingVertical: 6 }}>
                  <Text style={styles.howToggle}>{showHow ? '▾' : '▸'} {L('lesson.howTo')}</Text>
                </TouchableOpacity>
                {showHow && (
                  <View style={styles.howBox}>
                    <Text style={styles.howText}>1. {L('lesson.howToView')}</Text>
                    <Text style={styles.howText}>2. {L('lesson.howToOriginal')}</Text>
                    <Text style={styles.howText}>3. {L('lesson.howToCheck')}</Text>
                  </View>
                )}
              </>
            ) : (
              <Field label={L('lesson.singleLink')} help={L('lesson.singleLinkHelp')} value={single} onChange={setSingle} issue={issues.view} autoFocus={fixedTitle} />
            )}
          </ScrollView>
          <View style={styles.sheetActions}>
            {onClear && (
              <TouchableOpacity onPress={() => run(onClear)} disabled={busy} style={styles.dangerBtn}>
                <Text style={styles.dangerBtnText}>{L('lesson.clearLink')}</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => run(onDelete)} disabled={busy} style={styles.dangerBtn}>
                <Text style={styles.dangerBtnText}>{L('lesson.delete')}</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onClose} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>{L('lesson.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!canSave} style={[styles.primaryBtn, !canSave && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{L('lesson.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, help, value, onChange, issue, autoFocus }: {
  label: string; help: string; value: string; onChange: (v: string) => void; issue?: LessonLinkIssue; autoFocus?: boolean;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://"
        style={[styles.input, issue ? { borderColor: '#f59e0b' } : null]}
      />
      {issue ? <Text style={styles.issue}>⚠️ {ISSUE_TEXT[issue]()}</Text> : <Text style={styles.help}>{help}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { padding: 12, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 280 },
  centerHint: { marginTop: 8, fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headCode: { fontSize: 12, fontWeight: '700', color: BLUE },
  headTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  headRole: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  headCount: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headCountTotal: { fontSize: 15, fontWeight: '700', color: '#9ca3af' },
  headCountLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#f3f4f6', marginTop: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4 },
  topicHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  topicTitle: { fontSize: 15, fontWeight: '800', color: '#111827', flexShrink: 1 },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#f3f4f6' },
  pillDone: { backgroundColor: '#ecfdf5' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  guideChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#eff6ff' },
  guideChipText: { fontSize: 12, color: '#1d4ed8' },
  note: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  warn: { fontSize: 13, color: '#b45309', backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: GREEN, borderColor: GREEN },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#f3f4f6' },
  linkChipText: { fontSize: 11, color: '#4b5563' },
  softBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#eff6ff' },
  softBtnText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  primaryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  primaryBtnSm: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: BLUE },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  addItem: { paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  addItemText: { fontSize: 12, color: '#9ca3af' },
  dashedBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  dashedBtnText: { fontSize: 13, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fff', color: '#111827' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 12 },
  sheetTopic: { fontSize: 12, fontWeight: '700', color: BLUE },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  sheetTitleInput: { fontSize: 18, fontWeight: '800', color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 6 },
  help: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  issue: { fontSize: 12, color: '#b45309', marginTop: 4 },
  howToggle: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  howBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, gap: 6 },
  howText: { fontSize: 12, color: '#4b5563', lineHeight: 18 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  dangerBtn: { paddingHorizontal: 10, paddingVertical: 9 },
  dangerBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 9 },
  ghostBtnText: { color: '#4b5563', fontSize: 13, fontWeight: '600' },
});
