/**
 * 관리자 → 한국인 멘토 선생님 / 원어민 선생님 (웹 /admin/user-check · /admin/foreign-teachers 와 같은 화면)
 *
 * - 사람 목록·묶기·소개·수업 자료 불러오기 규칙은 shared (utils/campTeachers · services/campTeachers) — 웹과 같은 코드
 * - 운영진(매니저 → 부매니저) · 그룹별 (멘토: 담임 반 순서 → 수업 / 원어민: Speaking → Reading → Writing → Mix)
 * - 카드: 사진(3:4) · 이름 · 나이·성별·학교/학과(멘토) 또는 국적·참여·경력 연수(원어민)
 *         멘토는 이 캠프에 올린 수업 자료 주제, 운영진은 최근 참여한 캠프
 * - 카드를 누르면 아래에서 올라오는 창 — 수업 자료(공개보기 · 원본편집, 눌러서 열기) · 경력(원어민) · 참여한 캠프(그때 역할)
 * - 링크가 빈 주제·칸은 보이지 않는다. 연락처·주민번호 같은 개인정보도 보이지 않는다
 * - 휴대폰은 한 줄에 한 명, 태블릿(넓은 화면)은 두 명
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  CAMP_TEACHER_TITLE,
  adminGetAllJobCodes,
  buildCampTeachers,
  campTeacherCaption,
  compareCampCodes,
  countryFlag,
  formatTeachingPeriod,
  getCampRoster,
  groupCampTeachers,
  lessonGenNum,
  loadTeacherLessons,
  logger,
  ordinalEn,
  resolveActiveJobCodeId,
  safeLessonUrl,
  uploadedLessonTopics,
  type CampTeacher,
  type CampTeacherKind,
  type JobCodeWithId,
  type TeacherLesson,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getUsersByJobCodeId } from '../services/userService';
import type { AdminStackScreenProps } from '../navigation/types';

type Person = CampTeacher;
type Tone = { bar: string; soft: string; text: string };

const BRAND = '#2E26D3';
/** 그룹 색 — 웹 화면과 같은 계열 */
const GROUP_TONE: Record<string, Tone> = {
  spring: { bar: '#fbbf24', soft: '#fffbeb', text: '#b45309' },
  summer: { bar: '#10b981', soft: '#ecfdf5', text: '#047857' },
  autumn: { bar: '#8b5cf6', soft: '#f5f3ff', text: '#6d28d9' },
  winter: { bar: '#fb7185', soft: '#fff1f2', text: '#be123c' },
  junior: { bar: '#0ea5e9', soft: '#f0f9ff', text: '#0369a1' },
  middle: { bar: '#14b8a6', soft: '#f0fdfa', text: '#0f766e' },
  senior: { bar: '#6366f1', soft: '#eef2ff', text: '#4338ca' },
};
const STAFF_TONE: Tone = { bar: BRAND, soft: '#eef2ff', text: BRAND };
const toneOf = (g: string): Tone => GROUP_TONE[String(g).toLowerCase()] ?? STAFF_TONE;

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmt = (d: Date | null) => (d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '');
const openUrl = (url?: string) => {
  const u = safeLessonUrl(url);
  if (u) Linking.openURL(u).catch(() => undefined);
};

