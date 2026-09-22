import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SectionList, Modal, Alert, KeyboardAvoidingView, Platform, Linking, Dimensions, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../config/firebase';
import { uriToBlob } from '../utils';
import { authenticatedFetch } from '../utils/apiClient';
import jobCodesService from '../services/jobCodesService';
import { stSheetService } from '../services/stSheet';
import {
  subscribeInventoryItems,
  subscribeInventoryStocks,
  subscribeInventoryGroups,
  subscribeInventoryMovements,
  subscribeSupplyRequests,
  addSupplyRequest,
  updateSupplyRequest,
  setSupplyRequestStatus,
  setSupplyBuyer,
  addSupplyComment,
  deleteSupplyComment,
  deleteSupplyRequest,
  summarizeSupplyRequests,
  isSupplyOpen,
  supplyStoreLabel,
  supplyForLabel,
  SUPPLY_STORES,
  SUPPLY_REQUEST_STATUS_LABELS,
  receiveSupplyRequest,
  addCampRequestsFromNeeds,
  needsStockIntake,
  uncoveredPurchaseNeeds,
  subscribeLostItems,
  addLostItem,
  updateLostItem,
  setLostItemStatus,
  addLostItemMedia,
  removeLostItemMedia,
  deleteLostItem,
  lostItemMediaPath,
  LOST_ITEM_STATUSES,
  LOST_ITEM_STATUS_LABELS,
  restock,
  adjustStockTo,
  getCampGroups,
  findGroupByClassCode,
  itemLabel,
  setGroupMinStock,
  buildInventoryViews,
  computePurchaseNeeds,
  getGroupStock,
  getMinStock,
  INVENTORY_CATEGORIES,
  INVENTORY_MOVEMENT_LABELS,
} from '@smis-mentor/shared';
import type {
  CampCode,
  InventoryItem,
  InventoryItemView,
  InventoryStock,
  InventoryGroup,
  InventoryMovement,
  InventoryCategory,
  PurchaseNeed,
  SupplyRequest,
  SupplyRequestLine,
  SupplyRequestStatus,
  SupplyStore,
  SupplyStoreSummary,
  SupplyForType,
  LostItem,
  LostItemMedia,
  LostItemStatus,
  CampGroup,
  STSheetStudent,
} from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'lost';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(ts: InventoryMovement['at'] | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 캠프 › 재고 (모바일) — 현황·검색·상세·내역, 관리자는 입고/조정/최소 수량. 품목·그룹·패키지 관리는 웹에서 */
export function InventoryScreen() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const userName = userData?.name ?? '';

  const activeJobCodeId = useMemo(() => {
    return isAdmin
      ? ((userData as unknown as Record<string, unknown>)?.adminTempActiveCamp as string | undefined) || userData?.activeJobExperienceId
      : userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  }, [userData, isAdmin]);

  const [campCode, setCampCode] = useState<CampCode | null>(null);
  useEffect(() => {
    if (!activeJobCodeId) return;
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then(codes => {
      if (codes.length > 0 && codes[0].code) setCampCode(codes[0].code as CampCode);
    }).catch(() => {});
  }, [activeJobCodeId]);

  // 캠프 그룹 · 학생 명단 — 분실물 이름표 알림 대상 계산
  const [campGroups, setCampGroups] = useState<CampGroup[]>([]);
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  useEffect(() => {
    if (!campCode) return;
    getCampGroups(db, campCode).then(setCampGroups).catch(() => {});
    stSheetService.getCachedData(campCode).then(s => setStudents((s ?? []) as STSheetStudent[])).catch(() => {});
  }, [campCode]);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stocks, setStocks] = useState<Record<string, InventoryStock>>({});
  const [groups, setGroups] = useState<InventoryGroup[]>([]);
  useEffect(() => subscribeInventoryItems(db, setItems), []);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeInventoryStocks(db, campCode, setStocks);
    const u2 = subscribeInventoryGroups(db, campCode, setGroups);
    return () => { u1(); u2(); };
  }, [campCode]);

  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  useEffect(() => { if (campCode) return subscribeSupplyRequests(db, campCode, setRequests); }, [campCode]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  useEffect(() => { if (campCode) return subscribeLostItems(db, campCode, setLostItems); }, [campCode]);
  const keptLostCount = useMemo(() => lostItems.filter(l => l.status === 'found').length, [lostItems]);

  const views = useMemo(() => buildInventoryViews(items, stocks, groups), [items, stocks, groups]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  const shortItems = useMemo(() => new Set(needs.map(n => n.itemId)), [needs]);
  // 탭 배지: 관리자는 새 요청 + 재고 입고 대기 + 아직 요청 안 된 재고 부족분, 그 외는 내가 올렸거나 사오기로 한 진행 중 요청
  const requestBadge = useMemo(() => isAdmin
    ? requests.filter(r => r.status === 'requested' || needsStockIntake(r)).length + uncoveredPurchaseNeeds(needs, requests).length
    : requests.filter(r => isSupplyOpen(r.status) && (r.requesterId === userData?.userId || r.buyerId === userData?.userId)).length,
  [requests, needs, isAdmin, userData?.userId]);

  const [subTab, setSubTab] = useState<SubTab>('stock');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => views.find(v => v.id === selectedId) ?? null, [views, selectedId]);

  // 목록 필터: 보유 중인 품목만(기본) · 부족만 · 전체
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const anyPlaced = useMemo(() => views.some(v => Object.keys(v.stocks).length > 0), [views]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (v.isActive === false) return false;
      if (category !== '전체' && v.category !== category) return false;
      // 검색어가 없으면 이 캠프에 둔 품목만, 검색하면 전체 품목에서 찾음
      if (!q && anyPlaced && Object.keys(v.stocks).length === 0) return false;
      if (!q && groupFilter && !(groupFilter in v.stocks)) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description, v.ingredient].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, anyPlaced, groupFilter]);

  const sections = useMemo(() => {
    const map = new Map<string, InventoryItemView[]>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return [...map.entries()].map(([title, data]) => ({ title, count: data.length, data }));
  }, [filtered]);
  // 열려 있는 분류만 목록에 표시 (닫힌 분류는 헤더도 숨김 — 버튼으로만 여닫음)
  const visibleSections = useMemo(() => sections.filter(sec => !collapsed[sec.title]), [sections, collapsed]);
  const allOpen = sections.every(sec => !collapsed[sec.title]);
  const toggleAll = () => setCollapsed(allOpen ? Object.fromEntries(sections.map(sec => [sec.title, true])) : {});

  if (!activeJobCodeId || !campCode) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cube-outline" size={40} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>{activeJobCodeId ? '캠프 정보를 불러오는 중...' : '활성 캠프를 선택해주세요.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 세부탭 */}
      <View style={styles.tabRow}>
        {([
          { id: 'stock' as SubTab, title: isForeign ? 'Stock' : '재고 현황', icon: 'cube-outline' as const },
          { id: 'request' as SubTab, title: isForeign ? 'Request' : '재고 요청', icon: 'clipboard-outline' as const, badge: requestBadge },
          { id: 'lost' as SubTab, title: isForeign ? 'Lost' : '분실물', icon: 'search-outline' as const, badge: keptLostCount },
        ]).map(tab => (
          <TouchableOpacity key={tab.id} onPress={() => setSubTab(tab.id)} style={styles.tabBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={tab.icon} size={14} color={subTab === tab.id ? '#047857' : '#6b7280'} />
              <Text style={[styles.tabText, subTab === tab.id && styles.tabTextActive]}>{tab.title}</Text>
              {!!tab.badge && <View style={styles.badge}><Text style={styles.badgeText}>{tab.badge}</Text></View>}
            </View>
            {subTab === tab.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'stock' ? (
        <View style={{ flex: 1 }}>
          {/* 고정 툴바: 검색 · 분류 · 범위/그룹 */}
          <View style={styles.toolbar}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={search} onChangeText={setSearch} placeholder="품목 · 종류 · 성분 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} returnKeyType="search" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {groups.length > 0 && (
                <TouchableOpacity onPress={() => setGroupFilter('')} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>모든 그룹</Text>
                </TouchableOpacity>
              )}
              {groups.map(g => (
                <TouchableOpacity key={g.id} onPress={() => setGroupFilter(groupFilter === g.id ? '' : g.id)} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {sections.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
                <TouchableOpacity onPress={toggleAll} style={styles.secAllBtn}>
                  <Ionicons name={allOpen ? 'contract-outline' : 'expand-outline'} size={12} color="#fff" />
                  <Text style={styles.secAllBtnText}>{allOpen ? '모두 접기' : '모두 펼치기'}</Text>
                </TouchableOpacity>
                {sections.map(sec => {
                  const open = !collapsed[sec.title];
                  return (
                    <TouchableOpacity key={sec.title} onPress={() => setCollapsed(c => ({ ...c, [sec.title]: open }))}
                      style={[styles.secBtn, open ? styles.secBtnOn : styles.secBtnOff]}>
                      <Text style={[styles.secBtnText, open ? { color: '#065f46' } : { color: '#9ca3af' }]}>
                        {sec.title.replace(/^(.+) · /, '')} <Text style={{ fontWeight: '400' }}>{sec.count}</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {groups.length === 0 && (
            <View style={[styles.notice, { marginHorizontal: 12, marginTop: 8 }]}><Text style={styles.noticeText}>이 캠프에 재고 그룹이 아직 없습니다. 관리자가 웹 재고 탭 › 관리에서 그룹을 만들면 수량이 표시됩니다.</Text></View>
          )}

          <SectionList
            sections={visibleSections}
            keyExtractor={v => v.id}
            stickySectionHeadersEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={30}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              sections.length > 0 && visibleSections.length === 0 ? (
                <View style={styles.centered}>
                  <Text style={styles.emptyBody}>모든 분류가 접혀 있습니다.</Text>
                  <TouchableOpacity onPress={() => setCollapsed({})} style={{ marginTop: 6 }}><Text style={{ fontSize: 12, color: '#047857', fontWeight: '600' }}>모두 펼치기</Text></TouchableOpacity>
                </View>
              ) : views.length === 0 ? (
                <View style={styles.centered}>
                  <Ionicons name="cube-outline" size={36} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>등록된 품목이 없습니다.</Text>
                </View>
              ) : (
                <View style={styles.centered}>
                  <Text style={styles.emptyBody}>{search ? '검색 결과가 없습니다.' : '이 캠프에 둔 품목이 없습니다. 검색하면 전체 품목에서 찾습니다.'}</Text>
                </View>
              )
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                <Text style={styles.sectionHeaderCount}>{section.count}</Text>
              </View>
            )}
            renderItem={({ item: v, index, section }) => (
              <StockRowMobile view={v} groups={groups} focusGroupId={groupFilter}
                isShort={shortItems.has(v.id)} isLast={index === section.data.length - 1}
                onPress={() => setSelectedId(v.id)} />
            )}
          />
        </View>
      ) : subTab === 'request' ? (
        <SupplyRequestTabMobile campCode={campCode} requests={requests} items={items} views={views} groups={groups} needs={needs} students={students} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      ) : (
        <LostListMobile campCode={campCode} jobCodeId={activeJobCodeId ?? ''} students={students} campGroups={campGroups} lostItems={lostItems} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      )}

      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelectedId(null)}>
        {selected && (
          <ItemDetailMobile view={selected} groups={groups} campCode={campCode} isAdmin={isAdmin} userName={userName} onClose={() => setSelectedId(null)} />
        )}
      </Modal>
    </View>
  );
}

// ==================== 재고 행 (컴팩트) ====================

/** 한 줄 요약: 이름·종류 | 그룹별 수량(있는 그룹만) | 총량. 그룹을 고르면 그 그룹 수량을 크게 */
const StockRowMobile = React.memo(function StockRowMobile({ view: v, groups, focusGroupId, isShort, isLast, onPress }: {
  view: InventoryItemView; groups: InventoryGroup[]; focusGroupId: string; isShort: boolean; isLast: boolean; onPress: () => void;
}) {
  const parts = groups
    .map(g => {
      const n = getGroupStock(v, g.id);
      const min = getMinStock(v, g.id);
      return { g, n, low: n < 0 || (min > 0 && n < min), placed: g.id in v.stocks };
    })
    .filter(x => x.placed || x.low);
  const focus = focusGroupId ? parts.find(x => x.g.id === focusGroupId) ?? { g: groups.find(g => g.id === focusGroupId)!, n: getGroupStock(v, focusGroupId), low: false, placed: false } : null;
  const negative = parts.some(x => x.n < 0);
  const big = focus ? focus.n : v.total;
  const bigLow = focus ? focus.low : isShort;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.row, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {v.name}
          {v.kind || v.spec ? <Text style={styles.rowMeta}>  {[v.kind, v.spec].filter(Boolean).join(' · ')}</Text> : null}
        </Text>
        <Text style={styles.rowGroups} numberOfLines={1}>
          {parts.length === 0 ? <Text style={{ color: '#d1d5db' }}>재고 없음</Text> : parts.map((x, i) => (
            <Text key={x.g.id} style={x.low ? styles.rowGroupLow : x.g.id === focusGroupId ? styles.rowGroupFocus : undefined}>
              {i > 0 ? '  ' : ''}{x.g.name} {x.n}
            </Text>
          ))}
        </Text>
      </View>
      {negative && <View style={styles.badgeWarn}><Text style={styles.badgeWarnText}>실사</Text></View>}
      {!negative && bigLow && <View style={styles.badgeLow}><Text style={styles.badgeLowText}>부족</Text></View>}
      <View style={{ alignItems: 'flex-end', minWidth: 44 }}>
        <Text style={[styles.rowTotal, bigLow && { color: '#dc2626' }]}>{big}<Text style={styles.rowUnit}>{v.unit}</Text></Text>
        {focus ? <Text style={styles.rowTotalSub}>총 {v.total}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

// ==================== 📝 재고 요청 (멘토 구매 요청 · 모두 공유) ====================

type SupplyFilter = 'open' | 'mine' | 'done';
type SupplyEditing = { mode: 'new'; prefill?: SupplyRequest } | { mode: 'edit'; req: SupplyRequest };

function addDaysStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtHoldDate(s?: string): string {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}
function supplyStatusLine(r: SupplyRequest): string {
  if (r.status === 'onhold') return `⏸ 보류${r.holdUntil ? ` · ${fmtHoldDate(r.holdUntil)} 구매 예정` : ''}${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'rejected') return `반려${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'purchased') return `구매 완료${r.handledBy ? ` · ${r.handledBy}` : ''}${r.forType === 'camp' ? (r.stockApplied ? ' · 재고 입고됨' : needsStockIntake(r) ? ' · 📥 재고 입고 대기' : '') : ''}`;
  return r.buyerName ? `🙋 ${r.buyerName} 쌤이 사올 예정` : '';
}
const failAlert = () => Alert.alert('오류', '처리하지 못했습니다. 권한을 확인해주세요.');

function SupplyRequestTabMobile({ campCode, requests, items, views, groups, needs, students, isAdmin, userId, userName }: {
  campCode: string; requests: SupplyRequest[]; items: InventoryItem[]; views: InventoryItemView[]; groups: InventoryGroup[]; needs: PurchaseNeed[];
  students: STSheetStudent[]; isAdmin: boolean; userId: string; userName: string;
}) {
  // 재고 부족분 중 아직 캠프 공용 요청에 안 올라간 것 · 구매했지만 재고 입고 전인 캠프 공용 요청
  const shortage = useMemo(() => uncoveredPurchaseNeeds(needs, requests), [needs, requests]);
  const intakeWaiting = useMemo(() => requests.filter(needsStockIntake), [requests]);
  const [showNeeds, setShowNeeds] = useState(false);
  const [posting, setPosting] = useState(false);
  const postNeeds = async () => {
    if (posting || shortage.length === 0) return;
    setPosting(true);
    try {
      const n = await addCampRequestsFromNeeds(db, campCode, shortage, items, { uid: userId, name: userName });
      Alert.alert('요청 등록', `캠프 공용 요청 ${n}건(구매처별)으로 올렸습니다. 필요하면 열어서 수량·구매처를 고치세요.`);
    } catch (e) { console.error(e); Alert.alert('오류', '요청을 만들지 못했습니다.'); }
    finally { setPosting(false); }
  };
  const [filter, setFilter] = useState<SupplyFilter>('open');
  const [byStore, setByStore] = useState(false);
  const [editing, setEditing] = useState<SupplyEditing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = requests.find(r => r.id === openId) ?? null;

  const open = useMemo(() => requests.filter(r => isSupplyOpen(r.status)), [requests]);
  const pending = useMemo(() => open.filter(r => r.status === 'requested'), [open]);
  const mine = useMemo(() => requests.filter(r => r.requesterId === userId), [requests, userId]);
  const list = filter === 'open' ? open : filter === 'mine' ? mine : requests.filter(r => !isSupplyOpen(r.status));
  const storeSummary = useMemo(() => summarizeSupplyRequests(pending), [pending]);
  const onholdCount = open.length - pending.length;

  const shareStore = (g: SupplyStoreSummary) => {
    Share.share({ message: `[${g.store} 장보기]\n${g.lines.map(l => `• ${l.name} ${l.total}${l.unit}  (${l.who.join(', ')})`).join('\n')}` });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => setEditing({ mode: 'new' })} style={styles.primaryBtn}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>필요한 물품 요청하기</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {([['open', `진행 중 ${open.length}`], ['mine', `내 요청 ${mine.length}`], ['done', '완료·반려']] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.miniChip, filter === id && styles.miniChipDark]}>
              <Text style={[styles.miniChipText, filter === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
          {filter === 'open' && pending.length > 0 && (
            <TouchableOpacity onPress={() => setByStore(v => !v)} style={[styles.miniChip, { marginLeft: 'auto' }, byStore && styles.miniChipAmber]}>
              <Text style={[styles.miniChipText, byStore && { color: '#92400e' }]}>🛍 장보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>
        {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350f' }}>📥 구매했지만 재고 입고 전 {intakeWaiting.length}건</Text>
            {intakeWaiting.map(r => (
              <TouchableOpacity key={r.id} onPress={() => setOpenId(r.id)}>
                <Text style={{ fontSize: 11, color: '#78350f' }} numberOfLines={1}>{STORE_ICON[r.store] ?? '📦'} {r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ')} <Text style={{ color: '#b45309', fontWeight: '700' }}>→ 입고</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {isAdmin && filter === 'open' && shortage.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#991b1b' }}>📉 최소 수량 미만 {shortage.length}건 <Text style={{ fontWeight: '400', color: '#dc2626' }}>· 아직 요청 안 됨</Text></Text>
            {showNeeds && shortage.map(n => (
              <Text key={`${n.itemId}|${n.groupId}`} style={{ fontSize: 11, color: '#374151' }}><Text style={{ fontWeight: '700' }}>{n.itemName}</Text> · {n.groupName} {n.current}/{n.min} → <Text style={{ fontWeight: '700', color: '#dc2626' }}>{n.shortage}{n.unit}</Text></Text>
            ))}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => setShowNeeds(v => !v)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', paddingVertical: 7 }]}>
                <Text style={{ fontSize: 11, color: '#b91c1c' }}>{showNeeds ? '접기' : '목록 보기'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={postNeeds} disabled={posting} style={[styles.btn, { backgroundColor: '#ef4444', paddingVertical: 7, opacity: posting ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{posting ? '올리는 중...' : '요청으로 올리기'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 10, color: '#ef4444' }}>의약품은 약국, 나머지는 다이소로 나눠 '캠프 공용' 요청이 만들어지고, 구매 완료 후 입고하면 재고에 반영됩니다.</Text>
          </View>
        )}
        {filter === 'open' && byStore ? (
          <>
            {storeSummary.map(g => {
              const reqs = pending.filter(r => g.requestIds.includes(r.id));
              const unclaimed = reqs.filter(r => !r.buyerId).map(r => r.id);
              const buyers = [...new Set(reqs.map(r => r.buyerName).filter(Boolean))] as string[];
              const completable = reqs.filter(r => isAdmin || r.buyerId === userId).map(r => r.id);
              return (
                <View key={g.store} style={styles.listBox}>
                  <View style={{ backgroundColor: '#fffbeb', paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.blockTitle, { flex: 1 }]}>{STORE_ICON[g.store] ?? '📦'} {g.store} <Text style={{ fontSize: 11, fontWeight: '400', color: '#92400e' }}>{g.requestIds.length}건 · {g.lines.length}품목</Text></Text>
                      <TouchableOpacity onPress={() => shareStore(g)} style={styles.actBtn}><Text style={styles.actBtnText}>공유</Text></TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 11, color: '#4b5563' }}>{buyers.length ? `🙋 사올 사람: ${buyers.join(', ')}` : '아직 사오기로 한 사람이 없어요'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {unclaimed.length > 0 && (
                        <TouchableOpacity onPress={() => setSupplyBuyer(db, unclaimed, { uid: userId, name: userName }).catch(failAlert)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fcd34d', paddingVertical: 7 }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>🙋 제가 사올게요 ({unclaimed.length})</Text>
                        </TouchableOpacity>
                      )}
                      {completable.length > 0 && (
                        <TouchableOpacity onPress={() => Alert.alert(`${g.store} 구매 완료`, `${completable.length}건을 구매 완료로 처리할까요?`, [
                          { text: '취소', style: 'cancel' },
                          { text: '구매 완료', onPress: () => setSupplyRequestStatus(db, completable, 'purchased', userName).catch(failAlert) },
                        ])} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 7 }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>✓ 구매 완료 ({completable.length})</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {g.lines.map((l, i) => {
                    const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
                    return (
                      <View key={l.key} style={[styles.row, i === g.lines.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
                          <Text style={styles.rowGroups} numberOfLines={2}>{l.who.join(' · ')}{isAdmin && stock ? `  ·  재고 ${stock.total}${stock.unit}` : ''}</Text>
                        </View>
                        <Text style={[styles.rowTotal, { color: '#b45309', fontSize: 15 }]}>{l.total}<Text style={styles.rowUnit}>{l.unit}</Text></Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
            {onholdCount > 0 && <Text style={{ fontSize: 10, color: '#9ca3af' }}>⏸ 보류 중인 요청 {onholdCount}건은 장보기 목록에서 빠져 있습니다.</Text>}
          </>
        ) : list.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="clipboard-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{filter === 'mine' ? '올린 요청이 없습니다.' : filter === 'open' ? '진행 중인 요청이 없습니다.' : '완료된 요청이 없습니다.'}</Text>
            {filter !== 'done' && <Text style={styles.emptyBody}>학생이나 본인에게 필요한 물품을 위 버튼으로 요청하세요.</Text>}
          </View>
        ) : (
          <>
            {filter === 'open' && <Text style={{ fontSize: 10, color: '#9ca3af' }}>다른 선생님 요청도 함께 보여요. 같은 게 필요하면 '나도 필요해요', 사러 갈 땐 '제가 사올게요'.</Text>}
            <View style={styles.listBox}>
              {list.map((r, i) => <SupplyRowMobile key={r.id} req={r} isLast={i === list.length - 1} onPress={() => setOpenId(r.id)} />)}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SupplyRequestFormMobile campCode={campCode} existing={editing.mode === 'edit' ? editing.req : undefined} prefill={editing.mode === 'new' ? editing.prefill : undefined}
            groups={groups} items={items} views={views} students={students} userId={userId} userName={userName} onClose={() => setEditing(null)} />
        )}
      </Modal>
      <Modal visible={!!opened && !editing} transparent animationType="fade" onRequestClose={() => setOpenId(null)}>
        {opened && (
          <SupplyRequestDetailMobile req={opened} campCode={campCode} groups={groups} views={views} isAdmin={isAdmin} userId={userId} userName={userName}
            onEdit={() => setEditing({ mode: 'edit', req: opened })}
            onMetoo={() => { setEditing({ mode: 'new', prefill: opened }); setOpenId(null); }}
            onClose={() => setOpenId(null)} />
        )}
      </Modal>
    </View>
  );
}

const SUPPLY_STATUS_COLOR: Record<SupplyRequestStatus, { bg: string; fg: string }> = {
  requested: { bg: '#dbeafe', fg: '#1d4ed8' },
  onhold: { bg: '#fef3c7', fg: '#92400e' },
  purchased: { bg: '#d1fae5', fg: '#047857' },
  rejected: { bg: '#f3f4f6', fg: '#6b7280' },
};
const STORE_ICON: Record<string, string> = { 다이소: '🛍', 약국: '💊', 마트: '🛒', 기타: '📦' };

function SupplyRowMobile({ req: r, isLast, onPress }: { req: SupplyRequest; isLast: boolean; onPress: () => void }) {
  const c = SUPPLY_STATUS_COLOR[r.status];
  const what = r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ');
  const status = supplyStatusLine(r);
  const last = r.comments?.[r.comments.length - 1];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.row, isLast && { borderBottomWidth: 0 }, { alignItems: 'flex-start' }]}>
      <Text style={{ fontSize: 18, marginTop: 1 }}>{STORE_ICON[r.store] ?? '📦'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={styles.rowName} numberOfLines={1}>{supplyForLabel(r)}</Text>
          <Text style={styles.rowMeta}>{supplyStoreLabel(r)}</Text>
        </View>
        <Text style={[styles.rowGroups, { color: '#374151' }]} numberOfLines={2}>{what || '물품 없음'}</Text>
        {status ? <Text style={[styles.rowGroups, { fontSize: 10, color: r.status === 'onhold' ? '#b45309' : r.buyerName && isSupplyOpen(r.status) ? '#047857' : '#6b7280' }]} numberOfLines={1}>{status}</Text> : null}
        {last ? <Text style={[styles.rowGroups, { fontSize: 10 }]} numberOfLines={1}>💬 {r.comments!.length} · <Text style={{ fontWeight: '700', color: last.admin ? '#4338ca' : '#374151' }}>{last.name}</Text> {last.text}</Text> : null}
        <Text style={[styles.rowGroups, { fontSize: 10 }]}>{r.requesterName} · {fmtDateTime(r.createdAt)}</Text>
      </View>
      <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: c.fg }}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** 요청 올리기 / 수정 / 나도 필요해요 — 누가 · 어디서 · 무엇 */
function SupplyRequestFormMobile({ campCode, existing, prefill, groups, items, views, students, userId, userName, onClose }: {
  campCode: string; existing?: SupplyRequest; prefill?: SupplyRequest; groups: InventoryGroup[]; items: InventoryItem[]; views: InventoryItemView[]; students: STSheetStudent[];
  userId: string; userName: string; onClose: () => void;
}) {
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const base = existing ?? prefill;
  const [forType, setForType] = useState<SupplyForType>(existing?.forType ?? (prefill?.forType === 'camp' ? 'camp' : 'student'));
  const defaultGroup = groups[0];
  const [student, setStudent] = useState<{ id?: string; name: string; cls?: string } | null>(
    existing?.studentName ? { id: existing.studentId, name: existing.studentName, cls: existing.studentClass } : null);
  const [studentQuery, setStudentQuery] = useState('');
  const [store, setStore] = useState<SupplyStore>(base?.store ?? '다이소');
  const [storeEtc, setStoreEtc] = useState(base?.storeEtc ?? '');
  const [lines, setLines] = useState<SupplyRequestLine[]>(
    existing?.items ?? (prefill ? prefill.items.map(l => ({ ...l, id: newId(), quantity: 1, memo: undefined })) : []));
  const [q, setQ] = useState('');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const UNITS = ['개', '박스', '통', '팩', '병', '세트'];

  const studentResults = useMemo(() => {
    const t = studentQuery.trim();
    return t ? students.filter(s => s.name.includes(t)).slice(0, 6) : [];
  }, [students, studentQuery]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return items.filter(i => i.isActive !== false && [i.name, i.kind, i.spec, i.ingredient, i.subCategory].some(f => f?.toLowerCase().includes(t))).slice(0, 12);
  }, [items, q]);
  const addItem = (i: InventoryItem) => {
    const had = lines.find(l => l.itemId === i.id);
    if (had) setLines(ls => ls.map(l => l.id === had.id ? { ...l, quantity: l.quantity + 1 } : l));
    else setLines(ls => [...ls, { id: newId(), itemId: i.id, name: itemLabel(i), quantity: 1, unit: i.unit, groupId: defaultGroup?.id, groupName: defaultGroup?.name }]);
    setQ(''); // 고르면 검색 목록 닫기
  };
  const upd = (id: string, patch: Partial<SupplyRequestLine>) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));

  const submit = async () => {
    if (forType === 'student' && !student) { Alert.alert('확인 필요', '어떤 학생을 위한 물품인지 선택해주세요.'); return; }
    if (store === '기타' && !storeEtc.trim()) { Alert.alert('확인 필요', '구매처를 입력해주세요.'); return; }
    if (lines.length === 0) { Alert.alert('확인 필요', '필요한 물품을 하나 이상 담아주세요.'); return; }
    setBusy(true);
    try {
      const payload = {
        forType,
        studentId: forType === 'student' ? student?.id : undefined,
        studentName: forType === 'student' ? student?.name : undefined,
        studentClass: forType === 'student' ? student?.cls : undefined,
        store, storeEtc: store === '기타' ? storeEtc.trim() : undefined,
        // 캠프 공용만 입고 그룹을 가진다
        items: lines.map(l => forType === 'camp' && l.itemId
          ? { ...l, groupId: l.groupId ?? defaultGroup?.id, groupName: l.groupName ?? defaultGroup?.name }
          : { ...l, groupId: undefined, groupName: undefined }),
        note,
      };
      if (existing) await updateSupplyRequest(db, existing.id, payload);
      else await addSupplyRequest(db, { campCode, requesterId: userId, requesterName: userName, ...payload });
      onClose();
    } catch (e) { console.error('구매 요청 저장 오류:', e); Alert.alert('오류', '요청을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>{existing ? '요청 수정' : prefill ? '🙋 나도 필요해요' : '📝 필요한 물품 요청'}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          {prefill ? <Text style={{ fontSize: 11, color: '#6b7280', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8 }}>{supplyForLabel(prefill)} 요청과 같은 구매처·물품을 담았어요. 누구 것인지와 수량만 바꿔 올리면 장보기 목록에 합쳐집니다.</Text> : null}
          {/* 누가 */}
          <View>
            <Text style={styles.formLabel}>① 누가 필요한가요?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([['student', '👧 학생'], ['mentor', '🧑‍🏫 멘토(나)'], ['camp', '🏕 캠프 공용']] as const).map(([id, label]) => (
                <TouchableOpacity key={id} onPress={() => setForType(id)} style={[styles.segBtn, forType === id && styles.segBtnOn]}>
                  <Text style={[styles.segBtnText, forType === id && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {forType === 'camp' && <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>상비약·소모품처럼 캠프 재고로 쓰는 물건. 재고 품목을 검색해 담고 넣을 그룹을 고르면, 구매 후 관리자가 입고할 때 재고에 반영됩니다.</Text>}
            {forType === 'student' && (student ? (
              <View style={[styles.pickedBox, { marginTop: 6 }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a8a', flex: 1 }}>{student.name}{student.cls ? <Text style={{ fontWeight: '400', color: '#3b82f6' }}>  {student.cls}</Text> : null}</Text>
                <TouchableOpacity onPress={() => setStudent(null)}><Text style={{ fontSize: 12, color: '#6b7280' }}>변경</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 6, gap: 4 }}>
                <TextInput value={studentQuery} onChangeText={setStudentQuery} placeholder="학생 이름 검색" placeholderTextColor="#9ca3af" style={styles.input} />
                {studentResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className }); setStudentQuery(''); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                    <Text style={{ fontSize: 12, color: '#111827' }}>{s.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{s.className}{s.classMentor ? ` · 담임 ${s.classMentor}` : ''}</Text></Text>
                  </TouchableOpacity>
                ))}
                {studentQuery.trim() !== '' && studentResults.length === 0 && (
                  <TouchableOpacity onPress={() => { setStudent({ name: studentQuery.trim() }); setStudentQuery(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Text style={{ fontSize: 12, color: '#374151' }}>명단에 없으면 <Text style={{ fontWeight: '700' }}>"{studentQuery.trim()}"</Text>로 입력</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* 어디서 */}
          <View>
            <Text style={styles.formLabel}>② 어디서 사야 하나요?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SUPPLY_STORES.map(s => (
                <TouchableOpacity key={s} onPress={() => setStore(s)} style={[styles.segBtn, store === s && styles.segBtnOn]}>
                  <Text style={[styles.segBtnText, store === s && { color: '#fff' }]}>{STORE_ICON[s]} {s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {store === '기타' && <TextInput value={storeEtc} onChangeText={setStoreEtc} placeholder="구매처 (예: 편의점, 쿠팡)" placeholderTextColor="#9ca3af" style={[styles.input, { marginTop: 6 }]} />}
          </View>

          {/* 무엇 */}
          <View style={{ gap: 6 }}>
            <Text style={styles.formLabel}>③ 무엇이 필요한가요? <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{lines.length}개 담음</Text></Text>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={q} onChangeText={setQ} placeholder="물품 검색 (예: 밴드, 치약, 보드마카)" placeholderTextColor="#9ca3af" style={styles.searchInput} />
              {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>
            {q.trim() !== '' && (
              <View style={[styles.listBox, { borderColor: '#d1fae5' }]}>
                {results.map((i, idx) => {
                  const had = lines.find(l => l.itemId === i.id);
                  const stock = views.find(v => v.id === i.id);
                  return (
                    <TouchableOpacity key={i.id} onPress={() => addItem(i)} activeOpacity={0.6} style={[styles.row, idx === results.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{i.name}{i.kind || i.spec ? <Text style={styles.rowMeta}>  {[i.kind, i.spec].filter(Boolean).join(' · ')}</Text> : null}</Text>
                        {stock && stock.total > 0 ? <Text style={styles.rowGroups}>캠프 재고 {stock.total}{stock.unit} 있음</Text> : null}
                      </View>
                      {had ? <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>{had.quantity} +1</Text> : <Ionicons name="add-circle" size={22} color="#059669" />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => { setLines(ls => [...ls, { id: newId(), name: q.trim(), quantity: 1, unit: '개' }]); setQ(''); }}
                  style={[styles.row, { borderBottomWidth: 0, backgroundColor: '#f9fafb' }]}>
                  <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}><Text style={{ fontWeight: '700' }}>"{q.trim()}"</Text> 직접 추가</Text>
                  <Ionicons name="create-outline" size={18} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {lines.length > 0 && (
              <View style={styles.listBox}>
                {lines.map((l, idx) => (
                  <View key={l.id} style={[{ paddingHorizontal: 10, paddingVertical: 7, gap: 5 }, idx < lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{l.name}</Text>
                      <TouchableOpacity onPress={() => upd(l.id, { quantity: Math.max(1, l.quantity - 1) })} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>−</Text></TouchableOpacity>
                      <Text style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: '800' }}>{l.quantity}</Text>
                      <TouchableOpacity onPress={() => upd(l.id, { quantity: l.quantity + 1 })} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => setLines(ls => ls.filter(x => x.id !== l.id))} style={{ paddingLeft: 2 }}><Ionicons name="trash-outline" size={16} color="#9ca3af" /></TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                      {[...new Set([l.unit, ...UNITS])].map(u => (
                        <TouchableOpacity key={u} onPress={() => upd(l.id, { unit: u })} style={[styles.miniChip, l.unit === u && styles.miniChipAmber]}>
                          <Text style={[styles.miniChipText, l.unit === u && { color: '#92400e' }]}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TextInput value={l.memo ?? ''} onChangeText={v => upd(l.id, { memo: v || undefined })} placeholder="메모 (색상·사이즈 등)" placeholderTextColor="#9ca3af" style={[styles.input, { paddingVertical: 4, fontSize: 11 }]} />
                    {forType === 'camp' && (l.itemId ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, color: '#6b7280' }}>입고 그룹</Text>
                        {groups.map(g => {
                          const on = (l.groupId ?? defaultGroup?.id) === g.id;
                          return (
                            <TouchableOpacity key={g.id} onPress={() => upd(l.id, { groupId: g.id, groupName: g.name })} style={[styles.miniChip, on && { backgroundColor: '#d1fae5' }]}>
                              <Text style={[styles.miniChipText, on && { color: '#065f46' }]}>{g.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    ) : <Text style={{ fontSize: 10, color: '#9ca3af' }}>재고 품목이 아니라 입고되지 않아요</Text>)}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View>
            <Text style={styles.formLabel}>메모 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(선택)</Text></Text>
            <TextInput value={note} onChangeText={setNote} multiline placeholder="예: 오늘 저녁까지 필요해요, 학생 개인 비용" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 44 }]} />
          </View>

          <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? '저장 중...' : existing ? '수정 저장' : '요청 올리기'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function SupplyRequestDetailMobile({ req: r, campCode, groups, views, isAdmin, userId, userName, onEdit, onMetoo, onClose }: {
  req: SupplyRequest; campCode: string; groups: InventoryGroup[]; views: InventoryItemView[]; isAdmin: boolean; userId: string; userName: string;
  onEdit: () => void; onMetoo: () => void; onClose: () => void;
}) {
  const mine = r.requesterId === userId;
  const isOpen = isSupplyOpen(r.status);
  const iAmBuyer = r.buyerId === userId;
  const [mode, setMode] = useState<'none' | 'reject' | 'hold'>('none');
  const isCamp = r.forType === 'camp';
  const canIntake = isAdmin && isCamp && !r.stockApplied && r.status !== 'rejected';
  const [intake, setIntake] = useState(false);
  const [intakeLines, setIntakeLines] = useState(() => r.items.filter(l => l.itemId).map(l => ({
    lineId: l.id, itemId: l.itemId!, itemName: l.name,
    groupId: l.groupId ?? groups[0]?.id ?? '', quantity: String(l.quantity),
  })));
  const [reason, setReason] = useState('');
  const [holdUntil, setHoldUntil] = useState(addDaysStr(7));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const c = SUPPLY_STATUS_COLOR[r.status];
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); failAlert(); } finally { setBusy(false); }
  };
  const act = (status: SupplyRequestStatus, opts?: { note?: string; holdUntil?: string }) =>
    run(async () => { await setSupplyRequestStatus(db, [r.id], status, userName, opts); setMode('none'); setReason(''); });
  const send = () => run(async () => { await addSupplyComment(db, r.id, { uid: userId, name: userName, text: comment, admin: isAdmin }); setComment(''); });
  const doIntake = () => run(async () => {
    const lines = intakeLines.map(l => ({
      itemId: l.itemId, itemName: l.itemName, groupId: l.groupId,
      groupName: groups.find(g => g.id === l.groupId)?.name ?? '', quantity: Math.max(0, parseInt(l.quantity, 10) || 0),
    }));
    if (lines.some(l => !l.groupId)) { Alert.alert('확인 필요', '입고할 그룹을 골라주세요.'); return; }
    await receiveSupplyRequest(db, campCode, r.id, lines, userName);
    setIntake(false);
  });
  const purchase = () => (isCamp && isAdmin ? setIntake(true) : act('purchased'));
  const remove = () => Alert.alert('요청 취소', '이 요청을 취소할까요?', [
    { text: '아니요', style: 'cancel' },
    { text: '취소하기', style: 'destructive', onPress: () => run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }) },
  ]);
  const status = supplyStatusLine(r);
  const HOLD_CHIPS: Array<[string, string]> = [['내일', addDaysStr(1)], ['3일 뒤', addDaysStr(3)], ['1주 뒤', addDaysStr(7)], ['2주 뒤', addDaysStr(14)], ['미정', '']];

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.fg }}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</Text></View>
              <Text style={styles.modalTitle}>{STORE_ICON[r.store]} {supplyStoreLabel(r)}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.requesterName} · {fmtDateTime(r.createdAt)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={styles.pickedBox}>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>누구</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e3a8a', flex: 1 }}>{r.forType === 'student' ? '👧 ' : '🧑‍🏫 '}{supplyForLabel(r)}</Text>
          </View>
          <View style={styles.listBox}>
            {r.items.map((l, i) => {
              const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
              return (
                <View key={l.id} style={[styles.row, i === r.items.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{l.name}{isCamp && l.groupName ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#047857' }}>  → {l.groupName}</Text> : null}</Text>
                    {(l.memo || (isAdmin && stock)) ? <Text style={styles.rowGroups} numberOfLines={2}>{[l.memo, isAdmin && stock ? `캠프 재고 ${stock.total}${stock.unit}` : ''].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                  <Text style={[styles.rowTotal, { color: '#b45309', fontSize: 15 }]}>{l.quantity}<Text style={styles.rowUnit}>{l.unit}</Text></Text>
                </View>
              );
            })}
          </View>
          {r.note ? <Text style={{ fontSize: 12, color: '#374151', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 }}>📝 {r.note}</Text> : null}
          {(!isOpen || r.status === 'onhold') && (
            <Text style={{ fontSize: 11, color: r.status === 'onhold' ? '#92400e' : '#4b5563', backgroundColor: r.status === 'onhold' ? '#fffbeb' : '#f9fafb', borderRadius: 8, padding: 8 }}>
              {status}{r.handledBy && r.status !== 'purchased' ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}
            </Text>
          )}

          {/* 사오기 */}
          {isOpen && (r.buyerId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ecfdf5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#065f46' }}>🙋 {iAmBuyer ? '제가' : `${r.buyerName} 쌤이`} 사오기로 했어요</Text>
              {iAmBuyer && <TouchableOpacity onPress={() => run(() => setSupplyBuyer(db, [r.id], null))}><Text style={{ fontSize: 11, color: '#6b7280' }}>취소</Text></TouchableOpacity>}
              {(iAmBuyer || isAdmin) && (
                <TouchableOpacity onPress={purchase} disabled={busy} style={{ backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>✓ 사왔어요</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity onPress={() => run(() => setSupplyBuyer(db, [r.id], { uid: userId, name: userName }))} disabled={busy}
              style={[styles.btn, { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', flex: 0 }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>🙋 제가 사올게요</Text>
            </TouchableOpacity>
          ))}
          {isOpen && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {!mine && <TouchableOpacity onPress={onMetoo} style={[styles.btn, { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>🙋 나도 필요해요</Text></TouchableOpacity>}
              {mine && <TouchableOpacity onPress={onEdit} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>수정</Text></TouchableOpacity>}
              {mine && <TouchableOpacity onPress={remove} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>요청 취소</Text></TouchableOpacity>}
            </View>
          )}

          {/* 캠프 공용 → 재고 입고 */}
          {canIntake && (intake ? (
            <View style={{ borderWidth: 1, borderColor: '#6ee7b7', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 9, gap: 7 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#065f46' }}>📥 재고 입고 — 실제로 산 수량(낱개)과 넣을 그룹을 확인하세요</Text>
              {intakeLines.map((l, idx) => (
                <View key={l.lineId} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{l.itemName}</Text>
                    <TextInput value={l.quantity} keyboardType="number-pad" onChangeText={v => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, quantity: v } : x))}
                      style={[styles.input, { width: 64, textAlign: 'right', backgroundColor: '#fff', paddingVertical: 4 }]} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                    {groups.map(g => (
                      <TouchableOpacity key={g.id} onPress={() => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, groupId: g.id } : x))} style={[styles.miniChip, l.groupId === g.id && { backgroundColor: '#a7f3d0' }]}>
                        <Text style={[styles.miniChipText, l.groupId === g.id && { color: '#065f46' }]}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}
              {r.items.some(l => !l.itemId) && <Text style={{ fontSize: 10, color: '#6b7280' }}>재고 품목이 아닌 {r.items.filter(l => !l.itemId).map(l => l.name).join(', ')}은(는) 입고하지 않아요.</Text>}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setIntake(false)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={doIntake} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 7, flex: 2, opacity: busy ? 0.5 : 1 }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{r.status === 'purchased' ? '재고에 입고' : '구매 완료 + 재고 입고'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : r.status === 'purchased' ? (
            <TouchableOpacity onPress={() => setIntake(true)} style={[styles.btn, { backgroundColor: '#f59e0b', flex: 0 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>📥 재고에 입고하기</Text></TouchableOpacity>
          ) : null)}

          {/* 관리자 처리 */}
          {isAdmin && (mode !== 'none' || isOpen || !r.stockApplied) && (
            <View style={{ borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: '#f5f7ff', borderRadius: 10, padding: 9, gap: 7 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4338ca' }}>관리자 처리</Text>
              {mode === 'none' ? (
                isOpen ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => setMode('reject')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>반려</Text></TouchableOpacity>
                    {r.status === 'onhold'
                      ? <TouchableOpacity onPress={() => act('requested')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#92400e' }}>보류 해제</Text></TouchableOpacity>
                      : <TouchableOpacity onPress={() => setMode('hold')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#92400e' }}>⏸ 보류</Text></TouchableOpacity>}
                    <TouchableOpacity onPress={purchase} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 7, flex: 1.4 }]}><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>✓ 구매 완료{isCamp ? ' + 입고' : ''}</Text></TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => act('requested')} disabled={busy} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7, flex: 0 }]}><Text style={{ fontSize: 11, color: '#374151' }}>다시 진행 중으로</Text></TouchableOpacity>
                )
              ) : (
                <View style={{ gap: 6 }}>
                  <TextInput value={reason} onChangeText={setReason} autoFocus placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]}
                    placeholder={mode === 'reject' ? '반려 사유 (예: 캠프 재고로 대체, 살 필요 없음)' : '보류 사유 (예: 이번 장보기엔 못 사요)'} />
                  {mode === 'hold' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, color: '#6b7280', marginRight: 2 }}>구매 예정</Text>
                      {HOLD_CHIPS.map(([label, val]) => (
                        <TouchableOpacity key={label} onPress={() => setHoldUntil(val)} style={[styles.miniChip, holdUntil === val && styles.miniChipAmber]}>
                          <Text style={[styles.miniChipText, holdUntil === val && { color: '#92400e' }]}>{label}{val ? ` ${fmtHoldDate(val)}` : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => setMode('none')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => act(mode === 'reject' ? 'rejected' : 'onhold', { note: reason, holdUntil })} disabled={busy}
                      style={[styles.btn, { backgroundColor: mode === 'reject' ? '#6b7280' : '#f59e0b', paddingVertical: 7 }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{mode === 'reject' ? '반려' : '보류'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* 메모·댓글 */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>💬 메모·댓글 {r.comments?.length ? r.comments.length : ''}</Text>
            {(r.comments ?? []).map(cm => (
              <View key={cm.id} style={{ backgroundColor: cm.admin ? '#eef2ff' : '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: cm.admin ? '#4338ca' : '#1f2937' }}>{cm.name}</Text>
                  {cm.admin && <Text style={{ fontSize: 9, fontWeight: '700', color: '#4338ca', backgroundColor: '#e0e7ff', borderRadius: 3, paddingHorizontal: 3 }}>관리자</Text>}
                  <Text style={{ fontSize: 10, color: '#9ca3af', flex: 1 }}>{fmtDateTime(cm.at)}</Text>
                  {isAdmin && <TouchableOpacity onPress={() => run(() => deleteSupplyComment(db, r.id, cm))}><Text style={{ fontSize: 10, color: '#cbd5e1' }}>삭제</Text></TouchableOpacity>}
                </View>
                <Text style={{ fontSize: 12, color: '#374151', marginTop: 1 }}>{cm.text}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput value={comment} onChangeText={setComment} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} multiline
                placeholder={isAdmin ? '예: 이번엔 못 사고 다음 주에 살게요' : '예: 저희 반도 2개 필요해요'} />
              <TouchableOpacity onPress={send} disabled={busy || !comment.trim()} style={{ backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', opacity: busy || !comment.trim() ? 0.3 : 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>등록</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ==================== 분실물 (모바일) ====================

const LOST_STATUS_COLOR: Record<LostItemStatus, { bg: string; text: string }> = {
  found: { bg: '#dbeafe', text: '#1d4ed8' },
  claimed: { bg: '#d1fae5', text: '#047857' },
  discarded: { bg: '#f3f4f6', text: '#6b7280' },
};

type PickedMedia = { uri: string; type: 'image' | 'video'; mimeType?: string; fileName?: string; fileSize?: number };

/** 갤러리에서 사진·영상 여러 개 선택 */
async function pickLostMedia(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('권한 필요', '사진 접근 권한을 허용해주세요.'); return []; }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
  if (result.canceled) return [];
  return result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined }));
}

/** 카메라로 촬영 (사진) */
async function captureLostPhoto(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) { Alert.alert('권한 필요', '카메라 권한을 허용해주세요.'); return []; }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
  if (result.canceled) return [];
  return result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined }));
}

async function uploadLostMediaMobile(campCode: string, lostItemId: string, picked: PickedMedia[]): Promise<LostItemMedia[]> {
  const out: LostItemMedia[] = [];
  for (const m of picked) {
    const blob = await uriToBlob(m.uri);
    const ext = m.fileName?.split('.').pop() || (m.type === 'video' ? 'mp4' : 'jpg');
    const path = lostItemMediaPath(campCode, lostItemId, m.fileName || `${m.type}.${ext}`);
    const r = storageRef(storage, path);
    const contentType = m.mimeType || blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg');
    await uploadBytes(r, blob, { contentType });
    const url = await getDownloadURL(r);
    out.push({ url, path, type: m.type, name: m.fileName, size: m.fileSize ?? blob.size });
  }
  return out;
}

function MediaPickerMobile({ picked, onChange, disabled }: { picked: PickedMedia[]; onChange: (p: PickedMedia[]) => void; disabled?: boolean }) {
  const tooBig = picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TouchableOpacity disabled={disabled} onPress={async () => onChange([...picked, ...(await pickLostMedia())])} style={[styles.mediaBtn, disabled && { opacity: 0.5 }]}>
          <Ionicons name="images-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>사진·영상 선택</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={disabled} onPress={async () => onChange([...picked, ...(await captureLostPhoto())])} style={[styles.mediaBtn, disabled && { opacity: 0.5 }]}>
          <Ionicons name="camera-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>촬영</Text>
        </TouchableOpacity>
      </View>
      {picked.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {picked.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={styles.thumb}>
              {p.type === 'video'
                ? <View style={[styles.thumbFill, { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="videocam" size={22} color="#fff" /></View>
                : <Image source={{ uri: p.uri }} style={styles.thumbFill} contentFit="cover" />}
              {!disabled && (
                <TouchableOpacity onPress={() => onChange(picked.filter((_, j) => j !== i))} style={styles.thumbRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 10, color: tooBig ? '#dc2626' : '#9ca3af' }}>{tooBig ? '50MB를 넘는 파일이 있습니다.' : '사진·영상 각 50MB 이하, 여러 개 첨부 가능'}</Text>
    </View>
  );
}

function LostListMobile({ campCode, jobCodeId, students, campGroups, lostItems, isAdmin, userId, userName }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  lostItems: LostItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  const [filter, setFilter] = useState<LostItemStatus | '전체'>('found');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = lostItems.find(l => l.id === openId) ?? null;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lostItems.filter(l => (filter === '전체' || l.status === filter) &&
      (!q || [l.name, l.description, l.foundPlace, l.keptAt, l.claimedBy, l.reportedBy].some(f => f?.toLowerCase().includes(q))));
  }, [lostItems, filter, search]);
  const count = (s: LostItemStatus) => lostItems.filter(l => l.status === s).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>분실물 <Text style={{ color: '#2563eb' }}>{count('found')}</Text> <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '400' }}>보관 중</Text></Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>누구나 등록·확인 · 주인을 찾으면 상태를 바꿔주세요</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Ionicons name="add" size={14} color="#fff" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>등록</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder="물품명 · 장소 · 학생 이름 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {([['found', `보관 중 ${count('found')}`], ['claimed', `주인 찾음 ${count('claimed')}`], ['discarded', `폐기 ${count('discarded')}`], ['전체', '전체']] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.chip, filter === id && { backgroundColor: '#2563eb', borderColor: '#2563eb' }]}>
              <Text style={[styles.chipText, filter === id && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {list.length === 0 ? (
          <View style={styles.centered}><Ionicons name="search-outline" size={36} color="#cbd5e1" /><Text style={styles.emptyTitle}>{lostItems.length === 0 ? '등록된 분실물이 없습니다.' : '해당하는 분실물이 없습니다.'}</Text></View>
        ) : list.map(l => {
          const thumb = l.media.find(m => m.type === 'image');
          const c = LOST_STATUS_COLOR[l.status];
          return (
            <TouchableOpacity key={l.id} onPress={() => setOpenId(l.id)} style={[styles.card, { padding: 0, overflow: 'hidden', alignItems: 'stretch', borderColor: l.status === 'found' ? '#bfdbfe' : '#e5e7eb', opacity: l.status === 'found' ? 1 : 0.8 }]}>
              <View style={{ width: 60, height: 60, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                {thumb ? <Image source={{ uri: thumb.url }} style={{ width: 60, height: 60 }} contentFit="cover" />
                  : l.media.length > 0 ? <Ionicons name="videocam" size={24} color="#9ca3af" /> : <Ionicons name="image-outline" size={24} color="#d1d5db" />}
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{LOST_ITEM_STATUS_LABELS[l.status]}</Text></View>
                  <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>{l.name}{l.ownerName ? <Text style={{ fontSize: 10, color: '#e11d48', fontWeight: '600' }}>  🏷️ {l.ownerName}</Text> : null}</Text>
                  {l.media.length > 1 && <Text style={{ fontSize: 9, color: '#9ca3af' }}>+{l.media.length - 1}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }} numberOfLines={1}>📍 {l.foundPlace || '장소 미상'} · {l.foundDate}</Text>
                <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{l.keptAt ? `보관: ${l.keptAt} · ` : ''}등록 {l.reportedBy}{l.status === 'claimed' && l.claimedBy ? ` · → ${l.claimedBy}` : ''}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showForm} animationType="fade" transparent onRequestClose={() => setShowForm(false)}>
        <LostItemFormMobile campCode={campCode} jobCodeId={jobCodeId} students={students} campGroups={campGroups} userId={userId} userName={userName} onClose={() => setShowForm(false)} onCreated={id => { setShowForm(false); setOpenId(id); }} />
      </Modal>
      <Modal visible={!!opened} animationType="fade" transparent onRequestClose={() => setOpenId(null)}>
        {opened && <LostItemDetailMobile item={opened} isAdmin={isAdmin} userId={userId} userName={userName} onClose={() => setOpenId(null)} />}
      </Modal>
    </View>
  );
}

function LostItemFormMobile({ campCode, jobCodeId, students, campGroups, userId, userName, onClose, onCreated }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  userId: string; userName: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  // 이름표(주인)가 있으면 담임·방 담당·그룹 매니저에게, 없으면 캠프 전체에 알림 — 끌 수 있음
  const [owner, setOwner] = useState<STSheetStudent | null>(null);
  const [ownerQuery, setOwnerQuery] = useState('');
  const [notify, setNotify] = useState(true);
  const ownerResults = useMemo(() => {
    const q = ownerQuery.trim();
    return q ? students.filter(s => s.name.includes(q)).slice(0, 6) : [];
  }, [ownerQuery, students]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [foundPlace, setFoundPlace] = useState('');
  const [foundDate, setFoundDate] = useState(todayStr());
  const [keptAt, setKeptAt] = useState('');
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const tooBig = picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024);

  const submit = async () => {
    if (!name.trim() || busy || tooBig) return;
    setBusy(true);
    try {
      setProgress('등록 중...');
      const ownerGroup = owner?.className ? findGroupByClassCode(campGroups, owner.className)?.name.toLowerCase() : undefined;
      const id = await addLostItem(db, {
        campCode, name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined,
        foundDate, keptAt: keptAt.trim() || undefined, reportedBy: userName, reportedById: userId,
        jobCodeId: jobCodeId || undefined, notify,
        ownerStudentId: owner?.studentId, ownerName: owner?.name, ownerClassCode: owner?.className,
        ownerClassMentor: owner?.classMentor, ownerUnitMentor: owner?.unitMentor, ownerGroup,
      });
      if (picked.length) {
        setProgress(`사진·영상 ${picked.length}개 업로드 중...`);
        const media = await uploadLostMediaMobile(campCode, id, picked);
        await addLostItemMedia(db, id, media);
      }
      if (notify) authenticatedFetch('/api/inventory/notify-lost', { method: 'POST', body: JSON.stringify({ lostItemId: id }) }).catch(e => console.warn('분실물 알림 요청 실패:', e));
      onCreated(id);
    } catch (e) { console.error('분실물 등록 오류:', e); Alert.alert('오류', '등록 중 오류가 발생했습니다.'); }
    finally { setBusy(false); setProgress(''); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>🔍 분실물 등록</Text>
          <TouchableOpacity onPress={onClose} disabled={busy} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          <View><Text style={styles.label}>물품명 *</Text><TextInput value={name} onChangeText={setName} placeholder="예: 파란색 물통, 안경, 후드집업" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={styles.label}>발견 장소</Text><TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder="예: 강당, 3층 복도" placeholderTextColor="#9ca3af" style={styles.input} /></View>
            <View style={{ width: 120 }}><Text style={styles.label}>발견일</Text><TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          </View>
          <View><Text style={styles.label}>보관 장소</Text><TextInput value={keptAt} onChangeText={setKeptAt} placeholder="예: 2층 교무실 분실물 박스" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.label}>설명 (특징, 이름표 여부 등)</Text><TextInput value={description} onChangeText={setDescription} multiline placeholder="예: 뚜껑에 스티커 붙어 있음, 이름 없음" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} /></View>
          <View>
            <Text style={styles.label}>🏷️ 이름표 (주인을 아는 경우)</Text>
            {owner ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#fecdd3', backgroundColor: '#fff1f2', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#9f1239' }}>{owner.name}</Text>
                <Text style={{ flex: 1, fontSize: 10, color: '#be123c' }} numberOfLines={1}>{[owner.className, owner.classMentor && `담임 ${owner.classMentor}`, owner.unitMentor && `방 ${owner.unitMentor}`].filter(Boolean).join(' · ')}</Text>
                <TouchableOpacity onPress={() => setOwner(null)}><Text style={{ color: '#fb7185' }}>✕</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                <TextInput value={ownerQuery} onChangeText={setOwnerQuery} placeholder="학생 이름 검색 (모르면 비워두세요)" placeholderTextColor="#9ca3af" style={styles.input} />
                {ownerResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setOwner(s); setOwnerQuery(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                    <Text style={{ fontSize: 12, color: '#111827' }}>{s.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{s.className}{s.classMentor ? ` · 담임 ${s.classMentor}` : ''}</Text></Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => setNotify(v => !v)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}>
            <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={18} color={notify ? '#2563eb' : '#9ca3af'} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>푸시 알림 보내기</Text>
              <Text style={{ fontSize: 10, color: '#9ca3af' }}>{owner ? '담임 · 방 담당 · 그룹 매니저에게 보냅니다' : '캠프 선생님 전체에게 보냅니다 — 중요하지 않은 물품이면 끄세요'}</Text>
            </View>
          </TouchableOpacity>
          {progress ? <Text style={{ fontSize: 11, color: '#2563eb', textAlign: 'center' }}>{progress}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || busy || tooBig} style={[styles.btn, { backgroundColor: '#2563eb', opacity: !name.trim() || busy || tooBig ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '등록 중...' : '등록'}</Text></TouchableOpacity>
          </View>
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function LostItemDetailMobile({ item, isAdmin, userId, userName, onClose }: {
  item: LostItem; isAdmin: boolean; userId: string; userName: string; onClose: () => void;
}) {
  const canDelete = isAdmin || item.reportedById === userId;
  const [claimName, setClaimName] = useState(item.claimedBy ?? item.ownerName ?? '');
  const [claiming, setClaiming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [foundPlace, setFoundPlace] = useState(item.foundPlace ?? '');
  const [foundDate, setFoundDate] = useState(item.foundDate);
  const [keptAt, setKeptAt] = useState(item.keptAt ?? '');
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<LostItemMedia | null>(null);
  const c = LOST_STATUS_COLOR[item.status];
  const screenW = Dimensions.get('window').width;
  const tile = Math.floor((screenW - 28 - 12) / 3);

  const saveEdit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await updateLostItem(db, item.id, { name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined, foundDate, keptAt: keptAt.trim() || undefined }); setEditing(false); }
    finally { setBusy(false); }
  };
  const uploadMore = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try { const media = await uploadLostMediaMobile(item.campCode, item.id, picked); await addLostItemMedia(db, item.id, media); setPicked([]); }
    catch (e) { console.error('첨부 추가 오류:', e); Alert.alert('오류', '업로드 중 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };
  const removeMedia = (m: LostItemMedia) => {
    Alert.alert('첨부 삭제', '이 첨부를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { try { await deleteObject(storageRef(storage, m.path)); } catch { /* 없으면 무시 */ } await removeLostItemMedia(db, item.id, item.media, m.path); } },
    ]);
  };
  const setStatus = async (status: LostItemStatus) => {
    if (busy) return;
    if (status === 'claimed' && !claimName.trim()) { setClaiming(true); return; }
    setBusy(true);
    try { await setLostItemStatus(db, item.id, status, userName, claimName); setClaiming(false); }
    finally { setBusy(false); }
  };
  const remove = () => {
    Alert.alert('기록 삭제', '이 분실물 기록과 첨부를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await Promise.all(item.media.map(m => deleteObject(storageRef(storage, m.path)).catch(() => undefined))); await deleteLostItem(db, item.id); onClose(); }
        finally { setBusy(false); }
      } },
    ]);
  };
  const openMedia = (m: LostItemMedia) => { if (m.type === 'video') Linking.openURL(m.url); else setViewer(m); };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{LOST_ITEM_STATUS_LABELS[item.status]}</Text></View>
              <Text style={styles.modalTitle} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>등록 {item.reportedBy} · {fmtDateTime(item.createdAt)}{item.status !== 'found' && item.claimedHandler ? ` · 처리 ${item.claimedHandler}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          {item.media.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {item.media.map(m => (
                <View key={m.path} style={{ width: tile, height: tile, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                  <TouchableOpacity onPress={() => openMedia(m)} style={{ flex: 1 }}>
                    {m.type === 'video'
                      ? <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', gap: 2 }}><Ionicons name="play-circle" size={28} color="#fff" /><Text style={{ fontSize: 9, color: '#fff' }}>영상 열기</Text></View>
                      : <Image source={{ uri: m.url }} style={{ flex: 1 }} contentFit="cover" />}
                  </TouchableOpacity>
                  {canDelete && <TouchableOpacity onPress={() => removeMedia(m)} style={styles.thumbRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></TouchableOpacity>}
                </View>
              ))}
            </View>
          )}
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          {picked.length > 0 && (
            <TouchableOpacity onPress={uploadMore} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb', opacity: busy ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '업로드 중...' : `${picked.length}개 첨부 업로드`}</Text></TouchableOpacity>
          )}

          {editing ? (
            <View style={{ gap: 8 }}>
              <TextInput value={name} onChangeText={setName} placeholder="물품명" placeholderTextColor="#9ca3af" style={styles.input} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder="발견 장소" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
                <TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={[styles.input, { width: 120 }]} />
              </View>
              <TextInput value={keptAt} onChangeText={setKeptAt} placeholder="보관 장소" placeholderTextColor="#9ca3af" style={styles.input} />
              <TextInput value={description} onChangeText={setDescription} multiline placeholder="설명" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setEditing(false)} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>저장</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', padding: 10, gap: 4 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>📍 발견 장소: <Text style={{ fontWeight: '700' }}>{item.foundPlace || '—'}</Text> · 발견일 <Text style={{ fontWeight: '700' }}>{item.foundDate}</Text></Text>
              <Text style={{ fontSize: 12, color: '#374151' }}>📦 보관 장소: <Text style={{ fontWeight: '700' }}>{item.keptAt || '—'}</Text></Text>
              {item.description ? <Text style={{ fontSize: 12, color: '#4b5563' }}>📝 {item.description}</Text> : null}
              {item.ownerName ? <Text style={{ fontSize: 12, color: '#be123c' }}>🏷️ 이름표: <Text style={{ fontWeight: '700' }}>{item.ownerName}</Text>{item.ownerClassCode ? ` (${item.ownerClassCode})` : ''}</Text> : null}
              {item.status === 'claimed' ? <Text style={{ fontSize: 12, color: '#047857' }}>✅ {item.claimedBy || '주인'}에게 돌려줌</Text> : null}
              <TouchableOpacity onPress={() => setEditing(true)}><Text style={{ fontSize: 11, color: '#2563eb' }}>정보 수정</Text></TouchableOpacity>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>상태 변경</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {LOST_ITEM_STATUSES.map(s => {
                const on = item.status === s; const sc = LOST_STATUS_COLOR[s];
                return (
                  <TouchableOpacity key={s} onPress={() => setStatus(s)} disabled={busy} style={[styles.btn, { backgroundColor: on ? sc.bg : '#fff', borderWidth: 1, borderColor: on ? sc.bg : '#e5e7eb' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? sc.text : '#6b7280' }}>{LOST_ITEM_STATUS_LABELS[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(claiming || item.status === 'claimed') && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={claimName} onChangeText={setClaimName} placeholder="돌려준 학생(사람) 이름" placeholderTextColor="#9ca3af" autoFocus={claiming} style={[styles.input, { flex: 1 }]} />
                <TouchableOpacity onPress={() => setStatus('claimed')} disabled={busy || !claimName.trim()} style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, opacity: busy || !claimName.trim() ? 0.4 : 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{item.status === 'claimed' ? '이름 저장' : '주인 찾음 처리'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {canDelete && <TouchableOpacity onPress={remove} disabled={busy} style={{ alignItems: 'center', paddingVertical: 8 }}><Text style={{ fontSize: 11, color: '#ef4444' }}>기록 삭제</Text></TouchableOpacity>}
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer.url }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          <TouchableOpacity onPress={() => setViewer(null)} style={{ position: 'absolute', top: 50, right: 20, padding: 8 }}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==================== 품목 상세 ====================

function ItemDetailMobile({ view, groups, campCode, isAdmin, userName, onClose }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; isAdmin: boolean; userName: string; onClose: () => void;
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [mode, setMode] = useState<{ type: 'restock' | 'adjust' | 'min'; groupId: string } | null>(null);
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const group = groups.find(g => g.id === mode?.groupId);
  const current = mode ? getGroupStock(view, mode.groupId) : 0;

  const submit = async () => {
    if (!mode || !group || busy) return;
    const n = parseInt(qty, 10);
    if (mode.type !== 'min' && (isNaN(n) || n < 0)) return;
    setBusy(true);
    try {
      const base = { itemId: view.id, itemName: view.name, groupId: group.id, groupName: group.name };
      if (mode.type === 'restock') {
        if (!(n > 0)) return;
        await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
      } else if (mode.type === 'adjust') {
        if (!memo.trim()) { Alert.alert('입력 필요', '조정 사유를 입력해주세요.'); return; }
        await adjustStockTo(db, campCode, { ...base, current, target: n, reason: memo.trim() }, userName);
      } else {
        await setGroupMinStock(db, campCode, view.id, group.id, qty === '' ? null : Math.max(0, n || 0));
      }
      setMode(null); setQty(''); setMemo('');
    } catch (e) {
      console.error('재고 처리 오류:', e);
      Alert.alert('오류', '처리 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>{view.category}{view.subCategory ? ` · ${view.subCategory}` : ''}{view.kind ? ` · ${view.kind}` : ''}</Text>
            <Text style={styles.modalTitle}>{view.name} {view.spec ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#9ca3af' }}>{view.spec}</Text> : null}</Text>
            {view.description ? <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>ℹ️ {view.description}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#047857', lineHeight: 26 }}>{view.total}<Text style={{ fontSize: 11, color: '#9ca3af' }}>{view.unit}</Text></Text>
            <Text style={{ fontSize: 9, color: '#9ca3af' }}>전체 재고</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* 그룹별 수량 */}
          <View>
            <Text style={styles.sectionTitle}>그룹별 수량</Text>
            {groups.length === 0 ? <Text style={styles.emptyBody}>재고 그룹이 없습니다.</Text> : (
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                {groups.map((g, i) => {
                  const n = getGroupStock(view, g.id);
                  const min = getMinStock(view, g.id);
                  const low = min > 0 && n < min;
                  return (
                    <View key={g.id} style={{ paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6', gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{g.name} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{g.location ?? ''}</Text></Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: low ? '#dc2626' : '#1f2937' }}>{n}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{view.unit}</Text></Text>
                        <Text style={{ fontSize: 10, color: '#9ca3af' }}>최소 {min}</Text>
                        {low ? <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>구매 필요 −{min - n}</Text>
                          : <Text style={{ fontSize: 9, color: '#9ca3af' }}>충분</Text>}
                      </View>
                      {isAdmin && (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity onPress={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>+입고</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>조정</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setMode({ type: 'min', groupId: g.id }); setQty(view.minStocks?.[g.id] != null ? String(view.minStocks[g.id]) : ''); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>최소</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {mode && group && (
            <View style={{ borderRadius: 10, borderWidth: 1, padding: 10, gap: 8, borderColor: mode.type === 'restock' ? '#a7f3d0' : '#fde68a', backgroundColor: mode.type === 'restock' ? '#ecfdf5' : '#fffbeb' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>
                {mode.type === 'restock' ? '📥 재고 입고' : mode.type === 'adjust' ? '✏️ 수량 직접 조정' : '📏 최소 보유 수량'} · {group.name} <Text style={{ fontWeight: '400', color: '#6b7280' }}>현재 {current}{view.unit}</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" autoFocus
                  placeholder={mode.type === 'restock' ? '입고 수량' : mode.type === 'adjust' ? '조정 후 수량' : `비우면 기본값(${view.minStockDefault ?? 0})`} placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 130 }]} />
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{view.unit}</Text>
                {mode.type === 'restock' && qty ? <Text style={{ fontSize: 11, color: '#047857' }}>→ {current + (parseInt(qty, 10) || 0)}</Text> : null}
                {mode.type === 'adjust' && qty ? <Text style={{ fontSize: 11, color: '#b45309' }}>차이 {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</Text> : null}
              </View>
              {mode.type !== 'min' && (
                <TextInput value={memo} onChangeText={setMemo} placeholder={mode.type === 'restock' ? '메모 (선택)' : '조정 사유 (필수)'} placeholderTextColor="#9ca3af" style={styles.input} />
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setMode(null)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', opacity: busy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '처리 중...' : '저장'}</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {/* 변동 내역 */}
          <View>
            <Text style={styles.sectionTitle}>변동 내역 <Text style={{ color: '#9ca3af', fontWeight: '400' }}>({movements.length}건)</Text></Text>
            {movements.length === 0 ? <Text style={styles.emptyBody}>이 캠프에서 아직 변동이 없습니다.</Text> : (
              <View style={{ gap: 4 }}>
                {movements.map(m => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 10, color: '#9ca3af', width: 66 }}>{fmtDateTime(m.at)}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: '#374151' }}>
                      <Text style={{ fontWeight: '700', color: '#1f2937' }}>{m.refLabel || INVENTORY_MOVEMENT_LABELS[m.reason]}</Text>
                      <Text style={{ color: '#9ca3af' }}> · {m.groupName}</Text>{m.memo ? <Text style={{ color: '#6b7280' }}> · {m.memo}</Text> : null}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>{m.by}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right', color: m.delta > 0 ? '#047857' : '#dc2626' }}>{m.delta > 0 ? '+' : ''}{m.delta}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyBody: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', position: 'relative' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#047857' },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#059669' },
  badge: { minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f3f4f6', borderRadius: 9, paddingHorizontal: 9, paddingVertical: Platform.OS === 'ios' ? 7 : 3 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', padding: 0 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#4b5563' },
  chipTextActive: { color: '#fff' },
  notice: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10 },
  noticeText: { fontSize: 11, color: '#92400e', lineHeight: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 10, color: '#6b7280' },
  groupChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#f9fafb' },
  groupChipLow: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  groupChipEmpty: { backgroundColor: '#fff' },
  groupChipText: { fontSize: 10, color: '#374151' },
  total: { fontSize: 18, fontWeight: '800', color: '#047857', lineHeight: 22 },
  totalUnit: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },
  totalLabel: { fontSize: 9, color: '#9ca3af' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 40, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '88%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: '#111827', backgroundColor: '#fff' },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: '#374151', marginBottom: 4 },
  toolbar: { backgroundColor: '#fff', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  requestBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  requestBannerText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#1e40af' },
  miniChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f3f4f6' },
  miniChipDark: { backgroundColor: '#1f2937' },
  miniChipRed: { backgroundColor: '#dc2626' },
  miniChipAmber: { backgroundColor: '#fef3c7' },
  miniChipText: { fontSize: 11, fontWeight: '600', color: '#4b5563' },
  vDivider: { width: 1, height: 14, backgroundColor: '#e5e7eb', marginHorizontal: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#f1f5f9' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 10 },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  formLabel: { fontSize: 12, fontWeight: '800', color: '#1f2937', marginBottom: 6 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  segBtnOn: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  segBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  pickedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eff6ff', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  qtyBtnText: { fontSize: 15, color: '#374151' },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: '#fff', borderWidth: 1, borderRadius: 10, paddingVertical: 8 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  blockTitle: { fontSize: 13, fontWeight: '800', color: '#1f2937' },
  listBox: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  actBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  actBtnText: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  secAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: '#475569' },
  secAllBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  secBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  secBtnOn: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  secBtnOff: { backgroundColor: '#fff', borderColor: '#e5e7eb', borderStyle: 'dashed' },
  secBtnText: { fontSize: 11, fontWeight: '700' },
  sectionHeaderText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  sectionHeaderCount: { fontSize: 10, color: '#94a3b8' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  rowName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 11, fontWeight: '400', color: '#9ca3af' },
  rowGroups: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  rowGroupLow: { color: '#dc2626', fontWeight: '700' },
  rowGroupFocus: { color: '#92400e', fontWeight: '700' },
  rowTotal: { fontSize: 16, fontWeight: '800', color: '#047857' },
  rowUnit: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },
  rowTotalSub: { fontSize: 9, color: '#9ca3af' },
  badgeLow: { backgroundColor: '#fef2f2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeLowText: { fontSize: 9, fontWeight: '700', color: '#dc2626' },
  badgeWarn: { backgroundColor: '#fff7ed', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#fdba74' },
  badgeWarnText: { fontSize: 9, fontWeight: '700', color: '#c2410c' },
  mediaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  mediaBtnText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  thumb: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  thumbFill: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
