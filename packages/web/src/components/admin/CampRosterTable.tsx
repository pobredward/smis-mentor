'use client';

/**
 * 캠프 인원 전체 정보 표 (관리자 · /admin/user-check 맨 아래)
 * - 기본 정보, 급여 계좌, 원어민 해외 송금 정보, 여권·S캠프 정보를 한 표로
 * - 모드 3가지: 조회(보기만) · 복사(셀 선택하면 자동 복사) · 수정(셀 더블클릭·입력). 모두 원본(주민번호·계좌번호·IBAN)을 보여 주고 불러올 때마다 감사 로그
 * - 수정 모드에서 엑셀 범위를 붙여넣으면(⌘/Ctrl+V) 선택한 칸부터 채워 한 번에 저장
 * - 표는 엑셀처럼 셀 선택: 클릭하면 그 값, 드래그·Shift+클릭하면 범위, 머리글 클릭하면 열 전체가 자동 복사된다
 *   (앞자리 0·긴 숫자가 엑셀에서 깨지지 않도록 텍스트 형식으로 붙여넣어진다)
 * - 셀 더블클릭(또는 셀 선택 후 Enter·바로 타이핑) → 수정, Enter 저장 · Esc 취소 · Tab 저장 후 오른쪽 칸 (서버가 알맞은 곳에 저장·암호화, 감사 로그)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedGet, authenticatedFetch } from '@/lib/apiClient';
import { CAMP_PROFILE_FIELD_LABELS, type CampProfileField } from '@smis-mentor/shared';

type Row = Record<string, string> & { userId: string; missing: CampProfileField[] };
type Sel = { r0: number; c0: number; r1: number; c1: number };

/** 표에서 고칠 수 있는 열 (서버 EDITABLE_ROSTER_FIELDS 와 같게) */
const EDITABLE = new Set([
  'name', 'phoneNumber', 'email', 'gender', 'university', 'major', 'address', 'classCode', 'group', 'groupRole',
  'englishNickname', 'rrnFront', 'rrnLast', 'bankName', 'accountHolder', 'accountNumber',
  'bankCountry', 'swift', 'routing', 'iban', 'accountType', 'recipientAddress', 'recipientPhone', 'bankAddress', 'bankNotes',
  'passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneModel', 'nationality', 'visaType',
]);
/** 입력 도움말 (datalist) */
const SUGGEST: Record<string, string[]> = {
  gender: ['남', '여'],
  shirtSize: ['S', 'M', 'L', 'XL', '2XL'],
  group: ['manager', 'junior', 'middle', 'senior', 'common', 'spring', 'summer', 'autumn', 'winter'],
  visaType: ['E-1', 'E-2', 'F-2', 'F-3', 'F-4', 'F-5', 'F-6', 'H-1', 'D-2', 'D-10', 'E-7', 'Korean citizen'],
  accountType: ['Checking', 'Savings'],
  nationality: ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'South Africa', 'Philippines', 'India'],
  bankCountry: ['South Korea (Korean bank account)', 'United States', 'Canada', 'Australia', 'New Zealand', 'United Kingdom', 'Ireland', 'South Africa', 'Philippines', 'India'],
};

