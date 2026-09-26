import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyLodgingFilter,
  buildLodgingPlaces,
  buildLodgingRooms,
  lodgingRoomTone,
  LODGING_FILTER_LABEL,
  LODGING_MAJOR_KINDS,
  LODGING_NO_HIDDEN,
  LODGING_PLACE_COLORS,
  lodgingFilterOptions,
  onlyLodgingValue,
  toggleLodgingHidden,
  setAllLodgingHidden,
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
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { loadLodgingBundle, lodgingQueryKey } from '../services/lodgingBundle';
import { LodgingFloorGrid, lodgingGridRoomRect } from '../components/lodging/LodgingFloorGrid';
import { LodgingB1Map } from '../components/lodging/LodgingB1Map';
import { LodgingViewer } from '../components/lodging/LodgingViewer';
import { LodgingRoomSheet, type LodgingTarget } from '../components/lodging/LodgingRoomSheet';
import { PanZoomCanvas, type PanZoomHandle } from '../components/lodging/PanZoomCanvas';
import { StudentDetailModal } from '../components/StudentDetailModal';
import { L } from '@smis-mentor/shared';

type ViewKey = 'all' | 'b1' | 'f1' | 'f2' | 'f3' | 'f4' | '3d';
const VIEW_KEYS: readonly string[] = ['all', 'b1', 'f1', 'f2', 'f3', 'f4', '3d'];
const VIEW_KEY = (jobCodeId: string) => `SMIS_LODGING_VIEW_${jobCodeId}`;
const ROWS_KEY = 'SMIS_LODGING_FILTER_ROWS';
const FILTER_KEYS: LodgingFilterKey[] = ['group', 'airport'];
/** B1 배치도를 그리는 폭 — 판에서 손가락으로 확대해 본다 */
const B1_WIDTH = 960;
const floorOfView = (v: ViewKey) => (v.startsWith('f') ? Number(v.slice(1)) : null);
type XY = { x: number; y: number };

/**
 * 숙소 탭 — 건물은 고정, 방 명단은 ST 시트 방호수, 용도·선생님은 캠프 설정.
 * 전체 / B1 / 1~4층 / 3D.
 */
