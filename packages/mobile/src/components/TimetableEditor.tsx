import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SUBJECTS,
  TIMETABLE_CATEGORIES,
  categoryLabel,
  booksFor,
  buildEmptyTimetable,
  commonFor,
  commonValuesOf,
  firstName,
  getCampClassInfo,
  getCampTimetableCommon,
  getCampGroups,
  getEslBooks,
  updateCampClassInfo,
  updateCampTimetableCommon,
  usesOwn,
  isUnsaved,
  isSameGroup,
  isMergedColumn,
  lineCountOf,
  makeNameResolvers,
  mergedColumnName,
  normalizeGroupKey,
  resolveGroups,
  resolveTimetable,
  dutyByBlock,
  sortBlocks,
  timetableGroupNames,
  timetableDraft as D,
  type CampClassInfo,
  type CampTimetable,
  type SubjectPartner,
  type TimetableClassColumn,
  type TimetableOwn,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { campTimetableService } from '../services/campTimetableService';
import { getUsersByJobCodeId } from '../services/userService';
import jobCodesService from '../services/jobCodesService';
import { scheduleQueryKey } from '../services/scheduleBundle';

interface Props {
  jobCodeId: string;
  onClose: () => void;
  initialCategory?: string | null;
  initialGroup?: string | null;
}

/** web 편집기와 같은 문구 */
const PARTNER_LABELS: Record<SubjectPartner, string> = {
  none: '짝 없음 (1줄)',
  pattern: '짝: Pattern 수업',
  foreign: '짝: 그 과목 원어민',
  owner: '짝: 주제 담당 담임',
  ownTeacher: '짝: 그 반 담임',
  staff: '짝: 담당자 이름만',
};

/** 공통 탭의 가짜 카테고리 키 — 실제 Day 가 아니다 */
const COMMON_KEY = '__common__';
const PARTNER_ORDER: SubjectPartner[] = ['foreign', 'pattern', 'owner', 'ownTeacher', 'staff', 'none'];

