'use client';
import { compareCampCodes } from '@smis-mentor/shared';

/**
 * 선생님 명단 관리 (관리자)
 * 관리시트 '동기화 리스트'의 값을 그대로 복사해 붙여넣는다. 헤더는 캠프 종류(J·E / S)에 맞춰 고정돼 있고 값만 넣는다.
 * - 칸을 누르고 ⌘/Ctrl+V → 그 칸부터 오른쪽·아래로 채운다 (줄이 모자라면 늘어난다). 칸은 직접 고쳐도 된다
 * - 역할·그룹이 빈 칸이면 위 줄 값을 이어받는다 (엑셀 병합 셀) — 회색으로 보인다
 * - 줄마다 이름으로 사용자를 찾아 연결한다. 동명이인은 골라 주고, 사이트에 없는 사람은 저장할 때 건너뛴다
 * - 저장하면 캠프 배정(그룹·역할·반번호), 반 정보(강의실·반이름·교재 → 시간표), 숙소 방이 반영되고,
 *   표에서 빠진 사람은 확인 후 캠프 배정이 해제된다
 * - 영어 이름 · 성별, 해외(S·F) 캠프의 주민번호 · 여권 · 단체티 · 휴대폰은 표에서 넣지 않는다 —
 *   멘토가 앱에서 넣은 값이 저절로 보이고, 비어 있으면 아직 안 넣은 것 (재촉용)
 * - 불러올 때 이름 매칭도 같이 받아 온다 (연결된 계정이 바로 보이게) — 이름이 바뀔 때만 다시 묻는다
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import CampRosterTable from '@/components/admin/CampRosterTable';
import PushReachPanel from '@/components/admin/PushReachPanel';
import { authenticatedGet, authenticatedPost, authenticatedPut } from '@/lib/apiClient';
import { getAllJobCodes } from '@/lib/firebaseService';
import {
  rosterAccountCells,
  rosterAccountKeys,
  rosterColumnsOf,
  rosterTierOf,
  rosterFillInherited,
  rosterMatchName,
  type CampRosterColumn,
  type CampRosterKind,
  type CampRosterRow,
  type CampRosterTier,
} from '@smis-mentor/shared';

/** loadedUserId: 불러올 때 연결돼 있던 계정 — 민감 칸 값은 그 계정 것이라, 연결이 바뀌면 저장 뒤에 다시 보인다 */
type Row = CampRosterRow & { pickedFor?: string; lookup?: string; loadedUserId?: string | null };
type Cand = { userId: string; name: string; role: string; status: string; englishNickname: string; gender?: string; university: string; inCamp: boolean };
type Match = { index: number; name: string; userId: string | null; status: 'linked' | 'auto' | 'ambiguous' | 'none'; candidates: Cand[] };
type JobCode = { id: string; code: string; name: string; generation: string; startDate?: any };

const ROLE_LABEL: Record<string, string> = { mentor: '멘토', mentor_temp: '멘토(임시)', admin: '관리자', foreign: '원어민', foreign_temp: '원어민(임시)' };
const blankRows = (n: number): Row[] => Array.from({ length: n }, () => ({ cells: {}, userId: null }));
/** 매칭에 영향을 주는 것만 (이름 · 연결 · 다른 이름으로 찾기, 줄 순서) */
const matchKeyOf = (m: Row[], f: Row[]) =>
  `${m.map((r) => `${r.cells.name ?? ''}|${r.userId ?? ''}|${r.lookup ?? ''}`).join(',')}§${f.map((r) => `${r.cells.englishName ?? ''}|${r.userId ?? ''}|${r.lookup ?? ''}`).join(',')}`;

/** 엑셀에서 복사한 텍스트(TSV) → 2차원 배열. 줄바꿈이 든 칸("...")도 처리 */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const t = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