/** 엑셀에서 복사한 텍스트(TSV) → 2차원 배열. 줄바꿈이 든 칸("...")도 처리 */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 선택한 셀을 엑셀에 바로 붙여넣을 수 있게 복사 (text/plain TSV + text/html 텍스트 서식) */
async function copyMatrix(m: string[][]) {
  const tsv = m.map((row) => row.map((v) => v.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  const html = `<table>${m.map((row) => `<tr>${row.map((v) => `<td style="mso-number-format:'\\@'">${escHtml(v)}</td>`).join('')}</tr>`).join('')}</table>`;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
  } catch { /* 아래로 */ }
  try { await navigator.clipboard.writeText(tsv); return true; } catch { return false; }
}

// 열 정의 — aud: m 멘토만, f 원어민만, (없음) 둘 다
type ColDef = readonly [key: string, label: string, aud?: 'm' | 'f'];
const GROUPS: Record<'basic' | 'pay' | 'intl' | 'passport', { label: string; labelF?: string; cols: readonly ColDef[] }> = {
  basic: { label: '기본 정보', cols: [
    ['group', '그룹'], ['groupRole', '역할'], ['classCode', '반'], ['gender', '성별'], ['age', '나이'], ['phoneNumber', '연락처'], ['email', '이메일'],
    ['university', '학교', 'm'], ['grade', '학년', 'm'], ['major', '전공', 'm'], ['address', '주소'], ['englishNickname', '영어 닉네임', 'm'], ['nationality', '국적', 'f'], ['visaType', '비자 종류', 'f'],
  ] },
  pay: { label: '급여·주민번호', labelF: '급여 계좌', cols: [
    ['rrnFront', '주민번호 앞', 'm'], ['rrnLast', '주민번호 뒤', 'm'], ['bankCountry', '계좌 국가', 'f'], ['bankName', '은행'], ['accountNumber', '계좌번호'], ['accountHolder', '예금주'],
  ] },
  intl: { label: '해외 송금', cols: [
    ['swift', 'SWIFT', 'f'], ['routing', 'ABA/BSB/Transit/Sort', 'f'], ['iban', 'IBAN', 'f'], ['accountType', '계좌 종류', 'f'],
    ['recipientAddress', '받는 분 주소', 'f'], ['recipientPhone', '받는 분 전화', 'f'], ['bankAddress', '은행 주소', 'f'], ['bankNotes', '송금 추가 안내', 'f'],
  ] },
  passport: { label: '여권·S캠프', cols: [['passportName', '여권 영문이름'], ['passportNumber', '여권 번호'], ['passportExpiry', '여권 만료'], ['shirtSize', '단체티'], ['phoneModel', '휴대폰 모델']] },
};
type GroupKey = keyof typeof GROUPS;
/** 정렬 — /admin/user-check 카드와 같은 순서: 그룹 → (매니저·원어민은 역할) → 반 코드 → 이름 */
const GROUP_ORDER = ['manager', 'common', 'junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter', 'short1', 'short2', 'short3', 'short4'];
const MANAGER_ROLE_ORDER: Record<string, number> = { '매니저': 1, '부매니저': 2, 'Manager': 3, 'Sub Manager': 4 };
const FOREIGN_ROLE_ORDER: Record<string, number> = { Speaking: 1, Reading: 2, Writing: 3, Mix: 4 };
function compareRoster(a: Record<string, string>, b: Record<string, string>): number {
  const gi = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 999 : i; };
  if (gi(a.group) !== gi(b.group)) return gi(a.group) - gi(b.group);
  if (a.group === 'manager') {
    const d = (MANAGER_ROLE_ORDER[a.groupRole] ?? 999) - (MANAGER_ROLE_ORDER[b.groupRole] ?? 999);
    if (d) return d;
    return (a.name || '').localeCompare(b.name || '');
  }
  if (a.role === '원어민' && b.role === '원어민') {
    const d = (FOREIGN_ROLE_ORDER[a.groupRole] ?? 999) - (FOREIGN_ROLE_ORDER[b.groupRole] ?? 999);
    if (d) return d;
  }
  const ca = a.classCode, cb = b.classCode;
  if (ca && cb && ca !== cb) return ca < cb ? -1 : 1;
  if (ca && !cb) return -1;
  if (!ca && cb) return 1;
  return (a.name || '').localeCompare(b.name || '');
}

