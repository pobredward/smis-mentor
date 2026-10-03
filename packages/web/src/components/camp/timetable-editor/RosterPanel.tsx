'use client';

/**
 * 패널 [반·이름] — 이 그룹 모든 Day 공통 (반 목록·순서·반번호 · 담임/역할 이름 덮어쓰기)
 * + 캠프 전체 반 정보 (반이름 · 강의실 · 교재 · Spare). 관리시트에서 열을 통째로 붙여넣을 수 있다.
 */
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DEFAULT_SUBJECTS,
  commonFor,
  firstName,
  sortedBookCodes,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampClassInfo,
  type EslBookList,
  type TimetableClassColumn,
} from '@smis-mentor/shared';
import { BookCodeInput, BookCodeList, NameTag, SectionTitle, btnCls, staffRolesOf, subjectsOf, type WsUpdate } from './ui';

type InfoField = 'classroom' | 'className' | 'bookCode' | 'spareBookCode';
const INFO_FIELDS: Array<{ field: InfoField; col: number; placeholder: string }> = [
  { field: 'classroom', col: 1, placeholder: '강의실' },
  { field: 'className', col: 2, placeholder: '반이름' },
  { field: 'bookCode', col: 3, placeholder: '교재' },
  { field: 'spareBookCode', col: 4, placeholder: 'Spare' },
];