export function LodgingScreen() {
  const { userData } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: lodgingQueryKey(activeJobCodeId ?? ''),
    queryFn: () => loadLodgingBundle(activeJobCodeId!, !!isAdmin),
    enabled: !!activeJobCodeId,
    staleTime: 60_000,
  });
  const building = data?.building ?? null;
  const lodging = data?.lodging ?? {};
  const students = data?.students ?? [];

  const { rooms, unknown } = useMemo(
    () =>
      building
        ? buildLodgingRooms(building, students, lodging, data?.groups)
        : { rooms: new Map<string, LodgingRoomView>(), unknown: new Map<string, LodgingOccupant[]>() },
    [building, students, lodging, data?.groups]
  );
  const places = useMemo(() => (building ? buildLodgingPlaces(building, lodging) : []), [building, lodging]);

  // 그룹별·공항별 — 버튼을 누르면 값들이 칩으로 뜨고, 칩마다 보이기/숨기기.
  // 그룹과 공항을 같이 걸 수 있다 (둘 다 켜진 학생만 보인다).
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
    AsyncStorage.getItem(ROWS_KEY)
      .then((v) => {
        const o = v ? JSON.parse(v) : null;
        if (o && typeof o === 'object') setRowClosed({ group: !!o.group, airport: !!o.airport });
      })
      .catch(() => {});
  }, []);
  const toggleRow = useCallback((k: LodgingFilterKey) => {
    setRowClosed((r) => {
      const next = { ...r, [k]: !r[k] };
      AsyncStorage.setItem(ROWS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const [view, setViewState] = useState<ViewKey>('all');
  useEffect(() => {
    if (!activeJobCodeId) return;
    AsyncStorage.getItem(VIEW_KEY(activeJobCodeId))
      .then((v) => { if (v && VIEW_KEYS.includes(v)) setViewState(v as ViewKey); })   // 예전에 저장된 없는 보기는 무시
      .catch(() => {});
  }, [activeJobCodeId]);
  const setView = useCallback(
    (v: ViewKey) => {
      setViewState(v);
      if (activeJobCodeId) AsyncStorage.setItem(VIEW_KEY(activeJobCodeId), v).catch(() => {});
    },
    [activeJobCodeId]
  );

  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<LodgingTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [studentModal, setStudentModal] = useState<{ list: STSheetStudent[]; index: number } | null>(null);

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

  const persist = async (next: CampLodging) => {
    if (!data?.campCode) return;
    setSaving(true);
    try {
      const saved = await updateCampLodging(db, data.campCode, next, userData?.userId);
      queryClient.setQueryData(lodgingQueryKey(activeJobCodeId ?? ''), { ...data, lodging: saved });
    } catch (e) {
      Alert.alert(L('common.saveFailed'), L('lodging.couldNotSaveLodgingSettings'));
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const saveRoom = (num: string, setting: LodgingRoomSetting) =>
    persist({ ...lodging, rooms: { ...(lodging.rooms ?? {}), [num]: setting } });
  const savePlace = (id: string, setting: LodgingPlaceSetting) =>
    persist({ ...lodging, places: { ...(lodging.places ?? {}), [id]: setting } });


  // 방 시트의 학생 카드에 사진까지 — 명단 칸 → 시트 원본
  const studentByKey = useMemo(() => {
    const m = new Map<string, STSheetStudent>();
    students.forEach((s) => m.set(`${s.rowNumber}|${s.studentId}`, s));
    return m;
  }, [students]);
  const studentOf = useCallback(
    (o: LodgingOccupant) => studentByKey.get(`${o.rowNumber}|${o.studentId}`),
    [studentByKey]
  );

  // 방 명단에서 학생을 누르면 학생 카드 (명단 탭과 같은 모달)
  const openStudent = (occ: LodgingOccupant, room: LodgingRoomView) => {
    const list = room.students
      .map((o) => students.find((s) => s.rowNumber === o.rowNumber && s.studentId === o.studentId))
      .filter((s): s is STSheetStudent => !!s);
    const index = list.findIndex((s) => s.rowNumber === occ.rowNumber);
    if (index >= 0) setStudentModal({ list, index });
  };

  // 내 방·내가 담당인 방 — 초록 테두리
  const mine = useMemo(() => lodgingMyRooms(rooms, userData?.name), [rooms, userData?.name]);

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    const s = new Set<string>();
    if (!q) return s;
    rooms.forEach((r) => {
      if (
        r.num.includes(q) ||
        r.students.some((st) => st.name.toLowerCase().includes(q) || (st.englishName ?? '').toLowerCase().includes(q)) ||
        r.teachers.some((t) => t.toLowerCase().includes(q)) ||
        (r.label ?? '').toLowerCase().includes(q)
      )
        s.add(r.num);
    });
    return s;
  }, [q, rooms]);

  // 검색하면 위에 칩을 늘어놓는 대신, 찾은 방으로 화면을 옮긴다 (여럿이면 ‹ › 로 다음 방)
  const hitList = useMemo(
    () =>
      Array.from(hits).sort((a, b) => (rooms.get(a)?.floor ?? 0) - (rooms.get(b)?.floor ?? 0) || a.localeCompare(b)),
    [hits, rooms]
  );
  const [hitIdx, setHitIdx] = useState(0);
  const canvasRef = useRef<PanZoomHandle>(null);
  /** 판 안에서 층 카드·격자가 놓인 자리 — `${보기}|${층}` */
  const cardPos = useRef<Record<string, XY>>({});
  const gridPos = useRef<Record<string, XY>>({});
  const focusReq = useRef<{ num: string; floor: number; key: string; compact: boolean } | null>(null);
  const tryFocus = useCallback(() => {
    const req = focusReq.current;
    if (!req || !building) return;
    const card = cardPos.current[req.key];
    const grid = gridPos.current[req.key];
    if (!card || !grid) return; // 아직 안 그려졌다 — onLayout 에서 다시 부른다
    focusReq.current = null;
    const r = lodgingGridRoomRect(building, req.floor, req.num, req.compact);
    if (!r) return;
    canvasRef.current?.focus({ x: card.x + grid.x + r.x, y: card.y + grid.y + r.y, w: r.w, h: r.h }, req.compact ? 1.6 : undefined);
  }, [building]);
  const goToHit = useCallback(
    (i: number) => {
      const num = hitList[i];
      const room = num ? rooms.get(num) : undefined;
      if (!room) return;
      setHitIdx(i);
      // 전체 보기면 그 자리에서, 층별 보기면 그 방 층으로 바꿔서
      const next: ViewKey = view === 'all' || floorOfView(view) === room.floor ? view : (`f${room.floor}` as ViewKey);
      focusReq.current = { num, floor: room.floor, key: `${next}|${room.floor}`, compact: next === 'all' };
      if (next !== view) setView(next);
      else tryFocus();
    },
    [hitList, rooms, view, setView, tryFocus]
  );
  const goToHitRef = useRef(goToHit);
  goToHitRef.current = goToHit;
  const hitKey = hitList.join(',');
  useEffect(() => {
    if (!q || !hitKey) return;
    const t = setTimeout(() => goToHitRef.current(0), 450); // 치는 동안에는 기다렸다가
    return () => clearTimeout(t);
  }, [q, hitKey]);

  if (!activeJobCodeId) {
    return <Empty title={L('lodging.noActiveCamp')} body={L('lodging.activateACampOnMy')} />;
  }
  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }
  if (!building) {
    return (
      <Empty
        title={L('lodging.noBuildingMapForThis')}
        body={L('lodging.onlyEJCampsIlsung')}
      />
    );
  }

  const tabs: { key: ViewKey; label: string }[] = [
    { key: 'all', label: L('lodging.all') },
    { key: 'b1', label: 'B1' },
    ...building.floors.map((f) => ({ key: `f${f}` as ViewKey, label: L('lodging.v0F', { v0: f }) })),
    { key: '3d', label: '3D' },
  ];
  const floorOf = floorOfView;
  const TONE_ORDER = ['남자방', '여자방', '선생님방', '강의실', '학생방', '교무실', '환자방', '창고', '빈방'];
  const usedTones = Array.from(new Set(Array.from(rooms.values()).map((r) => lodgingRoomTone(r))));
  const legend = [
    ...TONE_ORDER.filter((t) => usedTones.includes(t)),
    ...usedTones.filter((t) => !TONE_ORDER.includes(t)),
  ];
  const isViewer = view === '3d';
  const showTools = view === 'all' || floorOf(view) !== null;
  // 모달로 연 방, 없으면 검색으로 옮겨 간 방을 파랗게
  const selectedRoom = target?.kind === 'room' ? target.room.num : q ? hitList[Math.min(hitIdx, hitList.length - 1)] ?? null : null;

  // 판 위에 올릴 도면 — 스크롤 뷰 없이, 판이 통째로 움직인다
  const floor = floorOf(view);
  const canvasContent =
    view === 'all' ? (
      <View style={styles.stack}>
        {[...building.floors].reverse().map((f) => {
          const cnt = Array.from(shownRooms.values())
            .filter((r) => r.floor === f)
            .reduce((a, r) => a + r.students.length, 0);
          return (
            <View
              key={f}
              style={styles.floorCard}
              onLayout={(e) => {
                cardPos.current[`all|${f}`] = e.nativeEvent.layout;
                tryFocus();
              }}
            >
              <TouchableOpacity onPress={() => setView(`f${f}` as ViewKey)} style={styles.floorHead}>
                <Text style={styles.floorTitle}>{f}F</Text>
                <Text style={styles.floorCount}>{cnt}{L('common.people2')}</Text>
              </TouchableOpacity>
              <LodgingFloorGrid
                building={building}
                floor={f}
                rooms={shownRooms}
                compact
                highlight={hits}
                mine={mine}
                selected={selectedRoom}
                onRoom={openRoom}
                onLayout={(e) => {
                  gridPos.current[`all|${f}`] = e.nativeEvent.layout;
                  tryFocus();
                }}
              />
            </View>
          );
        })}
        <View style={styles.floorCard}>
          <TouchableOpacity onPress={() => setView('b1')} style={styles.floorHead}>
            <Text style={styles.floorTitle}>B1</Text>
            <Text style={styles.floorCount}>{L('lodging.facilities')}</Text>
          </TouchableOpacity>
          <View style={styles.b1Chips}>
            {places
              .filter((p) => LODGING_MAJOR_KINDS.includes(p.kind))
              .map((p) => {
                const c = LODGING_PLACE_COLORS[p.kind];
                return (
                  <TouchableOpacity key={p.id} onPress={() => openPlace(p.id)} style={[styles.b1Chip, { backgroundColor: c.bg }]}>
                    <Text style={[styles.b1ChipText, { color: c.ink }]}>
                      {p.name}
                      {p.cap ? L('lodging.students', { v0: p.cap }) : ''}
                      {p.purpose ? ` · ${p.purpose}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>
      </View>
    ) : floor !== null ? (
      <View
        style={styles.floorCard}
        onLayout={(e) => {
          cardPos.current[`${view}|${floor}`] = e.nativeEvent.layout;
          tryFocus();
        }}
      >
        <Text style={styles.floorNote}>
          <Text style={{ fontWeight: '700', color: '#111827' }}>{floor}{L('lodging.f')}</Text> {L('lodging.fromTheMiddlePassageOf2')}
        </Text>
        <LodgingFloorGrid
          building={building}
          floor={floor}
          rooms={shownRooms}
          highlight={hits}
          mine={mine}
          selected={selectedRoom}
          onRoom={openRoom}
          onLayout={(e) => {
            gridPos.current[`${view}|${floor}`] = e.nativeEvent.layout;
            tryFocus();
          }}
        />
      </View>
    ) : view === 'b1' ? (
      <LodgingB1Map
        building={building}
        places={places}
        width={B1_WIDTH}
        selected={target?.kind === 'place' ? target.place.id : null}
        onPlace={openPlace}
      />
    ) : null;

  return (
    <View style={styles.container}>
      {/* 보기 고르기 */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.tabRow}>
          {tabs.map((t) => {
            const on = t.key === view;
            return (
              <TouchableOpacity key={t.key} onPress={() => setView(t.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {/* 판이 손가락을 다 받으므로 당겨서 새로고침 대신 단추 */}
        <TouchableOpacity onPress={() => refetch()} disabled={isFetching} hitSlop={10} style={styles.refresh}>
          {isFetching ? <ActivityIndicator size="small" color="#6b7280" /> : <Ionicons name="refresh" size={17} color="#6b7280" />}
        </TouchableOpacity>
      </View>

      {showTools && (
        <View style={styles.tools}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={L('lodging.searchNameRoom')}
            placeholderTextColor="#9ca3af"
            style={styles.search}
            clearButtonMode="while-editing"
            returnKeyType="search"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              if (hitList.length) goToHit(0);
            }}
          />
          {!!q &&
            (hitList.length > 1 ? (
              <View style={styles.hitNav}>
                <TouchableOpacity onPress={() => goToHit((Math.min(hitIdx, hitList.length - 1) - 1 + hitList.length) % hitList.length)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.hitText}>
                  {Math.min(hitIdx, hitList.length - 1) + 1}/{hitList.length}
                </Text>
                <TouchableOpacity onPress={() => goToHit((Math.min(hitIdx, hitList.length - 1) + 1) % hitList.length)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color="#374151" />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.hitText}>{hitList.length ? hitList[0] : L('task.none')}</Text>
            ))}
          {/* 그룹별·공항별 줄 보이기 — 꺼 두면 줄이 통째로 빠져 배치도가 넓어진다 */}
          {FILTER_KEYS.filter((k) => filterOptions[k].length > 0).map((k) => {
            const open = !rowClosed[k];
            const off = hidden[k].length;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => toggleRow(k)}
                hitSlop={4}
                style={[styles.rowPill, open && styles.rowPillOn]}
                accessibilityLabel={L('lodging.rowBy', { v0: LODGING_FILTER_LABEL[k], v1: open ? L('common.hide') : L('common.show') })}
              >
                <Ionicons name={open ? 'eye-outline' : 'eye-off-outline'} size={12} color={open ? '#fff' : '#6b7280'} />
                <Text style={[styles.rowPillText, open && styles.rowPillTextOn]}>{LODGING_FILTER_LABEL[k]}</Text>
                {off > 0 && <Text style={[styles.rowPillBadge, open && styles.rowPillBadgeOn]}>{off}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 그룹 줄·공항 줄 — 눈을 끄면 줄이 통째로 빠진다 (다시 켜기는 검색칸 옆 단추). 걸어 둔 필터는 그대로 */}
      {showTools &&
        FILTER_KEYS.filter((k) => filterOptions[k].length > 0 && !rowClosed[k]).map((k) => {
          const allOn = hidden[k].length === 0;
          return (
            <View key={k} style={styles.filterRow}>
              <TouchableOpacity
                onPress={() => toggleRow(k)}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
                style={styles.eyeBtn}
                accessibilityLabel={L('lodging.hideRowsBy', { v0: LODGING_FILTER_LABEL[k] })}
              >
                <Ionicons name="eye-outline" size={15} color="#4b5563" />
              </TouchableOpacity>
              <Text style={styles.rowLabel}>{LODGING_FILTER_LABEL[k]}{L('lodging.by')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipStrip} contentContainerStyle={styles.chipRow}>
                {/* 전체 — 다 켜져 있으면 다 끄고, 하나라도 꺼져 있으면 다 켠다 */}
                <TouchableOpacity
                  onPress={() => setHidden((h) => setAllLodgingHidden(h, k, filterOptions[k], allOn))}
                  style={[styles.allChip, allOn && styles.allChipOn]}
                >
                  <Text style={[styles.allChipText, allOn && styles.allChipTextOn]}>{L('lodging.all')}</Text>
                </TouchableOpacity>
                {filterOptions[k].map((o) => {
                  const off = hidden[k].includes(o.value);
                  return (
                    <TouchableOpacity
                      key={o.value || '_empty'}
                      onPress={() => setHidden((h) => toggleLodgingHidden(h, k, o.value))}
                      onLongPress={() => setHidden((h) => onlyLodgingValue(h, k, o.value, filterOptions[k]))}
                      delayLongPress={350}
                      style={[styles.valChip, off && styles.valChipOff]}
                    >
                      <Text style={[styles.valChipText, off && styles.valChipTextOff]}>
                        {o.label} <Text style={styles.valChipCount}>{o.count}</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

      {!isViewer && unknown.size > 0 && (
        <Text style={styles.warn} numberOfLines={2}>
          {L('lodging.studentsWhoseSheetRoomNumber')}{' '}
          {Array.from(unknown.entries())
            .map(([num, list]) => `${num || L('common.blankParen')} — ${list.map((s) => s.name).join(', ')}`)
            .join(' / ')}
        </Text>
      )}

      {isViewer ? (
        <View style={styles.viewerWrap}>
          <LodgingViewer key="3d" building={building} rooms={shownRooms} places={places} mode="3d" onRoom={openRoom} onPlace={openPlace} />
        </View>
      ) : (
        <>
          <PanZoomCanvas ref={canvasRef} key={view} initial={view === 'all' || view === 'b1' ? 'fitWidth' : 'start'}>
            {canvasContent}
          </PanZoomCanvas>
          {legend.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legendStrip} contentContainerStyle={styles.legendRow}>
              {legend.map((p) => {
                const c = lodgingPurposeColor(p);
                return (
                  <View key={p} style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: c.bg }]} />
                    <Text style={styles.legendText}>{p}</Text>
                  </View>
                );
              })}
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: '#dbeafe' }]} />
                <Text style={styles.legendText}>{L('lodging.mainAnnexPassage')}</Text>
              </View>
              {mine.size > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.legendMine]} />
                  <Text style={styles.legendText}>{L('lodging.myRoom')}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </>
      )}

      <LodgingRoomSheet
        target={target}
        isAdmin={!!isAdmin}
        isForeign={!!isForeign}
        columns={detailColumns}
        memberNames={data.memberNames}
        saving={saving}
        onClose={() => setTarget(null)}
        onStudent={openStudent}
        studentOf={studentOf}
        onSaveRoom={saveRoom}
        onSavePlace={savePlace}
      >
        {/* 방 시트 안에서 띄워야 누르자마자 뜬다 (iOS 는 모달 위에 바깥 모달을 못 올린다) */}
        {studentModal && data.campType && (
          <StudentDetailModal
            visible
            students={studentModal.list}
            initialIndex={studentModal.index}
            onClose={() => setStudentModal(null)}
            campType={data.campType}
            campCode={data.campCode}
          />
        )}
      </LodgingRoomSheet>
    </View>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  emptyBody: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  tabBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 6 },
  tabRow: { paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  tabOn: { backgroundColor: '#2563eb' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  tabTextOn: { color: '#fff' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  search: { flex: 1, minWidth: 110, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, backgroundColor: '#fff', color: '#111827' },
  hitText: { fontSize: 11, color: '#6b7280' },
  hitNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', paddingHorizontal: 7, paddingVertical: 4 },
  rowPillOn: { backgroundColor: '#111827', borderColor: '#111827' },
  rowPillText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  rowPillTextOn: { color: '#fff' },
  rowPillBadge: { fontSize: 10, fontWeight: '700', color: '#b45309', backgroundColor: '#fef3c7', borderRadius: 999, paddingHorizontal: 4, overflow: 'hidden' },
  rowPillBadgeOn: { color: '#111827', backgroundColor: '#fbbf24' },
  allChip: { borderRadius: 999, borderWidth: 1, borderColor: '#9ca3af', backgroundColor: '#fff', paddingHorizontal: 7, paddingVertical: 2 },
  allChipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  allChipText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  allChipTextOn: { color: '#fff' },
  hitRow: { paddingHorizontal: 12, gap: 6, paddingBottom: 4 },
  refresh: { width: 36, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingBottom: 4 },
  eyeBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { width: 38, fontSize: 11, fontWeight: '700', color: '#374151' },
  chipStrip: { flex: 1 },
  chipRow: { paddingRight: 12, gap: 4, alignItems: 'center' },
  valChip: { borderRadius: 999, backgroundColor: '#2563eb', paddingHorizontal: 8, paddingVertical: 3 },
  valChipOff: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 7, paddingVertical: 2 },
  valChipText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  valChipTextOff: { color: '#9ca3af', textDecorationLine: 'line-through' },
  valChipCount: { fontWeight: '400', opacity: 0.75 },
  stack: { gap: 8 },
  legendStrip: { flexGrow: 0, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  legendRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 12, alignItems: 'center' },
  hitChip: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  hitChipText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  viewerWrap: { flex: 1, padding: 8 },
  warn: { backgroundColor: '#fffbeb', color: '#92400e', fontSize: 11, paddingHorizontal: 12, paddingVertical: 6 },
  floorCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 8, gap: 6 },
  floorHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  floorTitle: { fontSize: 15, fontWeight: '800', color: '#4b5563' },
  floorCount: { fontSize: 10, color: '#9ca3af' },
  floorNote: { fontSize: 11, color: '#6b7280' },
  b1Chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: 320 },
  b1Chip: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  b1ChipText: { fontSize: 11, fontWeight: '600' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  legendText: { fontSize: 11, color: '#4b5563' },
  legendMine: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#10b981' },
});
