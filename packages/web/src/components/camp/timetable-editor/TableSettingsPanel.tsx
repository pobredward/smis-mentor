'use client';

/**
 * 패널 [표 설정] — 이 표만: 표 메모 · 전담 열 · 이 표를 쓰는 날 · 표 삭제 (삭제도 저장 때 반영)
 */
import {
  monthDayLabel,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampTimetable,
  type TimetableExtraColumn,
} from '@smis-mentor/shared';
import { FieldLabel, SectionTitle, btnCls, btnDangerCls, inputBaseCls, inputCls, staffRolesOf, subjectsOf, type TableEdit, type WsUpdate } from './ui';

type ExtraKind = D.ExtraColumnKind;
const KIND_LABEL: Record<ExtraKind, string> = {
  duty: '당번 로테이션',
  staffRole: '한 역할이 내내',
  staticText: '고정 글',
  teacher: '고정 교사 이름',
};
const KIND_HINT: Record<ExtraKind, string> = {
  duty: '반별 줄마다 이 순서대로 한 줄씩 돌아갑니다 (공통 줄은 건너뜀). 이름은 그 반 담임.',
  staffRole: '이 역할 담당자 이름이 줄을 합쳐 한 번만 들어갑니다.',
  staticText: '사람 대신 늘 같은 글이 들어갑니다.',
  teacher: '열 머리에 이 이름이 붙고, 칸은 반 칸처럼 직접 채웁니다.',
};
const KINDS: ExtraKind[] = ['duty', 'staffRole', 'staticText', 'teacher'];

/** 표 칩 이름 — 기본 / 8/8·8/15 / 날짜 미정 */
export function tableChipLabel(t: Pick<CampTimetable, 'id' | 'dates'>, baseId: string | null | undefined): string {
  if (t.dates?.length) return t.dates.map(monthDayLabel).join('·');
  return t.id === baseId || !baseId ? '기본' : '날짜 미정';
}

