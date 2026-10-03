/**
 * 가져오기 (전체 화면) — 다른 그룹·Day·지난 기수의 표를 작업 공간으로 복사한다 (저장 전).
 * 출처 [이 캠프 | 다른 캠프] · 범위 [지금 표 하나 | 이 그룹 모든 Day | 캠프 전체(그룹 짝)] ·
 * 옵션(커스텀 표 · 칸 설명 · 일정표 · 이미 있는 표 바꾸기/건너뛰기) · 미리보기 → 가져오기.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  compareGroupNames,
  findCategory,
  isSameGroup,
  loadTimetableWorkspace,
  localYmd,
  monthDayLabel,
  savedTimetablesFor,
  timetableGroupNames,
  timetableWorkspace as W,
  type CampTimetable,
  type TimetableClassColumn,
  type TimetableWorkspaceData,
} from '@smis-mentor/shared';
import { db } from '../../config/firebase';
import jobCodesService, { type JobCode } from '../../services/jobCodesService';
import { Btn, C, CheckRow, Chip, Field, FullModal, InlineSelect, Notice, Seg, SectionHead, datesText, squash, u, type SetWs } from './common';

type Scope = 'one' | 'group' | 'camp';
type Status = 'create' | 'replace' | 'skip' | 'outside';

const startYmdOf = (jc: JobCode | null): string | null => {
  const d = (jc as unknown as { startDate?: { toDate?: () => Date } } | null)?.startDate?.toDate?.();
  return d ? localYmd(d) : null;
};
const sameDates = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

export function ImportSheet({
  visible,
  onClose,
  ws,
  setWs,
  campCode,
  jobCodeId,
  startMs,
  endMs,
  groups,
  categories,
  current,
  fallbackFor,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  ws: W.Workspace;
  setWs: SetWs;
  campCode: string;
  jobCodeId: string;
  startMs: number | null;
  endMs: number | null;
  /** 받는 캠프의 그룹 */
  groups: string[];
  categories: Array<{ key: string; label: string }>;
  /** 지금 보고 있는 Day·그룹·표 (표는 빈 뼈대일 수 있다) */
  current: { category: string | null; group: string | null; table: CampTimetable | null };
  /** 그룹의 앱 배정 반 (공통·표가 없을 때) */
  fallbackFor: (group: string) => TimetableClassColumn[];
  onDone: (msg: string, focusId?: string) => void;
}) {
  const [source, setSource] = useState<'this' | 'other'>('this');
  const [job, setJob] = useState<JobCode | null>(null);
  const [other, setOther] = useState<TimetableWorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>(current.table ? 'one' : 'group');
  const [srcCat, setSrcCat] = useState<string>(current.category ?? '');
  const [srcGroup, setSrcGroup] = useState<string>('');
  const [srcTableId, setSrcTableId] = useState<string>('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [withCustom, setWithCustom] = useState(false);
  const [withGuides, setWithGuides] = useState(true);
  const [withPlan, setWithPlan] = useState(false);
  const [mode, setMode] = useState<'replace' | 'skip'>('replace');

  // 열 때마다 지금 화면 기준으로 다시
  useEffect(() => {
    if (!visible) return;
    setScope(current.table && current.category ? 'one' : 'group');
    setSrcCat(current.category ?? '');
    setMode(current.table && current.category ? 'replace' : 'skip');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const jobsQ = useQuery({
    queryKey: ['allJobCodes'],
    queryFn: () => jobCodesService.getAllJobCodes(),
    enabled: visible && source === 'other',
    staleTime: 10 * 60 * 1000,
  });
  const jobs = useMemo(
    () =>
      (jobsQ.data ?? [])
        .filter((j) => j.id !== jobCodeId && !!j.code)
        .sort((a, b) => String(b.generation ?? '').localeCompare(String(a.generation ?? ''), 'ko', { numeric: true }) || a.code.localeCompare(b.code)),
    [jobsQ.data, jobCodeId]
  );

  const pickJob = async (j: JobCode) => {
    setJob(j);
    setOther(null);
    setLoading(true);
    try {
      const data = await loadTimetableWorkspace(db, { campCode: j.code, jobCodeId: j.id });
      setOther(data);
      setWithPlan(!ws.cur.dayPlan?.sets?.length && !!data.dayPlan?.sets?.length);
    } catch (e) {
      Alert.alert('가져오기', `${j.code} 데이터를 읽지 못했습니다.\n${(e as Error)?.message ?? ''}`);
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const srcTables: CampTimetable[] = useMemo(
    () => (source === 'this' ? Object.values(ws.cur.tables) : other?.tables ?? []),
    [source, ws.cur.tables, other]
  );
  const srcGroups = useMemo(() => timetableGroupNames([], srcTables).sort((a, b) => compareGroupNames(a, b)), [srcTables]);

  // 출처 그룹 기본값 — 이 캠프면 지금 그룹이 아닌 첫 그룹, 다른 캠프면 같은 이름 그룹
  useEffect(() => {
    const ok = srcGroups.some((g) => g === srcGroup);
    if (ok) return;
    const pick =
      source === 'this'
        ? srcGroups.find((g) => !isSameGroup(g, current.group)) ?? srcGroups[0]
        : srcGroups.find((g) => isSameGroup(g, current.group)) ?? srcGroups[0];
    setSrcGroup(pick ?? '');
  }, [srcGroups, srcGroup, source, current.group]);

  // 캠프 전체 — 받는 그룹 ↔ 출처 그룹 (이름, 없으면 순서로)
  useEffect(() => {
    const m: Record<string, string> = {};
    groups.forEach((g, i) => {
      if (source === 'this') m[g] = '';
      else m[g] = srcGroups.find((x) => isSameGroup(x, g)) ?? srcGroups[i] ?? '';
    });
    setMapping(m);
  }, [groups, srcGroups, source]);

  const curLayout = current.table?.layout ?? findCategory(current.category)?.layout ?? 'time';
  const catOptions = categories.filter((c) => (findCategory(c.key)?.layout ?? 'time') === curLayout);
  const oneList = useMemo(() => savedTimetablesFor(srcTables, srcCat || null, srcGroup || null), [srcTables, srcCat, srcGroup]);
  useEffect(() => {
    if (!oneList.some((t) => t.id === srcTableId)) setSrcTableId(oneList[0]?.id ?? '');
  }, [oneList, srcTableId]);

  const targetStart = startMs ? localYmd(new Date(startMs)) : null;
  const period = startMs && endMs ? { start: localYmd(new Date(startMs)), end: localYmd(new Date(endMs)) } : null;
  const srcStart = source === 'other' ? startYmdOf(job) : null;
  const dayShift = source === 'other' && srcStart && targetStart ? W.daysBetween(srcStart, targetStart) : 0;
  const catLabel = (key: string, fallback?: string) => categories.find((c) => c.key === key)?.label ?? fallback ?? key;

  const items = useMemo(() => {
    const pairs: Array<{ src: CampTimetable; group: string }> = [];
    if (scope === 'one') {
      const src = srcTables.find((t) => t.id === srcTableId);
      if (src && current.group && current.category) pairs.push({ src, group: current.group });
    } else if (scope === 'group') {
      if (current.group && srcGroup && !(source === 'this' && isSameGroup(srcGroup, current.group)))
        srcTables
          .filter((t) => isSameGroup(t.groupName, srcGroup) && (withCustom || !t.dates?.length))
          .forEach((src) => pairs.push({ src, group: current.group! }));
    } else {
      groups.forEach((g) => {
        const m = mapping[g];
        if (!m || (source === 'this' && isSameGroup(m, g))) return;
        srcTables.filter((t) => isSameGroup(t.groupName, m) && (withCustom || !t.dates?.length)).forEach((src) => pairs.push({ src, group: g }));
      });
    }
    const next = Object.values(ws.cur.tables);
    return pairs.map(({ src, group }) => {
      const out = W.adaptTable(src, {
        campCode,
        jobCodeId,
        groupName: group,
        classes: W.groupClasses(ws, group, fallbackFor(group)),
        dayShift: scope === 'one' ? 0 : dayShift,
        period: scope === 'one' ? null : period,
      });
      if (out && scope === 'one' && current.category) {
        out.dayType = current.category;
        out.dayTypeLabel = current.table?.dayTypeLabel ?? catLabel(current.category);
        out.layout = curLayout;
        out.dates = [...(current.table?.dates ?? [])];
      }
      let status: Status = 'outside';
      if (out) {
        const clash = next.filter((x) => x.dayType === out.dayType && isSameGroup(x.groupName, out.groupName) && sameDates(x.dates, out.dates));
        if (clash.length && mode === 'skip') status = 'skip';
        else {
          status = clash.length ? 'replace' : 'create';
          clash.forEach((x) => next.splice(next.indexOf(x), 1));
          next.push(out);
        }
      }
      const t = out ?? src;
      const label = `${t.groupName} · ${catLabel(t.dayType, t.dayTypeLabel)} · ${t.dates?.length ? datesText(t.dates) : '기본'}`;
      return { src, out, status, label };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, srcTables, srcTableId, srcGroup, mapping, withCustom, mode, ws, current, dayShift, period?.start, period?.end, groups, source]);

  const byStatus = (st: Status) => items.filter((i) => i.status === st);
  const usable = items.filter((i) => i.out && i.status !== 'skip');
  const guideN = source === 'other' && withGuides && other ? Object.keys(other.guides).filter((k) => !ws.cur.guides[k]).length : 0;
  const canApply = usable.length > 0 || guideN > 0 || (source === 'other' && withPlan && !!other?.dayPlan);

  const apply = () => {
    const outs = items.filter((i) => i.out).map((i) => i.out!);
    let created = 0;
    let replaced = 0;
    let skipped = 0;
    let guides = 0;
    let plan = false;
    setWs((w0) => {
      let w = w0;
      if (outs.length) {
        const r = W.importTables(w, outs, mode);
        w = r.ws;
        created = r.created;
        replaced = r.replaced;
        skipped = r.skipped;
      }
      if (source === 'other' && other && withGuides) {
        const g = W.importGuides(w, other.guides, 'missing');
        w = g.ws;
        guides = g.count;
      }
      if (source === 'other' && other?.dayPlan && withPlan) {
        w = W.importDayPlan(w, W.shiftDayPlan(other.dayPlan, dayShift, period));
        plan = true;
      }
      return squash(w0, w);
    });
    const parts = [`표 ${created + replaced}장을 가져왔습니다${skipped ? ` (${skipped}장 건너뜀)` : ''}`];
    if (guides) parts.push(`칸 설명 ${guides}칸`);
    if (plan) parts.push('일정표');
    onDone(`${parts.join(' · ')} — 저장을 눌러야 반영됩니다`, scope === 'one' && created + replaced ? outs[0]?.id : undefined);
    onClose();
  };

  const groupNoClasses = (g: string) => !W.groupClasses(ws, g, fallbackFor(g)).length;

  return (
    <FullModal
      visible={visible}
      onClose={onClose}
      title="가져오기"
      footer={
        <>
          <Btn label="닫기" onPress={onClose} style={{ flex: 1 }} />
          <Btn label={`가져오기${usable.length ? ` (${usable.length}장)` : ''}`} kind="primary" disabled={!canApply} onPress={apply} style={{ flex: 2 }} />
        </>
      }
    >
      <SectionHead title="1. 출처" />
      <Seg
        items={[
          { key: 'this', label: `이 캠프 (${campCode})` },
          { key: 'other', label: '다른 캠프' },
        ]}
        value={source}
        onChange={(v) => {
          setSource(v);
          setJob(null);
          setOther(null);
        }}
        style={{ marginBottom: 10 }}
      />
      {source === 'other' && (
        <View style={{ marginBottom: 10 }}>
          {job ? (
            <View style={[u.row, s.jobBox]}>
              <View style={{ flex: 1 }}>
                <Text style={s.jobTitle}>
                  {job.code} · {job.name}
                </Text>
                <Text style={u.hint}>
                  {srcStart ? `시작 ${monthDayLabel(srcStart)} · 커스텀 표·일정표 날짜 ${dayShift >= 0 ? '+' : ''}${dayShift}일` : '시작일을 몰라 날짜를 옮기지 않습니다'}
                </Text>
              </View>
              {loading ? <ActivityIndicator color={C.blue} /> : <Btn label="바꾸기" onPress={() => { setJob(null); setOther(null); }} />}
            </View>
          ) : jobsQ.isLoading ? (
            <ActivityIndicator color={C.blue} style={{ marginVertical: 12 }} />
          ) : (
            <View style={s.jobList}>
              {jobs.map((j) => (
                <TouchableOpacity key={j.id} style={s.jobItem} onPress={() => void pickJob(j)}>
                  <Text style={s.jobCode}>{j.code}</Text>
                  <Text style={s.jobName} numberOfLines={1}>
                    {j.generation ? `${j.generation} · ` : ''}
                    {j.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {!jobs.length && <Text style={[u.hint, { padding: 10 }]}>다른 캠프가 없습니다.</Text>}
            </View>
          )}
        </View>
      )}

      {(source === 'this' || other) && (
        <>
          <SectionHead title="2. 범위" />
          <Seg
            items={[
              ...(current.table && current.category ? [{ key: 'one' as Scope, label: '지금 표 하나' }] : []),
              { key: 'group' as Scope, label: '이 그룹 모든 Day' },
              { key: 'camp' as Scope, label: '캠프 전체' },
            ]}
            value={scope}
            onChange={(v) => {
              setScope(v);
              setMode(v === 'one' ? 'replace' : 'skip');
            }}
            style={{ marginBottom: 10 }}
          />

          {scope === 'one' && (
            <View style={u.card}>
              <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>
                고른 표로 지금 보고 있는 {current.group} · {catLabel(current.category ?? '')}
                {current.table?.dates?.length ? ` · ${datesText(current.table.dates)}` : ''} 표를 채웁니다.
              </Text>
              <Field label="출처 Day">
                <View style={u.wrap}>
                  {catOptions.map((c) => {
                    const n = srcTables.filter((t) => t.dayType === c.key).length;
                    return <Chip key={c.key} label={`${c.label}${n ? ` (${n})` : ''}`} on={srcCat === c.key} disabled={!n} onPress={() => setSrcCat(c.key)} />;
                  })}
                </View>
              </Field>
              <Field label="출처 그룹">
                <View style={u.wrap}>
                  {srcGroups.map((g) => (
                    <Chip key={g} label={g} on={g === srcGroup} onPress={() => setSrcGroup(g)} />
                  ))}
                </View>
              </Field>
              {oneList.length > 1 && (
                <Field label="출처 표">
                  <View style={u.wrap}>
                    {oneList.map((t) => (
                      <Chip key={t.id} label={t.dates?.length ? datesText(t.dates) : '기본'} on={t.id === srcTableId} onPress={() => setSrcTableId(t.id)} />
                    ))}
                  </View>
                </Field>
              )}
              {!oneList.length && <Text style={u.hint}>이 Day·그룹에 출처 표가 없습니다.</Text>}
            </View>
          )}

          {scope === 'group' && (
            <View style={u.card}>
              <Field label={`출처 그룹 → ${current.group ?? ''}`}>
                <View style={u.wrap}>
                  {srcGroups
                    .filter((g) => !(source === 'this' && isSameGroup(g, current.group)))
                    .map((g) => (
                      <Chip key={g} label={g} on={g === srcGroup} onPress={() => setSrcGroup(g)} />
                    ))}
                </View>
              </Field>
            </View>
          )}

          {scope === 'camp' && (
            <View style={u.card}>
              <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>받는 그룹마다 어느 그룹 표를 가져올지 고르세요. 반은 순서대로 맞춰집니다.</Text>
              {groups.map((g) => (
                <View key={g} style={[u.row, { marginBottom: 6 }]}>
                  <Text style={s.mapTo} numberOfLines={1}>
                    {g}
                  </Text>
                  <Text style={{ color: C.faint }}>←</Text>
                  <InlineSelect
                    value={mapping[g] ?? ''}
                    options={[
                      { key: '', label: '안 가져옴' },
                      ...srcGroups.filter((x) => !(source === 'this' && isSameGroup(x, g))).map((x) => ({ key: x, label: x })),
                    ]}
                    onChange={(v) => setMapping((m) => ({ ...m, [g]: v }))}
                    style={{ flex: 1 }}
                  />
                </View>
              ))}
            </View>
          )}

          <SectionHead title="3. 옵션" />
          {scope !== 'one' && (
            <CheckRow
              on={withCustom}
              label="커스텀 표도 가져오기"
              sub={source === 'other' ? `날짜는 두 캠프 시작일 차이(${dayShift >= 0 ? '+' : ''}${dayShift}일)만큼 옮기고, 기간 밖 날짜는 뺍니다.` : '같은 날짜의 커스텀 표로 복사합니다.'}
              onPress={() => setWithCustom((v) => !v)}
            />
          )}
          {source === 'other' && (
            <>
              <CheckRow on={withGuides} label="칸 설명 (이 캠프에 없는 칸만)" sub={other ? `새로 들어올 칸 ${guideN}개` : undefined} onPress={() => setWithGuides((v) => !v)} />
              <CheckRow
                on={withPlan}
                label="일정표"
                sub={other?.dayPlan?.sets?.length ? `날짜를 ${dayShift >= 0 ? '+' : ''}${dayShift}일 옮깁니다. 지금 일정표를 덮어씁니다.` : '출처 캠프에 일정표가 없습니다.'}
                onPress={() => other?.dayPlan?.sets?.length && setWithPlan((v) => !v)}
              />
            </>
          )}
          <Field label="이미 있는 표" style={{ marginTop: 6 }}>
            <Seg
              items={[
                { key: 'replace', label: '바꾸기' },
                { key: 'skip', label: '건너뛰기' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>

          <SectionHead title="4. 미리보기" />
          {!items.length && <Text style={u.hint}>가져올 표가 없습니다.</Text>}
          {(
            [
              ['create', '만들 표', C.blueText],
              ['replace', '바꿀 표', C.amberText],
              ['skip', '건너뜀 (이미 있음)', C.faint],
              ['outside', '빠짐 (캠프 기간 밖)', C.faint],
            ] as const
          ).map(([st, title, color]) => {
            const list = byStatus(st);
            if (!list.length) return null;
            return (
              <View key={st} style={{ marginBottom: 8 }}>
                <Text style={[s.prevTitle, { color }]}>
                  {title} {list.length}
                </Text>
                {list.map((i, n) => (
                  <Text key={n} style={s.prevItem}>
                    · {i.label}
                  </Text>
                ))}
              </View>
            );
          })}
          {groups.filter((g) => items.some((i) => i.out && isSameGroup(i.out.groupName, g)) && groupNoClasses(g)).map((g) => (
            <Notice key={g} tone="amber" text={`${g} 에 반이 없어 반 칸이 비게 됩니다. [반·이름] 에서 반을 먼저 넣으세요.`} />
          ))}
          <Text style={u.hint}>가져온 표는 작업 공간에만 들어갑니다. 확인한 뒤 [저장] 을 눌러야 반영됩니다. 사람 이름(직접 넣은 이름)은 가져오지 않습니다.</Text>
        </>
      )}
    </FullModal>
  );
}

const s = StyleSheet.create({
  jobBox: { borderWidth: 1, borderColor: C.blueLine, backgroundColor: C.blueBg, borderRadius: 9, padding: 10 },
  jobTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  jobList: { borderWidth: 1, borderColor: C.line, borderRadius: 9, overflow: 'hidden' },
  jobItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.bg2 },
  jobCode: { width: 48, fontSize: 13, fontWeight: '700', color: C.text },
  jobName: { flex: 1, fontSize: 12, color: C.muted },
  mapTo: { width: 72, fontSize: 12.5, fontWeight: '600', color: C.text },
  prevTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  prevItem: { fontSize: 12, color: C.text2, lineHeight: 18 },
});
