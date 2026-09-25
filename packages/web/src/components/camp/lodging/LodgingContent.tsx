'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  applyLodgingFilter,
  buildLodgingPlaces,
  buildLodgingRooms,
  getCampGroups,
  getCampLodging,
  lodgingBuildingFor,
  lodgingRoomTone,
  LODGING_FILTER_LABEL,
  LODGING_MAJOR_KINDS,
  LODGING_NO_HIDDEN,
  LODGING_PLACE_COLORS,
  lodgingFilterOptions,
  onlyLodgingValue,
  setAllLodgingHidden,
  toggleLodgingHidden,
  lodgingPurposeColor,
  lodgingMyRooms,
  updateCampLodging,
  type CampLodging,
  type LodgingOccupant,
  type LodgingFilterKey,
  type LodgingHidden,
  type LodgingPlaceSetting,
  type LodgingRoomSetting,
  type LodgingRoomView,
  type STSheetStudent,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getJobCodeById, getUsersByJobCodeId } from '@/lib/firebaseService';
import { stSheetService, type CampCode } from '@/lib/stSheetService';
import LodgingFloorGrid from './LodgingFloorGrid';
import LodgingB1Map from './LodgingB1Map';
import LodgingViewer from './LodgingViewer';
import LodgingDetail, { type LodgingTarget } from './LodgingDetail';

type ViewKey = 'all' | 'b1' | 'f1' | 'f2' | 'f3' | 'f4' | '3d';
const VIEW_KEYS: readonly string[] = ['all', 'b1', 'f1', 'f2', 'f3', 'f4', '3d'];
const VIEW_KEY = (jobCodeId: string) => `SMIS_LODGING_VIEW_${jobCodeId}`;
const ROWS_KEY = 'SMIS_LODGING_FILTER_ROWS';

/**
 * 숙소 탭 — 건물은 고정, 방 명단은 ST 시트 방호수, 용도·선생님은 캠프 설정.
 * 전체 / B1 / 1~4층 / 3D.
 */