export function UserCheckScreen({ navigation, route }: AdminStackScreenProps<'UserCheck'>) {
  const { userData } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<CampTeacherKind>(route.params?.kind ?? 'mentor');
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [gen, setGen] = useState('');
  const [jobCodeId, setJobCodeId] = useState('');
  const [users, setUsers] = useState<Array<Record<string, any>>>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /** userId → 이 캠프 수업 자료 (한국인 멘토 화면만) */
  const [lessons, setLessons] = useState<Record<string, TeacherLesson> | null>(null);
  const [selected, setSelected] = useState<{ p: Person; staff: boolean; tone: Tone } | null>(null);

  useEffect(() => {
    if (route.params?.kind) setKind(route.params.kind);
  }, [route.params?.kind]);

  // 캠프 코드 — 최근 기수부터, 처음에는 관리자가 지금 들어가 있는 캠프
  useEffect(() => {
    adminGetAllJobCodes(db)
      .then((list) => {
        const cs = list
          .filter((c) => c.code)
          .sort((a, b) => lessonGenNum(b.generation) - lessonGenNum(a.generation) || compareCampCodes(a.code, b.code));
        setCodes(cs);
        const active = resolveActiveJobCodeId(userData as any);
        const first = cs.find((c) => c.id === active) ?? cs[0];
        if (first) {
          setGen(String(first.generation));
          setJobCodeId(first.id);
        } else setLoading(false);
      })
      .catch((e) => {
        logger.error('캠프 코드 불러오기 실패:', e);
        setFailed(true);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사람 — '선생님 명단 관리' 표(있으면) 또는 캠프 배정
  useEffect(() => {
    if (!jobCodeId) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all([getUsersByJobCodeId(jobCodeId), getCampRoster(db, jobCodeId).catch(() => null)])
      .then(([us, roster]) => {
        if (!alive) return;
        setUsers(us as any[]);
        setPeople(buildCampTeachers(jobCodeId, us as any[], roster));
      })
      .catch((e) => {
        logger.error('캠프 선생님 불러오기 실패:', e);
        if (alive) {
          setPeople([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [jobCodeId, reloadKey]);

  const jc = codes.find((c) => c.id === jobCodeId);

  // 한국인 멘토 — 사람 목록이 뜬 뒤 각자의 이 캠프 수업 자료
  useEffect(() => {
    if (kind !== 'mentor' || !jc?.code || !people.length) {
      setLessons(null);
      return;
    }
    let alive = true;
    setLessons(null);
    const ids = [...new Set(people.filter((p) => p.kind === 'mentor' && p.userId).map((p) => p.userId as string))];
    loadTeacherLessons(db, { users: users as any, ids, jobCodeId, code: jc.code })
      .then((r) => { if (alive) setLessons(r); })
      .catch(() => { if (alive) setLessons({}); });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, people, jc?.code]);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))], [codes]);
  const genCodes = useMemo(() => codes.filter((c) => String(c.generation) === gen), [codes, gen]);
  const view = useMemo(() => groupCampTeachers(people, kind), [people, kind]);
  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);
  /** 참여한 캠프 — 최근 기수부터 */
  const campsOf = (p: Person) =>
    (p.campIds ?? [])
      .map((id) => codeById.get(id))
      .filter((c): c is JobCodeWithId => !!c)
      .sort((a, b) => lessonGenNum(b.generation) - lessonGenNum(a.generation) || compareCampCodes(a.code, b.code));

  const pickGen = (g: string) => {
    setGen(g);
    const first = codes.find((c) => String(c.generation) === g);
    if (first && first.id !== jobCodeId) setJobCodeId(first.id);
  };
  const changeKind = (k: CampTeacherKind) => {
    setKind(k);
    navigation.setParams({ kind: k });
  };

  // 넓은 화면(태블릿)은 두 명씩
  const cols = width >= 720 ? 2 : 1;
  const contentW = Math.min(width, 1100) - 32;
  const cardW = cols === 1 ? contentW : (contentW - 12) / 2;
  const start = toDate((jc as any)?.startDate);
  const end = toDate((jc as any)?.endDate);
  const title = CAMP_TEACHER_TITLE[kind];

  const grid = (list: Person[], staff: boolean, tone: Tone) => (
    <View style={styles.grid}>
      {list.map((p) => (
        <PersonCard
          key={p.key}
          p={p}
          staff={staff}
          tone={tone}
          width={cardW}
          lesson={p.userId ? lessons?.[p.userId] : undefined}
          lessonsLoading={kind === 'mentor' && !lessons}
          camps={staff ? campsOf(p) : []}
          currentId={jobCodeId}
          onPress={() => setSelected({ p, staff, tone })}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 머리 — 뒤로 · 제목(캠프) · 멘토/원어민 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{jc ? `${jc.generation} ${jc.name}` : 'SMIS CAMP'}</Text>
        </View>
        <View style={styles.segment}>
          {(['mentor', 'foreign'] as const).map((k) => (
            <TouchableOpacity key={k} onPress={() => changeKind(k)} style={[styles.segmentBtn, kind === k && styles.segmentOn]}>
              <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>{k === 'mentor' ? '멘토' : '원어민'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 기수 · 캠프 고르기 */}
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {gens.map((g) => (
            <TouchableOpacity key={g} onPress={() => pickGen(g)} style={[styles.genChip, g === gen && styles.genChipOn]}>
              <Text style={[styles.genChipText, g === gen && styles.chipTextOn]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {genCodes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {genCodes.map((c) => {
              const on = c.id === jobCodeId;
              return (
                <TouchableOpacity key={c.id} onPress={() => setJobCodeId(c.id)} style={[styles.codeChip, on && styles.codeChipOn]}>
                  <Text style={[styles.codeChipCode, on && styles.chipTextOn]}>{c.code}</Text>
                  <Text style={[styles.codeChipName, on && { color: 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 14, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setReloadKey((k) => k + 1); }} />}
      >
        <View style={{ width: contentW, alignSelf: 'center' }}>
          <View style={styles.summary}>
            {!!jc?.code && <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{jc.code}</Text></View>}
            {!!start && <Text style={styles.summaryText}>{fmt(start)} – {fmt(end)}</Text>}
            {view.count > 0 && <Text style={styles.summaryText}><Text style={styles.summaryCount}>{view.count}</Text>명</Text>}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={BRAND} />
              <Text style={styles.centerText}>불러오는 중…</Text>
            </View>
          ) : failed ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={40} color="#d1d5db" />
              <Text style={styles.centerText}>불러오지 못했습니다. 아래로 당겨 다시 시도하세요.</Text>
            </View>
          ) : view.count === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={40} color="#d1d5db" />
              <Text style={styles.centerText}>이 캠프에 배정된 {title}이 없습니다.</Text>
              <Text style={styles.centerHint}>웹의 '선생님 명단 관리'에서 배정할 수 있습니다.</Text>
            </View>
          ) : (
            <>
              {view.staff.length > 0 && (
                <View style={styles.section}>
                  <SectionTitle title="운영진" sub="Camp Managers" tone={STAFF_TONE} />
                  {grid(view.staff, true, STAFF_TONE)}
                </View>
              )}
              {view.sections.map(({ g, list, grades }) => {
                const tone = toneOf(g);
                return (
                  <View key={g} style={styles.section}>
                    <SectionTitle title={g} sub={grades.join(' · ')} tone={tone} />
                    {grid(list, false, tone)}
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      {selected && (
        <DetailSheet
          p={selected.p}
          staff={selected.staff}
          tone={selected.tone}
          lesson={selected.p.userId ? lessons?.[selected.p.userId] : undefined}
          lessonsLoading={kind === 'mentor' && !lessons}
          camps={campsOf(selected.p)}
          currentId={jobCodeId}
          onClose={() => setSelected(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ── 조각들 ──────────────────────────────────────────────────────

function SectionTitle({ title, sub, tone }: { title: string; sub?: string; tone: Tone }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionBar, { backgroundColor: tone.bar }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!sub && <Text style={[styles.sectionSub, { color: tone.text }]} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function Photo({ p, width, radius }: { p: Person; width: number; radius: number }) {
  const box = { width, height: Math.round((width * 4) / 3), borderRadius: radius };
  return p.photo ? (
    <Image source={{ uri: p.photo }} style={[box, { backgroundColor: '#f3f4f6' }]} contentFit="cover" transition={150} cachePolicy="memory-disk" />
  ) : (
    <View style={[box, styles.photoEmpty]}>
      <Text style={[styles.photoInitial, { fontSize: Math.round(width * 0.36) }]}>{p.name.slice(0, 1)}</Text>
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View style={[styles.pill, { backgroundColor: tone.soft }]}>
      <Text style={[styles.pillText, { color: tone.text }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** 소개 줄 — 멘토: 나이·성별·SMIS / 학교·학과·학년, 원어민: 국적 / SMIS·경력 연수 */
function Meta({ p }: { p: Person }) {
  if (p.kind === 'foreign') {
    const second = [p.smisCount ? `SMIS ${ordinalEn(p.smisCount)}` : '', p.teachingYears ? `Teaching ${p.teachingYears}` : ''].filter(Boolean).join(' · ');
    return (
      <>
        {!!p.nationality && <Text style={styles.meta} numberOfLines={1}>{countryFlag(p.nationality)} {p.nationality}</Text>}
        {!!second && <Text style={styles.metaSub} numberOfLines={1}>{second}</Text>}
      </>
    );
  }
  const basics = [p.age ? `${p.age}세` : '', p.gender, p.smisCount ? `SMIS ${p.smisCount}회` : ''].filter(Boolean).join(' · ');
  const school = [[p.school, p.major].filter(Boolean).join(' '), p.schoolYear].filter(Boolean).join(' · ');
  return (
    <>
      {!!basics && <Text style={styles.meta} numberOfLines={1}>{basics}</Text>}
      {!!school && <Text style={styles.metaSub} numberOfLines={1}>{school}</Text>}
    </>
  );
}

function PersonCard({ p, staff, tone, width, lesson, lessonsLoading, camps, currentId, onPress }: {
  p: Person; staff: boolean; tone: Tone; width: number;
  lesson?: TeacherLesson; lessonsLoading: boolean;
  /** 운영진 — 참여한 캠프 (최근부터) */
  camps: JobCodeWithId[]; currentId: string;
  onPress: () => void;
}) {
  const caption = campTeacherCaption(p, staff);
  const topics = uploadedLessonTopics(lesson);
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.card, { width }]}>
      <Photo p={p} width={76} radius={10} />
      <View style={styles.cardBody}>
        {!!caption && <Pill text={caption} tone={tone} />}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          {!!p.englishName && <Text style={styles.eng} numberOfLines={1}>{p.englishName}</Text>}
        </View>
        <Meta p={p} />

        {/* 운영진 — 최근 참여한 캠프 / 한국인 멘토 — 이 캠프에 올린 수업 자료 */}
        {staff ? (
          camps.length > 0 && (
            <View style={styles.footRow}>
              {camps.slice(0, 4).map((c) => (
                <View key={c.id} style={[styles.miniCode, c.id === currentId && styles.miniCodeOn]}>
                  <Text style={[styles.miniCodeText, c.id === currentId && { color: '#fff' }]}>{c.code}</Text>
                </View>
              ))}
              {camps.length > 4 && <Text style={styles.more}>+{camps.length - 4}</Text>}
            </View>
          )
        ) : p.kind === 'mentor' ? (
          lessonsLoading ? (
            <Text style={styles.footMuted}>수업 자료 확인 중…</Text>
          ) : lesson?.failed ? (
            <Text style={styles.footWarn}>수업 자료를 불러오지 못했습니다</Text>
          ) : topics.length ? (
            <View style={styles.footRow}>
              {topics.map((t, i) => (
                <View key={i} style={styles.topicChip}>
                  <Ionicons name="document-text-outline" size={11} color={BRAND} />
                  <Text style={styles.topicChipText} numberOfLines={1}>{t.title} {t.sections.length}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.footMuted}>아직 올린 수업 자료 없음</Text>
          )
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

// ── 눌렀을 때 — 아래에서 올라오는 창 ─────────────────────────────

function DetailSheet({ p, staff, tone, lesson, lessonsLoading, camps, currentId, onClose }: {
  p: Person; staff: boolean; tone: Tone;
  lesson?: TeacherLesson; lessonsLoading: boolean;
  camps: JobCodeWithId[]; currentId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const caption = p.kind === 'foreign'
    ? campTeacherCaption(p, staff)
    : staff
      ? campTeacherCaption(p, true)
      : [p.group, p.role === '담임' ? `담임 ${p.classCode}` : p.role, p.className].filter(Boolean).join(' · ');
  const topics = uploadedLessonTopics(lesson);
  // 운영진은 올린 자료가 있을 때만 수업 자료 칸
  const showLessons = p.kind === 'mentor' && (!staff || topics.length > 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: height * 0.88, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <TouchableOpacity onPress={onClose} style={styles.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={20} color="#6b7280" />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={styles.sheetHead}>
              <Photo p={p} width={96} radius={14} />
              <View style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                {!!caption && <Pill text={caption} tone={tone} />}
                <Text style={styles.sheetName}>{p.name}</Text>
                {!!p.englishName && <Text style={styles.eng}>{p.englishName}</Text>}
                <View style={{ marginTop: 4 }}>
                  <Meta p={p} />
                </View>
              </View>
            </View>

            {showLessons && <LessonList lesson={lesson} loading={lessonsLoading} />}
            {p.kind === 'foreign' && <Experience p={p} />}

            {camps.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>참여한 캠프 · {camps.length}</Text>
                {camps.map((c) => {
                  const on = c.id === currentId;
                  const role = p.campRoles?.[c.id];
                  return (
                    <View key={c.id} style={styles.campRow}>
                      <View style={[styles.campCode, on && styles.campCodeOn]}>
                        <Text style={[styles.campCodeText, on && { color: '#fff' }]}>{c.code}</Text>
                      </View>
                      <Text style={[styles.campName, on && styles.campNameOn]} numberOfLines={1}>{c.generation} {c.name}</Text>
                      {!!role && (
                        <View style={[styles.campRole, on && { backgroundColor: '#eef2ff' }]}>
                          <Text style={[styles.campRoleText, on && { color: BRAND }]} numberOfLines={1}>{role}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** 이 캠프의 수업 자료 — 올린 칸만, 칸마다 공개보기 · 원본편집 (같은 링크면 하나만) */
function LessonList({ lesson, loading }: { lesson?: TeacherLesson; loading: boolean }) {
  const topics = uploadedLessonTopics(lesson);
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>수업 자료</Text>
      {loading ? (
        <Text style={styles.footMuted}>불러오는 중…</Text>
      ) : lesson?.failed ? (
        <Text style={styles.footWarn}>수업 자료를 불러오지 못했습니다</Text>
      ) : !topics.length ? (
        <Text style={styles.footMuted}>아직 올린 수업 자료가 없습니다</Text>
      ) : (
        topics.map((t, i) => (
          <View key={i} style={styles.topic}>
            <Text style={styles.topicTitle}>{t.title}</Text>
            {t.sections.map((x, j) => (
              <View key={j} style={styles.item}>
                <Text style={styles.itemTitle} numberOfLines={2}>{x.title}</Text>
                {!!x.view && (
                  <TouchableOpacity onPress={() => openUrl(x.view)} style={styles.viewBtn}>
                    <Text style={styles.viewBtnText}>공개보기</Text>
                  </TouchableOpacity>
                )}
                {!!x.original && x.original !== x.view && (
                  <TouchableOpacity onPress={() => openUrl(x.original)} style={styles.editBtn}>
                    <Text style={styles.editBtnText}>원본편집</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

/** 원어민 경력 — 구조화된 목록(역할·장소·기간·내용)이 있으면 그걸, 없으면 예전 글 */
function Experience({ p }: { p: Person }) {
  const items = p.teachingExperiences ?? [];
  const legacy = items.length
    ? []
    : String(p.teachingExperience ?? '').split(/\r?\n/).map((l) => l.replace(/^[-•·@\s]+/, '').trim()).filter(Boolean);
  if (!items.length && !legacy.length) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>TEACHING EXPERIENCE</Text>
      {items.length > 0
        ? items.map((it, i) => (
          <View key={i} style={styles.expItem}>
            <View style={styles.expHead}>
              <Text style={styles.expRole} numberOfLines={2}>
                {it.role || it.place}
                {!!it.role && !!it.place && <Text style={styles.expPlace}> · {it.place}</Text>}
              </Text>
              <Text style={styles.expPeriod}>{formatTeachingPeriod(it)}</Text>
            </View>
            {!!it.description && <Text style={styles.expDesc}>{it.description}</Text>}
          </View>
        ))
        : legacy.map((l, i) => <Text key={i} style={styles.expLegacy}>• {l}</Text>)}
    </View>
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
  headerSub: { fontSize: 12, fontWeight: '600', color: BRAND, marginTop: 1 },
  segment: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 2 },
  segmentBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 },
  segmentOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  segmentTextOn: { color: '#111827', fontWeight: '800' },

  filters: { backgroundColor: '#fff', paddingVertical: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  chipRow: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  genChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  genChipOn: { backgroundColor: '#111827' },
  genChipText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  chipTextOn: { color: '#fff' },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 220, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  codeChipOn: { backgroundColor: BRAND, borderColor: BRAND },
  codeChipCode: { fontSize: 13, fontWeight: '800', color: '#111827' },
  codeChipName: { fontSize: 12, color: '#6b7280', flexShrink: 1 },

  summary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  codeBadge: { backgroundColor: BRAND, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  codeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  summaryText: { fontSize: 13, color: '#6b7280' },
  summaryCount: { fontWeight: '800', color: '#111827' },

  center: { alignItems: 'center', paddingVertical: 64, gap: 8 },
  centerText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  centerHint: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },

  section: { marginBottom: 28 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 10, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardBody: { flex: 1, minWidth: 0, paddingTop: 2, gap: 2 },
  photoEmpty: { backgroundColor: '#eef0f3', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontWeight: '800', color: '#9ca3af' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2, maxWidth: '100%' },
  pillText: { fontSize: 11, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  eng: { fontSize: 12, color: '#9ca3af', flexShrink: 1 },
  meta: { fontSize: 13, color: '#4b5563' },
  metaSub: { fontSize: 12, color: '#6b7280' },
  footRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 },
  footMuted: { fontSize: 11, color: '#c0c4cc', marginTop: 6 },
  footWarn: { fontSize: 11, color: '#d97706', marginTop: 6 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, backgroundColor: '#eef2ff',
  },
  topicChipText: { fontSize: 11, fontWeight: '700', color: BRAND, flexShrink: 1 },
  miniCode: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#f3f4f6' },
  miniCodeOn: { backgroundColor: BRAND },
  miniCodeText: { fontSize: 10, fontWeight: '800', color: '#4b5563' },
  more: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 10 },
  sheetClose: { position: 'absolute', top: 14, right: 14, zIndex: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingTop: 6 },
  sheetName: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 2 },

  block: { marginTop: 22 },
  blockTitle: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 },
  topic: { marginBottom: 12 },
  topicTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
    borderRadius: 10, backgroundColor: '#f9fafb', borderWidth: StyleSheet.hairlineWidth, borderColor: '#eef0f3',
  },
  itemTitle: { flex: 1, fontSize: 14, color: '#1f2937' },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eef2ff' },
  viewBtnText: { fontSize: 12, fontWeight: '800', color: BRAND },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ecfdf5' },
  editBtnText: { fontSize: 12, fontWeight: '800', color: '#047857' },

  expItem: { marginBottom: 10 },
  expHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  expRole: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  expPlace: { fontWeight: '400', color: '#6b7280' },
  expPeriod: { fontSize: 12, color: '#9ca3af' },
  expDesc: { fontSize: 13, color: '#4b5563', marginTop: 2, lineHeight: 18 },
  expLegacy: { fontSize: 13, color: '#374151', marginBottom: 4, lineHeight: 18 },

  campRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  campCode: { width: 58, alignItems: 'center', paddingVertical: 3, borderRadius: 6, backgroundColor: '#f3f4f6' },
  campCodeOn: { backgroundColor: BRAND },
  campCodeText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  campName: { flex: 1, fontSize: 13, color: '#374151' },
  campNameOn: { fontWeight: '800', color: '#111827' },
  campRole: { maxWidth: '40%', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#f9fafb' },
  campRoleText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
});
