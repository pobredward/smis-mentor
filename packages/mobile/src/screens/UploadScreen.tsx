/**
 * 관리자 → 수업 템플릿 관리 (웹 /admin/lesson-templates 와 같은 화면)
 *
 * 캠프 코드마다 '수업' 탭에서 올릴 자료의 틀(주제 · 소제목 · 안내 링크)을 만든다.
 * - 검사·복사·요약·가져오기 규칙은 shared/utils/lessonTemplateEditor.ts (웹과 같은 코드)
 * - 누가 올리는지(대상): 한국인 멘토 / 원어민, 그 안의 역할 — 반별로 만들기(원어민 레슨플랜)
 * - 차례: '순서 바꾸기'에서 화살표로 — 수업 탭의 주제 순서도 같이 바뀐다
 * - 다른 캠프에서 가져오기: 지난 기수 템플릿을 한 번에 복사 (제목의 캠프 코드도 바꿔 준다)
 * - 만들기·고치기는 같은 전체 화면 편집기 하나에서
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  FOREIGN_GROUP_ROLES,
  MENTOR_GROUP_ROLES,
  adminGetAllJobCodes,
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
  safeLessonUrl,
  sortLessonTemplates,
  suggestLessonAudience,
  swapTemplateCode,
  templateCopyChoices,
  templateDraftOf,
  templateSectionsFromText,
  type JobCodeWithId,
  type LessonAudienceRole,
  type LessonMaterialAudience,
  type LessonTemplateDraft,
  type LessonTemplateLink,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { AdminStackScreenProps } from '../navigation/types';
import {
  addLessonMaterialTemplate,
  deleteLessonMaterialTemplate,
  getLessonMaterialTemplates,
  updateLessonMaterialTemplate,
  type LessonMaterialTemplate,
  type LessonMaterialTemplateSection,
} from '../services/lessonMaterialService';

const NO_CODE = '__none__';
const BLUE = '#2563eb';

const openUrl = (url?: string) => {
  const u = safeLessonUrl(url);
  if (u) Linking.openURL(u).catch(() => undefined);
};

export function UploadScreen({ navigation }: AdminStackScreenProps<'Upload'>) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gen, setGen] = useState('');
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState<LessonTemplateDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reordering, setReordering] = useState(false);

  const reload = async () => {
    try {
      setTemplates(await getLessonMaterialTemplates());
    } catch (e) {
      logger.error('템플릿 불러오기 실패:', e);
      Alert.alert('오류', '템플릿을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [tpls, jcs] = await Promise.all([getLessonMaterialTemplates(), adminGetAllJobCodes(db)]);
        setTemplates(tpls);
        const list = jcs.filter((c) => c.code);
        setCodes(list);
        const latest = [...new Set(list.map((c) => String(c.generation)))].sort((a, b) => lessonGenNum(b) - lessonGenNum(a))[0] ?? '';
        setGen(latest);
        const first = list.filter((c) => String(c.generation) === latest).sort((a, b) => compareCampCodes(a.code, b.code))[0];
        if (first) setCode(first.code);
      } catch (e) {
        logger.error('수업 템플릿 화면 불러오기 실패:', e);
        Alert.alert('오류', '불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))].sort((a, b) => lessonGenNum(b) - lessonGenNum(a)), [codes]);
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
  const summary = useMemo(() => (code === NO_CODE ? [] : lessonTemplateSummary(list)), [list, code]);

  const pickGen = (g: string) => {
    setGen(g);
    const first = codes.filter((c) => String(c.generation) === g).sort((a, b) => compareCampCodes(a.code, b.code))[0];
    setCode(first?.code ?? '');
    setReordering(false);
  };
  const pickCode = (c: string) => {
    setCode(c);
    setReordering(false);
  };

  // 차례 바꾸기 — 이 코드의 템플릿 모두에 order 를 다시 매긴다 (수업 탭 주제 순서)
  const move = async (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    const orderOf = new Map(next.map((t, i) => [t.id, i]));
    setTemplates((prev) => prev.map((t) => (orderOf.has(t.id) ? { ...t, order: orderOf.get(t.id) } : t)));
    try {
      await Promise.all(next.map((t, i) => (t.order === i ? null : updateLessonMaterialTemplate(t.id, { order: i }))));
    } catch (e) {
      logger.error('템플릿 순서 저장 실패:', e);
      Alert.alert('오류', '순서를 저장하지 못했습니다.');
      void reload();
    }
  };

  const remove = (t: LessonMaterialTemplate) =>
    Alert.alert('템플릿 삭제', `"${t.title}" 템플릿을 삭제할까요?\n\n수업 탭에서 이 주제가 사라집니다. 멘토들이 올린 링크는 지워지지 않습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLessonMaterialTemplate(t.id);
            setTemplates((prev) => prev.filter((x) => x.id !== t.id));
          } catch (e) {
            logger.error('템플릿 삭제 실패:', e);
            Alert.alert('오류', '삭제하지 못했습니다.');
          }
        },
      },
    ]);

  const canAdd = !!code && code !== NO_CODE;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>수업 템플릿 관리</Text>
          <Text style={styles.headerSub} numberOfLines={1}>캠프 → 수업 탭에서 올릴 자료의 틀 · 대상에게만 보입니다</Text>
        </View>
      </View>

      {/* 기수 · 캠프 고르기 */}
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {gens.map((g) => (
            <TouchableOpacity key={g} onPress={() => pickGen(g)} style={[styles.genChip, g === gen && styles.genChipOn]}>
              <Text style={[styles.genChipText, g === gen && { color: '#fff' }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {genCodes.map((c) => {
            const on = c.code === code;
            return (
              <TouchableOpacity key={c.code} onPress={() => pickCode(c.code)} style={[styles.codeChip, on && styles.codeChipOn]}>
                <Text style={[styles.codeChipCode, on && { color: '#fff' }]}>{c.code}</Text>
                <Text style={[styles.codeChipName, on && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{c.name}</Text>
                <View style={[styles.countBadge, on && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[styles.countText, on && { color: '#fff' }]}>{countOf(c.code)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {orphans.length > 0 && (
            <TouchableOpacity onPress={() => pickCode(NO_CODE)} style={[styles.codeChip, styles.orphanChip, code === NO_CODE && styles.orphanChipOn]}>
              <Text style={[styles.orphanText, code === NO_CODE && { color: '#fff' }]}>코드 없음 {orphans.length}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      >
        {code === NO_CODE ? (
          <Text style={styles.orphanNote}>캠프 코드가 없거나 지워진 캠프의 템플릿입니다. 어느 수업 탭에도 보이지 않으니 코드를 정해 주거나 지워 주세요.</Text>
        ) : (
          <View style={styles.summaryRow}>
            {summary.map(([label, n]) => (
              <View key={label} style={[styles.sumChip, !n && styles.sumChipZero]}>
                <Text style={[styles.sumText, !n && { color: '#dc2626' }]}>{label} {n}개</Text>
              </View>
            ))}
          </View>
        )}

        {canAdd && (
          <View style={styles.tools}>
            <TouchableOpacity onPress={() => setImportOpen(true)} style={styles.toolBtn}>
              <Ionicons name="download-outline" size={15} color="#374151" />
              <Text style={styles.toolText}>다른 캠프에서 가져오기</Text>
            </TouchableOpacity>
            {list.length > 1 && (
              <TouchableOpacity onPress={() => setReordering((v) => !v)} style={[styles.toolBtn, reordering && styles.toolBtnOn]}>
                <Ionicons name={reordering ? 'checkmark' : 'swap-vertical'} size={15} color={reordering ? '#fff' : '#374151'} />
                <Text style={[styles.toolText, reordering && { color: '#fff' }]}>{reordering ? '순서 완료' : '순서 바꾸기'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={BLUE} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{jc ? `${jc.code}에 템플릿이 없습니다` : '캠프를 고르세요'}</Text>
            {!!jc && <Text style={styles.emptySub}>지난 기수에서 가져오거나 새로 만드세요.</Text>}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {list.map((t, i) => (
              <TemplateCard
                key={t.id}
                t={t}
                index={i}
                reordering={reordering && code !== NO_CODE}
                first={i === 0}
                last={i === list.length - 1}
                onMove={(dir) => move(i, dir)}
                onEdit={() => setDraft(templateDraftOf(t))}
                onDelete={() => remove(t)}
              />
            ))}
          </View>
        )}
        {reordering && <Text style={styles.hint}>화살표로 바꾼 순서는 바로 저장되고, 수업 탭의 주제 순서도 같이 바뀝니다.</Text>}
      </ScrollView>

      {canAdd && !reordering && (
        <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setDraft(newTemplateDraft(code))} activeOpacity={0.85}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>새 템플릿</Text>
        </TouchableOpacity>
      )}

      {draft && (
        <TemplateEditor
          draft={draft}
          codes={codes}
          templates={templates}
          nextOrder={list.length}
          onClose={() => setDraft(null)}
          onSaved={async () => {
            setDraft(null);
            await reload();
          }}
        />
      )}
      {importOpen && jc && (
        <ImportSheet
          target={jc}
          codes={codes}
          templates={templates}
          onClose={() => setImportOpen(false)}
          onDone={async () => {
            setImportOpen(false);
            await reload();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── 목록 카드 ────────────────────────────────────────────────────

function TemplateCard({ t, index, reordering, first, last, onMove, onEdit, onDelete }: {
  t: LessonMaterialTemplate; index: number; reordering: boolean; first: boolean; last: boolean;
  onMove: (dir: -1 | 1) => void; onEdit: () => void; onDelete: () => void;
}) {
  const foreign = audienceOf(t).roles.includes('foreign');
  const sections = [...(t.sections ?? [])].sort((x, y) => x.order - y.order);
  const links = (t.links ?? []).filter((l) => l.label && l.url);
  return (
    <TouchableOpacity activeOpacity={reordering ? 1 : 0.7} onPress={reordering ? undefined : onEdit} style={[styles.card, reordering && styles.cardReorder]}>
      <View style={styles.cardTop}>
        <View style={styles.index}><Text style={styles.indexText}>{index + 1}</Text></View>
        <Text style={styles.cardTitle} numberOfLines={2}>{t.title}</Text>
        {reordering ? (
          <View style={styles.moveBtns}>
            <TouchableOpacity disabled={first} onPress={() => onMove(-1)} style={[styles.moveBtn, first && styles.dim]}>
              <Ionicons name="chevron-up" size={18} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity disabled={last} onPress={() => onMove(1)} style={[styles.moveBtn, last && styles.dim]}>
              <Ionicons name="chevron-down" size={18} color="#374151" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.trash}>
            <Ionicons name="trash-outline" size={17} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
      {!reordering && (
        <View style={styles.cardBody}>
          <View style={styles.tags}>
            <View style={[styles.tag, { backgroundColor: foreign ? '#f0f9ff' : '#eef2ff' }]}>
              <Text style={[styles.tagText, { color: foreign ? '#0369a1' : '#4338ca' }]}>{audienceLabel(t)}{t.audience ? '' : ' (기본)'}</Text>
            </View>
            {t.perClass && (
              <View style={[styles.tag, { backgroundColor: '#fffbeb' }]}>
                <Text style={[styles.tagText, { color: '#b45309' }]}>반마다 1칸 (+Spare)</Text>
              </View>
            )}
          </View>
          <View style={styles.secs}>
            {sections.map((s, i) => (
              <View key={s.id} style={styles.sec}>
                <Text style={styles.secText} numberOfLines={1}>
                  <Text style={styles.secNum}>{i + 1} </Text>
                  {s.title}
                  {(s.links ?? []).length ? <Text style={{ color: BLUE }}> 🔗{s.links!.length}</Text> : null}
                </Text>
              </View>
            ))}
            {!sections.length && !t.perClass && <Text style={styles.warn}>소제목이 없습니다 — 수업 탭에 칸이 생기지 않아요</Text>}
          </View>
          {links.length > 0 && (
            <View style={styles.secs}>
              {links.map((l, i) => (
                <TouchableOpacity key={i} onPress={() => openUrl(l.url)} style={styles.linkChip}>
                  <Text style={styles.linkChipText} numberOfLines={1}>↗ {l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 누가 올리나요 ────────────────────────────────────────────────

function AudiencePicker({ audience, perClass, onChange }: {
  audience: LessonMaterialAudience;
  perClass: boolean;
  onChange: (audience: LessonMaterialAudience, perClass: boolean) => void;
}) {
  const roles = audience.roles;
  const groupRoles = audience.groupRoles ?? [];
  const listOf = (k: LessonAudienceRole): readonly string[] => (k === 'mentor' ? MENTOR_GROUP_ROLES : FOREIGN_GROUP_ROLES);
  const toggleKind = (k: LessonAudienceRole) => {
    const next = roles.includes(k) ? roles.filter((r) => r !== k) : [...roles, k];
    if (!next.length) return; // 한 종류는 남긴다
    const gr = roles.includes(k) ? groupRoles.filter((r) => !listOf(k).includes(r)) : groupRoles;
    onChange({ roles: next, groupRoles: gr }, next.includes('foreign') ? perClass : false);
  };
  const toggleRole = (r: string) =>
    onChange({ roles, groupRoles: groupRoles.includes(r) ? groupRoles.filter((x) => x !== r) : [...groupRoles, r] }, perClass);
  const clearKind = (k: LessonAudienceRole) => onChange({ roles, groupRoles: groupRoles.filter((r) => !listOf(k).includes(r)) }, perClass);
  const row = (k: LessonAudienceRole, label: string) => {
    const picked = groupRoles.filter((r) => listOf(k).includes(r));
    const on = roles.includes(k);
    return (
      <View style={aud.row}>
        <TouchableOpacity onPress={() => toggleKind(k)} style={[aud.kind, on && aud.kindOn]}>
          <Text style={[aud.kindText, on && { color: '#fff' }]}>{on ? '✓ ' : ''}{label}</Text>
        </TouchableOpacity>
        {on && (
          <>
            <TouchableOpacity onPress={() => clearKind(k)} style={[aud.chip, !picked.length && aud.chipOn]}>
              <Text style={[aud.chipText, !picked.length && { color: '#fff' }]}>전원</Text>
            </TouchableOpacity>
            {listOf(k).map((r) => (
              <TouchableOpacity key={r} onPress={() => toggleRole(r)} style={[aud.chip, picked.includes(r) && aud.chipOn]}>
                <Text style={[aud.chipText, picked.includes(r) && { color: '#fff' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    );
  };
  return (
    <View style={aud.box}>
      {row('mentor', '한국인 멘토')}
      {row('foreign', '원어민')}
      {roles.includes('foreign') && (
        <TouchableOpacity onPress={() => onChange(audience, !perClass)} style={aud.check}>
          <Ionicons name={perClass ? 'checkbox' : 'square-outline'} size={18} color={perClass ? BLUE : '#9ca3af'} />
          <Text style={aud.checkText}>
            <Text style={{ fontWeight: '700' }}>반별로 만들기</Text> (레슨플랜) — 맡은 그룹의 반마다 칸이 생기고, 보조 교재(Spare)가 있는 반은 하나 더 생깁니다.
          </Text>
        </TouchableOpacity>
      )}
      <Text style={aud.hint}>
        역할을 고르지 않으면 그 종류 전원 · 지금: <Text style={{ fontWeight: '700', color: '#4b5563' }}>{audienceLabel({ audience })}{perClass ? ' · 반별' : ''}</Text>
      </Text>
    </View>
  );
}

const aud = StyleSheet.create({
  box: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  kind: { minWidth: 104, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  kindOn: { backgroundColor: '#111827', borderColor: '#111827' },
  kindText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontSize: 13, color: '#4b5563' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 2 },
  checkText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 17 },
  hint: { fontSize: 11, color: '#9ca3af' },
});

// ── 링크 칸들 · 소제목 ────────────────────────────────────────────

function LinkRows({ links, onChange }: { links: LessonTemplateLink[]; onChange: (l: LessonTemplateLink[]) => void }) {
  return (
    <View style={{ gap: 6 }}>
      {links.map((l, i) => {
        const bad = !!l.url.trim() && !isHttpUrl(l.url.trim());
        return (
          <View key={i} style={styles.linkRow}>
            <TextInput
              value={l.label}
              onChangeText={(v) => onChange(links.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              placeholder="제목"
              placeholderTextColor="#9ca3af"
              style={[styles.input, { width: 92 }]}
            />
            <TextInput
              value={l.url}
              onChangeText={(v) => onChange(links.map((x, j) => (j === i ? { ...x, url: v } : x)))}
              placeholder="https://"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { flex: 1 }, bad && styles.inputBad]}
            />
            <TouchableOpacity onPress={() => onChange(links.filter((_, j) => j !== i))} style={styles.iconBtn}>
              <Ionicons name="close" size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity onPress={() => onChange([...links, { label: '', url: '' }])} style={{ paddingVertical: 4 }}>
        <Text style={styles.addLink}>+ 링크 추가</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionEditor({ sections, onChange }: { sections: LessonMaterialTemplateSection[]; onChange: (s: LessonMaterialTemplateSection[]) => void }) {
  const [input, setInput] = useState('');
  const [linksOf, setLinksOf] = useState<string | null>(null);
  const add = () => {
    const added = templateSectionsFromText(input); // 여러 줄 붙여넣기 → 한 번에 여러 칸
    if (!added.length) return;
    onChange(reorderTemplateSections([...sections, ...added]));
    setInput('');
  };
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [m] = next.splice(i, 1);
    next.splice(to, 0, m);
    onChange(reorderTemplateSections(next));
  };
  const patch = (id: string, p: Partial<LessonMaterialTemplateSection>) => onChange(sections.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const lines = input.split('\n').filter((v) => v.trim()).length;
  return (
    <View style={{ gap: 6 }}>
      {sections.map((s, i) => {
        const links = s.links ?? [];
        const open = linksOf === s.id;
        return (
          <View key={s.id} style={styles.secRow}>
            <View style={styles.secRowTop}>
              <Text style={styles.secIdx}>{i + 1}</Text>
              <TextInput value={s.title} onChangeText={(v) => patch(s.id, { title: v })} style={styles.secInput} placeholder="소제목" placeholderTextColor="#d1d5db" />
              <TouchableOpacity onPress={() => setLinksOf(open ? null : s.id)} style={[styles.secLinkBtn, (links.length > 0 || open) && styles.secLinkBtnOn]}>
                <Ionicons name="link-outline" size={14} color={links.length || open ? BLUE : '#9ca3af'} />
                {links.length > 0 && <Text style={styles.secLinkCount}>{links.length}</Text>}
              </TouchableOpacity>
              <TouchableOpacity disabled={i === 0} onPress={() => move(i, -1)} style={[styles.iconBtn, i === 0 && styles.dim]}>
                <Ionicons name="chevron-up" size={16} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity disabled={i === sections.length - 1} onPress={() => move(i, 1)} style={[styles.iconBtn, i === sections.length - 1 && styles.dim]}>
                <Ionicons name="chevron-down" size={16} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onChange(reorderTemplateSections(sections.filter((x) => x.id !== s.id)))} style={styles.iconBtn}>
                <Ionicons name="close" size={16} color="#c0c4cc" />
              </TouchableOpacity>
            </View>
            {open && (
              <View style={styles.secLinks}>
                <Text style={styles.secLinksHint}>이 칸 옆에 보일 참고 링크 (예: 모의수업 영상)</Text>
                <LinkRows links={links} onChange={(l) => patch(s.id, { links: l })} />
              </View>
            )}
          </View>
        );
      })}
      <View style={styles.addRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          multiline
          placeholder="소제목 (예: 1차시 수업자료) — 여러 줄을 붙여넣으면 한 번에"
          placeholderTextColor="#9ca3af"
          style={styles.addInput}
        />
        <TouchableOpacity onPress={add} disabled={!input.trim()} style={[styles.addBtn, !input.trim() && styles.dim]}>
          <Text style={styles.addBtnText}>추가</Text>
        </TouchableOpacity>
      </View>
      {lines > 1 && <Text style={styles.addHint}>{lines}개 칸을 한 번에 추가합니다.</Text>}
    </View>
  );
}

// ── 만들기·고치기 (전체 화면) ─────────────────────────────────────

function TemplateEditor({ draft: initial, codes, templates, nextOrder, onClose, onSaved }: {
  draft: LessonTemplateDraft; codes: JobCodeWithId[]; templates: LessonMaterialTemplate[]; nextOrder: number;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<LessonTemplateDraft>(initial);
  const [touchedAudience, setTouchedAudience] = useState(!!initial.id);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const isNew = !initial.id;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = (p: Partial<LessonTemplateDraft>) => setD((x) => ({ ...x, ...p }));

  const close = () => {
    if (!dirty) return onClose();
    Alert.alert('저장하지 않은 내용', '저장하지 않은 내용이 있습니다. 닫을까요?', [
      { text: '계속 편집', style: 'cancel' },
      { text: '닫기', style: 'destructive', onPress: onClose },
    ]);
  };

  /** 새 템플릿 — 제목으로 대상 추천 (패턴 → 수업, 방OT → 담임·수업, 그 밖 → 담임, 레슨플랜 → 원어민 반별) */
  const onTitle = (title: string) => {
    if (isNew && !touchedAudience) {
      const s = suggestLessonAudience(title);
      set({ title, audience: s.audience, perClass: !!s.perClass });
    } else set({ title });
  };
  const copyChoices = useMemo(() => templateCopyChoices(templates, d.code), [templates, d.code]);
  const problem = lessonTemplateProblem(d, templates);
  const orphanCode = !isNew && !codes.some((c) => c.code === initial.code);
  const sortedCodes = useMemo(
    () => [...codes].sort((a, b) => lessonGenNum(b.generation) - lessonGenNum(a.generation) || compareCampCodes(a.code, b.code)),
    [codes],
  );
  const removedWithUploads = !isNew && initial.sections.some((s) => !d.sections.find((x) => x.id === s.id));
  const disabled = !!problem || saving || (!isNew && !dirty);

  const save = async () => {
    if (disabled) return;
    setSaving(true);
    const payload = lessonTemplatePayload(d);
    try {
      if (isNew) {
        await addLessonMaterialTemplate(
          payload.title,
          payload.sections.map(({ id: _id, ...rest }) => rest),
          payload.code,
          payload.links,
          { audience: payload.audience, perClass: payload.perClass, order: nextOrder },
        );
      } else {
        await updateLessonMaterialTemplate(d.id!, payload);
      }
      await onSaved();
    } catch (e) {
      logger.error('템플릿 저장 실패:', e);
      Alert.alert('오류', '저장하지 못했습니다.');
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.edHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={close} style={styles.edSide}>
              <Text style={styles.edCancel}>취소</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.edCode}>{d.code || '코드 없음'}</Text>
              <Text style={styles.edTitle}>{isNew ? '새 템플릿' : '템플릿 수정'}</Text>
            </View>
            <TouchableOpacity onPress={save} disabled={disabled} style={[styles.edSide, { alignItems: 'flex-end' }]}>
              {saving ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.edSave, disabled && { opacity: 0.35 }]}>{isNew ? '만들기' : '저장'}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}>
            {isNew && (
              <View style={styles.quickRow}>
                <Text style={styles.quickLabel}>빠르게 시작</Text>
                <TouchableOpacity onPress={() => { setTouchedAudience(true); set(lessonPlanPreset(d.code)); }} style={[styles.quickBtn, { backgroundColor: '#f0f9ff' }]}>
                  <Text style={[styles.quickBtnText, { color: '#0369a1' }]}>🌏 원어민 레슨플랜</Text>
                </TouchableOpacity>
                {copyChoices.length > 0 && (
                  <TouchableOpacity onPress={() => setCopyOpen(true)} style={[styles.quickBtn, { backgroundColor: '#f3f4f6' }]}>
                    <Text style={[styles.quickBtnText, { color: '#374151' }]}>📋 다른 캠프에서 복사</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View>
              <Text style={styles.label}>이름</Text>
              <TextInput
                value={d.title}
                onChangeText={onTitle}
                autoFocus={isNew}
                placeholder={`예: ${d.code || 'S29'} 반OT`}
                placeholderTextColor="#9ca3af"
                style={styles.titleInput}
              />
              {orphanCode && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.amberLabel}>캠프 코드를 정해 주세요</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {sortedCodes.map((c) => (
                      <TouchableOpacity key={c.id} onPress={() => set({ code: c.code })} style={[styles.genChip, d.code === c.code && styles.genChipOn]}>
                        <Text style={[styles.genChipText, d.code === c.code && { color: '#fff' }]}>{c.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View>
              <Text style={styles.label}>누가 올리나요</Text>
              <AudiencePicker audience={d.audience} perClass={d.perClass} onChange={(a, pc) => { setTouchedAudience(true); set({ audience: a, perClass: pc }); }} />
            </View>

            <View>
              <Text style={styles.label}>안내 링크 <Text style={styles.labelHint}>— 주제 제목 옆 (예: Canva 템플릿, 가이드라인)</Text></Text>
              <LinkRows links={d.links} onChange={(links) => set({ links })} />
            </View>

            <View>
              <Text style={styles.label}>
                소제목 (칸) <Text style={styles.labelHint}>— 하나마다 링크 한 칸{d.perClass ? ', 반별 칸 뒤에 붙습니다' : ''}</Text>
              </Text>
              {d.perClass && <Text style={styles.perClassNote}>반별 칸은 자동으로 생깁니다. 여기에는 반과 상관없는 칸만 넣으세요 (예: Outdoor Class). 없어도 됩니다.</Text>}
              <SectionEditor sections={d.sections} onChange={(sections) => set({ sections })} />
              {removedWithUploads && <Text style={styles.amberNote}>뺀 소제목은 수업 탭에서 칸이 사라집니다. 이미 올린 링크는 지워지지 않고, 올린 사람에게만 남아 보입니다.</Text>}
            </View>
          </ScrollView>

          <View style={[styles.edFoot, { paddingBottom: insets.bottom + 10 }]}>
            {problem ? <Text style={styles.problem}>{problem}</Text> : <Text style={styles.footHint}>{dirty ? '저장하면 수업 탭에 바로 반영됩니다.' : '바뀐 내용이 없습니다.'}</Text>}
          </View>
        </KeyboardAvoidingView>

        {/* 다른 캠프 템플릿 복사 — 같은 창 안에서 아래에서 올라오는 목록 */}
        {copyOpen && (
          <View style={styles.overlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCopyOpen(false)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, maxHeight: '80%' }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>복사해 올 템플릿</Text>
              <Text style={styles.sheetSub}>소제목·안내 링크·대상까지 복사하고, 제목의 캠프 코드는 {d.code}로 바꿉니다.</Text>
              <ScrollView style={{ marginTop: 8 }}>
                {copyChoices.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => { setTouchedAudience(true); set(copyTemplatePreset(t, d.code)); setCopyOpen(false); }}
                    style={styles.pickRow}
                  >
                    <View style={styles.pickCode}><Text style={styles.pickCodeText}>{t.code}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickName} numberOfLines={1}>{t.title}</Text>
                      <Text style={styles.pickMeta} numberOfLines={1}>{audienceLabel(t)}{t.perClass ? ' · 반별' : ''} · 소제목 {(t.sections ?? []).length}개</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── 다른 캠프에서 가져오기 ───────────────────────────────────────

function ImportSheet({ target, codes, templates, onClose, onDone }: {
  target: JobCodeWithId; codes: JobCodeWithId[]; templates: LessonMaterialTemplate[];
  onClose: () => void; onDone: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  // 같은 종류(코드 첫 글자)의 지난 기수를 먼저
  const sources = useMemo(() => lessonImportSources(templates, codes, target.code), [templates, codes, target.code]);
  const [src, setSrc] = useState(sources[0] ?? '');
  const srcList = useMemo(() => sortLessonTemplates(templates.filter((t) => t.code === src)), [templates, src]);
  const existing = useMemo(() => new Set(templates.filter((t) => t.code === target.code).map((t) => t.title.trim())), [templates, target.code]);
  const titleOf = (t: LessonMaterialTemplate) => swapTemplateCode(t.title, src, target.code);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setPicked(new Set(srcList.filter((t) => !existing.has(titleOf(t).trim())).map((t) => t.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcList]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const chosen = srcList.filter((t) => picked.has(t.id));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const base = templates.filter((t) => t.code === target.code).length;
      for (let i = 0; i < chosen.length; i++) {
        await addLessonMaterialTemplate(...importTemplateArgs(chosen[i], src, target.code, base + i));
      }
      await onDone();
    } catch (e) {
      logger.error('템플릿 가져오기 실패:', e);
      Alert.alert('오류', '가져오다 멈췄습니다. 목록을 확인해 주세요.');
      await onDone();
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, maxHeight: '88%' }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>다른 캠프에서 가져오기 → {target.code}</Text>
          <Text style={styles.sheetSub}>소제목·안내 링크·대상까지 그대로 복사합니다. 제목 앞의 캠프 코드는 {target.code}로 바꿉니다.</Text>
          {sources.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 10 }} style={{ flexGrow: 0 }}>
              {sources.map((c) => (
                <TouchableOpacity key={c} onPress={() => setSrc(c)} style={[styles.genChip, c === src && styles.genChipOn]}>
                  <Text style={[styles.genChipText, c === src && { color: '#fff' }]}>{c} · {templates.filter((t) => t.code === c).length}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <ScrollView style={{ flexGrow: 0 }}>
            {srcList.map((t) => {
              const dup = existing.has(titleOf(t).trim());
              const on = picked.has(t.id);
              return (
                <TouchableOpacity
                  key={t.id}
                  disabled={dup}
                  onPress={() => setPicked((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  style={[styles.impRow, dup && { opacity: 0.45 }]}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? BLUE : '#9ca3af'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickName} numberOfLines={1}>{titleOf(t)}</Text>
                    <Text style={styles.pickMeta} numberOfLines={1}>
                      {audienceLabel(t)}{t.perClass ? ' · 반별' : ''} · 소제목 {(t.sections ?? []).length}개{dup ? ' · 이미 있음' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {!srcList.length && <Text style={styles.emptySub}>가져올 템플릿이 없습니다.</Text>}
          </ScrollView>
          <View style={styles.impFoot}>
            <Text style={styles.footHint}>{picked.size}개 선택</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onClose} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={run} disabled={!picked.size || busy} style={[styles.primaryBtn, (!picked.size || busy) && styles.dim]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{picked.size}개 가져오기</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },

  filters: { backgroundColor: '#fff', paddingVertical: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  chipRow: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  genChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  genChipOn: { backgroundColor: '#111827' },
  genChipText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 240, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  codeChipOn: { backgroundColor: BLUE, borderColor: BLUE },
  codeChipCode: { fontSize: 13, fontWeight: '800', color: '#111827' },
  codeChipName: { fontSize: 12, color: '#6b7280', flexShrink: 1 },
  countBadge: { minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: '#f3f4f6', alignItems: 'center' },
  countText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  orphanChip: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  orphanChipOn: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  orphanText: { fontSize: 13, fontWeight: '700', color: '#92400e' },

  orphanNote: { fontSize: 13, color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, lineHeight: 19, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  sumChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: '#f3f4f6' },
  sumChipZero: { backgroundColor: '#fef2f2' },
  sumText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  toolBtnOn: { backgroundColor: '#111827', borderColor: '#111827' },
  toolText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', backgroundColor: '#fff' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#4b5563' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  cardReorder: { paddingVertical: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  index: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  indexText: { fontSize: 12, fontWeight: '800', color: '#6b7280' },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#111827' },
  trash: { padding: 4 },
  moveBtns: { flexDirection: 'row', gap: 6 },
  moveBtn: { width: 36, height: 32, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  cardBody: { marginTop: 8, marginLeft: 34, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '800' },
  secs: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  sec: { maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f9fafb', borderWidth: StyleSheet.hairlineWidth, borderColor: '#eef0f3' },
  secText: { fontSize: 12, color: '#374151' },
  secNum: { color: '#9ca3af' },
  warn: { fontSize: 12, color: '#dc2626' },
  linkChip: { maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#eff6ff' },
  linkChipText: { fontSize: 12, color: '#1d4ed8' },
  dim: { opacity: 0.3 },

  fab: {
    position: 'absolute', right: 18, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 999, backgroundColor: BLUE, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  edHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  edSide: { width: 64, paddingVertical: 4 },
  edCancel: { fontSize: 15, color: '#6b7280' },
  edSave: { fontSize: 15, fontWeight: '800', color: BLUE },
  edCode: { fontSize: 11, fontWeight: '700', color: BLUE },
  edTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  edFoot: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  problem: { fontSize: 12, color: '#dc2626' },
  footHint: { fontSize: 12, color: '#9ca3af' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  quickLabel: { fontSize: 12, color: '#6b7280', marginRight: 2 },
  quickBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  quickBtnText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.2 },
  labelHint: { fontWeight: '400', color: '#9ca3af' },
  titleInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '700', color: '#111827' },
  amberLabel: { fontSize: 12, color: '#b45309', marginBottom: 6, fontWeight: '600' },
  perClassNote: { fontSize: 12, color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, marginBottom: 8, lineHeight: 17 },
  amberNote: { fontSize: 12, color: '#b45309', marginTop: 8, lineHeight: 17 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827' },
  inputBad: { borderColor: '#f59e0b' },
  iconBtn: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center' },
  addLink: { fontSize: 13, fontWeight: '700', color: BLUE },

  secRow: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#fff' },
  secRowTop: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, paddingVertical: 2 },
  secIdx: { width: 18, fontSize: 12, color: '#9ca3af' },
  secInput: { flex: 1, minWidth: 0, fontSize: 14, color: '#111827', paddingVertical: 8 },
  secLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, height: 28, borderRadius: 7, marginRight: 2 },
  secLinkBtnOn: { backgroundColor: '#eff6ff' },
  secLinkCount: { fontSize: 11, fontWeight: '700', color: BLUE },
  secLinks: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb', padding: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  secLinksHint: { fontSize: 11, color: '#6b7280', marginBottom: 6 },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  addInput: {
    flex: 1, minHeight: 40, maxHeight: 110, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, color: '#111827', textAlignVertical: 'top',
  },
  addBtn: { height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  addHint: { fontSize: 11, color: BLUE },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  pickCode: { width: 52, alignItems: 'center', paddingVertical: 3, borderRadius: 6, backgroundColor: '#f3f4f6' },
  pickCodeText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  pickName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  pickMeta: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  impRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  impFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  ghostBtnText: { fontSize: 14, color: '#4b5563' },
  primaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: BLUE, minWidth: 96, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