/** 반번호 입력 — 입력을 마칠 때(blur·Enter) 한 번에 바꾼다 (칸·주제 담당·당번이 따라간다) */
function CodeInput({ value, onCommit, onPaste }: { value: string; onCommit: (v: string) => void; onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      value={text ?? value}
      onFocus={() => setText(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && text.trim() !== value) onCommit(text.trim());
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      onPaste={onPaste}
      className="w-full min-w-0 rounded-md border border-gray-300 px-1.5 py-1 text-xs font-semibold"
    />
  );
}

/** 새 반번호 제안 — 지금 반번호들의 앞글자 + 다음 번호 */
function nextClassCode(codes: string[], campCode: string): string {
  const prefix = codes.map((c) => c.match(/^([A-Za-z]+)\d+$/)?.[1]).find(Boolean) ?? (campCode.slice(0, 1) || 'C');
  let n = codes.reduce((m, c) => Math.max(m, Number(c.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;
  while (codes.includes(`${prefix}${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

export function RosterPanel({
  ws,
  update,
  group,
  campCode,
  assignedCodes,
  teacherByClassCode,
  staffByRole,
  focusCode,
  eslBooks,
}: {
  ws: W.Workspace;
  update: WsUpdate;
  group: string;
  campCode: string;
  /** 앱 배정에 있는 이 그룹 반번호 */
  assignedCodes: string[];
  teacherByClassCode: Record<string, string>;
  staffByRole: Record<string, string>;
  focusCode: string | null;
  eslBooks: EslBookList | undefined;
}) {
  const fallback = useMemo(() => assignedCodes.map((classCode) => ({ classCode })), [assignedCodes]);
  const classes = W.groupClasses(ws, group, fallback);
  const common = commonFor(ws.cur.common, group);
  const bookCodes = useMemo(() => sortedBookCodes(eslBooks), [eslBooks]);
  const listId = `tt-book-codes-${campCode}`;

  useEffect(() => {
    if (!focusCode) return;
    document.getElementById(`tt-roster-${focusCode}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusCode]);

  /** 표에 실제로 쓰이는 역할 — 이 그룹 표들의 원어민 과목 · 담당자 칸 · 전담 열 역할 */
  const roles = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    const ids = W.groupTableIds(ws, group);
    ids.forEach((id) => {
      const t = ws.cur.tables[id];
      out.push(...staffRolesOf(subjectsOf(t)));
      (t.extraColumns ?? []).forEach((e) => {
        if (e.staffRole) out.push({ key: e.staffRole.toLowerCase(), label: `${e.staffRole} (전담 열)` });
        if (e.teacherRole) out.push({ key: e.teacherRole.toLowerCase(), label: `${e.teacherRole} (전담 열)` });
      });
    });
    if (!ids.length) out.push(...staffRolesOf(DEFAULT_SUBJECTS));
    Object.keys(common?.staffOverrides ?? {}).forEach((k) => out.push({ key: k, label: k }));
    return out.filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i);
  }, [ws, group, common?.staffOverrides]);

  const plain = (list: TimetableClassColumn[]) =>
    list.map((c) => ({ classCode: c.classCode, ...(c.teacherName?.trim() ? { teacherName: c.teacherName } : {}) }));

  /** 표도 공통도 없는 그룹(배정만 있음)은 먼저 공통에 반 목록을 올려 둔다 — 그래야 반번호를 바꿀 수 있다 */
  const seeded = (w: W.Workspace): W.Workspace => {
    const hasCommon = !!commonFor(w.cur.common, group)?.classes?.length;
    const hasTables = W.groupTableIds(w, group).some((id) => w.cur.tables[id].classes.length);
    return hasCommon || hasTables ? w : W.setGroupClasses(w, group, plain(W.groupClasses(w, group, fallback)));
  };

  const setClasses = (next: TimetableClassColumn[]) => update((w) => W.setGroupClasses(w, group, plain(next)));

  const renameCode = (old: string, v: string) => {
    if (!v) {
      toast.error('반번호를 비울 수 없습니다.');
      return;
    }
    let ok = false;
    update((w0) => {
      const w = seeded(w0);
      const n = W.renameClassCode(w, group, old, v);
      ok = n !== w;
      return ok ? n : w0;
    });
    if (!ok) toast.error(`${v} 는 이미 이 그룹에 있는 반번호입니다.`);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= classes.length) return;
    const next = [...classes];
    [next[i], next[j]] = [next[j], next[i]];
    setClasses(next);
  };

  const removeClass = (code: string) => {
    const n = W.tablesUsingClass(ws, group, code);
    if (!window.confirm(`${code} 반을 이 그룹에서 지울까요?${n ? `\n\n이 그룹 표 ${n}장에서 이 반 칸 내용이 지워집니다.` : ''}`)) return;
    setClasses(classes.filter((c) => c.classCode !== code));
  };

  const setTeacher = (code: string, val: string) =>
    update((w) =>
      W.editCommon(
        w,
        group,
        (v) => {
          const base = v.classes?.length ? v.classes : plain(W.groupClasses(w, group, fallback));
          v.classes = base.map((c) => (c.classCode === code ? { ...c, teacherName: val } : c));
        },
        `teacher:${code}`
      )
    );

  const setStaff = (key: string, val: string) =>
    update((w) =>
      W.editCommon(
        w,
        group,
        (v) => {
          v.staffOverrides = { ...(v.staffOverrides ?? {}) };
          if (val) v.staffOverrides[key] = val;
          else delete v.staffOverrides[key];
        },
        `staff:${key}`
      )
    );

  const infoOf = (code: string): CampClassInfo => ws.cur.classInfo[code] ?? {};
  const setInfo = (code: string, field: InfoField, val: string) =>
    update((w) => W.setClassInfo(w, code, { ...(w.cur.classInfo[code] ?? {}), [field]: val }, field));

  /**
   * 관리시트(SY)에서 열을 복사해 붙여넣으면 아래 행까지 채운다 — 반번호 · 강의실 · 반이름 · 교재 · Spare 순.
   * 반이 모자라면 늘어난다. 셀 하나만 붙여넣을 때는 브라우저 기본 동작에 맡긴다.
   */
  const paste = (row: number, col: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const grid = D.parseClipboardTable(e.clipboardData.getData('text/plain'));
    if (!grid) return;
    e.preventDefault();
    const rows = grid.slice(0, 30);
    update((w0) => {
      let w = seeded(w0);
      if (col === 0) {
        const list = plain(W.groupClasses(w, group, fallback));
        const appended: TimetableClassColumn[] = [];
        rows.forEach((cells, r) => {
          const v = cells[0]?.trim();
          if (!v) return;
          const i = row + r;
          if (i < list.length) {
            if (list[i].classCode !== v) w = W.renameClassCode(w, group, list[i].classCode, v);
          } else if (!list.some((c) => c.classCode === v) && !appended.some((c) => c.classCode === v)) {
            appended.push({ classCode: v });
          }
        });
        if (appended.length) w = W.setGroupClasses(w, group, [...plain(W.groupClasses(w, group, fallback)), ...appended]);
      }
      const codes = W.groupClasses(w, group, fallback).map((c) => c.classCode);
      rows.forEach((cells, r) => {
        const code = codes[row + r];
        if (!code) return;
        const patch: CampClassInfo = { ...(w.cur.classInfo[code] ?? {}) };
        let touched = false;
        cells.forEach((value, ci) => {
          const field = D.CLASS_PASTE_FIELDS[col + ci];
          if (!field || field === 'classCode' || !value) return;
          patch[field] = value;
          touched = true;
        });
        if (touched) w = W.setClassInfo(w, code, patch);
      });
      return w;
    });
    toast.success(`${rows.length}개 반에 붙여넣었습니다.`);
  };

  const missing = assignedCodes.filter((c) => !classes.some((x) => x.classCode === c));

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle
          scope="group"
          right={
            <button type="button" onClick={() => setClasses([...classes, { classCode: nextClassCode(classes.map((c) => c.classCode), campCode) }])} className={btnCls}>
              + 반 추가
            </button>
          }
        >
          {group} 반 ({classes.length})
        </SectionTitle>
        <p className="mb-2 text-[11px] text-gray-500">
          반번호·순서·담임 이름은 이 그룹의 모든 Day 표에 함께 적용됩니다. 담임 칸을 비워 두면 앱 배정 이름이 쓰입니다.
        </p>
        {classes.length === 0 && <p className="py-3 text-center text-xs text-gray-400">반이 없습니다.</p>}
        <div className="space-y-1">
          {classes.map((c, i) => {
            const joined = teacherByClassCode[c.classCode];
            const manual = (c.teacherName ?? '').trim();
            return (
              <div
                key={`${i}`}
                id={`tt-roster-${c.classCode}`}
                className={`grid grid-cols-[3.6rem_1fr_auto] items-center gap-1 rounded-md p-0.5 ${focusCode === c.classCode ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}
              >
                <CodeInput value={c.classCode} onCommit={(v) => renameCode(c.classCode, v)} onPaste={paste(i, 0)} />
                <div className="flex min-w-0 items-center gap-1">
                  <input
                    value={c.teacherName ?? ''}
                    onChange={(e) => setTeacher(c.classCode, e.target.value)}
                    placeholder={joined || '담임 미배정'}
                    className={`min-w-0 flex-1 rounded-md border px-1.5 py-1 text-xs ${manual ? 'border-gray-400 bg-white' : 'border-gray-200 bg-gray-50'}`}
                  />
                  <NameTag manual={!!manual} joined={joined} />
                </div>
                <div className="flex items-center">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-[11px] text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="위로">
                    ▲
                  </button>
                  <button type="button" disabled={i === classes.length - 1} onClick={() => move(i, 1)} className="px-1 text-[11px] text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="아래로">
                    ▼
                  </button>
                  <button type="button" onClick={() => removeClass(c.classCode)} className="px-1 text-xs text-gray-400 hover:text-red-600" aria-label="반 삭제">
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {missing.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
            앱 배정에만 있는 반:
            {missing.map((code) => (
              <button key={code} type="button" onClick={() => setClasses([...classes, { classCode: code }])} className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 hover:bg-gray-50">
                + {code}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle scope="group">역할 이름</SectionTitle>
        <p className="mb-2 text-[11px] text-gray-500">비워 두면 앱 배정 이름이 쓰입니다. 넣은 이름은 앱과 연동되지 않습니다.</p>
        <div className="space-y-1">
          {roles.map((r) => {
            const joined = firstName(staffByRole[r.key]);
            const manual = (common?.staffOverrides?.[r.key] ?? '').trim();
            return (
              <div key={r.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-1">
                <span className="truncate text-[11px] font-medium text-gray-600" title={r.label}>
                  {r.label}
                </span>
                <div className="flex min-w-0 items-center gap-1">
                  <input
                    value={common?.staffOverrides?.[r.key] ?? ''}
                    onChange={(e) => setStaff(r.key, e.target.value)}
                    placeholder={joined || '미배정'}
                    className={`min-w-0 flex-1 rounded-md border px-1.5 py-1 text-xs ${manual ? 'border-gray-400 bg-white' : 'border-gray-200 bg-gray-50'}`}
                  />
                  <NameTag manual={!!manual} joined={joined} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle scope="camp">반 정보</SectionTitle>
        <p className="mb-2 text-[11px] text-gray-500">
          반이름·강의실·교재는 이 캠프의 모든 표가 같이 씁니다. 관리시트 SY시트에서 열을 통째로 복사해 붙여넣으면 아래 행까지 한 번에 채워집니다 (반번호 · 강의실 · 반이름 · 교재 · Spare 순).
        </p>
        <BookCodeList id={listId} codes={bookCodes} books={eslBooks} />
        <div className="grid grid-cols-[2.6rem_1fr_1fr_3.6rem_3.6rem] gap-1 text-[10px] text-gray-400">
          <span>반</span>
          <span>강의실</span>
          <span>반이름</span>
          <span>교재</span>
          <span>Spare</span>
        </div>
        <div className="mt-0.5 space-y-1">
          {classes.map((c, i) => {
            const info = infoOf(c.classCode);
            return (
              <div key={`${i}`} className="grid grid-cols-[2.6rem_1fr_1fr_3.6rem_3.6rem] items-center gap-1">
                <span className="truncate text-xs font-semibold text-gray-700">{c.classCode}</span>
                {INFO_FIELDS.map(({ field, col, placeholder }) =>
                  field === 'bookCode' || field === 'spareBookCode' ? (
                    <BookCodeInput
                      key={field}
                      value={info[field] ?? ''}
                      onChange={(v) => setInfo(c.classCode, field, v)}
                      onPaste={paste(i, col)}
                      codes={bookCodes}
                      books={eslBooks}
                      placeholder={placeholder}
                      listId={listId}
                    />
                  ) : (
                    <input
                      key={field}
                      value={info[field] ?? ''}
                      onChange={(e) => setInfo(c.classCode, field, e.target.value)}
                      onPaste={paste(i, col)}
                      placeholder={placeholder}
                      className="w-full min-w-0 rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-400 focus:outline-none"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
