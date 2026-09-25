import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SectionList, Modal, Alert, KeyboardAvoidingView, Platform, Linking, Dimensions, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { takeInventoryDeepLink, subscribeInventoryDeepLink, type InventoryDeepLink } from '../context/CampTabContext';
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
  setSupplyDefaultBuyer,
  subscribeSupplyGuides,
  ADJUST_REASONS,
  getItemUsage,
  USE_REASONS,
  recordStockUse,
  setStockMeta,
  expiryState,
  fmtExpiry,
  earliestExpiry,
  addInventoryItemMedia,
  removeInventoryItemMedia,
  inventoryItemMediaPath,
  itemThumb,
  saveSupplyGuide,
  deleteSupplyGuide,
  matchSupplyGuides,
  supplyLineSettleKind,
  groupSupplyByCampGroup,
  studentClassCode,
  SUPPLY_SETTLE_LABELS,
  subscribeSupplySettings,
  completeSupplyLines,
  undoSupplyLine,
  settleSupplyLines,
  supplyBuyerOf,
  supplyDoneCount,
  supplyAllDone,
  supplySettleLines,
  supplySettleKind,
  supplyShoppingList,
  supplyBuyerCandidates,
  fmtWon,
  addSupplyComment,
  deleteSupplyComment,
  deleteSupplyRequest,
  isSupplyOpen,
  supplyForLabel,
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
  addInventoryItem,
  INVENTORY_UNITS,
  INVENTORY_USAGE_LABELS,
  INVENTORY_SUBCATEGORIES,
  addInventoryGroup,
  updateInventoryGroup,
  deleteInventoryGroup,
  savePackageFromGroups,
  applyPackageToCamp,
  deleteInventoryPackage,
  subscribeInventoryPackages,
  setStockLevels,
  importInventoryItems,
  updateInventoryItem,
  DEFAULT_INVENTORY_ITEMS,
  STOCKTAKE_REASONS,
  inventoryPerm,
  transferStock,
  subscribeCampMovements,
  movementLabel,
  MOVEMENT_FILTERS,
  TRANSFER_REASONS,
  supplyProgress,
  missedSummary,
  LOST_NOTIFY_TARGETS,
  LOST_NOTIFY_TARGET_LABELS,
  lostNotifyPreview,
  lostGroupManagers,
  MISSED_STATE_LABELS,
  INVENTORY_USAGE_ORDER,
  suggestedUsages,
} from '@smis-mentor/shared';
import { getUsersByJobCodeId } from '../services/userService';
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
  SupplyForType,
  SupplyBuyerCandidate,
  SupplySettings,
  SupplySettleLine,
  SupplyGuide,
  SupplyLineSettleKind,
  ItemMedia,
  LostItem,
  LostItemMedia,
  LostItemStatus,
  CampGroup,
  STSheetStudent,
  InventoryUsage,
  InventoryPerm,
  LostNotifyTarget,
  NotifyUserLike,
  MovementFilterKey,
  InventoryPackage,
} from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'purchase' | 'movement' | 'lost' | 'manage';

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
  // 관리자: 그룹 패키지(회사 공통) · 품목 수정 창
  const [packages, setPackages] = useState<InventoryPackage[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | 'new' | null>(null);
  const [stocks, setStocks] = useState<Record<string, InventoryStock>>({});
  const [groups, setGroups] = useState<InventoryGroup[]>([]);
  useEffect(() => subscribeInventoryItems(db, setItems), []);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeInventoryStocks(db, campCode, setStocks);
    const u2 = subscribeInventoryGroups(db, campCode, setGroups);
    return () => { u1(); u2(); };
  }, [campCode]);
  useEffect(() => { if (isAdmin) return subscribeInventoryPackages(db, setPackages); }, [isAdmin]);

  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  useEffect(() => { if (campCode) return subscribeSupplyRequests(db, campCode, setRequests); }, [campCode]);
  const [supplySettings, setSupplySettings] = useState<SupplySettings | null>(null);
  const [supplyGuides, setSupplyGuides] = useState<SupplyGuide[]>([]);
  useEffect(() => subscribeSupplyGuides(db, setSupplyGuides), []);
  useEffect(() => { if (campCode) return subscribeSupplySettings(db, campCode, setSupplySettings); }, [campCode]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  useEffect(() => { if (campCode) return subscribeLostItems(db, campCode, setLostItems); }, [campCode]);
  const keptLostCount = useMemo(() => lostItems.filter(l => l.status === 'found').length, [lostItems]);

  const views = useMemo(() => buildInventoryViews(items, stocks, groups), [items, stocks, groups]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  const shortItems = useMemo(() => new Set(needs.map(n => n.itemId)), [needs]);
  // 탭 배지: 관리자는 새 요청 + 재고 입고 대기 + 아직 요청 안 된 재고 부족분, 그 외는 내가 올렸거나 사오기로 한 진행 중 요청
  // 탭 배지 — 관리자: 새 요청 + 재고 입고 대기 + 아직 요청 안 된 재고 부족분
  //          그 외: 내가 사 올 품목 + 내가 정산할 품목 (학생 = 담임, 선생님 물품 = 본인)
  const requestBadge = useMemo(() => {
    if (isAdmin) return requests.filter(r => r.status === 'requested' || needsStockIntake(r)).length + uncoveredPurchaseNeeds(needs, requests).length;
    const uid = userData?.userId;
    const buyLines = requests.filter(r => r.status === 'requested' && supplyBuyerOf(r, supplySettings)?.uid === uid)
      .reduce((a, r) => a + r.items.length - supplyDoneCount(r), 0);
    const settleTodo = supplySettleLines(requests).filter(sl => !sl.settled && sl.kind !== 'parent' && (sl.req.forType === 'student'
      ? !!userName && (sl.req.classMentor || students.find(st => st.studentId === sl.req.studentId)?.classMentor || '').trim() === userName.trim()
      : sl.req.requesterId === uid)).length;
    return buyLines + settleTodo;
  }, [requests, needs, isAdmin, userData?.userId, userName, students, supplySettings]);

  const [subTab, setSubTab] = useState<SubTab>('stock');
  // 푸시 알림을 눌러 들어온 경우: 요청 탭을 열고 해당 요청을 보여 준다
  const [deepLink, setDeepLink] = useState<InventoryDeepLink | null>(takeInventoryDeepLink());
  useEffect(() => subscribeInventoryDeepLink(t => { setDeepLink(t); setSubTab(t.requestId || t.view ? 'request' : 'stock'); }), []);
  useEffect(() => { if (deepLink?.requestId || deepLink?.view) setSubTab('request'); }, [deepLink]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 목록에서 바로 '사용'을 누르면 그 그룹의 사용 입력을 연 채로 상세를 연다
  const [quickUseGroupId, setQuickUseGroupId] = useState<string | undefined>(undefined);
  const selected = useMemo(() => views.find(v => v.id === selectedId) ?? null, [views, selectedId]);

  // 목록 필터: 보유 중인 품목만(기본) · 부족만 · 전체
  const [groupFilter, setGroupFilter] = useState<string>('');
  // 내 그룹 (멘토 배정 그룹 ↔ 재고 그룹의 캠프 그룹 이름) — 처음 한 번 기본 필터로
  const myInvGroupId = useMemo(() => {
    const g = userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group?.toLowerCase();
    if (!g) return undefined;
    return groups.find(x => (x.campGroupName ?? x.name).toLowerCase() === g)?.id;
  }, [userData?.jobExperiences, activeJobCodeId, groups]);
  const [groupTouched, setGroupTouched] = useState(false);
  useEffect(() => { if (!groupTouched && myInvGroupId) setGroupFilter(myInvGroupId); }, [myInvGroupId, groupTouched]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // 기존 권한 체계 그대로 — admin / 그룹 역할 '부매니저'
  const perm = useMemo(() => inventoryPerm(userData as { role?: string; jobExperiences?: Array<{ id: string; groupRole?: string }> } | null, activeJobCodeId),
    [userData, activeJobCodeId]);
  // 부매니저·관리자: 부족한 물품만 보기
  const [shortOnly, setShortOnly] = useState(false);
  const openRequestCount = useMemo(() => requests.filter(r => isSupplyOpen(r.status)).length, [requests]);
  const shortIds = useMemo(() => new Set(
    needs.filter(n => !groupFilter || n.groupId === groupFilter).map(n => n.itemId)
  ), [needs, groupFilter]);
  // 상세의 '필요한 물품 요청' → 요청 탭 작성 폼을 미리 채워 연다
  const [requestPrefill, setRequestPrefill] = useState<{ req: SupplyRequest; nonce: number } | null>(null);
  // 관리자: 분류별 품목 추가 (추가하면 바로 상세를 열어 그룹 수량 입력)
  const [adding, setAdding] = useState<{ category?: InventoryCategory; subCategory?: string } | null>(null);
  const anyPlaced = useMemo(() => views.some(v => Object.keys(v.stocks).length > 0), [views]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (v.isActive === false) return false;
      if (category !== '전체' && v.category !== category) return false;
      // 검색어가 없으면 이 캠프에 둔 품목만, 검색하면 전체 품목에서 찾음
      if (!q && anyPlaced && Object.keys(v.stocks).length === 0) return false;
      if (!q && groupFilter && !(groupFilter in v.stocks)) return false;
      if (shortOnly && perm.isStockManager && !shortIds.has(v.id)) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description, v.ingredient].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, anyPlaced, groupFilter, shortOnly, shortIds, perm.isStockManager]);

  const sections = useMemo(() => {
    const map = new Map<string, InventoryItemView[]>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return [...map.entries()].map(([title, data]) => ({ title, count: data.length, data, cat: data[0].category, sub: data[0].subCategory }));
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {([
          { id: 'stock' as SubTab, title: isForeign ? 'Stock' : '재고 현황', icon: 'cube-outline' as const, badge: 0 },
          { id: 'request' as SubTab, title: isForeign ? 'Request' : '재고 요청', icon: 'clipboard-outline' as const, badge: requestBadge },
          ...(perm.isStockManager ? [{ id: 'purchase' as SubTab, title: isForeign ? 'To buy' : '구매 목록', icon: 'cart-outline' as const, badge: 0 }] : []),
          ...(perm.isStockManager ? [{ id: 'movement' as SubTab, title: isForeign ? 'History' : '입출고 기록', icon: 'list-outline' as const, badge: 0 }] : []),
          { id: 'lost' as SubTab, title: isForeign ? 'Lost' : '분실물', icon: 'search-outline' as const, badge: keptLostCount },
          ...(isAdmin ? [{ id: 'manage' as SubTab, title: '관리', icon: 'settings-outline' as const, badge: 0 }] : []),
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
      </ScrollView>

      {subTab === 'stock' ? (
        <View style={{ flex: 1 }}>
          {/* 고정 툴바: 검색 · 분류 · 범위/그룹 */}
          <View style={styles.toolbar}>
            {perm.isStockManager && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setShortOnly(v => !v)} activeOpacity={0.7}
                  style={[styles.summaryCard, shortOnly ? { borderColor: '#f87171', backgroundColor: '#fef2f2' } : shortIds.size > 0 ? { borderColor: '#fecaca' } : null]}>
                  <Text style={styles.summaryLabel}>재고 부족{shortOnly ? ' · 보는 중' : ''}</Text>
                  <Text style={[styles.summaryValue, shortIds.size > 0 ? { color: '#dc2626' } : { color: '#9ca3af' }]}>
                    {shortIds.size}<Text style={styles.summaryUnit}>개 품목</Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSubTab('request')} activeOpacity={0.7} style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>미처리 요청</Text>
                  <Text style={[styles.summaryValue, openRequestCount > 0 ? { color: '#047857' } : { color: '#9ca3af' }]}>
                    {openRequestCount}<Text style={styles.summaryUnit}>건 ›</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={search} onChangeText={setSearch} placeholder="품목 · 종류 · 성분 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} returnKeyType="search" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {isAdmin && (
                <TouchableOpacity onPress={() => setAdding({ category: category === '전체' ? undefined : category })} style={[styles.chip, { backgroundColor: '#1f2937', borderColor: '#1f2937', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                  <Ionicons name="add" size={13} color="#fff" />
                  <Text style={[styles.chipText, { color: '#fff' }]}>{category === '전체' ? '품목 추가' : `${category}에 추가`}</Text>
                </TouchableOpacity>
              )}
              {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {groups.length > 0 && (
                <TouchableOpacity onPress={() => { setGroupTouched(true); setGroupFilter(''); }} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>모든 그룹</Text>
                </TouchableOpacity>
              )}
              {groups.map(g => (
                <TouchableOpacity key={g.id} onPress={() => { setGroupTouched(true); setGroupFilter(groupFilter === g.id ? '' : g.id); }} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.id === myInvGroupId ? '★ ' : ''}{g.name}</Text>
                </TouchableOpacity>
              ))}
              {perm.isStockManager && (
                <TouchableOpacity onPress={() => setShortOnly(v => !v)} style={[styles.miniChip, shortOnly && { backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                  <Text style={[styles.miniChipText, shortOnly && { color: '#b91c1c', fontWeight: '700' }]}>부족만</Text>
                </TouchableOpacity>
              )}
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
                {isAdmin && (
                  <TouchableOpacity onPress={() => setAdding({ category: section.cat, subCategory: section.sub })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 'auto' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>+ 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            renderItem={({ item: v, index, section }) => (
              <StockRowMobile view={v} groups={groups} focusGroupId={groupFilter} showStatus={perm.isStockManager}
                isShort={shortItems.has(v.id)} isLast={index === section.data.length - 1}
                onPress={() => { setQuickUseGroupId(undefined); setSelectedId(v.id); }}
                onQuickUse={groupFilter && groupFilter in v.stocks ? () => { setQuickUseGroupId(groupFilter); setSelectedId(v.id); } : undefined} />
            )}
          />
        </View>
      ) : subTab === 'request' ? (
        <SupplyRequestTabMobile deepLink={deepLink} onDeepLinkDone={() => setDeepLink(null)} campCode={campCode} jobCodeId={activeJobCodeId ?? ''} requests={requests} settings={supplySettings} guides={supplyGuides} campGroups={campGroups}
          prefill={requestPrefill} onPrefillDone={() => setRequestPrefill(null)}
          userGroup={userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group} items={items} views={views} groups={groups} needs={needs} students={students} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      ) : subTab === 'purchase' && perm.isStockManager ? (
        <PurchaseListTabMobile views={views} groups={groups} needs={needs} requests={requests} settings={supplySettings}
          onSelect={id => { setQuickUseGroupId(undefined); setSelectedId(id); }} onGoRequests={() => setSubTab('request')} />
      ) : subTab === 'movement' && perm.isStockManager ? (
        <MovementTabMobile campCode={campCode} groups={groups} views={views} />
      ) : subTab === 'manage' && isAdmin ? (
        <ManageTabMobile campCode={campCode} jobCodeId={activeJobCodeId ?? ''} settings={supplySettings} guides={supplyGuides}
          items={items} views={views} groups={groups} packages={packages} campGroups={campGroups} userName={userName}
          onSelect={id => { setQuickUseGroupId(undefined); setSelectedId(id); }} onEditItem={it => setEditingItem(it)} />
      ) : (
        <LostListMobile campCode={campCode} jobCodeId={activeJobCodeId ?? ''} students={students} campGroups={campGroups} lostItems={lostItems} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      )}

      <Modal visible={!!editingItem} animationType="fade" transparent onRequestClose={() => setEditingItem(null)}>
        {editingItem && <ItemFormMobile item={editingItem === 'new' ? undefined : editingItem} groups={groups} perm={perm} userName={userName} onClose={() => setEditingItem(null)}
          onCreated={id => setTimeout(() => setSelectedId(id), 300)} />}
      </Modal>
      <Modal visible={!!adding} animationType="fade" transparent onRequestClose={() => setAdding(null)}>
        {adding && <ItemFormMobile preset={adding} groups={groups} campCode={campCode} defaultGroupId={groupFilter || myInvGroupId} perm={perm} userName={userName}
          onClose={() => setAdding(null)} onCreated={id => setTimeout(() => setSelectedId(id), 300)} />}
      </Modal>
      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelectedId(null)}>
        {selected && (
          <ItemDetailMobile view={selected} groups={groups} campCode={campCode} perm={perm} userId={userData?.userId ?? ''} userName={userName}
            initialUseGroupId={quickUseGroupId} defaultGroupId={groupFilter || myInvGroupId}
            onClose={() => { setSelectedId(null); setQuickUseGroupId(undefined); }}
            onRequest={(v, gid) => {
              const g = groups.find(x => x.id === (gid ?? myInvGroupId)) ?? groups[0];
              setSelectedId(null);
              setRequestPrefill({ nonce: Date.now(), req: { forType: 'camp', items: [{ id: 'pf', itemId: v.id, name: v.name, quantity: 1, unit: v.unit || '개', groupId: g?.id, groupName: g?.name }] } as unknown as SupplyRequest });
              setSubTab('request');
            }}
            onEditItem={() => { const it = items.find(x => x.id === selected.id); setSelectedId(null); if (it) setTimeout(() => setEditingItem(it), 300); }} />
        )}
      </Modal>
    </View>
  );
}

// ==================== 재고 행 (컴팩트) ====================

/** 한 줄 요약: 이름·종류 | 그룹별 수량(있는 그룹만) | 총량. 그룹을 고르면 그 그룹 수량을 크게 */
const StockRowMobile = React.memo(function StockRowMobile({ view: v, groups, focusGroupId, showStatus, isShort, isLast, onPress, onQuickUse }: {
  view: InventoryItemView; groups: InventoryGroup[]; focusGroupId: string; showStatus: boolean; isShort: boolean; isLast: boolean; onPress: () => void; onQuickUse?: () => void;
}) {
  const qty = focusGroupId ? getGroupStock(v, focusGroupId) : v.total;
  const min = focusGroupId ? getMinStock(v, focusGroupId) : 0;
  const low = focusGroupId ? (qty < 0 || (min > 0 && qty < min)) : isShort;
  // 일반 멘토에게는 부족 상태를 표시하지 않는다 (실사 필요한 음수만 빨갛게)
  const lowShown = showStatus ? low : qty < 0;
  const thumb = itemThumb(v);
  const loc = focusGroupId ? v.locations?.[focusGroupId] : undefined;
  const meta = [v.kind, v.spec, loc ? `📍 ${loc}` : '', focusGroupId ? '' : `${groups.filter(g => g.id in v.stocks).length}곳 합계`].filter(Boolean).join(' · ');
  const ex = earliestExpiry(v, focusGroupId || undefined);
  const exSt = expiryState(ex);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.row, styles.stockRow, isLast && { borderBottomWidth: 0 }]}>
      {thumb
        ? <Image source={{ uri: thumb }} style={styles.rowThumb} contentFit="cover" />
        : <View style={[styles.rowThumb, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="cube-outline" size={16} color="#cbd5e1" /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{v.name}</Text>
        <Text style={styles.rowGroups} numberOfLines={1}>{meta || ' '}</Text>
      </View>
      {(exSt === 'expired' || exSt === 'soon') && (
        <View style={[styles.badgeWarn, exSt === 'soon' && { backgroundColor: '#fef3c7' }]}>
          <Text style={[styles.badgeWarnText, exSt === 'soon' && { color: '#92400e' }]}>{exSt === 'expired' ? '만료' : '임박'}</Text>
        </View>
      )}
      <View style={{ alignItems: 'flex-end', width: 52 }}>
        <Text style={[styles.rowTotal, lowShown && { color: '#dc2626' }]}>{qty}<Text style={styles.rowUnit}>{v.unit}</Text></Text>
      </View>
      {showStatus && (
        <View style={{ width: 34, alignItems: 'center' }}>
          {low ? <View style={styles.badgeLow}><Text style={styles.badgeLowText}>부족</Text></View>
            : <Text style={{ fontSize: 10, color: '#9ca3af' }}>정상</Text>}
        </View>
      )}
      {onQuickUse ? (
        <TouchableOpacity onPress={onQuickUse} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }} style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#1d4ed8' }}>−</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
});

// ==================== 📝 재고 요청 (멘토 구매 요청 · 모두 공유) ====================

type SupplyFilter = 'open' | 'buy' | 'settle' | 'mine' | 'done';
type SupplyEditing = { mode: 'new'; prefill?: SupplyRequest } | { mode: 'edit'; req: SupplyRequest };
type SupplyAssigning = { mode: 'default' } | { mode: 'reqs'; reqs: SupplyRequest[] };
type SupplyBuyer = ReturnType<typeof supplyBuyerOf>;
const FOR_ICON: Record<SupplyForType, string> = { student: '👧', mentor: '🧑‍🏫', camp: '🏕' };
const PAYTO_KEY = 'smis.supply.payTo';

function addDaysStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtHoldDate(s?: string): string {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}
function supplyStatusLine(r: SupplyRequest, buyer: SupplyBuyer): string {
  if (r.status === 'onhold') return `⏸ 보류${r.holdUntil ? ` · ${fmtHoldDate(r.holdUntil)} 구매 예정` : ''}${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'rejected') return `반려${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'purchased') {
    const base = `구매 완료${r.amount ? ` · ${fmtWon(r.amount)}` : ''}`;
    if (r.forType === 'camp') return base + (r.stockApplied ? ' · 재고 입고됨' : needsStockIntake(r) ? ' · 📥 재고 입고 대기' : '');
    const lines = supplySettleLines([r]);
    return lines.length ? `${base} · 정산 ${lines.filter(l => l.settled).length}/${lines.length}` : base;
  }
  const done = supplyDoneCount(r);
  return `${buyer ? `🛒 ${buyer.name}${buyer.isDefault ? '(기본)' : ''}` : '🛒 구매 담당 없음'}${done ? ` · ${done}/${r.items.length} 구매` : ''}`;
}
const settleVerb = (kind: SupplyLineSettleKind) => SUPPLY_SETTLE_LABELS[kind].verb;
const guideTagText = (l: Pick<SupplyRequestLine, 'channel' | 'parentBill'>) => [l.channel, l.parentBill ? '학부모 청구' : ''].filter(Boolean).join(' · ');
function GuideTagMobile({ line }: { line: Pick<SupplyRequestLine, 'channel' | 'parentBill'> }) {
  const t = guideTagText(line);
  if (!t) return null;
  return <Text style={{ fontSize: 9, fontWeight: '700', color: '#9a3412', backgroundColor: '#ffedd5' }}> {t} </Text>;
}
function SectionHeaderMobile({ label, count }: { label: string; count: number }) {
  return <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', paddingHorizontal: 2, paddingTop: 2 }}>{label === '캠프 공용' ? '🏕 ' : '👥 '}{label} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{count}</Text></Text>;
}
const failAlert = () => Alert.alert('오류', '처리하지 못했습니다. 권한을 확인해주세요.');
/** 푸시 알림 요청 — 실패해도 화면 동작은 그대로 (받는 사람은 서버가 정한다) */
/**
 * 알림 요청 — 보낸 뒤 **못 받은 사람이 있으면 보낸 사람에게 알려 준다**
 * (그 자리에서 "알림 켜 주세요"라고 말할 수 있게).
 */
function notifySupply(body: Record<string, unknown>) {
  authenticatedFetch('/api/inventory/notify', { method: 'POST', body: JSON.stringify(body) })
    .then(async res => {
      // 재고 부족(stock_low)은 사용 기록에 따라 자동으로 나가는 알림이라 알려 주지 않는다
      if (body.type === 'stock_low') return;
      const data = (await res.json().catch(() => null)) as { missed?: Array<{ name: string; state: string }> } | null;
      const msg = missedSummary(data?.missed);
      if (msg) Alert.alert('알림을 못 받은 사람이 있어요', msg);
    })
    .catch(e => console.warn('알림 요청 실패:', e));
}

function SupplyRequestTabMobile({ deepLink, onDeepLinkDone, campCode, jobCodeId, requests, settings, guides, campGroups, items, views, groups, needs, students, isAdmin, userId, userName, userGroup, prefill, onPrefillDone }: {
  deepLink?: InventoryDeepLink | null; onDeepLinkDone?: () => void;
  campCode: string; jobCodeId: string; requests: SupplyRequest[]; settings: SupplySettings | null; guides: SupplyGuide[]; campGroups: CampGroup[];
  items: InventoryItem[]; views: InventoryItemView[]; groups: InventoryGroup[]; needs: PurchaseNeed[]; students: STSheetStudent[];
  isAdmin: boolean; userId: string; userName: string; userGroup?: string;
  /** 재고 현황 상세의 '필요한 물품 요청' 으로 들어온 경우 — 작성 폼을 미리 채워 연다 */
  prefill?: { req: SupplyRequest; nonce: number } | null;
  onPrefillDone?: () => void;
}) {
  const sectionsOf = <T,>(list: T[], reqOf: (t: T) => SupplyRequest) => groupSupplyByCampGroup(list, reqOf, campGroups, students);
  const [candidates, setCandidates] = useState<SupplyBuyerCandidate[]>([]);
  useEffect(() => {
    if (!isAdmin || !jobCodeId) return;
    getUsersByJobCodeId(jobCodeId).then(us => setCandidates(supplyBuyerCandidates(us, jobCodeId))).catch(e => console.error('캠프 인원 조회 오류:', e));
  }, [isAdmin, jobCodeId]);
  const [filter, setFilter] = useState<SupplyFilter>('open');
  const [editing, setEditing] = useState<SupplyEditing | null>(null);
  useEffect(() => {
    if (!prefill) return;
    setEditing({ mode: 'new', prefill: prefill.req });
    onPrefillDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);
  const [openId, setOpenId] = useState<string | null>(null);
  // 푸시 알림으로 들어오면 해당 요청 열기 / 내 구매·정산 화면 보여 주기
  useEffect(() => {
    if (!deepLink) return;
    if (deepLink.view === 'buy' || deepLink.view === 'settle') setFilter(deepLink.view);
    if (deepLink.requestId && requests.some(r => r.id === deepLink.requestId)) { setOpenId(deepLink.requestId); onDeepLinkDone?.(); }
    else if (!deepLink.requestId) onDeepLinkDone?.();
  }, [deepLink, requests, onDeepLinkDone]);
  const [assigning, setAssigning] = useState<SupplyAssigning | null>(null);
  const [completing, setCompleting] = useState<{ reqId: string; lineIds: string[] } | null>(null);
  const opened = requests.find(r => r.id === openId) ?? null;
  const completingReq = completing ? requests.find(r => r.id === completing.reqId) ?? null : null;

  const buyerOf = (r: SupplyRequest) => supplyBuyerOf(r, settings);
  const canBuy = (r: SupplyRequest) => isAdmin || buyerOf(r)?.uid === userId;
  const mentorOf = (r: SupplyRequest) => (r.classMentor || students.find(s => s.studentId === r.studentId)?.classMentor || '').trim();
  const isMe = (name: string) => !!name && name.trim() === userName.trim();
  const settlerIsMe = (r: SupplyRequest) => (r.forType === 'student' ? isMe(mentorOf(r)) : r.requesterId === userId);

  const open = useMemo(() => requests.filter(r => isSupplyOpen(r.status)), [requests]);
  const mine = useMemo(() => requests.filter(r => r.requesterId === userId), [requests, userId]);
  const myBuys = useMemo(() => open.filter(r => r.status === 'requested' && supplyBuyerOf(r, settings)?.uid === userId && !supplyAllDone(r)), [open, settings, userId]);
  const myBuyLineCount = myBuys.reduce((a, r) => a + r.items.length - supplyDoneCount(r), 0);
  const shopping = useMemo(() => supplyShoppingList(myBuys), [myBuys]);
  // 여러 요청에 걸쳐 같은 물품이 있으면 묶어서 (규격·단위가 다르면 따로 합산된다)
  const duplicated = useMemo(() => supplyShoppingList(open).filter(l => l.who.length >= 2), [open]);
  const [showDup, setShowDup] = useState(true);
  const settleAll = useMemo(() => supplySettleLines(requests), [requests]);
  const settlesLine = (s: SupplySettleLine) => (s.kind === 'parent' ? isAdmin : settlerIsMe(s.req) || isAdmin);
  const settleVisible = settleAll.filter(s => isAdmin || (s.kind !== 'parent' && settlerIsMe(s.req)) || s.done.byId === userId);
  const mySettleTodo = settleVisible.filter(s => !s.settled && (s.kind === 'parent' ? false : settlerIsMe(s.req)));
  const settleBadge = isAdmin ? settleVisible.filter(s => !s.settled).length : mySettleTodo.length;
  const settleByReq = (() => {
    const m = new Map<string, SupplySettleLine[]>();
    settleVisible.forEach(s => { const k = `${s.req.id}|${s.kind}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); });
    return [...m.values()].sort((a, b) => Number(a.every(s => s.settled)) - Number(b.every(s => s.settled)));
  })();
  const list = filter === 'open' ? open : filter === 'mine' ? mine : requests.filter(r => !isSupplyOpen(r.status));

  const shortage = useMemo(() => uncoveredPurchaseNeeds(needs, requests), [needs, requests]);
  const intakeWaiting = useMemo(() => requests.filter(needsStockIntake), [requests]);
  const [showNeeds, setShowNeeds] = useState(false);
  const [posting, setPosting] = useState(false);
  const postNeeds = async () => {
    if (posting || shortage.length === 0) return;
    setPosting(true);
    try { await addCampRequestsFromNeeds(db, campCode, shortage, items, { uid: userId, name: userName }); }
    catch (e) { console.error(e); Alert.alert('오류', '요청을 만들지 못했습니다.'); }
    finally { setPosting(false); }
  };
  const shareShopping = () => Share.share({ message: `[장보기 목록]\n${shopping.map(l => `• ${l.name} ${l.total}${l.unit}  (${l.who.join(', ')})`).join('\n')}` });
  const settle = (r: SupplyRequest, lineIds: string[], kind: SupplyLineSettleKind) => Alert.alert(
    SUPPLY_SETTLE_LABELS[kind].title,
    `${lineIds.length}개 품목을 ${settleVerb(kind)} 완료로 할까요?`,
    [{ text: '아직', style: 'cancel' }, { text: '완료', onPress: () => settleSupplyLines(db, r.id, lineIds, { uid: userId, name: userName }).then(() => notifySupply({ type: 'settled', requestId: r.id, lineIds })).catch(failAlert) }]);
  const defaultBuyer = settings?.defaultBuyerId ? settings.defaultBuyerName : '';

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => setEditing({ mode: 'new' })} style={styles.primaryBtn}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>필요한 물품 요청하기</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 5 }}>
          {([
            ['open', `진행 중 ${open.length}`, true],
            ['buy', `🛒 내 구매 ${myBuyLineCount}`, myBuys.length > 0],
            ['settle', `💰 정산 ${settleBadge}`, settleVisible.length > 0],
            ['mine', `내 요청 ${mine.length}`, true],
            ['done', '완료·반려', true],
          ] as const).filter(([, , show]) => show).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.miniChip, id === 'settle' && settleBadge > 0 && { backgroundColor: '#fef9c3' }, id === 'buy' && { backgroundColor: '#ecfdf5' }, filter === id && styles.miniChipDark]}>
              <Text style={[styles.miniChipText, id === 'settle' && settleBadge > 0 && { color: '#854d0e' }, id === 'buy' && { color: '#047857' }, filter === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>
        {isAdmin && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: defaultBuyer ? '#ecfdf5' : '#fef2f2', borderWidth: !defaultBuyer ? 1 : 0, borderColor: '#fecaca' }}>
          <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>🛒 기본 구매 담당 <Text style={{ fontWeight: '800', color: '#111827' }}>{defaultBuyer || '미지정'}</Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{defaultBuyer ? '  따로 지정 안 한 요청은 모두 이 사람이 사 와요' : isAdmin ? '  지정하면 요청마다 고르지 않아도 돼요' : '  관리자가 지정해요'}</Text></Text>
          <TouchableOpacity onPress={() => setAssigning({ mode: 'default' })} style={styles.actBtn}><Text style={[styles.actBtnText, { color: '#047857' }]}>{defaultBuyer ? '변경' : '지정'}</Text></TouchableOpacity>
        </View>}

        {filter === 'open' && (myBuys.length > 0 || mySettleTodo.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {myBuys.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('buy')} style={{ flex: 1, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>🛒 제가 사 올 것 {myBuyLineCount}품목 →</Text>
              </TouchableOpacity>
            )}
            {mySettleTodo.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('settle')} style={{ flex: 1, borderWidth: 1, borderColor: '#fde047', backgroundColor: '#fefce8', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#713f12' }}>💰 정산할 것 {mySettleTodo.length}건 →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350f' }}>📥 구매했지만 재고 입고 전 {intakeWaiting.length}건</Text>
            {intakeWaiting.map(r => (
              <TouchableOpacity key={r.id} onPress={() => setOpenId(r.id)}>
                <Text style={{ fontSize: 11, color: '#78350f' }} numberOfLines={1}>🏕 {r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ')} <Text style={{ color: '#b45309', fontWeight: '700' }}>→ 입고</Text></Text>
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
          </View>
        )}

        {filter === 'buy' ? (
          <>
            <View style={[styles.listBox, { borderColor: '#fde68a' }]}>
              <View style={[styles.row, { backgroundColor: '#fffbeb' }]}>
                <Text style={[styles.blockTitle, { flex: 1 }]}>🧾 장보기 목록 <Text style={{ fontSize: 11, fontWeight: '400', color: '#92400e' }}>{shopping.length}품목</Text></Text>
                <TouchableOpacity onPress={shareShopping} style={styles.actBtn}><Text style={styles.actBtnText}>공유</Text></TouchableOpacity>
              </View>
              {shopping.map((l, i) => (
                <View key={l.key} style={[styles.row, i === shopping.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
                    <Text style={styles.rowGroups} numberOfLines={2}>{l.who.join(' · ')}</Text>
                  </View>
                  <Text style={[styles.rowTotal, { color: '#b45309', fontSize: 15 }]}>{l.total}<Text style={styles.rowUnit}>{l.unit}</Text></Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>사 온 품목마다 '완료'를 눌러 금액을 적어주세요. 학생 물품은 담임쌤이 용돈봉투에서, 선생님 물품은 본인이 송금해요.</Text>
            {sectionsOf(myBuys, r => r).map(sec => (
              <View key={sec.key} style={{ gap: 8 }}>
                <SectionHeaderMobile label={sec.label} count={sec.items.length} />
                {sec.items.map(r => (
                  <SupplyLinesCardMobile key={r.id} req={r} canBuy onOpen={() => setOpenId(r.id)}
                    onComplete={ids => setCompleting({ reqId: r.id, lineIds: ids })} onUndo={id => undoSupplyLine(db, r.id, id).catch(failAlert)} />
                ))}
              </View>
            ))}
          </>
        ) : filter === 'settle' ? (
          <>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>학생 물품은 담임쌤이 용돈봉투에서 빼서, 선생님 물품은 본인이 송금해서 구매한 사람에게 주고 완료를 눌러주세요.</Text>
            {sectionsOf(settleByReq, g => g[0].req).map(sec => (
            <View key={sec.key} style={{ gap: 8 }}>
            <SectionHeaderMobile label={sec.label} count={sec.items.length} />
            {sec.items.map(group => {
              const r = group[0].req;
              const kind = group[0].kind;
              const mineToSettle = settlesLine(group[0]);
              const pendingIds = group.filter(s => !s.settled).map(s => s.line.id);
              const byPayee = new Map<string, { amount: number; payTo?: string }>();
              group.filter(s => !s.settled).forEach(s => {
                const cur = byPayee.get(s.done.by) ?? { amount: 0 };
                byPayee.set(s.done.by, { amount: cur.amount + (s.done.amount ?? 0), payTo: s.done.payTo || cur.payTo });
              });
              return (
                <View key={`${r.id}|${kind}`} style={{ borderWidth: 1, borderColor: pendingIds.length ? (kind === 'parent' ? '#fdba74' : '#fde047') : '#e5e7eb', backgroundColor: pendingIds.length ? (kind === 'parent' ? '#fff7ed' : '#fefce8') : '#fff', borderRadius: 10, padding: 10, gap: 6 }}>
                  <TouchableOpacity onPress={() => setOpenId(r.id)} activeOpacity={0.6}>
                    <Text style={styles.rowName}>{FOR_ICON[r.forType]} {supplyForLabel(r)}  <Text style={{ fontSize: 11, fontWeight: '400', color: '#6b7280' }}>{kind === 'envelope' ? `담임 ${mentorOf(r) || '미확인'} · 용돈봉투` : kind === 'transfer' ? '본인 송금' : '학부모 청구 (관리자)'}</Text></Text>
                  </TouchableOpacity>
                  {group.map(s => (
                    <View key={s.line.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ flex: 1, fontSize: 12, color: s.settled ? '#9ca3af' : '#1f2937', textDecorationLine: s.settled ? 'line-through' : 'none' }} numberOfLines={1}>
                        {s.line.name} {s.line.quantity}{s.line.unit} · <Text style={{ fontWeight: '700' }}>{fmtWon(s.done.amount)}</Text> → {s.done.by}
                      </Text>
                      {s.settled ? (
                        <TouchableOpacity disabled={!(isAdmin || s.settled.byId === userId)} onPress={() => settleSupplyLines(db, r.id, [s.line.id], null).catch(failAlert)}>
                          <Text style={{ fontSize: 10, color: '#047857' }}>✓ {s.settled.by}{(isAdmin || s.settled.byId === userId) ? ' · 취소' : ''}</Text>
                        </TouchableOpacity>
                      ) : mineToSettle ? (
                        <TouchableOpacity onPress={() => settle(r, [s.line.id], kind)} style={{ borderWidth: 1, borderColor: '#facc15', backgroundColor: '#fff', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#713f12' }}>완료</Text>
                        </TouchableOpacity>
                      ) : <Text style={{ fontSize: 10, color: '#854d0e' }}>대기</Text>}
                    </View>
                  ))}
                  {[...byPayee.entries()].map(([payee, v]) => (
                    <Text key={payee} selectable style={{ fontSize: 11, color: '#713f12', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: 6 }}>
                      {SUPPLY_SETTLE_LABELS[kind].icon} {kind === 'parent' ? '학부모님께 ' : ''}<Text style={{ fontWeight: '700' }}>{kind === 'parent' ? fmtWon(v.amount) : payee}</Text>{kind === 'parent' ? ` 청구 → ${payee}쌤께 지급` : <>쌤께 <Text style={{ fontWeight: '700' }}>{fmtWon(v.amount)}</Text> {settleVerb(kind)}</>}{kind === 'transfer' && v.payTo ? `\n${v.payTo}` : ''}
                    </Text>
                  ))}
                  {mineToSettle && pendingIds.length > 1 && (
                    <TouchableOpacity onPress={() => settle(r, pendingIds, kind)} style={[styles.btn, { flex: 0, backgroundColor: '#eab308', paddingVertical: 8 }]}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{kind === 'envelope' ? '📒 봉투 기재 · 현금 전달' : kind === 'transfer' ? '💸 송금' : '🧾 학부모 청구'} 모두 완료</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            </View>
            ))}
          </>
        ) : list.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="clipboard-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{filter === 'mine' ? '올린 요청이 없습니다.' : filter === 'open' ? '진행 중인 요청이 없습니다.' : '완료된 요청이 없습니다.'}</Text>
            {filter !== 'done' && <Text style={styles.emptyBody}>학생이나 본인에게 필요한 물품을 위 버튼으로 요청하세요.</Text>}
          </View>
        ) : (
          <>
            {filter === 'open' && duplicated.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 10, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => setShowDup(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#312e81' }}>
                    🧺 여러 선생님이 요청한 물품 <Text style={{ fontWeight: '400', color: '#4f46e5' }}>{duplicated.length}종</Text>
                  </Text>
                  <Ionicons name={showDup ? 'chevron-up' : 'chevron-down'} size={14} color="#818cf8" />
                </TouchableOpacity>
                {showDup && (
                  <View style={{ backgroundColor: '#fff' }}>
                    {duplicated.map((l, i) => (
                      <View key={l.key} style={{ paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : StyleSheet.hairlineWidth, borderTopColor: '#e0e7ff' }}>
                        <Text style={{ fontSize: 12 }}>
                          <Text style={{ fontWeight: '700', color: '#111827' }}>{l.name}</Text>
                          <Text style={{ fontWeight: '800', color: '#4338ca' }}>  {l.total}{l.unit}</Text>
                          <Text style={{ color: '#9ca3af' }}>  · {l.who.length}건</Text>
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: 10, color: '#6b7280' }}>{l.who.join(' · ')}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {filter === 'open' && <Text style={{ fontSize: 10, color: '#9ca3af' }}>다른 선생님 요청도 함께 보여요. 같은 게 필요하면 요청을 열어 '나도 필요해요'.</Text>}
            {sectionsOf(list, r => r).map(sec => (
              <View key={sec.key} style={{ gap: 4 }}>
                <SectionHeaderMobile label={sec.label} count={sec.items.length} />
                <View style={styles.listBox}>
                  {sec.items.map((r, i) => <SupplyRowMobile key={r.id} req={r} buyer={buyerOf(r)} isLast={i === sec.items.length - 1} onPress={() => setOpenId(r.id)} />)}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SupplyRequestFormMobile campCode={campCode} existing={editing.mode === 'edit' ? editing.req : undefined} prefill={editing.mode === 'new' ? editing.prefill : undefined}
            groups={groups} guides={guides} items={items} views={views} students={students} userId={userId} userName={userName} userGroup={userGroup} onClose={() => setEditing(null)} />
        )}
      </Modal>
      <Modal visible={!!assigning} transparent animationType="fade" onRequestClose={() => setAssigning(null)}>
        {assigning && (
          <SupplyBuyerPickerMobile candidates={candidates} title={assigning.mode === 'default' ? '기본 구매 담당' : '이 요청의 구매 담당'}
            hint={assigning.mode === 'default' ? '담당을 따로 지정하지 않은 모든 요청을 이 사람이 사 와서 품목별로 완료합니다.' : '기본 담당 대신 이 요청만 다른 사람이 사 옵니다.'}
            clearLabel={assigning.mode === 'default' ? (settings?.defaultBuyerId ? '기본 담당 해제' : '') : (assigning.reqs.some(r => r.buyerId) ? '기본 담당으로 되돌리기' : '')}
            onClose={() => setAssigning(null)}
            onPick={c => {
              const a = assigning; setAssigning(null);
              const buyer = c ? { uid: c.uid, name: c.name } : null;
              const ids = a.mode === 'reqs' ? a.reqs.map(r => r.id) : [];
              (a.mode === 'default' ? setSupplyDefaultBuyer(db, campCode, buyer, userName) : setSupplyBuyer(db, ids, buyer, userName))
                .then(() => { if (buyer) notifySupply(a.mode === 'default' ? { type: 'default_buyer', campCode } : { type: 'buyer_assigned', requestIds: ids }); })
                .catch(failAlert);
            }} />
        )}
      </Modal>
      <Modal visible={!!completing && !!completingReq} transparent animationType="fade" onRequestClose={() => setCompleting(null)}>
        {completing && completingReq && (
          <SupplyLineCompleteMobile req={completingReq} lineIds={completing.lineIds} classMentor={mentorOf(completingReq)} userId={userId} userName={userName} onClose={() => setCompleting(null)} />
        )}
      </Modal>
      <Modal visible={!!opened && !editing && !assigning && !completing} transparent animationType="fade" onRequestClose={() => setOpenId(null)}>
        {opened && (
          <SupplyRequestDetailMobile req={opened} buyer={buyerOf(opened)} canBuy={canBuy(opened)} settlerIsMe={settlerIsMe(opened)} campCode={campCode} groups={groups} views={views}
            isAdmin={isAdmin} userId={userId} userName={userName} classMentor={mentorOf(opened)}
            onAssign={() => setAssigning({ mode: 'reqs', reqs: [opened] })} onComplete={ids => setCompleting({ reqId: opened.id, lineIds: ids })}
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

const PROGRESS_COLOR: Record<string, { bg: string; fg: string }> = {
  waiting: { bg: '#f3f4f6', fg: '#4b5563' },
  approved: { bg: '#dbeafe', fg: '#1d4ed8' },
  buying: { bg: '#e0e7ff', fg: '#4338ca' },
  bought: { bg: '#d1fae5', fg: '#047857' },
  received: { bg: '#d1fae5', fg: '#047857' },
  onhold: { bg: '#fef3c7', fg: '#92400e' },
  rejected: { bg: '#f3f4f6', fg: '#6b7280' },
};

function SupplyRowMobile({ req: r, buyer, isLast, onPress }: { req: SupplyRequest; buyer: SupplyBuyer; isLast: boolean; onPress: () => void }) {
  const pg = supplyProgress(r, !!buyer);
  const c = PROGRESS_COLOR[pg.key] ?? SUPPLY_STATUS_COLOR[r.status];
  const what = r.items.map(l => `${r.done?.[l.id] ? '✓' : ''}${l.name} ${l.quantity}${l.unit}${l.groupName ? ` (${l.groupName})` : ''}`).join(', ');
  const status = supplyStatusLine(r, buyer);
  const last = r.comments?.[r.comments.length - 1];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.row, isLast && { borderBottomWidth: 0 }, { alignItems: 'flex-start' }]}>
      <Text style={{ fontSize: 18, marginTop: 1 }}>{FOR_ICON[r.forType]}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{supplyForLabel(r)} <Text style={styles.rowMeta}>{r.requesterName} · {fmtDateTime(r.createdAt)}</Text></Text>
        <Text style={[styles.rowGroups, { color: '#374151' }]} numberOfLines={2}>{what || '물품 없음'}</Text>
        <Text style={[styles.rowGroups, { fontSize: 10, color: r.status === 'onhold' ? '#b45309' : r.status === 'requested' ? '#047857' : '#6b7280' }]} numberOfLines={1}>{status}</Text>
        {last ? <Text style={[styles.rowGroups, { fontSize: 10 }]} numberOfLines={1}>💬 {r.comments!.length} · <Text style={{ fontWeight: '700', color: last.admin ? '#4338ca' : '#374151' }}>{last.name}</Text> {last.text}</Text> : null}
      </View>
      <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: c.fg }}>{pg.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** 요청 1건의 품목들 — 구매 담당이 품목별 완료 */
function SupplyLinesCardMobile({ req: r, canBuy, onOpen, onComplete, onUndo }: {
  req: SupplyRequest; canBuy: boolean; onOpen: () => void; onComplete: (lineIds: string[]) => void; onUndo: (lineId: string) => void;
}) {
  const undone = r.items.filter(l => !r.done?.[l.id]).map(l => l.id);
  return (
    <View style={styles.listBox}>
      <TouchableOpacity onPress={onOpen} activeOpacity={0.6} style={[styles.row, { backgroundColor: '#f9fafb' }]}>
        <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{FOR_ICON[r.forType]} {supplyForLabel(r)} <Text style={styles.rowMeta}>{r.requesterName}</Text></Text>
        <Text style={{ fontSize: 10, color: '#6b7280' }}>{supplyDoneCount(r)}/{r.items.length}</Text>
      </TouchableOpacity>
      {r.note ? <Text style={{ fontSize: 11, color: '#6b7280', paddingHorizontal: 10, paddingTop: 4 }}>📝 {r.note}</Text> : null}
      {r.items.map((l, i) => {
        const d = r.done?.[l.id];
        return (
          <View key={l.id} style={[styles.row, i === r.items.length - 1 && undone.length <= 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowName, d && { color: '#9ca3af', textDecorationLine: 'line-through', fontWeight: '400' }]} numberOfLines={1}>{l.name} {l.quantity}{l.unit}{l.groupName ? ` → ${l.groupName}` : ''}<GuideTagMobile line={l} /></Text>
              {l.memo && !d ? <Text style={styles.rowGroups} numberOfLines={1}>{l.memo}</Text> : null}
              {d ? <Text style={[styles.rowGroups, { color: '#047857' }]} numberOfLines={1}>✓ {d.amount ? fmtWon(d.amount) : '금액 없음'} · {d.by}{d.payTo ? ` · ${d.payTo}` : ''}</Text> : null}
            </View>
            {canBuy && (d
              ? <TouchableOpacity onPress={() => onUndo(l.id)}><Text style={{ fontSize: 11, color: '#9ca3af' }}>취소</Text></TouchableOpacity>
              : <TouchableOpacity onPress={() => onComplete([l.id])} style={{ backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 11, paddingVertical: 6 }}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>완료</Text></TouchableOpacity>)}
          </View>
        );
      })}
      {canBuy && undone.length > 1 && (
        <TouchableOpacity onPress={() => onComplete(undone)} style={{ paddingVertical: 8, alignItems: 'center', backgroundColor: '#ecfdf5' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>남은 {undone.length}개 한 번에 완료</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** 품목 구매 완료 — 금액 + (선생님 물품) 송금받을 곳 */
function SupplyLineCompleteMobile({ req: r, lineIds, classMentor, userId, userName, onClose }: {
  req: SupplyRequest; lineIds: string[]; classMentor: string; userId: string; userName: string; onClose: () => void;
}) {
  const lines = r.items.filter(l => lineIds.includes(l.id));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.id, r.done?.[l.id]?.amount ? String(r.done[l.id].amount) : ''])));
  const [payTo, setPayTo] = useState('');
  useEffect(() => { AsyncStorage.getItem(PAYTO_KEY).then(v => { if (v) setPayTo(p => p || v); }).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const num = (s: string) => parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0;
  const total = lines.reduce((a, l) => a + num(amounts[l.id]), 0);
  const kind = supplySettleKind(r);
  const doSubmit = async () => {
    setBusy(true);
    try {
      if (kind === 'transfer' && payTo.trim()) AsyncStorage.setItem(PAYTO_KEY, payTo.trim()).catch(() => {});
      await completeSupplyLines(db, r.id, lines.map(l => ({ lineId: l.id, amount: num(amounts[l.id]), payTo: kind === 'transfer' && !l.parentBill ? payTo : undefined })), { uid: userId, name: userName });
      notifySupply({ type: 'lines_done', requestId: r.id, lineIds: lines.map(l => l.id) });
      onClose();
    } catch (e) { console.error(e); Alert.alert('오류', '완료 처리를 하지 못했습니다. 구매 담당인지 확인해주세요.'); }
    finally { setBusy(false); }
  };
  const submit = () => {
    const warn = [
      kind && lines.some(l => !num(amounts[l.id])) ? '금액이 비어 있는 품목이 있어요 (정산 요청이 가지 않아요).' : '',
      kind === 'transfer' && lines.some(l => !l.parentBill) && !payTo.trim() ? '송금받을 계좌가 비어 있어요.' : '',
    ].filter(Boolean);
    if (!warn.length) { doSubmit(); return; }
    Alert.alert('확인', warn.join('\n'), [{ text: '입력하기', style: 'cancel' }, { text: '그대로 완료', onPress: doSubmit }]);
  };
  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>✓ 구매 완료 <Text style={{ fontSize: 12, fontWeight: '400', color: '#6b7280' }}>{FOR_ICON[r.forType]} {supplyForLabel(r)}</Text></Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{kind === 'envelope' ? `담임 ${classMentor || '(미확인)'}쌤이 용돈봉투에서 빼서 나에게 전달하도록 정산 요청이 가요.` : kind === 'transfer' ? `${r.requesterName}쌤이 아래 계좌로 송금하도록 정산 요청이 가요.` : '캠프 공용 — 관리자가 재고에 입고합니다. 금액은 기록용이에요.'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={styles.listBox}>
            {lines.map((l, i) => (
              <View key={l.id} style={[styles.row, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{l.name} <Text style={styles.rowMeta}>{l.quantity}{l.unit}</Text><GuideTagMobile line={l} /></Text>
                <TextInput value={amounts[l.id]} keyboardType="number-pad" autoFocus={i === 0} onChangeText={v => setAmounts(a => ({ ...a, [l.id]: v.replace(/[^0-9]/g, '') }))}
                  placeholder="금액" placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 90, textAlign: 'right', paddingVertical: 5 }, kind && !num(amounts[l.id]) ? { borderColor: '#fcd34d', backgroundColor: '#fefce8' } : null]} />
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>원</Text>
              </View>
            ))}
          </View>
          {lines.some(l => l.parentBill) && <Text style={{ fontSize: 10, color: '#c2410c', backgroundColor: '#fff7ed', borderRadius: 6, padding: 6 }}>🧾 '학부모 청구' 품목은 용돈봉투·송금 대신 관리자가 학부모님께 청구해요.</Text>}
          {kind === 'transfer' && lines.some(l => !l.parentBill) && (
            <View>
              <Text style={styles.formLabel}>💸 송금받을 곳</Text>
              <TextInput value={payTo} onChangeText={setPayTo} placeholder="예: 카카오뱅크 3333-01-1234567 홍길동" placeholderTextColor="#9ca3af" style={styles.input} />
              <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>이 기기에 기억해 두고 다음에 자동으로 채워요.</Text>
            </View>
          )}
          <Text style={{ textAlign: 'right', fontSize: 12, color: '#4b5563' }}>합계 <Text style={{ fontWeight: '800', color: '#111827' }}>{fmtWon(total)}</Text></Text>
          <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? '처리 중...' : `${lines.length}개 품목 구매 완료`}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 구매 담당 고르기 (관리자) */
function SupplyBuyerPickerMobile({ candidates, title, hint, clearLabel, onPick, onClose }: {
  candidates: SupplyBuyerCandidate[]; title: string; hint: string; clearLabel: string; onPick: (c: SupplyBuyerCandidate | null) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = candidates.filter(c => !q.trim() || c.name.includes(q.trim()) || c.tag.includes(q.trim()));
  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>🛒 {title}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{hint}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput value={q} onChangeText={setQ} placeholder="이름 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <View style={styles.listBox}>
            {list.length === 0 && <Text style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>{candidates.length ? '검색 결과가 없습니다.' : '캠프 인원을 불러오는 중...'}</Text>}
            {list.map((c, i) => (
              <TouchableOpacity key={c.uid} onPress={() => onPick(c)} activeOpacity={0.6} style={[styles.row, i === list.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.rowName, { flex: 1 }]}>{c.name}</Text>
                {c.tag ? (
                  <View style={{ backgroundColor: c.rank === 0 ? '#e0e7ff' : c.rank === 1 ? '#fef3c7' : '#f3f4f6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: c.rank === 0 ? '#4338ca' : c.rank === 1 ? '#92400e' : '#6b7280' }}>{c.tag}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          {clearLabel ? (
            <TouchableOpacity onPress={() => onPick(null)} style={[styles.btn, { marginTop: 10, flex: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}>
              <Text style={{ fontSize: 12, color: '#ef4444' }}>{clearLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 요청 올리기 / 수정 / 나도 필요해요 — 누가 · 무엇 */
function SupplyRequestFormMobile({ campCode, existing, prefill, groups, guides, items, views, students, userId, userName, userGroup, onClose }: {
  campCode: string; existing?: SupplyRequest; prefill?: SupplyRequest; groups: InventoryGroup[]; guides: SupplyGuide[]; items: InventoryItem[]; views: InventoryItemView[]; students: STSheetStudent[];
  userId: string; userName: string; userGroup?: string; onClose: () => void;
}) {
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const [forType, setForType] = useState<SupplyForType>(existing?.forType ?? (prefill?.forType === 'camp' ? 'camp' : 'student'));
  const defaultGroup = groups[0];
  const [student, setStudent] = useState<{ id?: string; name: string; cls?: string; mentor?: string; code?: string } | null>(
    existing?.studentName ? { id: existing.studentId, name: existing.studentName, cls: existing.studentClass, mentor: existing.classMentor, code: existing.studentClassCode } : null);
  const [studentQuery, setStudentQuery] = useState('');
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
  const guideResults = useMemo(() => matchSupplyGuides(guides, q), [guides, q]);
  const addGuide = (g: SupplyGuide) => {
    setLines(ls => ls.some(l => l.guideId === g.id) ? ls : [...ls, { id: newId(), name: g.name, quantity: 1, unit: '개', guideId: g.id, channel: g.channel || undefined, parentBill: g.parentBill || undefined }]);
    setQ(''); setOpenGuide(null);
  };
  const addItem = (i: InventoryItem) => {
    const had = lines.find(l => l.itemId === i.id);
    if (had) setLines(ls => ls.map(l => l.id === had.id ? { ...l, quantity: l.quantity + 1 } : l));
    else setLines(ls => [...ls, { id: newId(), itemId: i.id, name: itemLabel(i), quantity: 1, unit: i.unit, groupId: defaultGroup?.id, groupName: defaultGroup?.name }]);
    setQ(''); // 고르면 검색 목록 닫기
  };
  const upd = (id: string, patch: Partial<SupplyRequestLine>) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));

  const submit = async () => {
    if (forType === 'student' && !student) { Alert.alert('확인 필요', '어떤 학생을 위한 물품인지 선택해주세요.'); return; }
    if (lines.length === 0) { Alert.alert('확인 필요', '필요한 물품을 하나 이상 담아주세요.'); return; }
    setBusy(true);
    try {
      const payload = {
        forType,
        studentId: forType === 'student' ? student?.id : undefined,
        studentName: forType === 'student' ? student?.name : undefined,
        studentClass: forType === 'student' ? student?.cls : undefined,
        classMentor: forType === 'student' ? student?.mentor : undefined,
        studentClassCode: forType === 'student' ? student?.code : undefined,
        items: lines.map(l => forType === 'camp' && l.itemId
          ? { ...l, groupId: l.groupId ?? defaultGroup?.id, groupName: l.groupName ?? defaultGroup?.name }
          : { ...l, groupId: undefined, groupName: undefined }),
        note,
      };
      if (existing) await updateSupplyRequest(db, existing.id, payload);
      else {
        const id = await addSupplyRequest(db, { campCode, requesterId: userId, requesterName: userName, requesterGroup: userGroup || undefined, ...payload });
        notifySupply({ type: 'request_created', requestId: id });
      }
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
          {prefill ? <Text style={{ fontSize: 11, color: '#6b7280', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8 }}>{supplyForLabel(prefill)} 요청과 같은 물품을 담았어요. 누구 것인지와 수량만 바꿔 올리면 장보기 목록에 합쳐집니다.</Text> : null}
          <View>
            <Text style={styles.formLabel}>① 누가 필요한가요?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([['student', '👧 학생'], ['mentor', '🙋 본인'], ['camp', '🏕 캠프 공용']] as const).map(([id, label]) => (
                <TouchableOpacity key={id} onPress={() => setForType(id)} style={[styles.segBtn, forType === id && styles.segBtnOn]}>
                  <Text style={[styles.segBtnText, forType === id && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>{forType === 'student' ? '학생 용돈봉투에서 담임쌤이 정산해요.' : forType === 'mentor' ? '사 온 사람에게 본인이 송금해요.' : '상비약·소모품처럼 캠프 재고로 쓰는 물건. 구매 후 관리자가 재고에 입고해요.'}</Text>
            {forType === 'student' && (student ? (
              <View style={[styles.pickedBox, { marginTop: 6 }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a8a', flex: 1 }}>{student.name}<Text style={{ fontWeight: '400', color: '#3b82f6' }}>  {student.cls}{student.mentor ? ` · 담임 ${student.mentor}` : ''}</Text></Text>
                <TouchableOpacity onPress={() => setStudent(null)}><Text style={{ fontSize: 12, color: '#6b7280' }}>변경</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 6, gap: 4 }}>
                <TextInput value={studentQuery} onChangeText={setStudentQuery} placeholder="학생 이름 검색" placeholderTextColor="#9ca3af" style={styles.input} />
                {studentResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className, mentor: s.classMentor || undefined, code: studentClassCode(s.classNumber) || undefined }); setStudentQuery(''); }}
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

          <View style={{ gap: 6 }}>
            <Text style={styles.formLabel}>② 무엇이 필요한가요? <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{lines.length}개 담음 · 어디서 살지는 구매 담당이 정해요</Text></Text>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={q} onChangeText={setQ} placeholder="물품 검색 (예: 밴드, 치약, 보드마카)" placeholderTextColor="#9ca3af" style={styles.searchInput} />
              {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>
            {q.trim() !== '' && guideResults.length > 0 && (
              <View style={[styles.listBox, { borderColor: '#fdba74' }]}>
                {guideResults.map((g, gi) => (
                  <View key={g.id} style={[{ backgroundColor: '#fff7ed' }, gi < guideResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fed7aa' }]}>
                    <TouchableOpacity onPress={() => setOpenGuide(v => v === g.id ? null : g.id)} activeOpacity={0.6} style={[styles.row, { borderBottomWidth: 0, backgroundColor: 'transparent' }]}>
                      <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{g.name} <Text style={{ fontSize: 10, fontWeight: '700', color: '#9a3412' }}>{g.channel || '쿠팡'}{g.parentBill ? ' · 학부모 청구' : ''}</Text></Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#c2410c' }}>{openGuide === g.id ? '접기' : '안내 보기'}</Text>
                    </TouchableOpacity>
                    {openGuide === g.id && (
                      <View style={{ paddingHorizontal: 10, paddingBottom: 8, gap: 6 }}>
                        <Text style={{ fontSize: 11, color: '#7c2d12', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 6, padding: 7 }}>📌 {g.guide || `${g.channel || '쿠팡'}에서 구매하는 품목이에요.`}</Text>
                        <TouchableOpacity onPress={() => addGuide(g)} style={{ backgroundColor: '#f97316', borderRadius: 6, paddingVertical: 7, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>안내 확인 · 요청에 담기</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
            {q.trim() !== '' && (
              <View style={[styles.listBox, { borderColor: '#d1fae5' }]}>
                {results.map((i, idx) => {
                  const had = lines.find(l => l.itemId === i.id);
                  const stock = views.find(v => v.id === i.id);
                  return (
                    <TouchableOpacity key={i.id} onPress={() => addItem(i)} activeOpacity={0.6} style={[styles.row, idx === results.length - 1 && { borderBottomWidth: 0 }]}>
                      {itemThumb(i) ? <Image source={{ uri: itemThumb(i) }} style={{ width: 30, height: 30, borderRadius: 5, backgroundColor: '#f3f4f6' }} contentFit="cover" /> : null}
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
                    {l.guideId && guides.find(x => x.id === l.guideId)?.guide ? <Text style={{ fontSize: 10, color: '#7c2d12', backgroundColor: '#fff7ed', borderRadius: 5, padding: 5 }}>📌 {guides.find(x => x.id === l.guideId)!.guide}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{l.name}<GuideTagMobile line={l} /></Text>
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
            <TextInput value={note} onChangeText={setNote} multiline placeholder="예: 오늘 저녁까지 필요해요, 약국에 있어요" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 44 }]} />
          </View>

          <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? '저장 중...' : existing ? '수정 저장' : '요청 올리기'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function SupplyRequestDetailMobile({ req: r, buyer, canBuy, settlerIsMe, campCode, groups, views, isAdmin, userId, userName, classMentor, onAssign, onComplete, onEdit, onMetoo, onClose }: {
  req: SupplyRequest; buyer: SupplyBuyer; canBuy: boolean; settlerIsMe: boolean; campCode: string; groups: InventoryGroup[]; views: InventoryItemView[];
  isAdmin: boolean; userId: string; userName: string; classMentor: string;
  onAssign: () => void; onComplete: (lineIds: string[]) => void; onEdit: () => void; onMetoo: () => void; onClose: () => void;
}) {
  const mine = r.requesterId === userId;
  const isOpen = isSupplyOpen(r.status);
  const isCamp = r.forType === 'camp';
  const kind = supplySettleKind(r);
  const [mode, setMode] = useState<'none' | 'reject' | 'hold'>('none');
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
    run(async () => { await setSupplyRequestStatus(db, [r.id], status, userName, opts); if (status === 'rejected' || status === 'onhold') notifySupply({ type: 'status', requestId: r.id }); setMode('none'); setReason(''); });
  const send = () => run(async () => { await addSupplyComment(db, r.id, { uid: userId, name: userName, text: comment, admin: isAdmin }); notifySupply({ type: 'comment', requestId: r.id }); setComment(''); });
  const canIntake = isAdmin && isCamp && !r.stockApplied && r.status !== 'rejected';
  const [intake, setIntake] = useState(false);
  const [intakeLines, setIntakeLines] = useState(() => r.items.filter(l => l.itemId).map(l => ({
    lineId: l.id, itemId: l.itemId!, itemName: l.name, groupId: l.groupId ?? groups[0]?.id ?? '', quantity: String(l.quantity),
  })));
  const doIntake = () => run(async () => {
    const lines = intakeLines.map(l => ({
      itemId: l.itemId, itemName: l.itemName, groupId: l.groupId,
      groupName: groups.find(g => g.id === l.groupId)?.name ?? '', quantity: Math.max(0, parseInt(l.quantity, 10) || 0),
    }));
    if (lines.some(l => !l.groupId)) { Alert.alert('확인 필요', '입고할 그룹을 골라주세요.'); return; }
    await receiveSupplyRequest(db, campCode, r.id, lines, userName);
    setIntake(false);
  });
  const remove = () => Alert.alert('요청 취소', '이 요청을 취소할까요?', [
    { text: '아니요', style: 'cancel' },
    { text: '취소하기', style: 'destructive', onPress: () => run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }) },
  ]);
  const status = supplyStatusLine(r, buyer);
  const canSettle = isAdmin || settlerIsMe;
  const settleLines = supplySettleLines([r]);
  const undoneIds = r.items.filter(l => !r.done?.[l.id]).map(l => l.id);
  const HOLD_CHIPS: Array<[string, string]> = [['내일', addDaysStr(1)], ['3일 뒤', addDaysStr(3)], ['1주 뒤', addDaysStr(7)], ['2주 뒤', addDaysStr(14)], ['미정', '']];

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {(() => { const pg = supplyProgress(r, !!buyer); const pc = PROGRESS_COLOR[pg.key] ?? c; return (
                <View style={{ backgroundColor: pc.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: '700', color: pc.fg }}>{pg.label}</Text></View>
              ); })()}
              <Text style={styles.modalTitle}>{FOR_ICON[r.forType]} {supplyForLabel(r)}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.requesterName} · {fmtDateTime(r.createdAt)}{r.forType === 'student' && classMentor ? ` · 담임 ${classMentor}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          {isOpen && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: buyer ? '#ecfdf5' : '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: buyer ? '#065f46' : '#b91c1c' }}>{buyer ? `🛒 구매 담당: ${buyer.uid === userId ? '나' : buyer.name}${buyer.isDefault ? ' (기본)' : ''}` : '🛒 구매 담당 없음 — 관리자가 지정해주세요'}</Text>
              {isAdmin && <TouchableOpacity onPress={onAssign}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>이 요청만 {r.buyerId ? '변경' : '다른 사람'}</Text></TouchableOpacity>}
            </View>
          )}
          <View style={styles.listBox}>
            {r.items.map((l, i) => {
              const d = r.done?.[l.id];
              const st = r.settlements?.[l.id];
              const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
              const lk = supplyLineSettleKind(r, l);
              const canSettleLine = lk === 'parent' ? isAdmin : canSettle;
              return (
                <View key={l.id} style={[styles.row, i === r.items.length - 1 && { borderBottomWidth: 0 }, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowName, d && { color: '#6b7280' }]} numberOfLines={2}>{d ? '✓ ' : ''}{l.name} <Text style={{ color: '#b45309', fontWeight: '800' }}>{l.quantity}{l.unit}</Text>{isCamp && l.groupName ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#047857' }}>  → {l.groupName}</Text> : null}<GuideTagMobile line={l} /></Text>
                    {(l.memo || (isAdmin && stock)) ? <Text style={styles.rowGroups} numberOfLines={2}>{[l.memo, isAdmin && stock ? `캠프 재고 ${stock.total}${stock.unit}` : ''].filter(Boolean).join(' · ')}</Text> : null}
                    {d ? <Text selectable style={[styles.rowGroups, { color: '#047857' }]}>{d.amount ? fmtWon(d.amount) : '금액 없음'} · {d.by}{d.payTo ? `\n💸 ${d.payTo}` : ''}</Text> : null}
                    {d && lk && d.amount ? <Text style={[styles.rowGroups, { color: st ? '#9ca3af' : '#a16207' }]}>{st ? `✓ 정산 완료 · ${st.by}` : `💰 ${lk === 'envelope' ? '담임 봉투 정산' : lk === 'transfer' ? '송금' : '학부모 청구'} 대기`}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {canBuy && r.status !== 'rejected' && !r.stockApplied && (d
                      ? <TouchableOpacity onPress={() => run(() => undoSupplyLine(db, r.id, l.id))}><Text style={{ fontSize: 10, color: '#9ca3af' }}>구매 취소</Text></TouchableOpacity>
                      : isOpen ? <TouchableOpacity onPress={() => onComplete([l.id])} style={{ backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>완료</Text></TouchableOpacity> : null)}
                    {d && lk && d.amount && canSettleLine ? (st
                      ? (isAdmin || st.byId === userId) ? <TouchableOpacity onPress={() => run(() => settleSupplyLines(db, r.id, [l.id], null))}><Text style={{ fontSize: 10, color: '#9ca3af' }}>정산 취소</Text></TouchableOpacity> : null
                      : <TouchableOpacity onPress={() => run(async () => { await settleSupplyLines(db, r.id, [l.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [l.id] }); })} style={{ backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fde047', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#713f12' }}>{SUPPLY_SETTLE_LABELS[lk].icon} {lk === 'envelope' ? '정산' : lk === 'transfer' ? '송금' : '청구'} 완료</Text>
                        </TouchableOpacity>) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {canBuy && isOpen && undoneIds.length > 1 && (
            <TouchableOpacity onPress={() => onComplete(undoneIds)} style={[styles.btn, { flex: 0, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>남은 품목 한 번에 구매 완료</Text>
            </TouchableOpacity>
          )}
          {settleLines.length > 0 && (
            <Text style={{ fontSize: 11, color: '#4b5563', backgroundColor: '#fefce8', borderRadius: 8, padding: 8 }}>
              {kind === 'envelope' ? `📒 담임 ${classMentor || '(미확인)'}쌤이 용돈봉투에서 빼서 구매한 선생님께 전달해요.` : `💸 ${r.requesterName}쌤이 구매한 선생님께 송금해요.`}
              {' '}정산 {settleLines.filter(s => s.settled).length}/{settleLines.length} · 남은 금액 {fmtWon(settleLines.filter(s => !s.settled).reduce((a, s) => a + (s.done.amount ?? 0), 0))}
            </Text>
          )}
          {r.note ? <Text style={{ fontSize: 12, color: '#374151', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 }}>📝 {r.note}</Text> : null}
          {(!isOpen || r.status === 'onhold') && (
            <Text style={{ fontSize: 11, color: r.status === 'onhold' ? '#92400e' : '#4b5563', backgroundColor: r.status === 'onhold' ? '#fffbeb' : '#f9fafb', borderRadius: 8, padding: 8 }}>
              {status}{r.handledBy ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}
            </Text>
          )}
          {isOpen && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {!mine && <TouchableOpacity onPress={onMetoo} style={[styles.btn, { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>🙋 나도 필요해요</Text></TouchableOpacity>}
              {mine && <TouchableOpacity onPress={onEdit} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>수정</Text></TouchableOpacity>}
              {mine && !supplyDoneCount(r) && <TouchableOpacity onPress={remove} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>요청 취소</Text></TouchableOpacity>}
            </View>
          )}

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
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setIntake(false)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={doIntake} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 7, flex: 2, opacity: busy ? 0.5 : 1 }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{r.status === 'purchased' ? '재고에 입고' : '구매 완료 + 재고 입고'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIntake(true)} style={[styles.btn, { flex: 0, backgroundColor: r.status === 'purchased' ? '#f59e0b' : '#fff', borderWidth: r.status === 'purchased' ? 0 : 1, borderColor: '#a7f3d0' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: r.status === 'purchased' ? '#fff' : '#047857' }}>📥 {r.status === 'purchased' ? '재고에 입고하기' : '구매 완료 + 재고 입고'}</Text>
            </TouchableOpacity>
          ))}

          {isAdmin && (
            <View style={{ borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: '#f5f7ff', borderRadius: 10, padding: 9, gap: 7 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4338ca' }}>관리자 처리</Text>
              {mode === 'none' ? (
                isOpen ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => setMode('reject')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>반려</Text></TouchableOpacity>
                    {r.status === 'onhold'
                      ? <TouchableOpacity onPress={() => act('requested')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#92400e' }}>보류 해제</Text></TouchableOpacity>
                      : <TouchableOpacity onPress={() => setMode('hold')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#92400e' }}>⏸ 보류</Text></TouchableOpacity>}
                  </View>
                ) : !r.stockApplied ? (
                  <TouchableOpacity onPress={() => act('requested')} disabled={busy} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7, flex: 0 }]}><Text style={{ fontSize: 11, color: '#374151' }}>다시 진행 중으로</Text></TouchableOpacity>
                ) : <Text style={{ fontSize: 10, color: '#9ca3af' }}>재고에 입고된 요청이라 되돌릴 수 없어요.</Text>
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

// ── 관리 탭 (모바일) — 웹과 같은 구성 ──

type ManageSection = 'groups' | 'bulk' | 'items' | 'supply';

function ManageTabMobile({ campCode, jobCodeId, settings, guides, items, views, groups, packages, campGroups, userName, onSelect, onEditItem }: {
  campCode: string; jobCodeId: string; settings: SupplySettings | null; guides: SupplyGuide[];
  items: InventoryItem[]; views: InventoryItemView[]; groups: InventoryGroup[]; packages: InventoryPackage[]; campGroups: CampGroup[];
  userName: string; onSelect: (id: string) => void; onEditItem: (item: InventoryItem | 'new') => void;
}) {
  const [section, setSection] = useState<ManageSection>('groups');
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.toolbar, { paddingBottom: 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {([['groups', '그룹 · 패키지'], ['bulk', '일괄 입력 · 실사'], ['items', '품목 관리'], ['supply', '구매 담당 · 지정 품목']] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setSection(id)} style={[styles.segBtn, { flex: 0, paddingHorizontal: 12 }, section === id && styles.segBtnOn]}>
              <Text style={[styles.segBtnText, section === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {section === 'groups' ? <GroupManagerMobile campCode={campCode} groups={groups} packages={packages} campGroups={campGroups} views={views} userName={userName} />
        : section === 'bulk' ? <BulkStockEditorMobile campCode={campCode} views={views} groups={groups} userName={userName} />
          : section === 'items' ? <ItemManagerMobile items={items} views={views} userName={userName} onSelect={onSelect} onEdit={onEditItem} />
            : <SupplyAdminMobile campCode={campCode} jobCodeId={jobCodeId} settings={settings} guides={guides} userName={userName} />}
    </View>
  );
}

/** 그룹 · 패키지 */
function GroupManagerMobile({ campCode, groups, packages, campGroups, views, userName }: {
  campCode: string; groups: InventoryGroup[]; packages: InventoryPackage[]; campGroups: CampGroup[]; views: InventoryItemView[]; userName: string;
}) {
  const [newName, setNewName] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [pkgName, setPkgName] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try { await addInventoryGroup(db, { campCode, name: newName.trim(), location: newLoc.trim() || undefined, order: groups.length }); setNewName(''); setNewLoc(''); }
    catch { failAlert(); } finally { setBusy(false); }
  };
  const remove = (g: InventoryGroup) => {
    const left = views.filter(v => getGroupStock(v, g.id) !== 0);
    if (left.length > 0) {
      Alert.alert('삭제할 수 없어요', `"${g.name}" 그룹에 재고가 남아 있어요 (${left.length}개 품목: ${left.slice(0, 3).map(v => v.name).join(', ')}${left.length > 3 ? ' …' : ''}).\n일괄 입력·실사에서 0으로 맞춘 뒤 삭제해주세요.`);
      return;
    }
    Alert.alert('그룹 삭제', `"${g.name}" 그룹을 삭제할까요?`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => deleteInventoryGroup(db, g.id).catch(failAlert) }]);
  };
  const savePkg = async () => {
    if (!pkgName.trim() || groups.length === 0 || busy) return;
    setBusy(true);
    try { await savePackageFromGroups(db, pkgName.trim(), groups, userName); setPkgName(''); Alert.alert('저장됨', '현재 그룹 구성을 패키지로 저장했어요.'); }
    catch { failAlert(); } finally { setBusy(false); }
  };
  const apply = (pkg: InventoryPackage) => Alert.alert('패키지 적용', `"${pkg.name}"의 그룹 ${pkg.slots.length}개를 이 캠프(${campCode})에 추가할까요? 추가 후 그룹명·호실만 고치면 돼요.`, [
    { text: '취소', style: 'cancel' },
    { text: '적용', onPress: async () => { try { const n = await applyPackageToCamp(db, campCode, pkg, groups); if (n === 0) Alert.alert('알림', '이미 같은 슬롯의 그룹이 있어 추가된 그룹이 없어요.'); } catch { failAlert(); } } },
  ]);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <Text style={styles.blockTitle}>{campCode} 재고 그룹 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{groups.length}</Text></Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>보관 장소/키트 단위. 캠프 그룹을 연결하면 환자 탭에서 학생 반에 맞는 그룹이 자동 선택되고, 멘토에겐 '내 그룹'으로 먼저 보여요.</Text>
        {groups.map(g => <GroupRowMobile key={g.id} group={g} campGroups={campGroups} onDelete={() => remove(g)} />)}
        <View style={[styles.listBox, { padding: 10, gap: 6 }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>+ 새 그룹</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput value={newName} onChangeText={setNewName} placeholder="그룹명 (예: Spring)" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
            <TextInput value={newLoc} onChangeText={setNewLoc} placeholder="보관 장소" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1.3 }]} />
          </View>
          <TouchableOpacity onPress={add} disabled={!newName.trim() || busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', opacity: !newName.trim() || busy ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>그룹 추가</Text></TouchableOpacity>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.blockTitle}>📦 그룹 패키지 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(회사 공통)</Text></Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>그룹 구성을 저장해 두고 다음 기수에 적용한 뒤 그룹명·호실만 바꾸세요.</Text>
        <View style={styles.listBox}>
          {packages.length === 0 && <Text style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>저장된 패키지가 없습니다.</Text>}
          {packages.map((p, i) => (
            <View key={p.id} style={[styles.row, i === packages.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowGroups} numberOfLines={1}>{p.slots.map(s => s.label).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => apply(p)}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>적용</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('패키지 삭제', `"${p.name}"을 삭제할까요?`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => deleteInventoryPackage(db, p.id).catch(failAlert) }])} style={{ paddingLeft: 6 }}>
                <Ionicons name="trash-outline" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TextInput value={pkgName} onChangeText={setPkgName} placeholder="현재 구성을 패키지로 저장 — 이름" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
          <TouchableOpacity onPress={savePkg} disabled={!pkgName.trim() || groups.length === 0 || busy} style={[styles.btn, { flex: 0, paddingHorizontal: 14, backgroundColor: '#1f2937', opacity: !pkgName.trim() || groups.length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>저장</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function GroupRowMobile({ group, campGroups, onDelete }: { group: InventoryGroup; campGroups: CampGroup[]; onDelete: () => void }) {
  const [name, setName] = useState(group.name);
  const [loc, setLoc] = useState(group.location ?? '');
  useEffect(() => { setName(group.name); setLoc(group.location ?? ''); }, [group.name, group.location]);
  const dirty = name.trim() !== group.name || loc.trim() !== (group.location ?? '');
  const save = () => { if (name.trim()) updateInventoryGroup(db, group.id, { name: name.trim(), location: loc.trim() || undefined }).catch(failAlert); };
  return (
    <View style={[styles.listBox, { padding: 10, gap: 6 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 10, color: '#cbd5e1', width: 14 }}>{group.order + 1}</Text>
        <TextInput value={name} onChangeText={setName} onEndEditing={save} style={[styles.input, { flex: 1, fontWeight: '700' }]} />
        <TextInput value={loc} onChangeText={setLoc} onEndEditing={save} placeholder="보관 장소" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1.3 }]} />
        <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}><Ionicons name="trash-outline" size={16} color="#cbd5e1" /></TouchableOpacity>
      </View>
      {dirty && <TouchableOpacity onPress={save}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>변경 저장</Text></TouchableOpacity>}
      {campGroups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>캠프 그룹</Text>
          {campGroups.map(cg => (
            <TouchableOpacity key={cg.name} onPress={() => updateInventoryGroup(db, group.id, { campGroupName: group.campGroupName === cg.name ? '' : cg.name }).catch(failAlert)}
              style={[styles.miniChip, group.campGroupName === cg.name && { backgroundColor: '#d1fae5' }]}>
              <Text style={[styles.miniChipText, group.campGroupName === cg.name && { color: '#065f46' }]}>{cg.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** 일괄 입력 · 실사 — 폰에서는 그룹 하나씩 */
function BulkStockEditorMobile({ campCode, views, groups, userName }: {
  campCode: string; views: InventoryItemView[]; groups: InventoryGroup[]; userName: string;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groups, groupId]);
  const [category, setCategory] = useState<InventoryCategory | '전체'>('의약품');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'restock' | 'adjust'>('restock');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const group = groups.find(g => g.id === groupId);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => v.isActive !== false && (category === '전체' || v.category === category) &&
      (!q || [v.name, v.kind, v.subCategory, v.spec].some(f => f?.toLowerCase().includes(q))));
  }, [views, category, search]);
  const key = (itemId: string, gid: string) => `${itemId}|${gid}`;
  const changed = useMemo(() => {
    const out: { itemId: string; itemName: string; groupId: string; groupName: string; target: number }[] = [];
    Object.entries(edits).forEach(([k, val]) => {
      if (val.trim() === '') return;
      const [itemId, gid] = k.split('|');
      const v = views.find(x => x.id === itemId);
      const g = groups.find(x => x.id === gid);
      const n = parseInt(val, 10);
      if (!v || !g || isNaN(n) || n === getGroupStock(v, gid)) return;
      out.push({ itemId, itemName: v.name, groupId: gid, groupName: g.name, target: n });
    });
    return out;
  }, [edits, views, groups]);
  const doSave = async () => {
    setBusy(true);
    try {
      const n = await setStockLevels(db, campCode, changed, { reason: mode, refLabel: mode === 'restock' ? '일괄 입고' : '실사', memo: memo.trim() || undefined }, userName);
      Alert.alert('저장됨', `${n}칸을 저장했어요.`);
      setEdits({});
    } catch (e) { console.error('일괄 저장 오류:', e); failAlert(); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (changed.length === 0 || busy) return;
    if (mode === 'adjust' && !memo.trim()) { Alert.alert('입력 필요', '실사 사유를 골라주세요.'); return; }
    Alert.alert('저장', `${changed.length}칸을 ${mode === 'restock' ? '입고(기수 시작·보충)' : '실사 조정'}으로 저장할까요?`, [{ text: '취소', style: 'cancel' }, { text: '저장', onPress: doSave }]);
  };
  if (groups.length === 0) return <View style={styles.centered}><Text style={styles.emptyBody}>먼저 그룹 · 패키지에서 재고 그룹을 만들어주세요.</Text></View>;
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.toolbar, { gap: 6 }]}>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>칸에 <Text style={{ fontWeight: '700' }}>지금 실제 수량(낱개)</Text>을 적고 저장하세요. 바뀐 칸만 기록되고 차이는 변동 내역에 남아요.</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['restock', '입고 (기수 시작·보충)'], ['adjust', '실사 조정']] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setMode(id)} style={[styles.segBtn, mode === id && styles.segBtnOn]}><Text style={[styles.segBtnText, mode === id && { color: '#fff' }]}>{label}</Text></TouchableOpacity>
          ))}
        </View>
        {mode === 'adjust' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
            {STOCKTAKE_REASONS.map(r => (
              <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#f59e0b' }]}><Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{r}</Text></TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>그룹</Text>
          {groups.map(g => (
            <TouchableOpacity key={g.id} onPress={() => setGroupId(g.id)} style={[styles.miniChip, groupId === g.id && styles.miniChipAmber]}><Text style={[styles.miniChipText, groupId === g.id && { color: '#92400e' }]}>{g.name}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder="품목 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
        <View style={styles.listBox}>
          {rows.map((v, i) => {
            const k = key(v.id, groupId);
            const cur = getGroupStock(v, groupId);
            const val = edits[k];
            const dirty = val !== undefined && val.trim() !== '' && parseInt(val, 10) !== cur;
            return (
              <View key={v.id} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{v.name}{v.kind || v.spec ? <Text style={styles.rowMeta}>  {[v.kind, v.spec].filter(Boolean).join(' · ')}</Text> : null}</Text>
                  <Text style={styles.rowGroups}>현재 {groupId in v.stocks ? cur : '–'} {v.unit}</Text>
                </View>
                <TextInput value={val ?? (groupId in v.stocks ? String(cur) : '')} onChangeText={t => setEdits(prev => ({ ...prev, [k]: t.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad" placeholder="–" placeholderTextColor="#cbd5e1"
                  style={[styles.input, { width: 70, textAlign: 'center', paddingVertical: 5 }, dirty && { borderColor: '#34d399', backgroundColor: '#ecfdf5', fontWeight: '800', color: '#065f46' }, cur < 0 && { borderColor: '#fca5a5', color: '#dc2626' }]} />
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
        <Text style={{ flex: 1, fontSize: 12, color: '#4b5563' }}>{group?.name} · 바뀐 칸 <Text style={{ fontWeight: '800', color: '#047857' }}>{changed.length}</Text></Text>
        <TouchableOpacity onPress={() => setEdits({})} disabled={busy || Object.keys(edits).length === 0} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#f3f4f6', opacity: Object.keys(edits).length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, color: '#374151' }}>되돌리기</Text></TouchableOpacity>
        <TouchableOpacity onPress={save} disabled={busy || changed.length === 0} style={[styles.btn, { flex: 0, paddingHorizontal: 16, backgroundColor: '#059669', opacity: busy || changed.length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '저장 중...' : '저장'}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/** 품목 관리 (회사 공통) */
function ItemManagerMobile({ items, views, userName, onSelect, onEdit }: {
  items: InventoryItem[]; views: InventoryItemView[]; userName: string; onSelect: (id: string) => void; onEdit: (item: InventoryItem | 'new') => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => (category === '전체' || v.category === category) && (!q || [v.name, v.kind, v.subCategory, v.spec].some(f => f?.toLowerCase().includes(q))));
  }, [views, search, category]);
  const importDefaults = () => Alert.alert('기본 품목 세트', `기본 품목 ${DEFAULT_INVENTORY_ITEMS.length}개를 등록할까요? (이미 있는 품목은 건너뜀)`, [
    { text: '취소', style: 'cancel' },
    { text: '등록', onPress: async () => { setBusy(true); try { const n = await importInventoryItems(db, DEFAULT_INVENTORY_ITEMS, items, userName); Alert.alert('완료', `${n}개 품목을 추가했어요.`); } catch { failAlert(); } finally { setBusy(false); } } },
  ]);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[styles.searchBox, { flex: 1 }]}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput value={search} onChangeText={setSearch} placeholder="품목 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
          <TouchableOpacity onPress={() => onEdit('new')} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#059669' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>+ 추가</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>품목은 회사 공통이라 여기서 바꾸면 모든 캠프에 반영돼요. {list.length}개</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>
        <View style={styles.listBox}>
          {list.map((v, i) => (
            <View key={v.id} style={[styles.row, { opacity: v.isActive === false ? 0.5 : 1 }, i === list.length - 1 && { borderBottomWidth: 0 }]}>
              <TouchableOpacity onPress={() => onSelect(v.id)} style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>{v.name}{v.kind ? <Text style={styles.rowMeta}>  {v.kind}</Text> : null}{v.isActive === false ? <Text style={styles.rowMeta}>  사용 안 함</Text> : null}</Text>
                <Text style={styles.rowGroups} numberOfLines={1}>{v.category}{v.subCategory ? `·${v.subCategory}` : ''} · {INVENTORY_USAGE_LABELS[getItemUsage(v)]} · {v.unit} · 최소 {v.minStockDefault ?? 0}{v.ingredient ? ` · ${v.ingredient}` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onEdit(v)} style={{ padding: 4 }}><Ionicons name="create-outline" size={18} color="#6b7280" /></TouchableOpacity>
              <TouchableOpacity onPress={() => updateInventoryItem(db, v.id, { isActive: v.isActive === false }).catch(failAlert)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>{v.isActive === false ? '사용' : '숨김'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={importDefaults} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#f3f4f6', opacity: busy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, color: '#374151' }}>기본 품목 세트 불러오기</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ==================== ⚙️ 관리 (관리자 · 모바일) ====================
// 모바일에서는 자주 바꾸는 것만: 기본 구매 담당 · 지정 품목(쿠팡·학부모 청구). 그룹·패키지·일괄 입력·품목 관리는 웹 관리 탭.

function SupplyAdminMobile({ campCode, jobCodeId, settings, guides, userName }: {
  campCode: string; jobCodeId: string; settings: SupplySettings | null; guides: SupplyGuide[]; userName: string;
}) {
  const [candidates, setCandidates] = useState<SupplyBuyerCandidate[]>([]);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<SupplyGuide | 'new' | null>(null);
  useEffect(() => {
    if (!jobCodeId) return;
    getUsersByJobCodeId(jobCodeId).then(us => setCandidates(supplyBuyerCandidates(us, jobCodeId))).catch(e => console.error('캠프 인원 조회 오류:', e));
  }, [jobCodeId]);
  const defaultBuyer = settings?.defaultBuyerId ? settings.defaultBuyerName : '';

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: 30 }}>
      {/* 기본 구매 담당 */}
      <View style={{ gap: 6 }}>
        <Text style={styles.blockTitle}>🛒 기본 구매 담당</Text>
        <View style={[styles.listBox, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: defaultBuyer ? '#111827' : '#b91c1c' }}>{defaultBuyer || '미지정'}</Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>따로 지정하지 않은 모든 구매 요청을 이 사람이 사 와서 품목별로 완료해요.</Text>
          </View>
          <TouchableOpacity onPress={() => setPicking(true)} style={[styles.actBtn, { borderColor: '#a7f3d0' }]}><Text style={[styles.actBtnText, { color: '#047857' }]}>{defaultBuyer ? '변경' : '지정'}</Text></TouchableOpacity>
        </View>
      </View>

      {/* 지정 품목 */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockTitle}>🧾 지정 품목 (쿠팡 · 학부모 청구) <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{guides.length}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>멘토가 요청할 때 검색하면 안내와 함께 맨 위에 떠요. 전 캠프 공통.</Text>
          </View>
          <TouchableOpacity onPress={() => setEditing('new')} style={[styles.actBtn, { backgroundColor: '#059669', borderColor: '#059669' }]}><Text style={[styles.actBtnText, { color: '#fff' }]}>+ 추가</Text></TouchableOpacity>
        </View>
        <View style={styles.listBox}>
          {guides.length === 0 && <Text style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>지정된 품목이 없습니다.</Text>}
          {guides.map((g, i) => (
            <TouchableOpacity key={g.id} onPress={() => setEditing(g)} activeOpacity={0.6} style={[styles.row, { alignItems: 'flex-start', opacity: g.isActive === false ? 0.5 : 1 }, i === guides.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rowName} numberOfLines={1}>{g.name}<GuideTagMobile line={{ channel: g.channel, parentBill: g.parentBill }} />{g.isActive === false ? <Text style={styles.rowMeta}>  사용 안 함</Text> : null}</Text>
                {g.keywords?.length ? <Text style={styles.rowGroups} numberOfLines={1}>검색어: {g.keywords.join(', ')}</Text> : null}
                {g.guide ? <Text style={[styles.rowGroups, { color: '#4b5563' }]} numberOfLines={2}>{g.guide}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        {picking && (
          <SupplyBuyerPickerMobile candidates={candidates} title="기본 구매 담당"
            hint="담당을 따로 지정하지 않은 모든 요청을 이 사람이 사 와서 품목별로 완료합니다."
            clearLabel={settings?.defaultBuyerId ? '기본 담당 해제' : ''}
            onClose={() => setPicking(false)}
            onPick={c => { setPicking(false); setSupplyDefaultBuyer(db, campCode, c ? { uid: c.uid, name: c.name } : null, userName).catch(failAlert); }} />
        )}
      </Modal>
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        {editing && <SupplyGuideFormMobile guide={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </ScrollView>
  );
}

function SupplyGuideFormMobile({ guide, onClose }: { guide?: SupplyGuide; onClose: () => void }) {
  const [name, setName] = useState(guide?.name ?? '');
  const [keywords, setKeywords] = useState((guide?.keywords ?? []).join(', '));
  const [channel, setChannel] = useState(guide?.channel ?? '쿠팡');
  const [parentBill, setParentBill] = useState(guide?.parentBill ?? true);
  const [text, setText] = useState(guide?.guide ?? '');
  const [active, setActive] = useState(guide?.isActive !== false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { Alert.alert('확인 필요', '품목 이름을 입력해주세요.'); return; }
    setBusy(true);
    try {
      await saveSupplyGuide(db, { name, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), channel, parentBill, guide: text, isActive: active }, guide?.id);
      onClose();
    } catch (e) { console.error(e); Alert.alert('오류', '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = () => guide && Alert.alert('삭제', `${guide.name}을(를) 삭제할까요?`, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => deleteSupplyGuide(db, guide.id).then(onClose).catch(failAlert) },
  ]);
  const Toggle = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#059669' : '#9ca3af'} />
      <Text style={{ fontSize: 13, color: '#374151' }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>{guide ? '지정 품목 수정' : '지정 품목 추가'}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View><Text style={styles.formLabel}>품목 이름</Text><TextInput value={name} onChangeText={setName} placeholder="예: 책가방" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.formLabel}>검색어 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(쉼표로 구분)</Text></Text><TextInput value={keywords} onChangeText={setKeywords} placeholder="예: 가방, 백팩" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.formLabel}>구매 경로</Text><TextInput value={channel} onChangeText={setChannel} placeholder="쿠팡" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <Toggle on={parentBill} label="학부모님께 청구 (용돈봉투·송금 정산 안 함)" onPress={() => setParentBill(v => !v)} />
          <View>
            <Text style={styles.formLabel}>멘토에게 보여줄 안내</Text>
            <TextInput value={text} onChangeText={setText} multiline placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              placeholder={'예: 쿠팡에서 주문하는 품목이에요.\n학생 사이즈·색상을 메모에 적어주세요.\n금액은 학부모님께 따로 청구합니다.'} />
          </View>
          <Toggle on={active} label="검색에 보이기" onPress={() => setActive(v => !v)} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {guide && <TouchableOpacity onPress={remove} style={[styles.btn, { flex: 0, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>삭제</Text></TouchableOpacity>}
            <TouchableOpacity onPress={save} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? '저장 중...' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ==================== 품목 추가 (관리자 · 모바일) ====================

function ItemFormMobile({ item, preset, groups, campCode, defaultGroupId, perm, userName, onClose, onCreated }: {
  item?: InventoryItem;
  preset?: { category?: InventoryCategory; subCategory?: string };
  groups?: InventoryGroup[];
  /** 최초 재고를 바로 넣을 캠프 (재고 현황에서 추가할 때) */
  campCode?: string;
  defaultGroupId?: string;
  perm: InventoryPerm;
  userName: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const [category, setCategory] = useState<InventoryCategory>(item?.category ?? preset?.category ?? '의약품');
  const [subCategory, setSubCategory] = useState(item?.subCategory ?? preset?.subCategory ?? '');
  const [kind, setKind] = useState(item?.kind ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [spec, setSpec] = useState(item?.spec ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '개');
  const [usage, setUsage] = useState<InventoryUsage>(item ? getItemUsage(item) : suggestedUsages(preset?.category ?? '의약품')[0]);
  const [minStock, setMinStock] = useState(item?.minStockDefault != null ? String(item.minStockDefault) : '');
  const [packSize, setPackSize] = useState(item?.packSize ? String(item.packSize) : '');
  const [ingredient, setIngredient] = useState(item?.ingredient ?? '');
  const [intervalHours, setIntervalHours] = useState(item?.intervalHours != null ? String(item.intervalHours) : '');
  const [maxPerDay, setMaxPerDay] = useState(item?.maxPerDay != null ? String(item.maxPerDay) : '');
  const [dosageNote, setDosageNote] = useState(item?.dosageNote ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [isActive, setIsActive] = useState(item?.isActive !== false);
  const [busy, setBusy] = useState(false);
  // 상세 설정은 기본으로 접어둔다
  const [showDetail, setShowDetail] = useState(false);
  const subs = INVENTORY_SUBCATEGORIES[category] ?? [];
  const isMed = usage === 'oral' || usage === 'topical';
  const primaryUsages = suggestedUsages(category);
  const usageList = [...primaryUsages, ...INVENTORY_USAGE_ORDER.filter(u => !primaryUsages.includes(u))];

  // 신규 등록 — 보관 교무실 · 최초 재고
  const canSetStock = !item && !!campCode && !!groups?.length;
  const [stockGroupId, setStockGroupId] = useState(defaultGroupId ?? groups?.[0]?.id ?? '');
  const [initialQty, setInitialQty] = useState('');
  // 신규 등록 — 이미지 (관리자만)
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const pickPhoto = async () => {
    const picked = await pickLostMedia();
    const img = picked.find(p => p.type === 'image');
    if (!img) { if (picked.length) Alert.alert('확인 필요', '이미지 파일만 등록할 수 있습니다.'); return; }
    if ((img.fileSize ?? 0) > 10 * 1024 * 1024) { Alert.alert('확인 필요', '10MB 이하 이미지만 올릴 수 있습니다.'); return; }
    setPhoto(img);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert('확인 필요', '물품명을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const data = {
        category, subCategory: subCategory.trim() || undefined, kind: kind.trim() || undefined, name: name.trim(),
        spec: spec.trim() || undefined, unit: unit || '개', usage, isActive,
        description: description.trim() || undefined,
        packSize: packSize ? Math.max(1, parseInt(packSize, 10) || 1) : undefined,
        minStockDefault: minStock === '' ? undefined : Math.max(0, parseInt(minStock, 10) || 0),
        ingredient: isMed ? ingredient.trim() || undefined : undefined,
        intervalHours: usage === 'oral' && intervalHours !== '' ? Math.max(0, parseFloat(intervalHours) || 0) : undefined,
        maxPerDay: usage === 'oral' && maxPerDay !== '' ? Math.max(0, parseInt(maxPerDay, 10) || 0) : undefined,
        dosageNote: isMed ? dosageNote.trim() || undefined : undefined,
      };
      if (item) {
        await updateInventoryItem(db, item.id, data);
      } else {
        const id = await addInventoryItem(db, { ...data, createdBy: userName });
        if (photo && perm.canEditItemMedia) {
          try {
            const uploaded = await uploadItemMediaMobile(id, [photo], userName);
            if (uploaded.length) await addInventoryItemMedia(db, id, uploaded);
          } catch (e) {
            console.error('품목 이미지 업로드 오류:', e);
            Alert.alert('알림', '품목은 등록했지만 이미지를 올리지 못했습니다. 품목 상세에서 다시 시도해주세요.');
          }
        }
        const q = parseInt(initialQty, 10);
        if (canSetStock && stockGroupId && !isNaN(q) && q > 0) {
          const g = groups!.find(x => x.id === stockGroupId);
          if (g) {
            await setStockLevels(db, campCode!, [{ itemId: id, itemName: data.name, groupId: g.id, groupName: g.name, target: q }],
              { reason: 'restock', refLabel: '품목 등록 (최초 재고)' }, userName);
          }
        }
        onCreated?.(id);
      }
      onClose();
    } catch (e) { console.error('품목 저장 오류:', e); Alert.alert('오류', '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const Chips = <T extends string>({ values, value, onPick, label }: { values: readonly T[]; value: string; onPick: (v: T) => void; label?: (v: T) => string }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
      {values.map(v => (
        <TouchableOpacity key={v} onPress={() => onPick(v)} style={[styles.chip, value === v && styles.chipActive]}>
          <Text style={[styles.chipText, value === v && styles.chipTextActive]}>{label ? label(v) : v}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>{item ? '품목 수정' : '품목 추가'}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">

          {/* ── 기본 정보 ── */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {perm.canEditItemMedia && !item && (
              <View style={{ width: 76 }}>
                <TouchableOpacity onPress={pickPhoto} style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {photo
                    ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <><Ionicons name="camera-outline" size={18} color="#9ca3af" /><Text style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>이미지</Text></>}
                </TouchableOpacity>
                {photo ? <TouchableOpacity onPress={() => setPhoto(null)} style={{ paddingVertical: 3 }}><Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>제거</Text></TouchableOpacity> : null}
              </View>
            )}
            {perm.canEditItemMedia && item && (
              <View style={{ width: 76 }}>
                <View style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {itemThumb(item)
                    ? <Image source={{ uri: itemThumb(item) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <Ionicons name="cube-outline" size={20} color="#cbd5e1" />}
                </View>
                <Text style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 3, lineHeight: 12 }}>상세에서{'\n'}사진 관리</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 10 }}>
              <View><Text style={styles.formLabel}>물품명 *</Text>
                <TextInput value={name} onChangeText={setName} placeholder={category === '의약품' ? '예: 훼스탈플러스' : '예: 종이컵'} placeholderTextColor="#9ca3af" style={styles.input} autoFocus={!item} /></View>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>분류 *</Text>
                <Chips values={INVENTORY_CATEGORIES} value={category} onPick={c => { setCategory(c); setSubCategory(''); if (!item) setUsage(suggestedUsages(c)[0]); }} />
              </View>
            </View>
          </View>

          {canSetStock ? (
            <View style={{ gap: 10 }}>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>보관 교무실</Text>
                <Chips values={groups!.map(g => g.id)} value={stockGroupId} onPick={setStockGroupId} label={id => groups!.find(g => g.id === id)?.name ?? ''} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={styles.formLabel}>최초 재고 수량</Text>
                  <TextInput value={initialQty} onChangeText={setInitialQty} keyboardType="number-pad" placeholder="0" placeholderTextColor="#9ca3af" style={styles.input} /></View>
                <View style={{ flex: 1.4, gap: 5 }}>
                  <Text style={styles.formLabel}>단위 (낱개)</Text>
                  <Chips values={INVENTORY_UNITS} value={unit} onPick={setUnit} />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap: 5 }}>
              <Text style={styles.formLabel}>단위 (낱개 기준)</Text>
              <Chips values={INVENTORY_UNITS} value={unit} onPick={setUnit} />
            </View>
          )}

          {/* ── 상세 설정 (접힘) ── */}
          <TouchableOpacity onPress={() => setShowDetail(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }}>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#4b5563' }}>
              상세 설정 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>세부 분류 · 물품 유형 · 규격 · 최소 재고{isMed ? ' · 의약품' : ''}</Text>
            </Text>
            <Ionicons name={showDetail ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
          </TouchableOpacity>

          {showDetail && (
            <View style={{ gap: 12, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 10, padding: 10 }}>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>세부 분류 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(선택 · 직접 입력 가능)</Text></Text>
                {subs.length > 0 && <Chips values={subs} value={subCategory} onPick={v => setSubCategory(subCategory === v ? '' : v)} />}
                <TextInput value={subCategory} onChangeText={setSubCategory} placeholder="세부 분류" placeholderTextColor="#9ca3af" style={styles.input} />
              </View>
              <View><Text style={styles.formLabel}>종류</Text>
                <TextInput value={kind} onChangeText={setKind} placeholder={category === '의약품' ? '예: 소화제' : '(선택)'} placeholderTextColor="#9ca3af" style={styles.input} /></View>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>물품 유형</Text>
                <Chips values={usageList} value={usage} onPick={setUsage} label={u => INVENTORY_USAGE_LABELS[u]} />
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>먹는 약·바르는 약·처치 소모품은 환자 보고에서 고를 수 있고, 비품은 위치·수량만 관리합니다.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1.4 }}><Text style={styles.formLabel}>규격 · 비고</Text>
                  <TextInput value={spec} onChangeText={setSpec} placeholder="예: 알약 500mg" placeholderTextColor="#9ca3af" style={styles.input} /></View>
                <View style={{ flex: 1 }}><Text style={styles.formLabel}>포장당 낱개</Text>
                  <TextInput value={packSize} onChangeText={setPackSize} keyboardType="number-pad" placeholder="예: 4" placeholderTextColor="#9ca3af" style={styles.input} /></View>
              </View>
              {isMed && (
                <View style={{ gap: 8, backgroundColor: '#fff1f2', borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#9f1239' }}>의약품 상세 정보</Text>
                  <View><Text style={styles.formLabel}>주성분</Text><TextInput value={ingredient} onChangeText={setIngredient} placeholder="예: 아세트아미노펜" placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                  {usage === 'oral' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Text style={styles.formLabel}>최소 간격(시간)</Text><TextInput value={intervalHours} onChangeText={setIntervalHours} keyboardType="decimal-pad" placeholder="예: 4" placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                      <View style={{ flex: 1 }}><Text style={styles.formLabel}>1일 최대(회)</Text><TextInput value={maxPerDay} onChangeText={setMaxPerDay} keyboardType="number-pad" placeholder="예: 5" placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                    </View>
                  )}
                  <View><Text style={styles.formLabel}>복용 · 사용 안내</Text><TextInput value={dosageNote} onChangeText={setDosageNote} placeholder="예: 초등 저학년 반 알" placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                </View>
              )}
              <View><Text style={styles.formLabel}>{isMed ? '주의사항 · 기타 안내' : '설명 · 안내'} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(선택)</Text></Text>
                <TextInput value={description} onChangeText={setDescription} placeholder="예: 파란 상자, 어린이용" placeholderTextColor="#9ca3af" style={styles.input} /></View>
              <View><Text style={styles.formLabel}>최소 재고 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(교무실당 기본값)</Text></Text>
                <TextInput value={minStock} onChangeText={setMinStock} keyboardType="number-pad" placeholder="이보다 적으면 '부족'" placeholderTextColor="#9ca3af" style={styles.input} /></View>
              {item && (
                <TouchableOpacity onPress={() => setIsActive(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={isActive ? 'checkbox' : 'square-outline'} size={20} color={isActive ? '#059669' : '#9ca3af'} />
                  <Text style={{ fontSize: 13, color: '#374151' }}>사용 중 (끄면 목록·검색에서 숨김)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity onPress={save} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? '저장 중...' : item ? '저장' : '추가'}</Text>
          </TouchableOpacity>
          <View style={{ height: 8 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ==================== 품목 사진·영상 (모바일) ====================

async function uploadItemMediaMobile(itemId: string, picked: PickedMedia[], by: string): Promise<ItemMedia[]> {
  const out: ItemMedia[] = [];
  for (const m of picked) {
    if ((m.fileSize ?? 0) > 50 * 1024 * 1024) continue;
    const blob = await uriToBlob(m.uri);
    const ext = m.fileName?.split('.').pop() || (m.type === 'video' ? 'mp4' : 'jpg');
    const path = inventoryItemMediaPath(itemId, m.fileName || `${m.type}.${ext}`);
    const r = storageRef(storage, path);
    await uploadBytes(r, blob, { contentType: m.mimeType || blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg') });
    out.push({ url: await getDownloadURL(r), path, type: m.type, name: m.fileName, size: m.fileSize ?? blob.size, by });
  }
  return out;
}

/** 품목이 어떻게 생겼는지 — 보기는 누구나, 등록·삭제는 관리자만 (규칙에서도 관리자만 허용) */
function ItemMediaSectionMobile({ item, canEdit, userName }: { item: InventoryItem; canEdit: boolean; userName: string }) {
  const [deleting, setDeleting] = useState<ItemMedia | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const media = item.media ?? [];
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<ItemMedia | null>(null);
  const add = async (picked: PickedMedia[]) => {
    if (!picked.length) return;
    if (picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024)) Alert.alert('알림', '50MB를 넘는 파일은 빼고 올립니다.');
    setBusy(true);
    try { await addInventoryItemMedia(db, item.id, await uploadItemMediaMobile(item.id, picked, userName)); }
    catch (e) { console.error('품목 사진 업로드 오류:', e); Alert.alert('오류', '사진을 올리지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = async (m: ItemMedia) => {
    setDeleteBusy(true);
    try { await removeInventoryItemMedia(db, item.id, media, m.path); await deleteObject(storageRef(storage, m.path)).catch(() => {}); setDeleting(null); }
    catch { Alert.alert('오류', '삭제하지 못했습니다.'); }
    finally { setDeleteBusy(false); }
  };
  const open = (m: ItemMedia) => { if (m.type === 'video') Linking.openURL(m.url); else setViewer(m); };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>사진 · 영상 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{media.length || ''}</Text></Text>
        {canEdit && (
          <>
            <TouchableOpacity disabled={busy} onPress={async () => add(await captureLostPhoto())} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: busy ? 0.4 : 1 }}>
              <Ionicons name="camera-outline" size={15} color="#1d4ed8" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>촬영</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={async () => add(await pickLostMedia())} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: busy ? 0.4 : 1 }}>
              <Ionicons name="images-outline" size={15} color="#1d4ed8" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{busy ? '올리는 중...' : '앨범'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      {media.length === 0 ? (
        <Text style={{ fontSize: 11, color: '#9ca3af', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, textAlign: 'center' }}>
          {canEdit ? '아직 사진이 없어요. 포장·실물 사진을 올려두면 다른 선생님이 찾기 쉬워요.' : '등록된 사진이 없습니다. (사진 등록은 관리자만)'}
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {media.map(m => (
            <TouchableOpacity key={m.path} onPress={() => open(m)} activeOpacity={0.9}
              style={{ width: '100%', aspectRatio: m.type === 'video' ? 16 / 9 : 4 / 3, borderRadius: 10, overflow: 'hidden', backgroundColor: m.type === 'video' ? '#111827' : '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' }}>
              {m.type === 'video'
                ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Ionicons name="play-circle" size={44} color="#fff" /><Text style={{ fontSize: 11, color: '#d1d5db' }}>눌러서 영상 재생</Text></View>
                : <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}
              {m.by ? <Text style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>{m.by}</Text> : null}
              {canEdit && (
                <TouchableOpacity onPress={() => setDeleting(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[styles.thumbRemove, { width: 26, height: 26, borderRadius: 13, top: 6, right: 6 }]}><Text style={{ color: '#fff', fontSize: 12 }}>✕</Text></TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => !deleteBusy && setDeleting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 380 }]}>
            {deleting && (deleting.type === 'video'
              ? <View style={{ height: 150, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam" size={36} color="#fff" /></View>
              : <Image source={{ uri: deleting.url }} style={{ width: '100%', height: 200, backgroundColor: '#f3f4f6' }} contentFit="contain" />)}
            <View style={{ padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>이 {deleting?.type === 'video' ? '영상' : '사진'}을 삭제할까요?</Text>
              <Text style={{ fontSize: 12, color: '#4b5563', lineHeight: 18 }}>
                <Text style={{ fontWeight: '700' }}>{item.name}</Text>의 {deleting?.type === 'video' ? '영상' : '사진'}이 <Text style={{ fontWeight: '700', color: '#dc2626' }}>모든 캠프에서 사라지고 되돌릴 수 없어요.</Text>
                {deleting?.by ? ` (${deleting.by} 선생님이 올림)` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity onPress={() => setDeleting(null)} disabled={deleteBusy} style={[styles.btn, { backgroundColor: '#f3f4f6', paddingVertical: 11 }]}><Text style={{ fontSize: 13, color: '#374151' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleting && remove(deleting)} disabled={deleteBusy} style={[styles.btn, { backgroundColor: '#dc2626', paddingVertical: 11, opacity: deleteBusy ? 0.5 : 1 }]}><Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{deleteBusy ? '삭제 중...' : '삭제'}</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer.url }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          {viewer?.by ? <Text style={{ position: 'absolute', bottom: 40, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{viewer.by} 올림</Text> : null}
          <TouchableOpacity onPress={() => setViewer(null)} style={{ position: 'absolute', top: 50, right: 20, padding: 8 }}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}


// ==================== 🛒 구매 목록 (부매니저 · 관리자 · 모바일) ====================

function PurchaseListTabMobile({ views, groups, needs, requests, settings, onSelect, onGoRequests }: {
  views: InventoryItemView[]; groups: InventoryGroup[]; needs: PurchaseNeed[]; requests: SupplyRequest[]; settings: SupplySettings | null;
  onSelect: (id: string) => void; onGoRequests: () => void;
}) {
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const auto = useMemo(() => {
    const q = search.trim().toLowerCase();
    return uncoveredPurchaseNeeds(needs, requests)
      .filter(n => !groupFilter || n.groupId === groupFilter)
      .filter(n => !q || n.itemName.toLowerCase().includes(q))
      .sort((a, b) => b.shortage - a.shortage);
  }, [needs, requests, groupFilter, search]);

  const fromRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Array<{ req: SupplyRequest; line: SupplyRequestLine }> = [];
    requests.forEach(r => {
      if (!isSupplyOpen(r.status)) return;
      r.items.forEach(line => {
        if (r.done?.[line.id]) return;
        if (groupFilter && line.groupId && line.groupId !== groupFilter) return;
        if (q && !line.name.toLowerCase().includes(q)) return;
        out.push({ req: r, line });
      });
    });
    return out;
  }, [requests, groupFilter, search]);

  const viewOf = (itemId?: string) => (itemId ? views.find(v => v.id === itemId) : undefined);

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={styles.searchBox}>
        <Ionicons name="search" size={14} color="#9ca3af" />
        <TextInput value={search} onChangeText={setSearch} placeholder="물품명 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => setGroupFilter('')} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
          <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>교무실 전체</Text>
        </TouchableOpacity>
        {groups.map(g => (
          <TouchableOpacity key={g.id} onPress={() => setGroupFilter(groupFilter === g.id ? '' : g.id)} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
            <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={{ fontSize: 10, color: '#9ca3af' }}>실제 구매 수량은 구매 담당자가 정합니다. 물건이 도착해 입고까지 해야 재고에 반영됩니다.</Text>

      <View>
        <Text style={styles.sectionTitle}>재고 부족 (최소 재고 미달) <Text style={{ color: '#9ca3af', fontWeight: '400' }}>{auto.length}</Text></Text>
        {auto.length === 0 ? (
          <Text style={styles.emptyBody}>부족한 물품이 없습니다.</Text>
        ) : (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
            {auto.map((n, i) => {
              const v = viewOf(n.itemId);
              return (
                <TouchableOpacity key={`${n.itemId}|${n.groupId}`} onPress={() => onSelect(n.itemId)} activeOpacity={0.6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: '#e5e7eb' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{n.itemName}{v?.spec ? <Text style={{ fontWeight: '400', color: '#9ca3af' }}>  {v.spec}</Text> : null}</Text>
                    <Text style={{ fontSize: 10, color: '#6b7280' }}>{n.groupName} · 현재 {n.current} / 최소 {n.min}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#dc2626' }}>−{n.shortage}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{n.unit}</Text></Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>요청 물품 (아직 구매 전) <Text style={{ color: '#9ca3af', fontWeight: '400' }}>{fromRequests.length}</Text></Text>
          <TouchableOpacity onPress={onGoRequests}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>재고 요청 ›</Text></TouchableOpacity>
        </View>
        {fromRequests.length === 0 ? (
          <Text style={styles.emptyBody}>진행 중인 요청 물품이 없습니다.</Text>
        ) : (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
            {fromRequests.map(({ req, line }, i) => {
              const buyer = supplyBuyerOf(req, settings);
              const pg = supplyProgress(req, !!buyer);
              return (
                <View key={`${req.id}|${line.id}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: '#e5e7eb' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{line.name}</Text>
                    <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>
                      {supplyForLabel(req)}{line.groupName ? ` · ${line.groupName}` : ''}{buyer ? ` · ${buyer.name}` : ''}{line.channel ? ` · ${line.channel}` : ''}{line.parentBill ? ' · 학부모 청구' : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1f2937' }}>{line.quantity}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{line.unit}</Text></Text>
                  <View style={{ backgroundColor: pg.key === 'buying' ? '#ecfdf5' : pg.key === 'approved' ? '#eff6ff' : pg.key === 'onhold' ? '#fffbeb' : '#f3f4f6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: pg.key === 'buying' ? '#047857' : pg.key === 'approved' ? '#1d4ed8' : pg.key === 'onhold' ? '#b45309' : '#6b7280' }}>{pg.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ==================== 📋 입출고 기록 (부매니저 · 관리자 · 모바일) ====================

function MovementTabMobile({ campCode, groups, views }: {
  campCode: string; groups: InventoryGroup[]; views: InventoryItemView[];
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeCampMovements(db, campCode, setMovements), [campCode]);
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [kind, setKind] = useState<MovementFilterKey>('all');
  const [days, setDays] = useState<number>(7);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const reasons = MOVEMENT_FILTERS.find(f => f.key === kind)?.reasons ?? [];
    const since = days > 0 ? Date.now() - days * 86400000 : 0;
    return movements.filter(m => {
      if (groupFilter && m.groupId !== groupFilter) return false;
      if (reasons.length > 0 && !reasons.includes(m.reason)) return false;
      if (since && (m.at?.toMillis?.() ?? 0) < since) return false;
      if (q && !(m.itemName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [movements, groupFilter, kind, days, search]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder="물품명 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          {MOVEMENT_FILTERS.map(f => (
            <TouchableOpacity key={f.key} onPress={() => setKind(f.key)} style={[styles.chip, kind === f.key && styles.chipActive]}>
              <Text style={[styles.chipText, kind === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          {[{ v: 7, l: '최근 7일' }, { v: 30, l: '최근 30일' }, { v: 0, l: '전체 기간' }].map(d => (
            <TouchableOpacity key={d.v} onPress={() => setDays(d.v)} style={[styles.miniChip, days === d.v && styles.miniChipAmber]}>
              <Text style={[styles.miniChipText, days === d.v && { color: '#92400e' }]}>{d.l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setGroupFilter('')} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
            <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>모든 교무실</Text>
          </TouchableOpacity>
          {groups.map(g => (
            <TouchableOpacity key={g.id} onPress={() => setGroupFilter(groupFilter === g.id ? '' : g.id)} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
              <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <View style={styles.centered}><Text style={styles.emptyBody}>기록이 없습니다.</Text></View>
        ) : filtered.map((m, i) => {
          const v = views.find(x => x.id === m.itemId);
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb', borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 10, color: '#9ca3af', width: 64 }}>{fmtDateTime(m.at)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                  {m.itemName}{v?.spec ? <Text style={{ fontWeight: '400', color: '#9ca3af' }}>  {v.spec}</Text> : null}
                </Text>
                <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>
                  {m.groupName} · {movementLabel(m)}{m.memo ? ` · ${m.memo}` : ''} · {m.by}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', width: 40, textAlign: 'right', color: m.delta > 0 ? '#047857' : '#dc2626' }}>{m.delta > 0 ? '+' : ''}{m.delta}</Text>
            </View>
          );
        })}
        {filtered.length > 0 && <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', paddingVertical: 10 }}>최신 400건까지 보여줍니다.</Text>}
      </ScrollView>
    </View>
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
  /** 학생 반 → 캠프 그룹 (알림 대상 안내·저장에 함께 사용) */
  const ownerGroupLabel = useMemo(
    () => (owner?.classNumber ? findGroupByClassCode(campGroups, studentClassCode(owner.classNumber))?.name : undefined),
    [owner, campGroups]);
  // 이름표로 주인을 아는 분실물: 누구에게 보낼지 (기본은 담당 셋 다)
  const [targets, setTargets] = useState<LostNotifyTarget[]>([...LOST_NOTIFY_TARGETS]);
  const [toAll, setToAll] = useState(false);
  const toggleTarget = (t: LostNotifyTarget) =>
    setTargets(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  // 보내기 전에 "누가 받을 수 있나" 확인 — 캠프 인원은 필요할 때 한 번만 불러온다
  const [campUsers, setCampUsers] = useState<NotifyUserLike[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const loadCampUsers = async () => {
    if (campUsers || !jobCodeId) return;
    setChecking(true);
    try { setCampUsers((await getUsersByJobCodeId(jobCodeId)) as unknown as NotifyUserLike[]); }
    catch (e) { console.warn('캠프 인원 조회 실패:', e); setCampUsers([]); }
    finally { setChecking(false); }
  };
  // 담당 선생님을 고른 경우엔 인원이 적으니 자동으로 확인해 둔다
  useEffect(() => { if (owner && !toAll) loadCampUsers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [owner, toAll]);
  const preview = useMemo(() => {
    if (!campUsers) return null;
    return lostNotifyPreview(campUsers, {
      jobCodeId,
      scope: owner && !toAll ? 'owner' : 'all',
      targets,
      ownerClassMentor: owner?.classMentor,
      ownerUnitMentor: owner?.unitMentor,
      ownerGroup: ownerGroupLabel?.toLowerCase(),
      excludeId: userId,
    });
  }, [campUsers, owner, toAll, targets, ownerGroupLabel, jobCodeId, userId]);
  /** 이 그룹의 부매니저 이름들 — 반담당·방담당처럼 사람을 특정해 보여 준다 */
  const groupManagerNames = useMemo(
    () => (campUsers ? lostGroupManagers(campUsers, jobCodeId, ownerGroupLabel?.toLowerCase()).map(u => String(u.name ?? '').trim()).filter(Boolean) : []),
    [campUsers, jobCodeId, ownerGroupLabel]);
  const reachOfName = (name?: string) => {
    if (!name || !preview) return null;
    const t = name.trim();
    if (preview.ok.includes(t)) return 'ok' as const;
    const m = preview.missed.find(x => x.name === t);
    return m ? m.state : null;
  };
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
      const ownerGroup = ownerGroupLabel?.toLowerCase();
      const id = await addLostItem(db, {
        campCode, name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined,
        foundDate, keptAt: keptAt.trim() || undefined, reportedBy: userName, reportedById: userId,
        jobCodeId: jobCodeId || undefined, notify,
        ownerStudentId: owner?.studentId, ownerName: owner?.name, ownerClassCode: owner?.className,
        ownerClassMentor: owner?.classMentor, ownerUnitMentor: owner?.unitMentor, ownerGroup,
        notifyScope: owner ? (toAll ? 'all' : 'owner') : undefined,
        notifyTargets: owner && !toAll ? targets : undefined,
      });
      if (picked.length) {
        setProgress(`사진·영상 ${picked.length}개 업로드 중...`);
        const media = await uploadLostMediaMobile(campCode, id, picked);
        await addLostItemMedia(db, id, media);
      }
      if (notify) {
        authenticatedFetch('/api/inventory/notify-lost', { method: 'POST', body: JSON.stringify({ lostItemId: id }) })
          .then(async res => {
            const data = (await res.json().catch(() => null)) as { sent?: number; missed?: Array<{ name: string; state: string }> } | null;
            const msg = missedSummary(data?.missed);
            if (msg) Alert.alert('알림을 못 받은 사람이 있어요', msg);
          })
          .catch(e => console.warn('분실물 알림 요청 실패:', e));
      }
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
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => setNotify(v => !v)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
              <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={18} color={notify ? '#2563eb' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#374151' }}>푸시 알림 보내기</Text>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                  {!notify ? '아무에게도 보내지 않습니다'
                    : owner && !toAll
                      ? (targets.length
                          ? `${owner.name} 학생 ${targets.map(t => LOST_NOTIFY_TARGET_LABELS[t].ko).join(' · ')}에게만 보냅니다`
                          : '받는 사람을 골라주세요')
                      : '캠프 선생님 전체에게 보냅니다 — 중요하지 않은 물품이면 끄세요'}
                </Text>
              </View>
            </TouchableOpacity>
            {notify && owner ? (
              <View style={{ padding: 10, gap: 6, backgroundColor: '#f9fafb', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4b5563' }}>
                  받는 사람 <Text style={{ fontWeight: '400', color: '#9ca3af' }}>이름표가 있어 주인을 아는 물품이에요</Text>
                </Text>
                <View style={{ gap: 6, opacity: toAll ? 0.4 : 1 }}>
                  {LOST_NOTIFY_TARGETS.map(t => {
                    const who = t === 'classMentor' ? owner.classMentor
                      : t === 'unitMentor' ? owner.unitMentor
                      : groupManagerNames.join(', ');
                    // 부매니저는 명단을 불러와야 이름을 알 수 있다
                    const loading = t === 'groupManager' && !campUsers;
                    const on = !toAll && targets.includes(t);
                    return (
                      <TouchableOpacity key={t} disabled={toAll || (!who && !loading)} onPress={() => toggleTarget(t)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? '#2563eb' : '#9ca3af'} />
                        <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                          {LOST_NOTIFY_TARGET_LABELS[t].ko}
                          <Text style={{ fontSize: 11, color: '#9ca3af' }}>  {loading ? '확인 중...' : who || (t === 'groupManager' ? `${ownerGroupLabel ?? ''} 부매니저 없음`.trim() : '지정된 사람 없음')}</Text>
                        </Text>
                        {(() => {
                          if (toAll || !who) return null;
                          const names = t === 'groupManager' ? groupManagerNames : [who];
                          const bad = names.map(n => reachOfName(n)).find(st => st && st !== 'ok');
                          if (bad) return <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>🔕 {MISSED_STATE_LABELS[bad]?.ko ?? '못 받음'}</Text>;
                          if (names.every(n => reachOfName(n) === 'ok')) return <Text style={{ fontSize: 10, color: '#047857' }}>받을 수 있음</Text>;
                          return null;
                        })()}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
                  <TouchableOpacity onPress={() => setToAll(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name={toAll ? 'checkbox' : 'square-outline'} size={18} color={toAll ? '#2563eb' : '#9ca3af'} />
                    <Text style={{ fontSize: 12, color: '#374151' }}>캠프 선생님 전체</Text>
                  </TouchableOpacity>
                  {toAll ? (
                    <TouchableOpacity onPress={() => { setShowCheck(v => !v); loadCampUsers(); }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>
                        {checking ? '확인 중...' : showCheck ? '접기' : '받을 수 있는지 확인'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {toAll && showCheck && preview ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 3 }}>
                    <Text style={{ fontSize: 11, color: '#374151' }}>
                      <Text style={{ fontWeight: '700' }}>{preview.total}명</Text> 중 <Text style={{ fontWeight: '700', color: '#047857' }}>{preview.ok.length}명</Text>이 받을 수 있어요
                      {preview.missed.length > 0 ? <Text> · <Text style={{ fontWeight: '700', color: '#dc2626' }}>{preview.missed.length}명</Text>은 못 받아요</Text> : null}
                    </Text>
                    {preview.missed.length > 0 ? (
                      <Text style={{ fontSize: 11, color: '#6b7280', lineHeight: 16 }}>
                        {preview.missed.map(m => `${m.name}(${MISSED_STATE_LABELS[m.state]?.ko ?? '못 받음'})`).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {!toAll && preview && preview.missed.length > 0 ? (
                  <Text style={{ fontSize: 11, color: '#dc2626' }}>
                    🔕 {preview.missed.map(m => `${m.name}(${MISSED_STATE_LABELS[m.state]?.ko ?? '못 받음'})`).join(', ')} — 알림을 켜 달라고 알려주세요
                  </Text>
                ) : null}
                {!toAll && preview && preview.total === 0 && targets.length > 0 ? (
                  <Text style={{ fontSize: 11, color: '#b45309' }}>고른 담당 선생님이 이 캠프 명단에 없어요. 캠프 전체로 보내는 게 좋겠습니다.</Text>
                ) : null}
                {!toAll && targets.length === 0 ? (
                  <Text style={{ fontSize: 11, color: '#b45309' }}>한 명 이상 고르거나, 캠프 전체를 선택하거나, 푸시 알림을 꺼주세요.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
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

/** 유효기간 입력 정리: "2026-12" → 그 달 말일, "20261231" → 2026-12-31 */
function normExpiry(raw: string): string | null {
  const t = raw.trim().replace(/[./]/g, '-');
  if (!t) return '';
  let m = t.match(/^(\d{4})-?(\d{2})$/);
  if (m) { const last = new Date(Number(m[1]), Number(m[2]), 0).getDate(); return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`; }
  m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function ItemDetailMobile({ view, groups, campCode, perm, userId, userName, initialUseGroupId, defaultGroupId, onRequest, onClose, onEditItem }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; perm: InventoryPerm; userId: string; userName: string;
  initialUseGroupId?: string; defaultGroupId?: string;
  onRequest: (view: InventoryItemView, groupId?: string) => void;
  onClose: () => void; onEditItem?: () => void;
}) {
  const isAdmin = perm.canManageStock;
  const isMedicine = ['oral', 'topical'].includes(getItemUsage(view));
  // 그룹 간 이동 — 일반 수량 조정과 헷갈리지 않도록 별도 화면
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  /** 바로 사용할 교무실 — 내 교무실 → 재고가 있는 첫 곳 */
  const useGroupId = (defaultGroupId && defaultGroupId in view.stocks) ? defaultGroupId
    : groups.find(g => getGroupStock(view, g.id) > 0)?.id;
  // 그룹별 유효기간(관리자) · 세부 위치(누구나)
  const [meta, setMeta] = useState<{ groupId: string; kind: 'location' | 'expiry'; value: string } | null>(null);
  const [restockExpiry, setRestockExpiry] = useState('');
  const [metaBusy, setMetaBusy] = useState(false);
  const saveMeta = async () => {
    if (!meta || metaBusy) return;
    let value: string | null = meta.value;
    if (meta.kind === 'expiry') {
      value = normExpiry(meta.value);
      if (value === null) { Alert.alert('확인 필요', '날짜를 2026-12-31 또는 2026-12 형식으로 적어주세요.'); return; }
    }
    setMetaBusy(true);
    try {
      await setStockMeta(db, campCode, view.id, meta.groupId, meta.kind === 'expiry' ? { expiry: value || null } : { location: value || null });
      setMeta(null);
    } catch { Alert.alert('오류', '저장하지 못했습니다.'); }
    finally { setMetaBusy(false); }
  };
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [showAllMoves, setShowAllMoves] = useState(false);
  const [mode, setMode] = useState<{ type: 'use' | 'restock' | 'adjust' | 'min'; groupId: string } | null>(
    initialUseGroupId ? { type: 'use', groupId: initialUseGroupId } : null);
  const [qty, setQty] = useState(initialUseGroupId ? '1' : '');
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
      if (mode.type === 'use') {
        if (!(n > 0)) return;
        await recordStockUse(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, { uid: userId, name: userName });
        notifySupply({ type: 'stock_low', campCode, itemId: view.id, groupId: group.id });
      } else if (mode.type === 'restock') {
        if (!(n > 0)) return;
        const ex = restockExpiry ? normExpiry(restockExpiry) : '';
        if (ex === null) { Alert.alert('확인 필요', '유효기간을 2026-12-31 또는 2026-12 형식으로 적어주세요.'); return; }
        await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
        if (ex) await setStockMeta(db, campCode, view.id, group.id, { expiry: ex });
        setRestockExpiry('');
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
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#047857', lineHeight: 26 }}>{view.total}<Text style={{ fontSize: 11, color: '#9ca3af' }}>{view.unit}</Text></Text>
            <Text style={{ fontSize: 9, color: '#9ca3af' }}>현재 총재고</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          {(view.description || view.dosageNote) ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#d1fae5', backgroundColor: '#ecfdf5', padding: 10, gap: 2 }}>
              {view.dosageNote ? <Text style={{ fontSize: 11, color: '#065f46' }}>📋 {view.dosageNote}</Text> : null}
              {view.description ? <Text style={{ fontSize: 11, color: '#374151' }}>ℹ️ {view.description}</Text> : null}
            </View>
          ) : null}

          {/* 교무실별 수량 */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>교무실별 수량</Text>
              {perm.canEditItem && onEditItem && <TouchableOpacity onPress={onEditItem}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>품목 수정</Text></TouchableOpacity>}
            </View>
            {groups.length === 0 ? <Text style={styles.emptyBody}>교무실(재고 그룹)이 없습니다.</Text> : (
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                {groups.map((g, i) => {
                  const n = getGroupStock(view, g.id);
                  const min = getMinStock(view, g.id);
                  const low = min > 0 && n < min;
                  return (
                    <View key={g.id} style={{ paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6', gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{g.name} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{g.location ?? ''}</Text></Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: low && perm.isStockManager ? '#dc2626' : '#1f2937' }}>{n}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{view.unit}</Text></Text>
                        {perm.isStockManager ? <Text style={{ fontSize: 10, color: '#9ca3af' }}>최소 {min}</Text> : null}
                        {perm.isStockManager ? (low
                          ? <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>부족 −{min - n}</Text>
                          : <Text style={{ fontSize: 9, color: '#9ca3af' }}>정상</Text>) : null}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity onPress={() => setMeta({ groupId: g.id, kind: 'location', value: view.locations[g.id] ?? '' })}>
                          <Text style={{ fontSize: 11, color: view.locations[g.id] ? '#374151' : '#cbd5e1' }}>📍 {view.locations[g.id] || '위치 적기'}</Text>
                        </TouchableOpacity>
                        {(() => {
                          const ex = view.expiries[g.id]; const st = expiryState(ex);
                          if (!ex) return isAdmin ? <TouchableOpacity onPress={() => setMeta({ groupId: g.id, kind: 'expiry', value: '' })}><Text style={{ fontSize: 11, color: '#cbd5e1' }}>⏳ 유효기간</Text></TouchableOpacity> : null;
                          return (
                            <TouchableOpacity disabled={!isAdmin} onPress={() => setMeta({ groupId: g.id, kind: 'expiry', value: ex })}>
                              <Text style={{ fontSize: 11, fontWeight: st === 'ok' ? '400' : '700', color: st === 'expired' ? '#dc2626' : st === 'soon' ? '#b45309' : '#6b7280' }}>⏳ {fmtExpiry(ex)}{st === 'expired' ? ' 지남' : st === 'soon' ? ' 임박' : ''}</Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                      {(isAdmin || g.id in view.stocks) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {g.id in view.stocks && (
                            <TouchableOpacity onPress={() => { setMode({ type: 'use', groupId: g.id }); setQty('1'); setMemo(''); }} style={{ backgroundColor: '#2563eb', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>− 사용</Text>
                            </TouchableOpacity>
                          )}
                          {isAdmin && (
                            <>
                              <TouchableOpacity onPress={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>+입고</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>조정</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => { setMode(null); setTransferFrom(g.id); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#4f46e5' }}>이동</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => { setMode({ type: 'min', groupId: g.id }); setQty(view.minStocks?.[g.id] != null ? String(view.minStocks[g.id]) : ''); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>최소</Text></TouchableOpacity>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {meta && (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', padding: 10, gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{meta.kind === 'location' ? '📍 세부 위치' : '⏳ 유효기간'} · {groups.find(g => g.id === meta.groupId)?.name}</Text>
              <TextInput value={meta.value} onChangeText={v => setMeta({ ...meta, value: v })} autoFocus placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]}
                placeholder={meta.kind === 'location' ? '예: 약통 2번 칸, 교무실 캐비닛 위' : '2026-12-31 또는 2026-12'} keyboardType={meta.kind === 'expiry' ? 'numbers-and-punctuation' : 'default'} />
              {meta.kind === 'expiry' && <Text style={{ fontSize: 10, color: '#9ca3af' }}>여러 개면 가장 빠른 날짜를 적어주세요. 월까지만 적으면 그 달 말일로 저장돼요.</Text>}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {meta.value ? <TouchableOpacity onPress={() => setMeta({ ...meta, value: '' })} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>지우기</Text></TouchableOpacity> : null}
                <TouchableOpacity onPress={() => setMeta(null)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveMeta} disabled={metaBusy} style={[styles.btn, { backgroundColor: '#1f2937', opacity: metaBusy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>저장</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {mode && group && (
            <View style={{ borderRadius: 10, borderWidth: 1, padding: 10, gap: 8, borderColor: mode.type === 'use' ? '#bfdbfe' : mode.type === 'restock' ? '#a7f3d0' : '#fde68a', backgroundColor: mode.type === 'use' ? '#eff6ff' : mode.type === 'restock' ? '#ecfdf5' : '#fffbeb' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>
                {mode.type === 'use' ? '📤 사용하기' : mode.type === 'restock' ? '📥 재고 입고' : mode.type === 'adjust' ? '✏️ 이 교무실 수량만 조정' : '📏 최소 보유 수량'} · {group.name} <Text style={{ fontWeight: '400', color: '#6b7280' }}>현재 {current}{view.unit}</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" autoFocus
                  placeholder={mode.type === 'use' ? '사용 수량' : mode.type === 'restock' ? '입고 수량' : mode.type === 'adjust' ? '조정 후 수량' : `비우면 기본값(${view.minStockDefault ?? 0})`} placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 130 }]} />
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{view.unit}</Text>
                {mode.type === 'restock' && qty ? <Text style={{ fontSize: 11, color: '#047857' }}>→ {current + (parseInt(qty, 10) || 0)}</Text> : null}
                {mode.type === 'use' && qty ? <Text style={{ fontSize: 11, color: '#1d4ed8' }}>→ {current - (parseInt(qty, 10) || 0)} 남음</Text> : null}
                {mode.type === 'adjust' && qty ? <Text style={{ fontSize: 11, color: '#b45309' }}>차이 {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</Text> : null}
              </View>
              {mode.type === 'restock' && (
                <TextInput value={restockExpiry} onChangeText={setRestockExpiry} placeholder="유효기간 (선택) 2026-12-31 또는 2026-12" placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation" style={[styles.input, { backgroundColor: '#fff' }]} />
              )}
              {mode.type !== 'min' && (
                <>
                  {mode.type === 'use' && isMedicine && (
                    <Text style={{ fontSize: 10, color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 6, padding: 6 }}>💊 학생에게 먹이거나 발라 준 약은 환자 탭에서 복용 기록을 남기면 자동으로 빠져요. 여기서도 빼면 두 번 빠집니다.</Text>
                  )}
                  {mode.type === 'use' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {USE_REASONS.map(r => (
                        <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#2563eb' }]}>
                          <Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {mode.type === 'adjust' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {ADJUST_REASONS.map(r => (
                        <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#f59e0b' }]}>
                          <Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput value={memo} onChangeText={setMemo} placeholder={mode.type === 'use' ? '어디에 썼나요? (선택)' : mode.type === 'restock' ? '메모 (선택)' : '위에서 고르거나 직접 입력 (필수)'} placeholderTextColor="#9ca3af" style={styles.input} />
                </>
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
                {(showAllMoves ? movements : movements.slice(0, 4)).map(m => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 10, color: '#9ca3af', width: 66 }}>{fmtDateTime(m.at)}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: '#374151' }}>
                      <Text style={{ fontWeight: '700', color: '#1f2937' }}>{movementLabel(m)}</Text>
                      <Text style={{ color: '#9ca3af' }}> · {m.groupName}</Text>{m.memo ? <Text style={{ color: '#6b7280' }}> · {m.memo}</Text> : null}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>{m.by}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right', color: m.delta > 0 ? '#047857' : '#dc2626' }}>{m.delta > 0 ? '+' : ''}{m.delta}</Text>
                  </View>
                ))}
                {movements.length > 4 && (
                  <TouchableOpacity onPress={() => setShowAllMoves(v => !v)} style={{ paddingVertical: 6, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280' }}>{showAllMoves ? '접기 ▲' : `이전 내역 ${movements.length - 4}건 더 보기 ▼`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <ItemMediaSectionMobile item={view} canEdit={perm.canEditItemMedia} userName={userName} />
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* 사용하기 · 필요한 물품 요청 — 누구나 */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          <TouchableOpacity disabled={!useGroupId}
            onPress={() => { if (useGroupId) { setMode({ type: 'use', groupId: useGroupId }); setQty('1'); setMemo(''); } }}
            style={[styles.btn, { backgroundColor: useGroupId ? '#2563eb' : '#e5e7eb' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: useGroupId ? '#fff' : '#9ca3af' }}>사용하기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRequest(view, defaultGroupId)} style={[styles.btn, { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#047857' }}>필요한 물품 요청</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!transferFrom} animationType="fade" transparent onRequestClose={() => setTransferFrom(null)}>
        {transferFrom && (
          <StockTransferMobile view={view} groups={groups} campCode={campCode} fromGroupId={transferFrom}
            userId={userId} userName={userName} onClose={() => setTransferFrom(null)} />
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==================== 🔁 그룹(교무실) 간 재고 이동 (모바일) ====================

function StockTransferMobile({ view, groups, campCode, fromGroupId, userId, userName, onClose }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; fromGroupId: string; userId: string; userName: string; onClose: () => void;
}) {
  const [from, setFrom] = useState(fromGroupId);
  const others = groups.filter(g => g.id !== from);
  const [to, setTo] = useState(others[0]?.id ?? '');
  useEffect(() => { if (to === from) setTo(groups.find(g => g.id !== from)?.id ?? ''); }, [from, to, groups]);
  const [qty, setQty] = useState('1');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ from: number; to: number } | null>(null);

  const fromGroup = groups.find(g => g.id === from);
  const toGroup = groups.find(g => g.id === to);
  const fromCur = getGroupStock(view, from);
  const toCur = getGroupStock(view, to);
  const n = parseInt(qty, 10) || 0;
  const invalid = !fromGroup || !toGroup || from === to || n <= 0 || n > fromCur;

  const submit = async () => {
    if (invalid || busy || !fromGroup || !toGroup) return;
    setBusy(true);
    try {
      const res = await transferStock(db, campCode, {
        itemId: view.id, itemName: view.name,
        fromGroupId: fromGroup.id, fromGroupName: fromGroup.name,
        toGroupId: toGroup.id, toGroupName: toGroup.name,
        quantity: n, memo: memo.trim() || undefined,
      }, { uid: userId, name: userName });
      setDone(res);
      notifySupply({ type: 'stock_low', campCode, itemId: view.id, groupId: fromGroup.id });
    } catch (e) {
      Alert.alert('이동하지 못했습니다', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>🔁 다른 교무실로 이동</Text>
            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>보내는 곳에서 빠지고 받는 곳에 그대로 더해집니다 (전체 재고는 그대로)</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10 }}>
            {itemThumb(view)
              ? <Image source={{ uri: itemThumb(view) }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6' }} contentFit="cover" />
              : <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="cube-outline" size={18} color="#cbd5e1" /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }} numberOfLines={1}>{view.name}</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }} numberOfLines={1}>{[view.kind, view.spec].filter(Boolean).join(' · ') || view.category}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#047857' }}>{view.total}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{view.unit}</Text></Text>
          </View>

          {done ? (
            <View style={{ borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12, gap: 3 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#065f46' }}>이동했습니다.</Text>
              <Text style={{ fontSize: 12, color: '#374151' }}>{fromGroup?.name} {done.from}{view.unit} · {toGroup?.name} {done.to}{view.unit}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>양쪽 입출고 기록에 남았습니다.</Text>
            </View>
          ) : (
            <>
              <View>
                <Text style={styles.fieldLabel}>보내는 교무실</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {groups.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => setFrom(g.id)} style={[styles.miniChip, from === g.id && styles.miniChipAmber]}>
                      <Text style={[styles.miniChipText, from === g.id && { color: '#92400e', fontWeight: '700' }]}>{g.name} {getGroupStock(view, g.id)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={styles.fieldLabel}>받는 교무실</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {others.length === 0 ? <Text style={styles.emptyBody}>이동할 곳이 없습니다.</Text> : others.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => setTo(g.id)} style={[styles.miniChip, to === g.id && { backgroundColor: '#e0e7ff', borderColor: '#c7d2fe' }]}>
                      <Text style={[styles.miniChipText, to === g.id && { color: '#4338ca', fontWeight: '700' }]}>{g.name} {getGroupStock(view, g.id)}{g.id in view.stocks ? '' : ' (새로)'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>이동할 수량</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" style={[styles.input, { width: 110 }]} placeholder="0" placeholderTextColor="#9ca3af" />
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{view.unit}</Text>
                  {[1, 5, 10].filter(x => x <= fromCur).map(x => (
                    <TouchableOpacity key={x} onPress={() => setQty(String(x))} style={styles.miniChip}><Text style={styles.miniChipText}>{x}</Text></TouchableOpacity>
                  ))}
                  {fromCur > 0 && <TouchableOpacity onPress={() => setQty(String(fromCur))} style={styles.miniChip}><Text style={styles.miniChipText}>전부</Text></TouchableOpacity>}
                </View>
                {n > fromCur ? <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>보유 수량({fromCur}{view.unit})보다 많이 보낼 수 없습니다.</Text> : null}
                {!invalid ? (
                  <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 6, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
                    {fromGroup?.name} {fromCur} → <Text style={{ fontWeight: '800', color: '#dc2626' }}>{fromCur - n}</Text> · {toGroup?.name} {toCur} → <Text style={{ fontWeight: '800', color: '#047857' }}>{toCur + n}</Text>
                    <Text style={{ color: '#9ca3af' }}>  전체 {view.total} (그대로)</Text>
                  </Text>
                ) : null}
              </View>

              <View>
                <Text style={styles.fieldLabel}>이동 사유 (선택)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {TRANSFER_REASONS.map(r => (
                    <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#4f46e5', borderColor: '#4f46e5' }]}>
                      <Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={memo} onChangeText={setMemo} placeholder="직접 입력해도 됩니다" placeholderTextColor="#9ca3af" style={styles.input} />
              </View>
            </>
          )}
          <View style={{ height: 12 }} />
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 13, color: '#4b5563' }}>{done ? '닫기' : '취소'}</Text></TouchableOpacity>
          {!done && (
            <TouchableOpacity onPress={submit} disabled={invalid || busy} style={[styles.btn, { backgroundColor: '#4f46e5', opacity: invalid || busy ? 0.4 : 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{busy ? '이동 중...' : '이동하기'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyBody: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  tabScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff' },
  tabBtn: { minWidth: 92, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', position: 'relative' },
  summaryCard: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  summaryLabel: { fontSize: 10, color: '#6b7280' },
  summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 1 },
  summaryUnit: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
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
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#4b5563', marginBottom: 5 },
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
  /** 재고 목록 전용 — 모든 행 높이를 통일해 빠르게 훑을 수 있게 */
  stockRow: { height: 56, paddingVertical: 0 },
  rowThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f3f4f6' },
  rowName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 11, fontWeight: '400', color: '#9ca3af' },
  rowGroups: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  rowGroupLow: { color: '#dc2626', fontWeight: '700' },
  rowGroupFocus: { color: '#92400e', fontWeight: '700' },
  rowTotal: { fontSize: 15, fontWeight: '800', color: '#111827' },
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