export function TableSettingsPanel({
  table,
  tableId,
  list,
  planDates,
  edit,
  update,
  teacherByClassCode,
  onDeleted,
}: {
  /** 원래 표 (빈 뼈대일 수 있음) */
  table: CampTimetable;
  /** 작업 공간의 id (빈 뼈대면 null) */
  tableId: string | null;
  /** 같은 Day·그룹의 표들 (기본 표 먼저) */
  list: CampTimetable[];
  /** 일정표에서 이 Day 를 여는 날짜 */
  planDates: string[];
  edit: TableEdit;
  update: WsUpdate;
  teacherByClassCode: Record<string, string>;
  onDeleted: () => void;
}) {
  const baseId = list.find((t) => !t.dates?.length)?.id ?? null;
  const isBase = !tableId || tableId === baseId;
  const staffRoles = staffRolesOf(subjectsOf(table));
  const classes = table.classes;
  const classLabel = (code: string) => `${code} (${table.classes.find((c) => c.classCode === code)?.teacherName?.trim() || teacherByClassCode[code] || '미배정'})`;

  const setCol = (key: string, patch: Partial<TimetableExtraColumn>, k?: string) => edit((t) => D.updateExtraColumn(t, key, patch), k);
  const switchKind = (e: TimetableExtraColumn, k: ExtraKind) =>
    setCol(e.key, {
      dutyRotation: k === 'duty' ? classes.map((c) => c.classCode) : undefined,
      staffRole: k === 'staffRole' ? '수업' : undefined,
      staticText: k === 'staticText' ? '-' : undefined,
      teacherName: k === 'teacher' ? e.teacherName ?? '' : undefined,
      teacherRole: k === 'teacher' ? e.teacherRole : undefined,
    });

  const claimedByOthers = (d: string) => list.some((t) => t.id !== tableId && t.dates?.includes(d));
  const dateChips = [...new Set([...planDates, ...(table.dates ?? [])])].sort();
  const restDates = planDates.filter((d) => !list.some((t) => t.dates?.includes(d)));

  const remove = () => {
    if (!tableId) return;
    const others = list.filter((t) => t.id !== tableId);
    const which = others.length ? ` ${tableChipLabel(table, baseId)}` : '';
    const warn =
      others.length && tableId === baseId
        ? `\n\n기본 표입니다. 지우면 커스텀 표가 맡지 않은 날에는 남은 표(${tableChipLabel(others[0], null)})가 대신 쓰입니다.`
        : '';
    if (!window.confirm(`"${table.groupName} · ${table.dayTypeLabel}${which}" 표를 지울까요? 저장을 눌러야 반영됩니다.${warn}`)) return;
    update((w) => W.deleteTable(w, tableId));
    onDeleted();
  };

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle scope="table">표 메모</SectionTitle>
        <textarea
          value={table.note ?? ''}
          onChange={(e) => edit((t) => void (t.note = e.target.value), 'note')}
          rows={2}
          placeholder="표 아래에 보이는 안내"
          className={inputCls}
        />
      </section>

      <section>
        <SectionTitle scope="table">전담 열 ({table.extraColumns?.length ?? 0})</SectionTitle>
        <div className="space-y-2">
          {(table.extraColumns ?? []).map((e) => {
            const kind = D.extraColumnKindOf(e);
            return (
              <div key={e.key} className="rounded-md border border-gray-200 p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    value={e.label}
                    onChange={(ev) => setCol(e.key, { label: ev.target.value }, `extra:${e.key}:label`)}
                    placeholder="열 이름"
                    className={`${inputCls} font-semibold`}
                  />
                  <select value={kind} onChange={(ev) => switchKind(e, ev.target.value as ExtraKind)} className={`${inputBaseCls} shrink-0`}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => window.confirm(`"${e.label}" 열을 지울까요?`) && edit((t) => D.removeExtraColumn(t, e.key))}
                    className="px-1 text-sm text-gray-400 hover:text-red-600"
                    aria-label="열 삭제"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-gray-500">{KIND_HINT[kind]}</p>

                {kind === 'duty' && (
                  <div className="mt-1.5 space-y-1">
                    {(e.dutyRotation ?? []).map((code, pos) => (
                      <div key={pos} className="flex items-center gap-1">
                        <span className="w-14 shrink-0 text-[10px] text-gray-400">{pos + 1}번째 줄</span>
                        <select
                          value={code}
                          onChange={(ev) => setCol(e.key, { dutyRotation: (e.dutyRotation ?? []).map((c, j) => (j === pos ? ev.target.value : c)) })}
                          className={inputCls}
                        >
                          {classes.map((c) => (
                            <option key={c.classCode} value={c.classCode}>
                              {classLabel(c.classCode)}
                            </option>
                          ))}
                          {!classes.some((c) => c.classCode === code) && <option value={code}>{code}</option>}
                        </select>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setCol(e.key, { dutyRotation: [...(e.dutyRotation ?? []), classes[(e.dutyRotation?.length ?? 0) % Math.max(classes.length, 1)]?.classCode ?? ''].filter(Boolean) })}
                        className={btnCls}
                        disabled={!classes.length}
                      >
                        + 순번
                      </button>
                      <button
                        type="button"
                        onClick={() => setCol(e.key, { dutyRotation: (e.dutyRotation ?? []).slice(0, -1) })}
                        disabled={(e.dutyRotation?.length ?? 0) <= 1}
                        className={btnCls}
                      >
                        − 순번
                      </button>
                      <button type="button" onClick={() => setCol(e.key, { dutyRotation: classes.map((c) => c.classCode) })} className={btnCls}>
                        반 순서로
                      </button>
                    </div>
                  </div>
                )}

                {kind === 'staffRole' && (
                  <label className="mt-1.5 block">
                    <FieldLabel>역할</FieldLabel>
                    <select value={e.staffRole ?? ''} onChange={(ev) => setCol(e.key, { staffRole: ev.target.value })} className={inputCls}>
                      {staffRoles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                      {e.staffRole && !staffRoles.some((r) => r.key === e.staffRole) && <option value={e.staffRole}>{e.staffRole}</option>}
                    </select>
                  </label>
                )}

                {kind === 'staticText' && (
                  <label className="mt-1.5 block">
                    <FieldLabel>늘 넣을 글</FieldLabel>
                    <input value={e.staticText ?? ''} onChange={(ev) => setCol(e.key, { staticText: ev.target.value }, `extra:${e.key}:static`)} className={inputCls} />
                  </label>
                )}

                {kind === 'teacher' && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <FieldLabel>교사 이름 (직접)</FieldLabel>
                      <input
                        value={e.teacherName ?? ''}
                        onChange={(ev) => setCol(e.key, { teacherName: ev.target.value }, `extra:${e.key}:teacher`)}
                        placeholder="고정 전담 교사"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>또는 앱 배정 역할</FieldLabel>
                      <select value={e.teacherRole ?? ''} onChange={(ev) => setCol(e.key, { teacherRole: ev.target.value || undefined })} className={inputCls}>
                        <option value="">쓰지 않음</option>
                        {staffRoles.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => edit((t) => void D.addExtraColumn(t, k))} className={btnCls}>
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-gray-500">당번·고정 열에서 한 줄만 다른 사람이면 표에서 그 칸을 눌러 이름을 넣습니다.</p>
      </section>

      <section>
        <SectionTitle scope="table">{isBase ? '기본 표가 쓰이는 날' : '이 표를 쓰는 날'}</SectionTitle>
        {isBase ? (
          <p className="rounded-md bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600">
            {planDates.length
              ? restDates.length
                ? `커스텀 표가 맡지 않은 날: ${restDates.map(monthDayLabel).join(', ')}`
                : '이 Day 의 모든 날을 커스텀 표가 맡고 있습니다.'
              : '일정표에 이 Day 날짜가 아직 없습니다. 기본 표는 이 Day 의 모든 날에 쓰입니다.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {dateChips.map((d) => {
                const on = !!table.dates?.includes(d);
                const taken = !on && claimedByOthers(d);
                const outside = !planDates.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={taken}
                    title={taken ? '다른 표가 쓰는 날입니다' : outside ? '일정표에서 이 Day 가 아닌 날입니다' : undefined}
                    onClick={() => edit((t) => D.toggleDate(t, d))}
                    className={`rounded-full px-2.5 py-1 text-xs tabular-nums ${
                      on
                        ? outside
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-600 text-white'
                        : taken
                          ? 'cursor-not-allowed bg-gray-100 text-gray-300'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {monthDayLabel(d)}
                  </button>
                );
              })}
              {!dateChips.length && <span className="text-[11px] text-gray-400">일정표에 이 Day 날짜가 없습니다.</span>}
            </div>
            {!table.dates?.length && <p className="mt-1 text-[11px] text-amber-700">날짜를 고르지 않으면 이 표는 어느 날에도 쓰이지 않습니다.</p>}
          </>
        )}
      </section>

      {tableId && (
        <section className="border-t border-gray-100 pt-3">
          <button type="button" onClick={remove} className={btnDangerCls}>
            이 표 삭제
          </button>
          <p className="mt-1 text-[10px] text-gray-500">저장을 눌러야 실제로 지워집니다. 되돌리기로 살릴 수 있습니다.</p>
        </section>
      )}
    </div>
  );
}