export default function CampRosterTable({ jobCodeId, campCode, role }: { jobCodeId?: string; campCode?: string; role?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<'view' | 'copy' | 'edit'>('view');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({ basic: true, pay: true, intl: role === 'foreign', passport: (campCode ?? '').startsWith('S') });

  const load = async (reveal: boolean) => {
    if (!jobCodeId) return;
    setLoading(true);
    try {
      const res = await authenticatedGet<{ rows: Row[] }>(`/api/admin/camp-profiles?jobCodeId=${encodeURIComponent(jobCodeId)}${reveal ? '&reveal=1' : ''}`);
      setRows(res.rows);
      setRevealed(reveal);
    } catch (e) {
      toast.error((e as Error)?.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRows([]); setRevealed(false);
    void load(true); // 세 모드 모두 원본 표시 (서버가 열람 기록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCodeId]);

  // 원어민을 보면 해외 송금, S 캠프면 여권 묶음을 기본으로 펼친다
  useEffect(() => {
    setOpen((o) => ({ ...o, intl: role === 'foreign', passport: (campCode ?? '').toUpperCase().startsWith('S') }));
  }, [role, campCode]);

  const shown = useMemo(() => {
    const want = role === 'mentor' ? '멘토' : role === 'foreign' ? '원어민' : null;
    return rows
      .filter((r) => !want || r.role === want)
      .sort(compareRoster);
  }, [rows, role]);

  // 보는 대상(멘토/원어민)과 캠프(S / J·E)에 맞는 열만 — 멘토는 해외 송금 없음, 원어민은 주민번호·학교 없음, J·E 는 여권 없음
  const aud: 'm' | 'f' | null = role === 'mentor' ? 'm' : role === 'foreign' ? 'f' : null;
  const isS = (campCode ?? '').toUpperCase().startsWith('S');
  const colsOf = useCallback((g: GroupKey): Array<[string, string]> =>
    GROUPS[g].cols.filter(([k, , a]) => (!a || !aud || a === aud) && !(k === 'visaType' && isS)).map(([k, h]) => [k, h]), [aud, isS]);
  const available = useMemo(() => (Object.keys(GROUPS) as GroupKey[]).filter((g) =>
    !(g === 'passport' && !isS) && colsOf(g).length > 0), [isS, colsOf]);
  const cols = useMemo(() => available.filter((g) => open[g]).flatMap((g) => colsOf(g)), [open, available, colsOf]);
  const allCols: Array<[string, string]> = [['role', '구분'], ['name', '이름'], ...available.flatMap((g) => colsOf(g))];

  // ── 엑셀처럼 셀 선택·복사 ──
  const gridCols: Array<[string, string]> = useMemo(() => [['name', '이름'], ['role', '구분'], ...cols, ['missing', '미입력']], [cols]);
  const cellValue = useCallback((r: Row, k: string) => (k === 'missing' ? (r.missing ?? []).map((m) => CAMP_PROFILE_FIELD_LABELS[m]).join(', ') : String(r[k] ?? '')), []);
  const [sel, setSel] = useState<Sel | null>(null);
  const selRef = useRef<Sel | null>(null);
  const dragging = useRef(false);
  const setSelection = (s: Sel | null) => { selRef.current = s; setSel(s); };
  useEffect(() => { setSelection(null); }, [gridCols, jobCodeId, role, mode]);

  const norm = (s: Sel) => ({ r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) });
  const inSel = (ri: number, ci: number) => { if (!sel) return false; const n = norm(sel); return ri >= n.r0 && ri <= n.r1 && ci >= n.c0 && ci <= n.c1; };

  const copySelection = useCallback(async (s: Sel | null, withHeader = false) => {
    if (!s) return;
    const n = norm(s);
    const m: string[][] = [];
    if (withHeader) m.push(gridCols.slice(n.c0, n.c1 + 1).map(([, h]) => h));
    for (let ri = n.r0; ri <= n.r1; ri++) m.push(gridCols.slice(n.c0, n.c1 + 1).map(([k]) => cellValue(shown[ri], k)));
    const ok = await copyMatrix(m);
    if (!ok) { toast.error('복사하지 못했습니다. 브라우저 권한을 확인해주세요.'); return; }
    const cells = (n.r1 - n.r0 + 1) * (n.c1 - n.c0 + 1);
    toast.success(cells === 1 ? `복사됨: ${m[m.length - 1][0] || '(빈 칸)'}` : `${n.r1 - n.r0 + 1}행 × ${n.c1 - n.c0 + 1}열 복사됨 · 엑셀에 붙여넣으세요`, { id: 'roster-copy', duration: 1500 });
  }, [gridCols, shown, cellValue]);

  // 드래그 끝 → 자동 복사 / Ctrl·Cmd+C 다시 복사 / Esc 해제
  useEffect(() => {
    const up = () => { if (dragging.current) { dragging.current = false; if (modeRef.current === 'copy') void copySelection(selRef.current); } };
    const key = (e: KeyboardEvent) => {
      if (!selRef.current) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (modeRef.current !== 'view' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); void copySelection(selRef.current); }
      if (e.key === 'Escape') setSelection(null);
    };
    document.addEventListener('mouseup', up);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mouseup', up); document.removeEventListener('keydown', key); };
  }, [copySelection]);

  const onCellDown = (e: React.MouseEvent, ri: number, ci: number) => {
    if (e.button !== 0 || modeRef.current === 'view') return; // 조회 모드는 평범한 표
    e.preventDefault(); // 글자 드래그 선택 대신 셀 선택
    if (editingRef.current) void commitEdit(); // 다른 칸을 누르면 고치던 값 저장 (preventDefault 로 blur 가 안 생기므로)
    const cur = selRef.current;
    setSelection(e.shiftKey && cur ? { ...cur, r1: ri, c1: ci } : { r0: ri, c0: ci, r1: ri, c1: ci });
    dragging.current = true;
  };
  const onCellEnter = (ri: number, ci: number) => {
    const cur = selRef.current;
    if (dragging.current && cur && (cur.r1 !== ri || cur.c1 !== ci)) setSelection({ ...cur, r1: ri, c1: ci });
  };
  const selectColumn = (ci: number, e: React.MouseEvent) => {
    if (modeRef.current !== 'copy') return;
    const cur = selRef.current;
    const s = e.shiftKey && cur ? { r0: 0, r1: shown.length - 1, c0: cur.c0, c1: ci } : { r0: 0, r1: shown.length - 1, c0: ci, c1: ci };
    setSelection(s);
    void copySelection(s, true);
  };
  // ── 셀 수정 ──
  const [editing, setEditing] = useState<{ ri: number; ci: number; value: string; saving?: boolean } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => { setEditing(null); }, [gridCols, jobCodeId, role, mode]);
  const startEdit = (ri: number, ci: number, initial?: string) => {
    if (modeRef.current !== 'edit') return;
    const k = gridCols[ci]?.[0];
    if (!k || !EDITABLE.has(k)) { toast('이 칸은 계산값이라 여기서 고칠 수 없습니다.', { id: 'roster-edit' }); return; }
    const cur = cellValue(shown[ri], k);
    setSelection({ r0: ri, c0: ci, r1: ri, c1: ci });
    setEditing({ ri, ci, value: initial ?? (cur.includes('●') ? '' : cur) });
  };
  const commitEdit = async (move?: 'right' | 'down') => {
    const ed = editingRef.current;
    if (!ed || ed.saving) return;
    const row = shown[ed.ri];
    const k = gridCols[ed.ci][0];
    const before = cellValue(row, k);
    const next = () => {
      setEditing(null);
      if (move === 'right' && ed.ci + 1 < gridCols.length) setSelection({ r0: ed.ri, c0: ed.ci + 1, r1: ed.ri, c1: ed.ci + 1 });
      if (move === 'down' && ed.ri + 1 < shown.length) setSelection({ r0: ed.ri + 1, c0: ed.ci, r1: ed.ri + 1, c1: ed.ci });
    };
    if (ed.value.trim() === before.trim() || (before.includes('●') && !ed.value.trim())) { next(); return; }
    setEditing({ ...ed, saving: true });
    try {
      const res = await authenticatedFetch('/api/admin/camp-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ userId: row.userId, jobCodeId, field: k, value: ed.value, reveal: revealed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || '저장하지 못했습니다.');
      setRows((rs) => rs.map((r) => (r.userId === row.userId ? (json.row as Row) : r)));
      toast.success(`${row.name} · ${gridCols[ed.ci][1]} 저장`, { id: 'roster-edit', duration: 1200 });
      next();
    } catch (e) {
      toast.error((e as Error)?.message || '저장하지 못했습니다.', { id: 'roster-edit' });
      setEditing({ ...ed, saving: false });
    }
  };
  // 셀 하나 선택 상태에서 Enter·F2 또는 글자 입력 → 수정 시작 (엑셀처럼)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = selRef.current;
      if (modeRef.current !== 'edit' || !s || editingRef.current || s.r0 !== s.r1 || s.c0 !== s.c1) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(s.r0, s.c0); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); startEdit(s.r0, s.c0, e.key); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  // ── 붙여넣기 (수정 모드) ──
  const [pasting, setPasting] = useState(false);
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (modeRef.current !== 'edit' || !selRef.current || pasting) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const grid = parseTsv(text.replace(/\r?\n$/, ''));
      const single = grid.length === 1 && grid[0].length === 1;
      // 입력칸 안에 값 하나를 붙여넣는 건 평소처럼
      if (editingRef.current && single) return;
      e.preventDefault();
      if (!grid.length) return;
      const n = norm(selRef.current);
      const edits: Array<{ userId: string; field: string; value: string; ri: number; ci: number }> = [];
      let skipped = 0;
      const put = (ri: number, ci: number, value: string) => {
        if (ri >= shown.length || ci >= gridCols.length) return;
        const k = gridCols[ci][0];
        if (!EDITABLE.has(k)) { skipped++; return; }
        const cur = cellValue(shown[ri], k);
        if (value.trim() === cur.trim()) return;
        edits.push({ userId: shown[ri].userId, field: k, value, ri, ci });
      };
      if (single && (n.r1 > n.r0 || n.c1 > n.c0)) {
        // 값 하나 → 선택한 모든 칸에 채우기
        for (let ri = n.r0; ri <= n.r1; ri++) for (let ci = n.c0; ci <= n.c1; ci++) put(ri, ci, grid[0][0]);
      } else {
        grid.forEach((row, i) => row.forEach((v, j) => put(n.r0 + i, n.c0 + j, v)));
      }
      if (!edits.length) { toast(skipped ? '고칠 수 없는 칸이라 붙여넣지 않았습니다.' : '바뀐 값이 없습니다.', { id: 'roster-edit' }); return; }
      if (edits.length > 1 && !window.confirm(`${edits.length}칸을 붙여넣어 저장할까요?${skipped ? `\n(고칠 수 없는 칸 ${skipped}개는 건너뜀)` : ''}`)) return;
      setEditing(null);
      setPasting(true);
      const tid = toast.loading(`${edits.length}칸 저장 중…`);
      try {
        const res = await authenticatedFetch('/api/admin/camp-profiles', {
          method: 'POST',
          body: JSON.stringify({ jobCodeId, reveal: revealed, edits: edits.map(({ userId, field, value }) => ({ userId, field, value })) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || '저장하지 못했습니다.');
        const updated = new Map((json.rows as Row[]).map((r) => [r.userId, r]));
        setRows((rs) => rs.map((r) => updated.get(r.userId) ?? r));
        const failed = (json.failed ?? []) as Array<{ userId: string; field: string; error: string }>;
        if (failed.length) {
          const nameOf = (id: string) => rows.find((r) => r.userId === id)?.name ?? id.slice(0, 6);
          const labelOf = (f: string) => gridCols.find(([k]) => k === f)?.[1] ?? f;
          toast.error(`${json.saved}칸 저장, ${failed.length}칸 실패\n${failed.slice(0, 4).map((f) => `${nameOf(f.userId)} ${labelOf(f.field)}: ${f.error}`).join('\n')}${failed.length > 4 ? '\n…' : ''}`, { id: tid, duration: 8000 });
        } else {
          toast.success(`${json.saved}칸 저장했습니다${skipped ? ` (고칠 수 없는 칸 ${skipped}개 건너뜀)` : ''}`, { id: tid });
        }
        // 붙여넣은 범위를 선택 상태로 표시
        const rs = edits.map((x) => x.ri), cs = edits.map((x) => x.ci);
        setSelection({ r0: Math.min(...rs), r1: Math.max(...rs), c0: Math.min(...cs), c1: Math.max(...cs) });
      } catch (err) {
        toast.error((err as Error)?.message || '저장하지 못했습니다.', { id: tid });
      } finally {
        setPasting(false);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const selectAll = () => { const s = { r0: 0, r1: shown.length - 1, c0: 0, c1: gridCols.length - 1 }; setSelection(s); void copySelection(s, true); };



  if (!jobCodeId) return null;
  const missingCount = shown.filter((r) => r.missing?.length).length;

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-8">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-lg font-bold text-gray-900">{campCode} 인원 전체 정보</h2>
        <span className="text-xs text-gray-500">{shown.length}명{missingCount ? ` · 캠프 참가 정보 미완료 ${missingCount}명` : ''}</span>
        {revealed && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">원본 표시 중 (열람 기록됨)</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
            {([['view', '조회 모드'], ['copy', '복사 모드'], ['edit', '수정 모드']] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold border-l first:border-l-0 border-gray-300 ${mode === m ? (m === 'edit' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {available.map((g) => (
          <label key={g} className={`px-2.5 py-1 text-xs rounded-full border cursor-pointer select-none ${open[g] ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-500'}`}>
            <input type="checkbox" className="hidden" checked={open[g]} onChange={(e) => setOpen({ ...open, [g]: e.target.checked })} />
            {aud === 'f' && GROUPS[g].labelF ? GROUPS[g].labelF : GROUPS[g].label}
          </label>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">표시할 인원이 없습니다.</div>
      ) : (
        <div className={`overflow-auto max-h-[70vh] border rounded-lg ${mode === 'view' ? 'border-gray-200' : 'select-none'} ${mode === 'edit' ? 'border-amber-300' : mode === 'copy' ? 'border-blue-200' : ''}`}>
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {gridCols.map(([k, h], ci) => (
                  <th key={k} onClick={(e) => selectColumn(ci, e)} title={mode === 'copy' ? '클릭하면 열 전체 복사' : undefined}
                    className={`px-2 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap ${mode === 'copy' ? 'cursor-pointer hover:bg-blue-50' : ''} ${ci === 0 ? 'sticky left-0 z-20 bg-gray-50 border-r' : ''}`}>
                    {ci === 0 && mode === 'copy' && <button type="button" onClick={(e) => { e.stopPropagation(); selectAll(); }} className="mr-1.5 text-[10px] text-blue-600 underline" title="표 전체 복사">전체</button>}
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr key={r.userId} className="odd:bg-white even:bg-gray-50">
                  {gridCols.map(([k], ci) => {
                    const v = cellValue(r, k);
                    const on = inSel(ri, ci);
                    const ed = editing && editing.ri === ri && editing.ci === ci ? editing : null;
                    if (ed) {
                      return (
                        <td key={k} className={`p-0 border border-blue-500 bg-white ${ci === 0 ? 'sticky left-0 z-10' : ''}`}>
                          <input autoFocus disabled={ed.saving} value={ed.value} list={SUGGEST[k] ? `roster-suggest-${k}` : undefined}
                            placeholder={v.includes('●') ? '새 값 입력 (기존 값은 가려짐)' : ''}
                            onChange={(e) => setEditing({ ...ed, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); void commitEdit('down'); }
                              else if (e.key === 'Tab') { e.preventDefault(); void commitEdit('right'); }
                              else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                            }}
                            onBlur={() => { if (editingRef.current && !editingRef.current.saving) void commitEdit(); }}
                            className="w-full min-w-[8rem] px-2 py-1.5 text-xs outline-none bg-white disabled:opacity-50 select-text" />
                        </td>
                      );
                    }
                    return (
                      <td key={k}
                        onMouseDown={(e) => onCellDown(e, ri, ci)}
                        onMouseEnter={() => onCellEnter(ri, ci)}
                        onDoubleClick={() => startEdit(ri, ci)}
                        title={mode === 'edit' && EDITABLE.has(k) ? '더블클릭해 수정' : undefined}
                        className={[
                          'px-2 py-1.5 whitespace-nowrap border border-transparent',
                          mode === 'copy' ? 'cursor-cell' : mode === 'edit' ? (EDITABLE.has(k) ? 'cursor-text' : 'cursor-not-allowed') : '',
                          ci === 0 ? 'sticky left-0 font-semibold text-gray-900' : '',
                          ci === 0 && !on ? (ri % 2 ? 'bg-gray-50' : 'bg-white') : '',
                          k === 'role' ? 'text-gray-500' : k === 'missing' ? 'text-amber-700' : v ? 'text-gray-800' : 'text-gray-300',
                          ['rrnLast', 'accountNumber', 'iban', 'swift', 'routing', 'passportNumber'].includes(k) ? 'font-mono' : '',
                          on ? 'bg-blue-100 border-blue-300' : '',
                        ].join(' ')}>
                        {v || (k === 'missing' ? '' : '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {Object.entries(SUGGEST).map(([k, opts]) => (
            <datalist key={k} id={`roster-suggest-${k}`}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-400">
        {mode === 'view' && <>조회 모드 — 표를 보기만 합니다. </>}
        {mode === 'copy' && <>복사 모드 — 셀을 클릭하면 그 값이, 드래그(또는 Shift+클릭)하면 범위가, 머리글을 누르면 열 전체가 자동 복사됩니다. 엑셀에 바로 붙여넣으세요 (⌘/Ctrl+C 다시 복사, Esc 선택 해제). </>}
        {mode === 'edit' && <>수정 모드 — 셀을 더블클릭하거나 선택 후 바로 입력 → Enter 저장 · Tab 오른쪽 칸 · Esc 취소. 엑셀에서 복사한 범위는 시작할 칸을 선택하고 ⌘/Ctrl+V 로 붙여넣으면 한 번에 저장됩니다 (값 하나를 여러 칸 선택 후 붙여넣으면 모두 채움). 나이·학년·구분·미입력은 계산값이라 고칠 수 없음. </>}
        <br />주민번호 뒷자리·계좌번호·IBAN 은 암호화해 보관하며, 이 표를 열 때마다 원본 열람 기록이 남습니다.
      </p>
    </div>
  );
}