export function TimetableEditor({ jobCodeId, onClose, initialCategory, initialGroup }: Props) {
  const { userData } = useAuth();
  const queryClient = useQueryClient();

  // 어느 Day 의 어느 그룹을 고칠지로 고른다 (표 id 가 아니라)
  const [editCategory, setEditCategory] = useState<string | null>(initialCategory ?? null);
  const [editGroup, setEditGroup] = useState<string | null>(initialGroup ?? null);
  const [draft, setDraft] = useState<CampTimetable | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRooms, setShowRooms] = useState(false);
  /** 과목 고르기 모달 — {blockId, colKey} */
  const [picking, setPicking] = useState<{ blockId: string; colKey: string } | null>(null);
  /** 교무실조 순번 고르기 모달 — {colKey, index} */
  const [pickingDuty, setPickingDuty] = useState<{ colKey: string; index: number } | null>(null);

  const { data: timetables = [], refetch, isLoading } = useQuery({
    queryKey: ['campTimetables', jobCodeId],
    queryFn: () => campTimetableService.listByJobCodeId(jobCodeId),
  });

  const { data: jobCode } = useQuery({
    queryKey: ['jobCode', jobCodeId],
    queryFn: () => jobCodesService.getJobCodeById(jobCodeId),
    staleTime: 10 * 60 * 1000,
  });
  const campCode = (jobCode as { code?: string } | null)?.code ?? '';

  const { data: campGroups = [] } = useQuery({
    queryKey: ['campGroups', campCode],
    queryFn: () => getCampGroups(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  /** 반이름·강의실은 기수별 한 벌 — 표가 아니라 캠프 설정에 저장한다 */
  const { data: savedClassInfo = {}, refetch: refetchClassInfo } = useQuery({
    queryKey: ['campClassInfo', campCode],
    queryFn: () => getCampClassInfo(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });
  /** 그룹별 공통 값 — 같은 그룹의 모든 Day 가 함께 쓴다 */
  const { data: commonByGroup = {}, refetch: refetchCommon } = useQuery({
    queryKey: ['campTimetableCommon', campCode],
    queryFn: () => getCampTimetableCommon(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  const { data: eslBooks } = useQuery({
    queryKey: ['eslBooks'],
    queryFn: () => getEslBooks(db),
    staleTime: 30 * 60 * 1000,
  });

  const [classInfo, setClassInfo] = useState<Record<string, CampClassInfo>>({});
  useEffect(() => setClassInfo(savedClassInfo), [savedClassInfo]);

  const infoOf = (code: string): CampClassInfo => classInfo[code] ?? {};
  const setInfo = (code: string, patch: CampClassInfo) =>
    setClassInfo((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  const { data: members = [] } = useQuery({
    queryKey: ['campMembers', jobCodeId],
    queryFn: () => getUsersByJobCodeId(jobCodeId),
    staleTime: 5 * 60 * 1000,
  });

  const expOf = (u: { jobExperiences?: Array<{ id: string }> }) =>
    u.jobExperiences?.find((e) => e.id === jobCodeId) as
      | { group?: string; groupRole?: string; classCode?: string }
      | undefined;

  const teacherByClassCode = useMemo(() => {
    const map: Record<string, string> = {};
    (members as Array<{ name?: string; jobExperiences?: Array<{ id: string }> }>).forEach((u) => {
      const code = expOf(u)?.classCode;
      if (code && u.name) map[code] = u.name;
    });
    return map;
  }, [members, jobCodeId]);

  /** 그룹은 보기 화면과 같은 규칙으로 — 저장된 표가 없는 그룹도 전부 나온다 */
  const derived = useMemo(
    () => resolveGroups(members as never[], jobCodeId, campGroups),
    [members, jobCodeId, campGroups]
  );
  const groups = useMemo(() => timetableGroupNames(derived, timetables), [derived, timetables]);
  const categories = useMemo(
    () => TIMETABLE_CATEGORIES.map((c) => ({ key: c.key, label: categoryLabel(c, campCode) })),
    [campCode]
  );

  const activeCategory = editCategory ?? COMMON_KEY;
  /** 공통 탭 — 반·이름·과목만 고치고, 고친 값은 그 그룹의 모든 Day 에 적용된다 */
  const isCommon = activeCategory === COMMON_KEY;
  const activeGroup = (editGroup && groups.find((g) => isSameGroup(g, editGroup))) || groups[0] || null;

  /**
   * 고른 Day·그룹의 표. 저장된 게 있으면 그것을, 없으면 기본 틀을 초안으로 연다.
   * 저장을 누르면 그때 이 캠프 전용 표로 만들어진다.
   */
  const draftKey = `${activeCategory}::${normalizeGroupKey(activeGroup)}`;
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    // 편집 중인데 데이터만 새로고침된 경우에는 고쳐 둔 내용을 지우지 않는다
    if (loadedKey.current === draftKey && draft) return;
    const resolved = isCommon
      ? buildCommonDraft()
      : resolveTimetable({
          timetables,
          groups: derived,
          category: activeCategory,
          groupName: activeGroup,
          campCode,
          jobCodeId,
          common: commonByGroup,
        });
    setDraft(resolved ? D.cloneDraft(resolved) : null);
    loadedKey.current = draftKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, timetables, derived, groups, campCode, jobCodeId, commonByGroup]);

  /**
   * 공통 탭에서 고칠 초안.
   * 진짜 표가 아니라 campSettings 에 저장될 값이라, 표 껍데기만 빌려 쓴다. (web 과 같은 규칙)
   */
  function buildCommonDraft(): CampTimetable | null {
    if (!activeGroup) return null;
    const shared = commonFor(commonByGroup, activeGroup);
    const assigned = derived.find((g) => isSameGroup(g.name, activeGroup))?.classCodes ?? [];
    const saved = shared?.classes ?? [];
    const known = new Set(saved.map((c) => c.classCode));
    const classes: TimetableClassColumn[] = [
      ...saved,
      ...assigned.filter((code) => !known.has(code)).map((classCode) => ({ classCode })),
    ];
    if (!classes.length) return null;

    const skeleton = buildEmptyTimetable({
      category: categories[0]?.key ?? 'regular',
      groupName: activeGroup,
      classes,
      campCode,
      jobCodeId,
    });
    if (!skeleton) return null;
    return {
      ...skeleton,
      dayTypeLabel: '공통',
      staffOverrides: shared?.staffOverrides ?? {},
      subjects: shared?.subjects?.length ? shared.subjects : DEFAULT_SUBJECTS,
    };
  }

  /** 아직 저장된 적 없는 표인지 */
  const isNew = !!draft && isUnsaved(draft);

  const patch = (fn: (d: CampTimetable) => void) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = D.cloneDraft(prev);
      fn(next);
      return next;
    });

  /** 이 섹션이 공통을 따르는 중인지 (공통 탭에서는 늘 편집 가능) */
  const followsCommon = (part: keyof TimetableOwn) => !isCommon && !!draft && !usesOwn(draft, part);
  const setOwn = (part: keyof TimetableOwn, own: boolean) => patch((d) => D.setOwn(d, part, own));

  /** 이 그룹의 역할별 담당자 — 보기 화면과 같은 규칙(원어민·수업 멘토 모두) */
  const foreignBySubject = useMemo(
    () => derived.find((g) => isSameGroup(g.name, draft?.groupName))?.staffByRole ?? {},
    [derived, draft?.groupName]
  );
  const resolvers = makeNameResolvers(draft ?? undefined, teacherByClassCode, foreignBySubject);
  /**
   * 시트에서 복사한 값을 붙여넣으면 줄바꿈·탭이 그대로 들어온다.
   * 그럴 때는 한 칸이 아니라 표로 보고 아래 행까지 채운다.
   * @returns 표로 처리했으면 true
   */
  const pasteClasses = (row: number, col: number, value: string): boolean => {
    const grid = D.parseClipboardTable(value);
    if (!grid) return false;

    // 반코드는 표에, 반이름·강의실은 캠프 설정에 들어간다
    if (col === 0) {
      patch((d) => void D.pasteClassGrid(d, row, 0, grid.map((r) => [r[0]]), campCode));
    }
    const codes = draft?.classes.map((c) => c.classCode) ?? [];
    setClassInfo((prev) => {
      const next = { ...prev };
      grid.slice(0, 30).forEach((cells, r) => {
        const code = codes[row + r];
        if (!code) return;
        cells.forEach((v, ci) => {
          const field = D.CLASS_PASTE_FIELDS[col + ci];
          if (!v || field === 'classCode' || !field) return;
          next[code] = { ...next[code], [field]: v };
        });
      });
      return next;
    });
    Alert.alert('붙여넣기', `${Math.min(grid.length, 30)}개 반에 채웠습니다.`);
    return true;
  };

  const layout = draft?.layout ?? 'time';
  const subjects = draft?.subjects?.length ? draft.subjects : DEFAULT_SUBJECTS;
  const sorted = draft ? sortBlocks(draft.blocks, draft.layout) : [];
  /** 이름을 직접 넣을 수 있는 역할 — 과목의 원어민 + 수업(Pattern) 멘토 */
  const staffRoles = useMemo(() => {
    const out = [{ key: '수업', label: '수업(Pattern)' }];
    subjects.forEach((x) => {
      if (x.partner === 'foreign') out.push({ key: x.key.toLowerCase(), label: `${x.key} 원어민` });
      if (x.partner === 'staff' && x.roleKey) out.push({ key: x.roleKey.toLowerCase(), label: `${x.roleKey} 담당` });
    });
    return out.filter((r, i, a) => a.findIndex((y) => y.key === r.key) === i);
  }, [subjects]);

  // ── 저장 / 삭제 ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft || !userData?.userId) return;
    setSaving(true);
    try {
      // 공통 탭 — 표가 아니라 캠프 설정에 저장한다 (그 그룹의 모든 Day 가 함께 쓴다)
      if (isCommon) {
        await updateCampTimetableCommon(db, campCode, draft.groupName, commonValuesOf(draft));
        if (campCode) await updateCampClassInfo(db, campCode, classInfo);
        loadedKey.current = null;
        await Promise.all([refetchCommon(), refetchClassInfo(), refetch()]);
        queryClient.invalidateQueries({ queryKey: scheduleQueryKey(jobCodeId) });
        queryClient.invalidateQueries({ queryKey: ['campTimetableCommon', campCode] });
        queryClient.invalidateQueries({ queryKey: ['campClassInfo', campCode] });
        Alert.alert('저장', `"${draft.groupName}" 의 모든 Day 에 적용했습니다.`);
        return;
      }
      if (isNew) {
        // 기본 틀을 고친 것 — 이 캠프 전용 표로 새로 만든다
        await campTimetableService.create({
          campCode,
          jobCodeId,
          ...D.toUpdatePayload(draft),
          userId: userData.userId,
        });
      } else {
        await campTimetableService.update(draft.id, D.toUpdatePayload(draft), userData.userId);
      }
      // 반이름·강의실은 캠프 설정에 — 이 캠프의 모든 표가 같은 값을 쓴다
      if (campCode) await updateCampClassInfo(db, campCode, classInfo);
      loadedKey.current = null;
      await Promise.all([refetch(), refetchClassInfo()]);
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey(jobCodeId) });
      queryClient.invalidateQueries({ queryKey: ['campClassInfo', campCode] });
      Alert.alert('저장', '저장했습니다.');
    } catch (e) {
      Alert.alert('오류', '저장에 실패했습니다.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!draft || isNew || isCommon) return;
    Alert.alert('삭제', `"${draft.groupName} · ${draft.dayTypeLabel}" 를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await campTimetableService.remove(draft.id);
            loadedKey.current = null;
            await refetch();
            queryClient.invalidateQueries({ queryKey: scheduleQueryKey(jobCodeId) });
          } catch (e) {
            Alert.alert('오류', '삭제에 실패했습니다.');
            console.error(e);
          }
        },
      },
    ]);
  };

  const handleRotation = () => {
    if (!draft) return;
    const keys = D.rotationKeysOf(draft);
    const warn = D.rotationWarning(draft);
    if (warn && !keys.length) {
      Alert.alert('알림', warn);
      return;
    }
    patch((d) => void D.applyRotation(d));
    Alert.alert(
      '채움',
      `${keys.join(' → ')} 순으로 한 칸씩 밀어 채웠습니다.${warn ? `\n\n${warn}` : ''}`
    );
  };

  // ── 화면 ────────────────────────────────────────────────────────
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.topBar}>
        <Text style={s.title}>
          시간표 편집{!!campCode && <Text style={s.titleDim}> · {campCode}</Text>}
        </Text>
        <TouchableOpacity style={s.btn} onPress={onClose}>
          <Text style={s.btnText}>보기로</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !timetables.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#2563eb" />
      ) : null}

      {/* 1단계: Day — 맨 앞 "공통" 은 그 그룹의 모든 Day 에 함께 적용되는 값 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
        <TouchableOpacity
          onPress={() => setEditCategory(COMMON_KEY)}
          style={[s.chip, s.commonChip, isCommon && s.commonChipOn]}
        >
          <Text style={[s.chipText, s.commonChipText, isCommon && s.chipTextOn]}>공통</Text>
        </TouchableOpacity>
        <View style={s.chipDivider} />
        {categories.map((c) => {
          const on = c.key === activeCategory;
          return (
            <TouchableOpacity key={c.key} onPress={() => setEditCategory(c.key)} style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 2단계: 그룹 — 배정된 그룹은 저장된 표가 없어도 전부 나온다 */}
      {groups.length > 0 && (
        <View style={s.segment}>
          {groups.map((g) => {
            const on = isSameGroup(g, activeGroup);
            return (
              <TouchableOpacity key={g} onPress={() => setEditGroup(g)} style={[s.segItem, on && s.segItemOn]}>
                <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>
                  {g}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!draft ? (
        <Text style={s.placeholder}>
          이 그룹에 배정된 반이 없습니다.{'\n'}관리자 &gt; 지원 유저 관리에서 반번호를 넣어 주세요.
        </Text>
      ) : (
        <>
          {isCommon && (
            <View style={s.commonBanner}>
              <Text style={s.commonBannerText}>
                여기서 고친 값은 <Text style={{ fontWeight: '700' }}>{draft.groupName}</Text> 그룹의 모든
                Day(정규·스팀·입소…)에 함께 적용됩니다. 한 Day 만 달라야 하면 그 Day 탭에서 &quot;따로 쓰기&quot; 를
                누르세요.
              </Text>
            </View>
          )}

          {/* 이름 수정 — 비우면 앱 배정, 넣으면 그 값 */}
          <Section title="이름 수정" tag={
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('roster')}
                onDetach={() => setOwn('roster', true)}
                onReattach={() => setOwn('roster', false)}
              />
            }>
            <Locked on={followsCommon('roster')}>
            {draft.classes.map((c, i) => {
              const joined = teacherByClassCode[c.classCode];
              const manual = (c.teacherName ?? '').trim();
              return (
                <View key={`${c.classCode}-${i}`} style={s.nameRow}>
                  <Text style={s.roleLabel} numberOfLines={1}>
                    {c.classCode}
                  </Text>
                  <TextInput
                    value={c.teacherName ?? ''}
                    onChangeText={(v) => patch((d) => D.updateClass(d, i, { teacherName: v }))}
                    style={[s.input, s.flex1, s.tight, manual ? s.manualInput : null]}
                    placeholder={joined || '담임 미배정'}
                    placeholderTextColor="#9ca3af"
                  />
                  {!!manual && <Text style={s.manualTag}>직접</Text>}
                </View>
              );
            })}
            {staffRoles.map((role) => {
              const joined = firstName(foreignBySubject[role.key]);
              const manual = (draft.staffOverrides?.[role.key] ?? '').trim();
              return (
                <View key={role.key} style={s.nameRow}>
                  <Text style={s.roleLabel} numberOfLines={1}>
                    {role.label}
                  </Text>
                  <TextInput
                    value={draft.staffOverrides?.[role.key] ?? ''}
                    onChangeText={(v) =>
                      patch((d) => {
                        d.staffOverrides = { ...(d.staffOverrides ?? {}) };
                        if (v) d.staffOverrides[role.key] = v;
                        else delete d.staffOverrides[role.key];
                      })
                    }
                    style={[s.input, s.flex1, s.tight, manual ? s.manualInput : null]}
                    placeholder={joined || '미배정'}
                    placeholderTextColor="#9ca3af"
                  />
                  {!!manual && <Text style={s.manualTag}>직접</Text>}
                </View>
              );
            })}
            </Locked>
          </Section>

          {/* 반 구성 */}
          <Section
            title={`반 구성 (${draft.classes.length}반)`}
            tag={
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('roster')}
                onDetach={() => setOwn('roster', true)}
                onReattach={() => setOwn('roster', false)}
              />
            }
            action={
              <View style={s.tagRow}>
                <TouchableOpacity style={s.miniBtn} onPress={() => patch((d) => D.addClass(d, campCode))}>
                  <Text style={s.miniBtnText}>+ 반 추가</Text>
                </TouchableOpacity>
                {!isCommon && (
                  <TouchableOpacity
                    style={s.miniBtn}
                    onPress={() =>
                      patch((d) => {
                        d.extraColumns = [
                          ...(d.extraColumns ?? []),
                          { key: D.newBlockId().slice(-6), label: '새 열' },
                        ];
                      })
                    }
                  >
                    <Text style={s.miniBtnText}>+ 열 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          >
            <Locked on={followsCommon('roster')}>
            <Text style={s.hint}>
              관리시트 SY시트에서 열을 복사해 붙여넣으면 아래 행까지 채워집니다. 반이름·강의실·교재코드는 이
              캠프 전체가 함께 쓰는 값이라, 여기서 고치면 모든 표에 같이 반영됩니다.
            </Text>
            {draft.classes.map((c, i) => (
              <View key={`${c.classCode}-${i}`} style={s.classRow}>
                <TextInput
                  value={c.classCode}
                  onChangeText={(v) => {
                    if (pasteClasses(i, 0, v)) return;
                    patch((d) => D.updateClass(d, i, { classCode: v }));
                  }}
                  style={[s.input, s.classCode]}
                  placeholder="J01"
                  autoCapitalize="characters"
                />
                <TextInput
                  value={infoOf(c.classCode).classroom ?? ''}
                  onChangeText={(v) => {
                    if (pasteClasses(i, 1, v)) return;
                    setInfo(c.classCode, { classroom: v });
                  }}
                  style={[s.input, s.roomCol]}
                  placeholder="강의실"
                />
                <TextInput
                  value={infoOf(c.classCode).className ?? ''}
                  onChangeText={(v) => {
                    if (pasteClasses(i, 2, v)) return;
                    setInfo(c.classCode, { className: v });
                  }}
                  style={[s.input, s.flex1]}
                  placeholder="반이름 (Grit)"
                />
                <TouchableOpacity onPress={() => patch((d) => D.removeClass(d, i))} style={s.iconBtn}>
                  <Ionicons name="close" size={16} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            ))}

            {/* 교재 코드 — 코드만 넣으면 3권이 따라온다 */}
            <Text style={[s.fieldLabel, { marginTop: 8 }]}>교재 코드</Text>
            {draft.classes.map((c, i) => {
              const code = infoOf(c.classCode).bookCode ?? '';
              const spare = infoOf(c.classCode).spareBookCode ?? '';
              const set = booksFor(eslBooks, code);
              const unknown = !!code.trim() && !set;
              return (
                <View key={`bk-${c.classCode}-${i}`} style={s.classRow}>
                  <Text style={s.roleLabel} numberOfLines={1}>
                    {c.classCode}
                  </Text>
                  <TextInput
                    value={code}
                    onChangeText={(v) => {
                      if (pasteClasses(i, 3, v)) return;
                      setInfo(c.classCode, { bookCode: v });
                    }}
                    style={[s.input, s.codeField, unknown && s.unknownInput]}
                    placeholder="교재"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    value={spare}
                    onChangeText={(v) => {
                      if (pasteClasses(i, 4, v)) return;
                      setInfo(c.classCode, { spareBookCode: v });
                    }}
                    style={[s.input, s.codeField]}
                    placeholder="Spare"
                    placeholderTextColor="#9ca3af"
                  />
                  <Text style={s.bookHint} numberOfLines={1}>
                    {set
                      ? [set.speaking, set.reading, set.writing].filter(Boolean).join(' / ') || '교재 없음'
                      : unknown
                        ? '리스트에 없는 코드'
                        : ''}
                  </Text>
                </View>
              );
            })}
            </Locked>
          </Section>

          {/* 당번 순번 — Day 마다 다르므로 공통 탭에는 없다 (web 과 같은 구성) */}
          {!isCommon &&
            (draft.extraColumns ?? []).map((e, ei) => (
              <Section
                key={e.key}
                title="전담 열"
                action={
                  <TouchableOpacity
                    onPress={() =>
                      patch((d) => {
                        if (!d.extraColumns) return;
                        const [removed] = d.extraColumns.splice(ei, 1);
                        if (removed) d.blocks.forEach((b) => b.cells && delete b.cells[removed.key]);
                      })
                    }
                  >
                    <Text style={s.dangerLink}>열 삭제</Text>
                  </TouchableOpacity>
                }
              >
                <TextInput
                  value={e.label}
                  onChangeText={(v) =>
                    patch((d) => {
                      if (d.extraColumns) d.extraColumns[ei].label = v;
                    })
                  }
                  style={[s.input, { marginBottom: 8 }]}
                  placeholder="열 이름 (예: 교무실&#10;(사진)조)"
                  placeholderTextColor="#9ca3af"
                  multiline
                />

                <TouchableOpacity
                  style={s.checkRow}
                  onPress={() =>
                    patch((d) => {
                      if (!d.extraColumns) return;
                      d.extraColumns[ei].dutyRotation = d.extraColumns[ei].dutyRotation?.length
                        ? undefined
                        : d.classes.map((c) => c.classCode);
                    })
                  }
                >
                  <Ionicons
                    name={e.dutyRotation?.length ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={e.dutyRotation?.length ? '#2563eb' : '#9ca3af'}
                  />
                  <Text style={s.checkText}>반이 순서대로 돌아가는 당번 열</Text>
                </TouchableOpacity>

                {e.dutyRotation?.length ? (
                  <View style={s.wrapRow}>
                    {e.dutyRotation.map((code, idx) => (
                      <TouchableOpacity
                        key={`${code}-${idx}`}
                        style={s.dutyChip}
                        onPress={() => setPickingDuty({ colKey: e.key, index: idx })}
                      >
                        <Text style={s.dutyChipText}>
                          {idx + 1}. {teacherByClassCode[code] || code}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TextInput
                    value={e.teacherName ?? ''}
                    onChangeText={(v) =>
                      patch((d) => {
                        if (d.extraColumns) d.extraColumns[ei].teacherName = v;
                      })
                    }
                    style={s.input}
                    placeholder="고정 전담 교사"
                    placeholderTextColor="#9ca3af"
                  />
                )}
              </Section>
            ))}

          {/* 과목·주제 */}
          <Section
            title={`과목·주제 (${subjects.length})`}
            tag={
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('subjects')}
                onDetach={() => setOwn('subjects', true)}
                onReattach={() => setOwn('subjects', false)}
              />
            }
          >
            <Locked on={followsCommon('subjects')}>
              <>
                {/* 두 칸이 각각 무엇을 정하는지 머리글로 구분해 준다 (web 과 같은 규칙) */}
                <View style={s.colHead}>
                  <Text style={[s.colHeadText, s.flex1]}>과목</Text>
                  <Text style={[s.colHeadText, { width: 130, marginLeft: 6 }]}>둘째 줄</Text>
                </View>
                {subjects.map((sub, i) => (
                  <View key={`${sub.key}-${i}`}>
                    <View style={s.subjectRow}>
                    <TextInput
                      value={sub.key}
                      onChangeText={(v) => patch((d) => D.updateSubject(d, i, { key: v }))}
                      style={[s.input, s.flex1]}
                    />
                    <TouchableOpacity
                      style={s.partnerBtn}
                      onPress={() =>
                        patch((d) => {
                          const cur = (sub.partner ?? 'none') as SubjectPartner;
                          const next = PARTNER_ORDER[(PARTNER_ORDER.indexOf(cur) + 1) % PARTNER_ORDER.length];
                          D.updateSubject(d, i, { partner: next });
                        })
                      }
                    >
                      <Text style={s.partnerText} numberOfLines={1}>
                        {PARTNER_LABELS[(sub.partner ?? 'none') as SubjectPartner]}
                      </Text>
                    </TouchableOpacity>
                    <RoleButton
                      value={sub.teacherRole ?? ''}
                      roles={staffRoles}
                      onChange={(v) => patch((d) => D.updateSubject(d, i, { teacherRole: v }))}
                    />
                    <TextInput
                      value={sub.room ?? ''}
                      onChangeText={(v) => patch((d) => D.updateSubject(d, i, { room: v }))}
                      style={[s.input, s.roomField]}
                      placeholder="강의실"
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity onPress={() => patch((d) => D.removeSubject(d, i))} style={s.iconBtn}>
                      <Ionicons name="close" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    </View>

                    {/* 짝 수업(Pattern)은 같은 세트지만 다른 수업이라 따로 적는다 */}
                    {sub.partner === 'pattern' && (
                      <View style={[s.subjectRow, s.pairRow]}>
                        <Text style={s.pairMark}>└ 짝</Text>
                        <TextInput
                          value={sub.partnerLabel ?? ''}
                          onChangeText={(v) => patch((d) => D.updateSubject(d, i, { partnerLabel: v }))}
                          style={[s.input, s.flex1]}
                          placeholder="Pattern"
                          placeholderTextColor="#9ca3af"
                        />
                        <RoleButton
                          value={sub.partnerTeacherRole ?? '수업'}
                          roles={staffRoles}
                          onChange={(v) => patch((d) => D.updateSubject(d, i, { partnerTeacherRole: v }))}
                        />
                        <TextInput
                          value={sub.partnerRoom ?? ''}
                          onChangeText={(v) => patch((d) => D.updateSubject(d, i, { partnerRoom: v }))}
                          style={[s.input, s.roomField]}
                          placeholder="강의실"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                    )}
                  </View>
                ))}
                <View style={s.wrapRow}>
                  <TouchableOpacity style={s.miniBtn} onPress={() => patch((d) => D.addSubject(d))}>
                    <Text style={s.miniBtnText}>+ 과목 추가</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.miniBtn} onPress={() => patch((d) => D.resetRotationSubjects(d))}>
                    <Text style={s.miniBtnText}>주제1~{draft.classes.length} 로 채우기 (인문학용)</Text>
                  </TouchableOpacity>
                </View>
              </>
            </Locked>
          </Section>

          {/* 교시 — 교시·날짜는 Day 마다 다르므로 공통 탭에는 없다 */}
          {!isCommon && (
          <Section
            title={layout === 'date' ? `날짜별 줄 (${draft.blocks.length})` : `교시 (${draft.blocks.length})`}
            action={
              <TouchableOpacity style={s.miniBtn} onPress={() => setShowRooms((v) => !v)}>
                <Text style={s.miniBtnText}>{showRooms ? '강의실 숨기기' : '강의실 입력'}</Text>
              </TouchableOpacity>
            }
          >
            {sorted.map((b, bi) => {
              const n = lineCountOf(b, layout);
              return (
                <View key={b.id} style={s.block}>
                  <View style={s.blockHead}>
                    {layout === 'date' ? (
                      <TextInput
                        value={b.dateLabel ?? ''}
                        onChangeText={(v) => patch((d) => D.updateBlock(d, b.id, { dateLabel: v }))}
                        style={[s.input, s.dateInput]}
                        placeholder="1/6, 1/7"
                      />
                    ) : (
                      <View style={s.timeGroup}>
                        {(b.times ?? []).map((t, ti) => (
                          <View key={ti} style={s.timeRow}>
                            <TextInput
                              value={t.start}
                              onChangeText={(v) => patch((d) => D.updateTime(d, b.id, ti, 'start', v))}
                              style={[s.input, s.timeInput]}
                              placeholder="09:20"
                            />
                            <Text style={s.tilde}>~</Text>
                            <TextInput
                              value={t.end}
                              onChangeText={(v) => patch((d) => D.updateTime(d, b.id, ti, 'end', v))}
                              style={[s.input, s.timeInput]}
                              placeholder="10:00"
                            />
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={s.blockTools}>
                      {b.kind === 'class' && layout !== 'date' && (
                        <TouchableOpacity
                          style={s.miniBtn}
                          onPress={() => patch((d) => D.setPeriodCount(d, b.id, n === 2 ? 1 : 2))}
                        >
                          <Text style={s.miniBtnText}>{n === 2 ? '1교시로' : '2교시로'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => patch((d) => void D.moveBlock(d, b.id, -1))}
                        disabled={bi === 0}
                        style={[s.iconBtn, bi === 0 && s.iconDisabled]}
                      >
                        <Ionicons name="arrow-up" size={15} color="#6b7280" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => patch((d) => void D.moveBlock(d, b.id, 1))}
                        disabled={bi === sorted.length - 1}
                        style={[s.iconBtn, bi === sorted.length - 1 && s.iconDisabled]}
                      >
                        <Ionicons name="arrow-down" size={15} color="#6b7280" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => patch((d) => D.removeBlock(d, b.id))} style={s.iconBtn}>
                        <Ionicons name="trash-outline" size={15} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {b.kind === 'shared' ? (
                    <TextInput
                      value={b.label ?? ''}
                      onChangeText={(v) => patch((d) => D.updateBlock(d, b.id, { label: v }))}
                      style={[s.input, s.sharedInput]}
                      placeholder="Breakfast / P.E / 인문학 프로그램 …"
                    />
                  ) : (
                    <View style={s.cellWrap}>
                      {draft.classes.map((c) => {
                        const cell = b.cells?.[c.classCode];
                        const spec = subjects.find((x) => x.key === cell?.subject);
                        return (
                          <View key={c.classCode} style={s.cellCol}>
                            <Text style={s.cellHead}>{c.classCode}</Text>
                            <TouchableOpacity
                              style={[s.cellBtn, !cell?.subject && s.cellBtnEmpty]}
                              onPress={() => setPicking({ blockId: b.id, colKey: c.classCode })}
                            >
                              <Text style={[s.cellBtnText, !cell?.subject && s.dim]} numberOfLines={2}>
                                {cell?.subject || '비어 있음'}
                              </Text>
                            </TouchableOpacity>
                            {n === 2 && spec?.partner === 'pattern' && (
                              <TouchableOpacity
                                style={s.flipBtn}
                                onPress={() => patch((d) => D.togglePartnerFirst(d, b.id, c.classCode))}
                              >
                                <Text style={s.flipText}>
                                  {cell?.partnerFirst ? 'Pattern 먼저' : `${cell?.subject} 먼저`}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {showRooms && !!cell?.subject && (
                              <TextInput
                                value={cell.room ?? ''}
                                onChangeText={(v) =>
                                  patch((d) => D.setCellRoom(d, b.id, c.classCode, 'room', v))
                                }
                                style={[s.input, s.roomInput]}
                                placeholder="강의실"
                              />
                            )}
                          </View>
                        );
                      })}
                      {(draft.extraColumns ?? []).filter(isMergedColumn).map((e) => {
                        const auto = mergedColumnName(
                          e,
                          { id: b.id, cells: undefined },
                          { [e.key]: dutyByBlock(draft.blocks, layout, e.dutyRotation) },
                          resolvers.resolveTeacher,
                          resolvers.resolveForeign
                        );
                        const override = b.cells?.[e.key]?.texts?.[0] ?? '';
                        return (
                          <View key={e.key} style={s.cellCol}>
                            <Text style={s.cellHead} numberOfLines={1}>
                              {e.label}
                            </Text>
                            <TextInput
                              value={override}
                              onChangeText={(v) =>
                                patch((d) => {
                                  const blk = d.blocks.find((x) => x.id === b.id);
                                  if (!blk) return;
                                  blk.cells ??= {};
                                  if (v) blk.cells[e.key] = { texts: [v] };
                                  else delete blk.cells[e.key];
                                })
                              }
                              style={[s.input, s.dutyField, override ? s.manualInput : null]}
                              placeholder={auto?.text ?? '—'}
                              placeholderTextColor="#9ca3af"
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={s.wrapRow}>
              <TouchableOpacity style={s.miniBtn} onPress={() => patch((d) => D.addBlock(d, 'class'))}>
                <Text style={s.miniBtnText}>+ 반별 줄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.miniBtn} onPress={() => patch((d) => D.addBlock(d, 'shared'))}>
                <Text style={s.miniBtnText}>+ 공통 줄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.miniBtn} onPress={handleRotation}>
                <Text style={s.miniBtnText}>로테이션 채우기</Text>
              </TouchableOpacity>
            </View>
          </Section>
          )}

          {/* 저장 */}
          {isCommon && (
            <Text style={s.newHint}>저장하면 {draft.groupName} 그룹의 모든 Day 에 적용됩니다.</Text>
          )}
          {!isCommon && isNew && (
            <Text style={s.newHint}>저장하면 이 캠프 전용 표가 됩니다.</Text>
          )}
          <View style={s.actions}>
            <TouchableOpacity style={[s.primaryBtn, saving && s.disabled]} onPress={handleSave} disabled={saving}>
              <Text style={s.primaryBtnText}>{saving ? '저장 중…' : '저장'}</Text>
            </TouchableOpacity>
            {!isCommon && !isNew && (
              <TouchableOpacity style={s.dangerBtn} onPress={handleDelete}>
                <Text style={s.dangerBtnText}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* 과목 고르기 */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setPicking(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>과목 고르기</Text>
            <ScrollView style={s.sheetList}>
              {subjects.map((sub) => (
                <TouchableOpacity
                  key={sub.key}
                  style={s.sheetItem}
                  onPress={() => {
                    if (picking) patch((d) => D.setCellSubject(d, picking.blockId, picking.colKey, sub.key));
                    setPicking(null);
                  }}
                >
                  <View style={[s.swatch, { backgroundColor: sub.color ?? '#f3f4f6' }]} />
                  <Text style={s.sheetItemText}>{sub.key}</Text>
                  <Text style={s.sheetItemSub}>{PARTNER_LABELS[(sub.partner ?? 'none') as SubjectPartner]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={s.sheetItem}
                onPress={() => {
                  if (picking) patch((d) => D.setCellSubject(d, picking.blockId, picking.colKey, ''));
                  setPicking(null);
                }}
              >
                <Text style={[s.sheetItemText, s.dim]}>비우기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 교무실조 순번 고르기 */}
      <Modal visible={!!pickingDuty} transparent animationType="fade" onRequestClose={() => setPickingDuty(null)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setPickingDuty(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{(pickingDuty?.index ?? 0) + 1}번째 순번</Text>
            <ScrollView style={s.sheetList}>
              {(draft?.classes ?? []).map((c) => (
                <TouchableOpacity
                  key={c.classCode}
                  style={s.sheetItem}
                  onPress={() => {
                    if (pickingDuty)
                      patch((d) => {
                        const col = d.extraColumns?.find((e) => e.key === pickingDuty.colKey);
                        if (col?.dutyRotation) col.dutyRotation[pickingDuty.index] = c.classCode;
                      });
                    setPickingDuty(null);
                  }}
                >
                  <Text style={s.sheetItemText}>{c.classCode}</Text>
                  <Text style={s.sheetItemSub}>{teacherByClassCode[c.classCode] || '담임 미배정'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

/** 이 수업 아래에 이름이 붙을 담당자 — 탭하면 다음 후보로 넘어간다 */
function RoleButton({
  value,
  roles,
  onChange,
}: {
  value: string;
  roles: Array<{ key: string; label: string }>;
  onChange: (v: string) => void;
}) {
  const options = [{ key: '', label: '담당 없음' }, { key: 'ownTeacher', label: '그 반 담임' }, ...roles];
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <TouchableOpacity style={s.partnerBtn} onPress={() => onChange(options[(idx + 1) % options.length].key)}>
      <Text style={s.partnerText} numberOfLines={1}>
        {options[idx]?.label ?? '담당 없음'}
      </Text>
    </TouchableOpacity>
  );
}

function Section({
  title,
  action,
  tag,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  /** 공통/전용 표시 — 제목 바로 옆 */
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={s.tagRow}>
          <Text style={s.sectionTitle}>{title}</Text>
          {tag}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** 공통을 따르는 동안은 손대지 못하게 막고 흐리게 보여 준다 */
function Locked({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <View pointerEvents={on ? 'none' : 'auto'} style={on ? s.locked : undefined}>
      {children}
    </View>
  );
}

/** 섹션 머리의 "공통 따름 / 이 Day 전용" 표시와 전환 버튼 (web 과 같은 규칙) */
function CommonTag({
  hidden,
  follows,
  onDetach,
  onReattach,
}: {
  hidden: boolean;
  follows: boolean;
  onDetach: () => void;
  onReattach: () => void;
}) {
  if (hidden) return null;
  return (
    <View style={s.tagRow}>
      <View style={follows ? s.tagCommon : s.tagOwn}>
        <Text style={follows ? s.tagCommonText : s.tagOwnText}>{follows ? '공통' : '이 Day 전용'}</Text>
      </View>
      <TouchableOpacity onPress={follows ? onDetach : onReattach}>
        <Text style={s.tagLink}>{follows ? '따로 쓰기' : '공통으로'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 12, paddingBottom: 48 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  titleDim: { color: '#9ca3af', fontWeight: '400' },
  btn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  btnText: { fontSize: 12, color: '#374151' },

  chipRow: { marginBottom: 10 },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextOn: { color: '#fff' },


  placeholder: { textAlign: 'center', color: '#6b7280', fontSize: 13, paddingVertical: 32, lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  segItem: { flex: 1, paddingHorizontal: 4, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segItemOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  segTextOn: { color: '#111827' },
  newHint: { fontSize: 11, color: '#6b7280', marginBottom: 8 },

  section: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },

  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#6b7280', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  flex1: { flex: 1 },

  classRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  classCode: { width: 64, marginRight: 6 },
  roomCol: { width: 72, marginLeft: 6 },
  manualInput: { borderColor: '#9ca3af', backgroundColor: '#fff' },
  iconBtn: { padding: 6 },
  iconDisabled: { opacity: 0.25 },

  subjectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pairRow: { paddingLeft: 10 },
  pairMark: { width: 26, fontSize: 10, color: '#9ca3af' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  tight: { paddingVertical: 3 },
  partnerBtn: {
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 130,
  },
  partnerText: { fontSize: 11, color: '#374151' },

  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallChip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  smallChipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  smallChipText: { fontSize: 11, color: '#374151' },
  smallChipTextOn: { color: '#fff' },

  commonChip: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  commonChipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  commonChipText: { color: '#1d4ed8', fontWeight: '600' },
  chipDivider: { width: 1, alignSelf: 'center', height: 16, backgroundColor: '#e5e7eb', marginHorizontal: 4 },

  commonBanner: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  commonBannerText: { fontSize: 11, color: '#1e40af', lineHeight: 16 },

  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagCommon: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagCommonText: { fontSize: 10, color: '#1d4ed8' },
  tagOwn: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagOwnText: { fontSize: 10, color: '#b45309' },
  tagLink: { fontSize: 10, color: '#6b7280', textDecorationLine: 'underline' },
  locked: { opacity: 0.55 },
  colHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colHeadText: { fontSize: 10, color: '#9ca3af' },

  miniBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  miniBtnText: { fontSize: 11, color: '#374151' },

  dangerLink: { fontSize: 11, color: '#ef4444' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  checkText: { fontSize: 11, color: '#4b5563' },

  dutyChip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  dutyChipText: { fontSize: 11, color: '#374151' },

  block: { borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 8, padding: 8, marginBottom: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  timeGroup: { flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  timeInput: { width: 68, textAlign: 'center' },
  dateInput: { flex: 1, marginRight: 8 },
  tilde: { marginHorizontal: 6, color: '#9ca3af', fontSize: 12 },
  blockTools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sharedInput: { marginTop: 6 },

  cellWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  cellCol: { width: 86 },
  cellHead: { fontSize: 10, fontWeight: '600', color: '#6b7280', marginBottom: 3, textAlign: 'center' },
  cellBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cellBtnEmpty: { borderStyle: 'dashed' },
  cellBtnText: { fontSize: 11, color: '#111827', textAlign: 'center' },
  flipBtn: { marginTop: 3, alignItems: 'center' },
  flipText: { fontSize: 9, color: '#2563eb' },
  roomInput: { marginTop: 3, paddingVertical: 3, fontSize: 10, textAlign: 'center' },

  dim: { color: '#9ca3af', fontSize: 12 },
  hint: { fontSize: 11, lineHeight: 16, color: '#6b7280', marginBottom: 8 },
  roleLabel: { width: 86, fontSize: 11, color: '#6b7280', fontWeight: '500' },
  manualTag: { marginLeft: 6, fontSize: 10, color: '#6b7280' },
  roomField: { width: 62, marginLeft: 6, fontSize: 11 },
  codeField: { width: 58, marginLeft: 6, fontSize: 11, textAlign: 'center' },
  unknownInput: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' },
  bookHint: { flex: 1, marginLeft: 6, fontSize: 9.5, color: '#9ca3af' },
  dutyField: { paddingVertical: 8, fontSize: 11, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  sheetTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  sheetList: { maxHeight: 380 },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  swatch: { width: 12, height: 12, borderRadius: 3, marginRight: 8 },
  sheetItemText: { fontSize: 13, color: '#111827', flex: 1 },
  sheetItemSub: { fontSize: 11, color: '#9ca3af' },
});

export default TimetableEditor;