export default function LodgingContent() {
  const { userData } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const adminActiveCampId = isAdmin
    ? ((userData as unknown as { adminTempActiveCamp?: string }).adminTempActiveCamp ?? userData?.activeJobExperienceId)
    : undefined;
  const activeJobCodeId = adminActiveCampId || userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const { data: jobCode } = useQuery({
    queryKey: ['jobCode', activeJobCodeId],
    queryFn: () => getJobCodeById(activeJobCodeId!),
    enabled: !!activeJobCodeId,
  });
  const campCode = (jobCode?.code ?? '') as CampCode | '';
  const campType = campCode ? stSheetService.getCampType(campCode as CampCode) : null;
  const building = useMemo(() => lodgingBuildingFor(campType), [campType]);

  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['stSheetCache', campCode],
    queryFn: () => stSheetService.getCachedData(campCode as CampCode),
    enabled: !!campCode && !!building,
  });
  const { data: lodging = {} as CampLodging } = useQuery({
    queryKey: ['campLodging', campCode],
    queryFn: () => getCampLodging(db, campCode),
    enabled: !!campCode && !!building,
  });
  const { data: campGroups = [] } = useQuery({
    queryKey: ['campGroups', campCode],
    queryFn: () => getCampGroups(db, campCode),
    enabled: !!campCode && !!building,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['campMembers', activeJobCodeId],
    queryFn: () => getUsersByJobCodeId(activeJobCodeId!),
    enabled: !!activeJobCodeId && isAdmin,
  });
  const memberNames = useMemo(
    () => Array.from(new Set(members.map((m) => m.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [members]
  );

  const { rooms, unknown } = useMemo(
    () =>
      building
        ? buildLodgingRooms(building, students, lodging, campGroups)
        : { rooms: new Map<string, LodgingRoomView>(), unknown: new Map<string, LodgingOccupant[]>() },
    [building, students, lodging, campGroups]
  );
  const places = useMemo(() => (building ? buildLodgingPlaces(building, lodging) : []), [building, lodging]);

  // 그룹별·공항별 — 값마다 칩 하나, 칩을 눌러 보이기/숨기기.
  // 그룹과 공항을 같이 걸 수 있다 (둘 다 켜진 학생만 보인다).
  const FILTER_KEYS: LodgingFilterKey[] = ['group', 'airport'];
  const [hidden, setHidden] = useState<LodgingHidden>(LODGING_NO_HIDDEN);
  const filterOptions = useMemo(
    () => ({ group: lodgingFilterOptions(rooms, 'group'), airport: lodgingFilterOptions(rooms, 'airport') }),
    [rooms]
  );
  const shownRooms = useMemo(() => applyLodgingFilter(rooms, hidden), [rooms, hidden]);
  const detailColumns = FILTER_KEYS.filter((k) => filterOptions[k].length > 0);

  // 눈 단추로 접어 둔 줄 — 캠프와 상관없이 기억
  const [rowClosed, setRowClosed] = useState<Record<LodgingFilterKey, boolean>>({ group: false, airport: false });
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(ROWS_KEY) || 'null');
      if (v && typeof v === 'object') setRowClosed({ group: !!v.group, airport: !!v.airport });
    } catch {
      /* noop */
    }
  }, []);
  const toggleRow = useCallback((k: LodgingFilterKey) => {
    setRowClosed((r) => {
      const next = { ...r, [k]: !r[k] };
      try {
        window.localStorage.setItem(ROWS_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  // 보던 뷰는 캠프별로 기억
  const [view, setViewState] = useState<ViewKey>('all');
  useEffect(() => {
    if (!activeJobCodeId || typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(VIEW_KEY(activeJobCodeId));
      if (v && VIEW_KEYS.includes(v)) setViewState(v as ViewKey);   // 예전에 저장된 없는 보기는 무시
    } catch {
      /* noop */
    }
  }, [activeJobCodeId]);
  const setView = useCallback(
    (v: ViewKey) => {
      setViewState(v);
      if (!activeJobCodeId) return;
      try {
        window.localStorage.setItem(VIEW_KEY(activeJobCodeId), v);
      } catch {
        /* noop */
      }
    },
    [activeJobCodeId]
  );

  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<LodgingTarget | null>(null);
  const [saving, setSaving] = useState(false);

  // 열어 둔 방은 데이터가 갱신되면 새 값으로
  useEffect(() => {
    if (!target) return;
    if (target.kind === 'room') {
      const r = rooms.get(target.room.num);
      if (r && r !== target.room) setTarget({ kind: 'room', room: r });
    } else {
      const p = places.find((x) => x.id === target.place.id);
      if (p && p !== target.place) setTarget({ kind: 'place', place: p });
    }
  }, [rooms, places, target]);

  const openRoom = useCallback(
    (num: string) => {
      const r = rooms.get(num);
      if (r) setTarget({ kind: 'room', room: r });
    },
    [rooms]
  );
  const openPlace = useCallback(
    (id: string) => {
      const p = places.find((x) => x.id === id);
      if (p) setTarget({ kind: 'place', place: p });
    },
    [places]
  );
  const closeDetail = useCallback(() => setTarget(null), []);

  const persist = async (next: CampLodging) => {
    if (!campCode) return;
    setSaving(true);
    try {
      const saved = await updateCampLodging(db, campCode, next, userData?.userId);
      queryClient.setQueryData(['campLodging', campCode], saved);
    } catch (e) {
      console.error('숙소 설정 저장 실패', e);
      alert('저장에 실패했습니다. 다시 시도해주세요.');
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const saveRoom = async (num: string, setting: LodgingRoomSetting) =>
    persist({ ...lodging, rooms: { ...(lodging.rooms ?? {}), [num]: setting } });
  const savePlace = async (id: string, setting: LodgingPlaceSetting) =>
    persist({ ...lodging, places: { ...(lodging.places ?? {}), [id]: setting } });


  // 방 모달의 학생 카드에 사진까지 — 명단 칸 → 시트 원본
  const studentByKey = useMemo(() => {
    const m = new Map<string, STSheetStudent>();
    students.forEach((s: STSheetStudent) => m.set(`${s.rowNumber}|${s.studentId}`, s));
    return m;
  }, [students]);
  const studentOf = useCallback(
    (o: LodgingOccupant) => studentByKey.get(`${o.rowNumber}|${o.studentId}`),
    [studentByKey]
  );

  // 내 방·내가 담당인 방 — 초록 테두리
  const mine = useMemo(() => lodgingMyRooms(rooms, userData?.name), [rooms, userData?.name]);

  // 검색: 이름·호수·선생님
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return new Set<string>();
    const s = new Set<string>();
    rooms.forEach((r) => {
      if (
        r.num.includes(q) ||
        r.students.some((st: LodgingOccupant) => st.name.toLowerCase().includes(q) || (st.englishName ?? '').toLowerCase().includes(q)) ||
        r.teachers.some((t: string) => t.toLowerCase().includes(q)) ||
        (r.label ?? '').toLowerCase().includes(q)
      )
        s.add(r.num);
    });
    return s;
  }, [q, rooms]);

  if (!activeJobCodeId) {
    return <Empty title={isForeign ? 'No active camp' : '활성화된 캠프가 없습니다'} body={isForeign ? 'Activate a camp on My Page.' : '마이페이지에서 참여 중인 캠프를 활성화하면 숙소를 볼 수 있습니다.'} />;
  }
  if (!jobCode) {
    return (
      <div className="space-y-3 pt-2">
        <div className="h-7 w-72 animate-pulse rounded-full bg-gray-100" />
        <div className="h-72 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }
  if (!building) {
    return (
      <Empty
        title={isForeign ? 'No building map for this camp yet' : '이 캠프의 건물 정보가 아직 없습니다'}
        body={isForeign ? 'Only E/J camps (Ilsung Condo) have a floor plan so far.' : '지금은 E/J 캠프(일성콘도)만 도면이 있습니다. 다른 캠프는 배치도가 준비되면 붙입니다.'}
      />
    );
  }

  const tabs: { key: ViewKey; label: string }[] = [
    { key: 'all', label: isForeign ? 'All' : '전체' },
    { key: 'b1', label: 'B1' },
    ...building.floors.map((f) => ({ key: `f${f}` as ViewKey, label: isForeign ? `${f}F` : `${f}층` })),
    { key: '3d', label: '3D' },
  ];
  const floorOf = (v: ViewKey) => (v.startsWith('f') ? Number(v.slice(1)) : null);
  const TONE_ORDER = ['남자방', '여자방', '선생님방', '강의실', '학생방', '교무실', '환자방', '창고', '빈방'];
  const usedTones = Array.from(new Set(Array.from(rooms.values()).map((r: LodgingRoomView) => lodgingRoomTone(r))));
  const legend = [
    ...TONE_ORDER.filter((t) => usedTones.includes(t)),
    ...usedTones.filter((t) => !TONE_ORDER.includes(t)),
  ];

  return (
    <div className="pt-2 pb-16">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="숙소 보기" className="flex min-w-0 flex-1 flex-wrap gap-1">
          {tabs.map((t) => {
            const on = t.key === view;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {(view === 'all' || floorOf(view) !== null) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isForeign ? 'Search name / room' : '이름·호수·선생님 검색'}
            className="w-44 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs"
          />
          {q && (
            <span className="text-xs text-gray-500">
              {hits.size ? `${hits.size}개 방` : '없음'}
              {hits.size > 0 && hits.size <= 6 && (
                <>
                  {' · '}
                  {Array.from(hits).map((n) => (
                    <button key={n} onClick={() => openRoom(n)} className="ml-1 font-mono font-semibold text-blue-600 hover:underline">
                      {n}
                    </button>
                  ))}
                </>
              )}
            </span>
          )}
          {/* 그룹별·공항별 줄 보이기 — 꺼 두면 줄이 통째로 빠져 배치도가 넓어진다 */}
          <div className="flex items-center gap-1.5">
            {FILTER_KEYS.filter((k) => filterOptions[k].length > 0).map((k) => {
              const open = !rowClosed[k];
              const off = hidden[k].length;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleRow(k)}
                  aria-pressed={open}
                  title={open ? `${LODGING_FILTER_LABEL[k]}별 줄 숨기기` : `${LODGING_FILTER_LABEL[k]}별 줄 보이기`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors ${
                    open ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-500 ring-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {open ? <FiEye size={12} /> : <FiEyeOff size={12} />}
                  {LODGING_FILTER_LABEL[k]}별
                  {off > 0 && (
                    <span className={`rounded-full px-1 text-[10px] font-medium ${open ? 'bg-amber-400 text-gray-900' : 'bg-amber-100 text-amber-700'}`}>
                      {off}개 꺼짐
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 그룹 줄·공항 줄 — 눈을 끄면 줄이 통째로 빠진다 (다시 켜기는 검색칸 옆 단추). 걸어 둔 필터는 그대로 */}
      {(view === 'all' || floorOf(view) !== null) && FILTER_KEYS.some((k) => filterOptions[k].length > 0 && !rowClosed[k]) && (
        <div className="mb-2 space-y-1">
          {FILTER_KEYS.filter((k) => filterOptions[k].length > 0 && !rowClosed[k]).map((k) => {
            const allOn = hidden[k].length === 0;
            return (
              <div key={k} className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => toggleRow(k)}
                  aria-label={`${LODGING_FILTER_LABEL[k]}별 줄 숨기기`}
                  title="이 줄 숨기기"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
                >
                  <FiEye size={13} />
                </button>
                <span className="w-9 shrink-0 text-[11px] font-semibold leading-5 text-gray-700">{LODGING_FILTER_LABEL[k]}별</span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHidden((h) => setAllLodgingHidden(h, k, filterOptions[k], allOn))}
                    aria-pressed={allOn}
                    title={allOn ? '모두 숨기기' : '모두 보이기'}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 transition-colors ${
                      allOn ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    전체
                  </button>
                  {filterOptions[k].map((o) => {
                    const off = hidden[k].includes(o.value);
                    return (
                      <button
                        key={o.value || '_empty'}
                        type="button"
                        onClick={() => setHidden((h) => toggleLodgingHidden(h, k, o.value))}
                        onDoubleClick={() => setHidden((h) => onlyLodgingValue(h, k, o.value, filterOptions[k]))}
                        aria-pressed={!off}
                        title="누르면 보이기/숨기기 · 두 번 누르면 이것만"
                        className={`rounded-full px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                          off
                            ? 'bg-white text-gray-400 line-through ring-1 ring-inset ring-gray-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {o.label} <span className="opacity-70">{o.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unknown.size > 0 && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          시트 방호수가 도면에 없는 학생:{' '}
          {Array.from(unknown.entries())
            .map(([num, list]) => `${num || '(빈칸)'} — ${list.map((s) => s.name).join(', ')}`)
            .join(' / ')}
        </p>
      )}

      {view === 'all' && (
        <div className="space-y-2">
          {[...building.floors].reverse().map((f) => {
            const cnt = Array.from(shownRooms.values()).filter((r: LodgingRoomView) => r.floor === f).reduce((a: number, r: LodgingRoomView) => a + r.students.length, 0);
            return (
              <div key={f} className="grid grid-cols-[48px_1fr] items-start rounded-xl border border-gray-200 bg-white">
                <button
                  onClick={() => setView(`f${f}` as ViewKey)}
                  className="pt-3 pl-3 text-left font-mono text-base font-bold text-gray-600 hover:text-blue-600"
                >
                  {f}F
                  <span className="block font-sans text-[10px] font-normal text-gray-400">{cnt}명</span>
                </button>
                <div className="p-2">
                  <LodgingFloorGrid
                    building={building}
                    floor={f}
                    rooms={shownRooms}
                    compact
                    highlight={hits}
                    mine={mine}
                    selected={target?.kind === 'room' ? target.room.num : null}
                    onRoom={openRoom}
                  />
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[48px_1fr] items-start rounded-xl border border-gray-200 bg-white">
            <button onClick={() => setView('b1')} className="pt-3 pl-3 text-left font-mono text-base font-bold text-gray-600 hover:text-blue-600">
              B1
              <span className="block font-sans text-[10px] font-normal text-gray-400">시설</span>
            </button>
            <div className="flex flex-wrap gap-1 p-2">
              {places
                .filter((p) => LODGING_MAJOR_KINDS.includes(p.kind))
                .map((p) => {
                  const c = LODGING_PLACE_COLORS[p.kind];
                  return (
                    <button
                      key={p.id}
                      onClick={() => openPlace(p.id)}
                      className="rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-black/10"
                      style={{ background: c.bg, color: c.ink }}
                    >
                      {p.name}
                      {p.cap ? ` ${p.cap}명` : ''}
                      {p.purpose ? ` · ${p.purpose}` : ''}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {floorOf(view) !== null && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs text-gray-500">
            <b className="text-gray-800">{floorOf(view)}층</b> · 왼쪽 별관(세로 복도) 가운데 통로에서 본관(가로 복도)이 동쪽으로 뻗습니다
          </p>
          <LodgingFloorGrid
            building={building}
            floor={floorOf(view)!}
            rooms={shownRooms}
            highlight={hits}
            mine={mine}
            selected={target?.kind === 'room' ? target.room.num : null}
            onRoom={openRoom}
          />
        </div>
      )}

      {view === 'b1' && (
        <LodgingB1Map building={building} places={places} selected={target?.kind === 'place' ? target.place.id : null} onPlace={openPlace} />
      )}

      {view === '3d' && (
        <LodgingViewer
          building={building}
          rooms={shownRooms}
          places={places}
          mode="3d"
          onRoom={openRoom}
          onPlace={openPlace}
          className="h-[70vh] min-h-[480px] w-full rounded-xl border border-gray-200 bg-white"
        />
      )}

      {legend.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {legend.map((p) => {
            const c = lodgingPurposeColor(p);
            return (
              <span key={p} className="inline-flex items-center gap-1">
                <i className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ background: c.bg }} />
                {p}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-sm bg-blue-100" />
            본관↔별관 통로
          </span>
          {mine.size > 0 && (
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-3 w-3 rounded-sm border-2 border-emerald-500 bg-white" />
              {isForeign ? 'My room' : '내 방·담당'}
            </span>
          )}
        </div>
      )}

      {loadingStudents && <p className="mt-2 text-xs text-gray-400">명단 불러오는 중…</p>}

      {target && (
        <LodgingDetail
          target={target}
          isAdmin={isAdmin}
          isForeign={isForeign}
          columns={detailColumns}
          memberNames={memberNames}
          saving={saving}
          onClose={closeDetail}
          studentOf={studentOf}
          onSaveRoom={saveRoom}
          onSavePlace={savePlace}
        />
      )}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-14 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}
