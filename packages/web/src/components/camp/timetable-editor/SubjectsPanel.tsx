'use client';

/**
 * 패널 [과목·주제] — 이 표만.
 * 과목마다 이름(칸·칸 설명이 따라감) · 색 · 윗 칸 담당 · 강의실 · 아래 칸 규칙 · 담당 반 · 역할 · Pattern 짝.
 */
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DEFAULT_SUBJECTS,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampTimetable,
  type SubjectPartner,
  type TimetableCategory,
  type TimetableSubject,
} from '@smis-mentor/shared';
import {
  ColorPicker,
  FieldLabel,
  PARTNER_LABELS,
  PARTNER_ORDER,
  RoleSelect,
  SectionTitle,
  btnCls,
  inputCls,
  linkBtnCls,
  staffRolesOf,
  subjectsOf,
  type TableEdit,
  type WsUpdate,
} from './ui';

/** 이름 입력 — 비었거나 다른 과목과 겹치는 동안에는 칸에 반영하지 않는다 (칸이 엉뚱한 과목에 합쳐지지 않게) */
function SubjectNameInput({
  value,
  others,
  color,
  onRename,
  onDone,
}: {
  value: string;
  others: string[];
  color?: string;
  onRename: (from: string, to: string) => void;
  onDone: (first: string, last: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const start = useRef('');
  const bad = (v: string) => !v.trim() || others.some((o) => o.toLowerCase() === v.trim().toLowerCase());
  const shown = text ?? value;
  return (
    <input
      value={shown}
      onFocus={() => {
        start.current = value;
        setText(value);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (!bad(v) && v !== value) onRename(value, v);
      }}
      onBlur={() => {
        setText(null);
        onDone(start.current, value);
      }}
      title={text !== null && bad(text) ? '비었거나 다른 과목과 이름이 같습니다 — 반영하지 않습니다' : '이름을 바꾸면 칸과 칸 설명이 따라갑니다'}
      className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-xs font-semibold ${text !== null && bad(text) ? 'border-amber-400' : 'border-gray-300'}`}
      style={{ backgroundColor: color }}
    />
  );
}

export function SubjectsPanel({
  table,
  display,
  tableId,
  category,
  edit,
  update,
  teacherByClassCode,
  onBulkName,
}: {
  /** 원래 표 (빈 뼈대일 수 있음) */
  table: CampTimetable;
  /** 반 이름이 입혀진 표 — 담당 반 고르기용 */
  display: CampTimetable;
  /** 작업 공간에 있는 표 id (빈 뼈대면 null) */
  tableId: string | null;
  category: TimetableCategory | undefined;
  edit: TableEdit;
  update: WsUpdate;
  teacherByClassCode: Record<string, string>;
  onBulkName: (old: string) => void;
}) {
  const [colorOpen, setColorOpen] = useState<number | null>(null);
  const subjects = subjectsOf(table);
  const staffRoles = staffRolesOf(subjects);
  const usingDefault = !table.subjects?.length;

  const set = (i: number, patch: Partial<TimetableSubject>, key?: string) => edit((t) => D.updateSubject(t, i, patch), key);

  const rename = (from: string, to: string) => {
    let id = tableId;
    if (!table.subjects?.length || !id) {
      id = edit((t) => {
        if (!t.subjects?.length) t.subjects = DEFAULT_SUBJECTS.map((s) => ({ ...s }));
      });
    }
    if (id) update((w) => W.renameSubjectTyping(w, id!, from, to));
  };
  const renameDone = (first: string, last: string) => {
    const trimmed = last.trim();
    if (trimmed && trimmed !== last) rename(last, trimmed);
    if (first && trimmed && first !== trimmed) update((w) => W.carryGuideAfterRename(w, first, trimmed));
  };

  const usage = (key: string) =>
    table.blocks.reduce(
      (n, b) => n + Object.values(b.cells ?? {}).filter((c) => c?.subject && c.subject.toLowerCase() === key.toLowerCase()).length,
      0
    );

  const remove = (i: number) => {
    const s = subjects[i];
    const n = usage(s.key);
    if (n && !window.confirm(`"${s.key}" 를 칸 ${n}개에서 쓰고 있습니다. 목록에서 지울까요? (칸 글자는 남습니다)`)) return;
    edit((t) => D.removeSubject(t, i));
  };

  const classRows = table.blocks.filter((b) => b.kind === 'class').length;
  const rotationWarn = D.rotationWarning(table);
  const runRotation = () => {
    if (!D.rotationKeysOf(table).length) {
      toast.error(rotationWarn ?? '로테이션에 쓸 과목이 없습니다.');
      return;
    }
    if (!classRows) {
      toast.error('반별 줄이 없습니다.');
      return;
    }
    if (!window.confirm(`반별 줄 ${classRows}개의 반 칸을 모두 바꿉니다.${rotationWarn ? `\n\n주의: ${rotationWarn}` : ''}\n\n계속할까요?`)) return;
    edit((t) => void D.applyRotation(t));
    toast.success(`${D.rotationKeysOf(table).join(' → ')} 순으로 한 칸씩 밀어 채웠습니다.`);
  };

  return (
    <div className="space-y-3">
      <SectionTitle scope="table">과목·주제 ({subjects.length})</SectionTitle>
      {category?.noSubjects && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          이 Day 는 칸에 직접 글을 쓰는 날입니다. 칸을 눌러 [직접 쓰기] 로 넣으세요. 과목이 필요하면 아래에서 고칠 수 있습니다.
        </p>
      )}
      {usingDefault && <p className="text-[11px] text-gray-500">기본 과목을 쓰는 중입니다. 고치면 이 표의 과목 목록이 됩니다.</p>}
      <p className="text-[11px] text-gray-500">반별 칸은 윗 칸(1교시)·아래 칸(2교시)으로 나뉩니다. 아래 칸 규칙이 2교시에 무엇이 오는지 정합니다.</p>

      <div className="space-y-2">
        {subjects.map((s, i) => {
          const others = subjects.filter((_, j) => j !== i).map((x) => x.key);
          return (
            <div key={i} className="rounded-md border border-gray-200 p-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setColorOpen((v) => (v === i ? null : i))}
                  title="색"
                  className="h-6 w-6 shrink-0 rounded border border-gray-300"
                  style={{ backgroundColor: s.color ?? '#fff' }}
                />
                <SubjectNameInput value={s.key} others={others} color={s.color} onRename={rename} onDone={renameDone} />
                <button type="button" onClick={() => onBulkName(s.key)} className={linkBtnCls} title="캠프의 모든 표에서 이 이름 바꾸기">
                  전체
                </button>
                <button type="button" onClick={() => remove(i)} className="px-1 text-sm text-gray-400 hover:text-red-600" aria-label="과목 삭제">
                  ✕
                </button>
              </div>
              {colorOpen === i && (
                <div className="mt-1.5">
                  <ColorPicker value={s.color} onChange={(c) => set(i, { color: c })} />
                </div>
              )}

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label className="col-span-2 block">
                  <FieldLabel>아래 칸 규칙</FieldLabel>
                  <select value={s.partner} onChange={(e) => set(i, { partner: e.target.value as SubjectPartner })} className={inputCls}>
                    {PARTNER_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {PARTNER_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>

                {s.partner === 'staff' ? (
                  <label className="col-span-2 block">
                    <FieldLabel>칸에 이름이 찍힐 역할</FieldLabel>
                    <select value={s.roleKey ?? ''} onChange={(e) => set(i, { roleKey: e.target.value })} className={inputCls}>
                      <option value="">역할 고르기…</option>
                      {staffRoles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                      {s.roleKey && !staffRoles.some((r) => r.key === s.roleKey) && <option value={s.roleKey}>{s.roleKey}</option>}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="block">
                      <FieldLabel>윗 칸 담당</FieldLabel>
                      <RoleSelect value={s.teacherRole ?? ''} onChange={(v) => set(i, { teacherRole: v || undefined })} roles={staffRoles} />
                    </label>
                    <label className="block">
                      <FieldLabel>강의실</FieldLabel>
                      <input
                        value={s.room ?? ''}
                        onChange={(e) => set(i, { room: e.target.value || undefined }, `subject:${i}:room`)}
                        placeholder="늘 쓰는 호수"
                        className={inputCls}
                      />
                    </label>
                  </>
                )}

                {s.partner === 'owner' && (
                  <label className="col-span-2 block">
                    <FieldLabel>담당 반 (아래 칸에 이 반 담임 이름)</FieldLabel>
                    <select value={s.ownerClassCode ?? ''} onChange={(e) => set(i, { ownerClassCode: e.target.value || undefined })} className={inputCls}>
                      <option value="">담당 반 고르기…</option>
                      {display.classes.map((c) => (
                        <option key={c.classCode} value={c.classCode}>
                          {c.classCode}
                          {c.className ? ` ${c.className}` : ''} ({c.teacherName?.trim() || teacherByClassCode[c.classCode] || '미배정'})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {s.partner === 'pattern' && (
                  <>
                    <label className="block">
                      <FieldLabel>짝 이름</FieldLabel>
                      <input
                        value={s.partnerLabel ?? ''}
                        onChange={(e) => set(i, { partnerLabel: e.target.value || undefined }, `subject:${i}:plabel`)}
                        placeholder="Pattern"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>짝 강의실</FieldLabel>
                      <input
                        value={s.partnerRoom ?? ''}
                        onChange={(e) => set(i, { partnerRoom: e.target.value || undefined }, `subject:${i}:proom`)}
                        placeholder="호수"
                        className={inputCls}
                      />
                    </label>
                    <label className="col-span-2 block">
                      <FieldLabel>짝 담당</FieldLabel>
                      <RoleSelect value={s.partnerTeacherRole ?? '수업'} onChange={(v) => set(i, { partnerTeacherRole: v })} roles={staffRoles} />
                    </label>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => edit((t) => D.addSubject(t))} className={btnCls}>
          + 과목
        </button>
        {category?.rotation && (
          <button
            type="button"
            onClick={() => {
              if (table.subjects?.length && !window.confirm(`과목·주제 목록을 주제1~${table.classes.length} 로 새로 깝니다. 계속할까요?`)) return;
              edit((t) => D.resetRotationSubjects(t));
            }}
            className={btnCls}
            title="반 수만큼 주제1~N 을 만들고 각 반 담임을 담당으로 지정합니다"
          >
            주제1~{display.classes.length} 로 채우기
          </button>
        )}
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50/50 p-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-900">로테이션 채우기</span>
          <button type="button" onClick={runRotation} className={`${btnCls} ml-auto border-blue-300 text-blue-700`}>
            채우기
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">과목·주제를 반 순서대로 놓고 반별 줄이 넘어갈 때마다 한 칸씩 밉니다.</p>
        {rotationWarn && <p className="mt-1 text-[11px] text-amber-700">{rotationWarn}</p>}
      </div>

      <button type="button" onClick={() => onBulkName(subjects[0]?.key ?? '')} className={linkBtnCls}>
        캠프 전체에서 과목 이름 바꾸기…
      </button>
      {!tableId && <p className="text-[11px] text-gray-400">처음 고치면 이 그룹의 새 표가 만들어집니다 (저장 전).</p>}
    </div>
  );
}