export default function CampRosterPage() {
  const [codes, setCodes] = useState<JobCode[]>([]);
  const [gen, setGen] = useState('');
  const [jobCodeId, setJobCodeId] = useState('');
  const [mentors, setMentors] = useState<Row[]>(blankRows(20));
  const [foreign, setForeign] = useState<Row[]>(blankRows(12));
  const [matches, setMatches] = useState<{ mentor: Match[]; foreign: Match[]; removals: Cand[] }>({ mentor: [], foreign: [], removals: [] });
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<{ remove: Set<string> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ assigned: number; removed: string[]; unmatched: string[]; warnings: string[] } | null>(null);
  const [meta, setMeta] = useState<{ updatedAt?: string; updatedByName?: string }>({});
  const [tab, setTab] = useState<'assign' | 'profile' | 'push'>('assign');
  const [profileRole, setProfileRole] = useState<'mentor' | 'foreign'>('mentor');

  useEffect(() => {
    getAllJobCodes().then((list: any[]) => {
      const cs = (list as JobCode[]).filter((c) => c.code).sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }) || compareCampCodes(a.code, b.code));
      setCodes(cs);
      if (cs[0]) setGen(String(cs[0].generation));
    }).catch(() => toast.error('캠프 코드를 불러오지 못했습니다.'));
  }, []);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))], [codes]);
  const jc = codes.find((c) => c.id === jobCodeId);
  const tier: CampRosterTier = rosterTierOf(jc?.code ?? '');
  const colsM = rosterColumnsOf('mentor', tier);
  const colsF = rosterColumnsOf('foreign', tier);

  /** 마지막으로 매칭한 표 (이름 · 연결 · 순서) — 같으면 다시 묻지 않는다 */
  const matchedKey = useRef('');
  const load = useCallback(async (id: string) => {
    if (dirty && !window.confirm('저장하지 않은 내용이 있습니다. 다른 캠프를 불러올까요?')) return;
    setJobCodeId(id); setResult(null); setMatches({ mentor: [], foreign: [], removals: [] });
    if (!id) return;
    setLoading(true);
    try {
      const res = await authenticatedGet<{ doc: any; revealed: boolean; matches?: { mentors: Match[]; foreign: Match[]; removals: Cand[] } }>(`/api/admin/camp-roster?jobCodeId=${encodeURIComponent(id)}`);
      // loadedUserId: 민감 칸(주민번호 · 여권 …)은 불러온 그 계정일 때만 보인다
      const pad = (rows: Row[], n: number) => [...rows.map((r) => ({ ...r, pickedFor: r.userId ? rosterMatchName('mentor', r) : undefined, loadedUserId: r.userId ?? null })), ...blankRows(Math.max(3, n - rows.length))];
      const m: Row[] = res.doc?.mentors ?? [];
      const f: Row[] = (res.doc?.foreign ?? []).map((r: Row) => ({ ...r, pickedFor: r.userId ? rosterMatchName('foreign', r) : undefined }));
      const mm = pad(m, 20);
      const ff = [...f, ...blankRows(Math.max(3, 12 - f.length))];
      setMentors(mm);
      setForeign(ff);
      if (res.matches) {
        setMatches({ mentor: res.matches.mentors, foreign: res.matches.foreign, removals: res.matches.removals });
        matchedKey.current = matchKeyOf(mm, ff);   // 방금 받은 매칭 — 같은 표로 다시 묻지 않는다
      }
      setMeta({ updatedAt: res.doc?.updatedAt, updatedByName: res.doc?.updatedByName });
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [dirty]);

  // 이름 매칭 — 입력이 멈추면 서버에 물어본다
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runMatch = useCallback(async (m: Row[], f: Row[]): Promise<{ removals: Cand[] } | null> => {
    if (!jobCodeId) return null;
    try {
      const res = await authenticatedPost<{ mentors: Match[]; foreign: Match[]; removals: Cand[] }>('/api/admin/camp-roster', { jobCodeId, mentors: m, foreign: f });   // lookup(다른 이름으로 찾기)도 함께
      matchedKey.current = matchKeyOf(m, f);
      setMatches({ mentor: res.mentors, foreign: res.foreign, removals: res.removals });
      const apply = (rows: Row[], ms: Match[], kind: CampRosterKind) => {
        let changed = false;
        const next = rows.map((r, i) => {
          const mt = ms[i];
          if (!r.userId && mt?.userId && mt.status === 'auto') { changed = true; return { ...r, userId: mt.userId, pickedFor: rosterMatchName(kind, r) }; }
          return r;
        });
        return changed ? next : rows;
      };
      setMentors((cur) => apply(cur, res.mentors, 'mentor'));
      setForeign((cur) => apply(cur, res.foreign, 'foreign'));
      return res;
    } catch (e) {
      toast.error((e as Error).message || '이름 매칭에 실패했습니다.');
      return null;
    }
  }, [jobCodeId]);
  const matchKey = matchKeyOf(mentors, foreign);
  useEffect(() => {
    if (!jobCodeId) return;
    if (timer.current) clearTimeout(timer.current);
    if (matchKey === matchedKey.current) return;
    timer.current = setTimeout(() => { void runMatch(mentors, foreign); }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // 이름·연결이 바뀔 때만 다시 매칭
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCodeId, matchKey]);

  /** 칸 값 바꾸기 — 이름이 바뀌면 연결을 풀고 다시 찾는다 */
  const setRows = (kind: CampRosterKind) => (kind === 'mentor' ? setMentors : setForeign);
  const edit = (kind: CampRosterKind, updates0: Array<{ r: number; key: string; v: string }>) => {
    // 계정 칸(멘토 영어 이름 · 성별)은 표에서 넣지 않는다 — 붙여넣기도 건너뛴다
    const acct = new Set(rosterAccountKeys(kind, tier));
    const updates = updates0.filter((u) => !acct.has(u.key));
    if (!updates.length) return;
    setDirty(true);
    setRows(kind)((cur) => {
      const next = [...cur];
      const maxR = Math.max(...updates.map((u) => u.r));
      while (next.length <= maxR + 2) next.push({ cells: {}, userId: null });
      updates.forEach(({ r, key, v }) => { next[r] = { ...next[r], cells: { ...next[r].cells, [key]: v } }; });
      return next.map((row) => (row.userId && row.pickedFor !== undefined && rosterMatchName(kind, row) !== row.pickedFor ? { ...row, userId: null, pickedFor: undefined } : row));
    });
  };
  const pick = (kind: CampRosterKind, r: number, userId: string | null) => {
    setDirty(true);
    setRows(kind)((cur) => cur.map((row, i) => (i === r ? { ...row, userId, pickedFor: userId ? rosterMatchName(kind, row) : undefined } : row)));
  };
  const setLookup = (kind: CampRosterKind, r: number, lookup: string) => setRows(kind)((cur) => cur.map((row, i) => (i === r ? { ...row, lookup } : row)));
  const removeRow = (kind: CampRosterKind, r: number) => { setDirty(true); setRows(kind)((cur) => cur.filter((_, i) => i !== r)); };
  const addRows = (kind: CampRosterKind, n = 5) => setRows(kind)((cur) => [...cur, ...blankRows(n)]);

  const openConfirm = async () => {
    if (!jobCodeId) return;
    const res = await runMatch(mentors, foreign);
    if (!res) return;
    setConfirm({ remove: new Set(res.removals.map((c) => c.userId)) });
  };

  const save = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      const strip = (rows: Row[]) => rows.map(({ cells, userId }) => ({ cells, userId: userId ?? null }));   // lookup 은 저장하지 않는다
      const res = await authenticatedPut<{ assigned: number; removed: string[]; unmatched: string[]; warnings: string[] }>('/api/admin/camp-roster', {
        jobCodeId, mentors: strip(mentors), foreign: strip(foreign), removeUserIds: [...confirm.remove],
      });
      setResult(res); setConfirm(null); setDirty(false);
      toast.success(`${res.assigned}명 배정${res.removed.length ? ` · ${res.removed.length}명 해제` : ''}`);
      await load(jobCodeId);
    } catch (e) {
      toast.error((e as Error).message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const linked = [...mentors, ...foreign].filter((r) => r.userId).length;
  const unmatchedNames = [
    ...mentors.map((r) => (!r.userId ? rosterMatchName('mentor', r) : '')),
    ...foreign.map((r) => (!r.userId ? rosterMatchName('foreign', r) : '')),
  ].filter(Boolean);

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">선생님 명단 관리</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          관리시트 동기화 리스트의 값만 복사해서 칸에 붙여넣으세요 (⌘/Ctrl+V — 그 칸부터 채워집니다). 역할·그룹이 빈 칸이면 위 줄 값을 이어받습니다.
          저장하면 캠프 배정·반 정보(시간표)·숙소 방이 앱 전체에 반영됩니다. 영어 이름·성별{tier === 'S' ? '·주민번호·여권·단체티·휴대폰' : ''}은 멘토가 앱에서 넣은 값이 저절로 보이고, 비어 있으면 아직 안 넣은 것입니다.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={gen} onChange={(e) => setGen(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            {gens.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {codes.filter((c) => String(c.generation) === gen).map((c) => (
              <button key={c.id} onClick={() => void load(c.id)}
                className={`px-3 py-2 rounded-lg text-sm border ${c.id === jobCodeId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
                {c.code} <span className="opacity-70">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {!jobCodeId ? (
          <div className="border rounded-xl bg-white p-10 text-center text-gray-500">캠프를 고르세요.</div>
        ) : (
          <>
          <div className="flex gap-1 border-b mb-5">
            {([['assign', '배정 표'], ['profile', '참가 정보 (급여·여권)'], ['push', '알림 수신 현황']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
            ))}
            <div className="flex-1" />
            <a href="/admin/user-check" className="self-center text-sm text-gray-500 hover:text-gray-800">멘토·원어민 선생님 보기 →</a>
          </div>
          {tab === 'profile' ? (
            <div>
              <div className="flex gap-1 mb-3">
                {(['mentor', 'foreign'] as const).map((r) => (
                  <button key={r} onClick={() => setProfileRole(r)} className={`px-3 py-1.5 rounded-lg text-sm border ${profileRole === r ? 'bg-gray-900 text-white' : 'bg-white'}`}>{r === 'mentor' ? '멘토' : '원어민'}</button>
                ))}
              </div>
              <CampRosterTable jobCodeId={jobCodeId} campCode={jc?.code} role={profileRole} />
            </div>
          ) : tab === 'push' ? (
            <PushReachPanel jobCodeId={jobCodeId} campCode={jc?.code} />
          ) : loading ? (
          <div className="border rounded-xl bg-white p-10 text-center text-gray-500">불러오는 중…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              <span className="px-2 py-1 rounded bg-gray-100">{jc?.code} · {tier === 'S' ? '해외(S·F) 캠프 표' : 'J·E 캠프 표'}</span>
              <span>연결 <b className="text-green-700">{linked}</b>명</span>
              {unmatchedNames.length > 0 && <span className="text-amber-700">연결 안 됨 {unmatchedNames.length}명 (저장 시 건너뜀)</span>}
              {meta.updatedAt && <span className="text-gray-400">마지막 저장 {new Date(meta.updatedAt).toLocaleString('ko-KR')} {meta.updatedByName}</span>}
              <div className="flex-1" />
              {dirty && <span className="text-amber-600">저장 안 됨</span>}
              <button onClick={() => void openConfirm()} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">저장</button>
            </div>

            <Grid title="멘토" kind="mentor" cols={colsM} rows={mentors} matches={matches.mentor} onEdit={edit} onPick={pick} onLookup={setLookup} onRemove={removeRow} onAdd={addRows} />
            <div className="h-8" />
            <Grid title="원어민" kind="foreign" cols={colsF} rows={foreign} matches={matches.foreign} onEdit={edit} onPick={pick} onLookup={setLookup} onRemove={removeRow} onAdd={addRows} />

            {result && (
              <div className="mt-6 border rounded-xl bg-white p-4 text-sm space-y-1">
                <p><b>{result.assigned}</b>명 배정 완료{result.removed.length > 0 && <> · 배정 해제: {result.removed.join(', ')}</>}</p>
                {result.unmatched.length > 0 && <p className="text-amber-700">연결 안 돼 건너뛴 줄: {result.unmatched.join(', ')}</p>}
                {result.warnings.map((w, i) => <p key={i} className="text-red-600">⚠ {w}</p>)}
              </div>
            )}
          </>
          )}
          </>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setConfirm(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">{jc?.code} 선생님 표 저장</h2>
            <p className="text-sm mb-2">연결된 <b>{linked}</b>명을 이 캠프에 배정하고 표의 정보를 반영합니다.</p>
            {unmatchedNames.length > 0 && <p className="text-sm text-amber-700 mb-2">연결 안 된 줄은 건너뜁니다: {unmatchedNames.join(', ')}</p>}
            {matches.removals.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-semibold mb-1">표에 없어서 캠프 배정을 해제할 사람</p>
                <ul className="space-y-1">
                  {matches.removals.map((c) => (
                    <li key={c.userId}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={confirm.remove.has(c.userId)} onChange={(e) => setConfirm((cf) => {
                          if (!cf) return cf;
                          const s = new Set(cf.remove);
                          if (e.target.checked) s.add(c.userId); else s.delete(c.userId);
                          return { remove: s };
                        })} />
                        {c.name} <span className="text-gray-400">{ROLE_LABEL[c.role] ?? c.role}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-1">체크를 풀면 배정을 그대로 둡니다.</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirm(null)} disabled={saving} className="px-4 py-2 rounded-lg border text-sm">취소</button>
              <button onClick={() => void save()} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Grid(props: {
  title: string; kind: CampRosterKind; cols: CampRosterColumn[]; rows: Row[]; matches: Match[];
  onEdit: (kind: CampRosterKind, u: Array<{ r: number; key: string; v: string }>) => void;
  onPick: (kind: CampRosterKind, r: number, userId: string | null) => void;
  onLookup: (kind: CampRosterKind, r: number, lookup: string) => void;
  onRemove: (kind: CampRosterKind, r: number) => void;
  onAdd: (kind: CampRosterKind, n?: number) => void;
}) {
  const { title, kind, cols, rows, matches, onEdit, onPick, onLookup, onRemove, onAdd } = props;
  const ref = useRef<HTMLTableElement>(null);
  const filled = useMemo(() => rosterFillInherited(rows, cols), [rows, cols]);

  const focus = (r: number, c: number) => {
    const el = ref.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    el?.focus(); el?.select();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;   // 한 칸 값은 그냥 입력
    e.preventDefault();
    const grid = parseTsv(text.replace(/\n$/, ''));
    const ups: Array<{ r: number; key: string; v: string }> = [];
    grid.forEach((line, i) => line.forEach((v, j) => { const col = cols[c + j]; if (col) ups.push({ r: r + i, key: col.key, v }); }));
    onEdit(kind, ups);
    toast.success(`${grid.length}줄 붙여넣음`);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown')) { e.preventDefault(); focus(r + 1, c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus(r - 1, c); }
    else if (e.key === 'ArrowRight' && (e.currentTarget.selectionStart ?? 0) >= e.currentTarget.value.length) { e.preventDefault(); focus(r, c + 1); }
    else if (e.key === 'ArrowLeft' && (e.currentTarget.selectionEnd ?? 0) === 0) { e.preventDefault(); focus(r, c - 1); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-400">{kind === 'foreign' ? '영어 이름으로 원어민 계정을 찾습니다' : '반멘토 이름으로 계정을 찾습니다'}</span>
      </div>
      <div className="overflow-x-auto border rounded-xl bg-white">
        <table ref={ref} className="text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-700 sticky top-0">
            <tr>
              <th className="px-1 py-2 w-8 border-r" />
              <th className="px-2 py-2 border-r text-left whitespace-nowrap" style={{ minWidth: 170 }}>연결된 계정</th>
              {cols.map((c) => (
                <th key={c.key} className={`px-2 py-2 border-r text-left whitespace-nowrap ${c.sensitive ? 'text-rose-700' : ''}`} style={{ minWidth: c.width }}
                  title={c.fromAccount ? '계정에서 저절로 — 멘토가 직접 넣은 값만 보입니다 (표에서 넣지 않음)' : undefined}>
                  {c.label}
                  {c.fromAccount && <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-normal text-green-700">자동</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const mt = matches[r];
              const name = rosterMatchName(kind, row);
              const cands = mt?.candidates ?? [];
              return (
                <tr key={r} className="border-t">
                  <td className="text-center text-gray-300 border-r">
                    <button title="줄 삭제" onClick={() => onRemove(kind, r)} className="hover:text-red-500 px-1">×</button>
                  </td>
                  <td className="px-1 border-r">
                    {!name ? null : cands.length === 0 && !row.userId ? (
                      <input value={row.lookup ?? ''} onChange={(e) => onLookup(kind, r, e.target.value)}
                        placeholder="사이트에 없음 — 다른 이름으로 찾기" title="계정 이름이 다르면(예: 영문 전체 이름) 여기에 입력하세요"
                        className="w-full text-xs rounded px-1 py-1 bg-amber-50 text-amber-800 placeholder:text-amber-700 outline-none" />
                    ) : (
                      <select value={row.userId ?? ''} onChange={(e) => onPick(kind, r, e.target.value || null)}
                        className={`w-full text-xs rounded px-1 py-1 ${row.userId ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
                        <option value="">{cands.length > 1 ? `동명이인 ${cands.length}명 — 선택` : '연결 안 함'}</option>
                        {cands.map((c) => (
                          <option key={c.userId} value={c.userId}>
                            {c.name}{c.englishNickname ? ` (${c.englishNickname})` : ''} · {ROLE_LABEL[c.role] ?? c.role}{c.university ? ` · ${c.university}` : ''}{c.inCamp ? ' · 배정됨' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  {cols.map((c, ci) => {
                    if (c.fromAccount) {
                      // 계정 칸 — 연결된 계정 값만 (매칭 결과가 오기 전에는 불러온 값)
                      const acc = row.userId ? cands.find((x) => x.userId === row.userId) : undefined;
                      // 민감 칸은 불러온 계정일 때만 (새로 연결하면 저장한 뒤 보인다)
                      const pending = !!row.userId && !!c.sensitive && row.userId !== row.loadedUserId;
                      const val = !row.userId || pending ? '' : c.sensitive || !acc ? row.cells[c.key] ?? '' : rosterAccountCells(acc)[c.key] ?? '';
                      return (
                        <td key={c.key} className="border-r p-0 bg-gray-50">
                          <input
                            data-r={r} data-c={ci} value={val} readOnly placeholder={pending ? '저장 후 표시' : row.userId ? '미입력' : ''}
                            title={pending ? '새로 연결한 계정 — 저장하면 멘토가 넣은 값이 보입니다' : row.userId ? (val ? '멘토가 직접 넣은 값' : '멘토가 아직 넣지 않았습니다') : '계정을 연결하면 저절로 채워집니다'}
                            onPaste={(e) => onPaste(e, r, ci)} onKeyDown={(e) => onKey(e, r, ci)}
                            className={`w-full cursor-default px-2 py-1.5 outline-none bg-transparent text-gray-600 ${pending ? 'placeholder:text-gray-300' : 'placeholder:text-rose-300'}`}
                            style={{ minWidth: c.width }}
                          />
                        </td>
                      );
                    }
                    const raw = row.cells[c.key] ?? '';
                    const inherited = c.inherit && !raw ? filled[r]?.cells[c.key] ?? '' : '';
                    return (
                      <td key={c.key} className="border-r p-0">
                        <input
                          data-r={r} data-c={ci} value={raw} placeholder={inherited}
                          onChange={(e) => onEdit(kind, [{ r, key: c.key, v: e.target.value }])}
                          onPaste={(e) => onPaste(e, r, ci)} onKeyDown={(e) => onKey(e, r, ci)}
                          className="w-full px-2 py-1.5 outline-none focus:bg-blue-50 placeholder:text-gray-300 bg-transparent"
                          style={{ minWidth: c.width }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => onAdd(kind)} className="mt-2 text-sm text-blue-600 hover:underline">+ 5줄 추가</button>
    </div>
  );
}
