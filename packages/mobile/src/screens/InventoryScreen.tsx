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
  setSupplyRequestNote,
  approveSupplyRequests,
  supplyApproved,
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
  LOST_ITEM_KINDS,
  LOST_KIND_LABELS,
  LOST_STATUS_LABELS_BY_KIND,
  lostItemKind,
  lostStatusLabel,
  isLostOpen,
  suggestLostMatches,
  linkLostItems,
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
  managedStockGroupIds,
  canTransferBetween,
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
  suggestedUsages, dataLabel, L, isEnglishUI, supplyUnitChoices, isMedicineItem, USE_REASON_OTHER, orderedItemMedia, itemCoverMedia, setItemCoverMedia, getAvailableStock, getOpenedCount, getNearlyEmptyCount, isMultiUse, supplyLineStockQty, setSupplyDecision, supplyDecisionOf, type SupplyDecision } from '@smis-mentor/shared';
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
  LostItemKind,
  CampGroup,
  STSheetStudent,
  InventoryUsage,
  InventoryPerm,
  LostNotifyTarget,
  NotifyUserLike,
  MovementFilterKey,
  InventoryPackage, InventoryConsumption } from '@smis-mentor/shared';
import { fmtHoldDate, supplyStatusLine } from '@smis-mentor/shared';

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
  /** 입고 · 조정 · 이동할 수 있는 그룹 — 관리자 전체, 부매니저는 자기 그룹 */
  const managedGroupIds = useMemo(
    () => managedStockGroupIds(inventoryPerm(userData as { role?: string; jobExperiences?: Array<{ id: string; groupRole?: string }> } | null, activeJobCodeId),
      groups, userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group),
    [userData, activeJobCodeId, groups]);
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
        <Text style={styles.emptyTitle}>{activeJobCodeId ? L('inventory.loadingCampInfo') : L('patient.pleaseSelectAnActiveCamp')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 세부탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {([
          { id: 'stock' as SubTab, title: L('inventory.stock'), icon: 'cube-outline' as const, badge: 0 },
          { id: 'request' as SubTab, title: L('inventory.request'), icon: 'clipboard-outline' as const, badge: requestBadge },
          ...(perm.isStockManager ? [{ id: 'purchase' as SubTab, title: L('inventory.toBuy'), icon: 'cart-outline' as const, badge: 0 }] : []),
          ...(perm.isStockManager ? [{ id: 'movement' as SubTab, title: L('inventory.history'), icon: 'list-outline' as const, badge: 0 }] : []),
          { id: 'lost' as SubTab, title: L('inventory.lost'), icon: 'search-outline' as const, badge: keptLostCount },
          ...(isAdmin ? [{ id: 'manage' as SubTab, title: L('inventory.manage'), icon: 'settings-outline' as const, badge: 0 }] : []),
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
                  <Text style={styles.summaryLabel}>{L('inventory.lowStock')}{shortOnly ? L('inventory.viewing') : ''}</Text>
                  <Text style={[styles.summaryValue, shortIds.size > 0 ? { color: '#dc2626' } : { color: '#9ca3af' }]}>
                    {shortIds.size}<Text style={styles.summaryUnit}>{L('inventory.items3')}</Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSubTab('request')} activeOpacity={0.7} style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>{L('inventory.openRequests')}</Text>
                  <Text style={[styles.summaryValue, openRequestCount > 0 ? { color: '#047857' } : { color: '#9ca3af' }]}>
                    {openRequestCount}<Text style={styles.summaryUnit}>{L('inventory.text5')}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItemTypeIngredient')} placeholderTextColor="#9ca3af" style={styles.searchInput} returnKeyType="search" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {isAdmin && (
                <TouchableOpacity onPress={() => setAdding({ category: category === '전체' ? undefined : category })} style={[styles.chip, { backgroundColor: '#1f2937', borderColor: '#1f2937', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                  <Ionicons name="add" size={13} color="#fff" />
                  <Text style={[styles.chipText, { color: '#fff' }]}>{category === '전체' ? L('inventory.addItem') : L('inventory.addTo', { v0: category })}</Text>
                </TouchableOpacity>
              )}
              {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{dataLabel(c)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {groups.length > 0 && (
                <TouchableOpacity onPress={() => { setGroupTouched(true); setGroupFilter(''); }} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>{L('inventory.allGroups')}</Text>
                </TouchableOpacity>
              )}
              {groups.map(g => (
                <TouchableOpacity key={g.id} onPress={() => { setGroupTouched(true); setGroupFilter(groupFilter === g.id ? '' : g.id); }} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
                  <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.id === myInvGroupId ? '★ ' : ''}{g.name}</Text>
                </TouchableOpacity>
              ))}
              {perm.isStockManager && (
                <TouchableOpacity onPress={() => setShortOnly(v => !v)} style={[styles.miniChip, shortOnly && { backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                  <Text style={[styles.miniChipText, shortOnly && { color: '#b91c1c', fontWeight: '700' }]}>{L('inventory.lowOnly')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            {sections.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
                <TouchableOpacity onPress={toggleAll} style={styles.secAllBtn}>
                  <Ionicons name={allOpen ? 'contract-outline' : 'expand-outline'} size={12} color="#fff" />
                  <Text style={styles.secAllBtnText}>{allOpen ? L('inventory.collapseAll') : L('inventory.expandAll')}</Text>
                </TouchableOpacity>
                {sections.map(sec => {
                  const open = !collapsed[sec.title];
                  return (
                    <TouchableOpacity key={sec.title} onPress={() => setCollapsed(c => ({ ...c, [sec.title]: open }))}
                      style={[styles.secBtn, open ? styles.secBtnOn : styles.secBtnOff]}>
                      <Text style={[styles.secBtnText, open ? { color: '#065f46' } : { color: '#9ca3af' }]}>
                        {sec.sub ?? dataLabel(sec.cat)} <Text style={{ fontWeight: '400' }}>{sec.count}</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {groups.length === 0 && (
            <View style={[styles.notice, { marginHorizontal: 12, marginTop: 8 }]}><Text style={styles.noticeText}>{L('inventory.thisCampHasNoInventory')}</Text></View>
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
                  <Text style={styles.emptyBody}>{L('inventory.allCategoriesAreCollapsed')}</Text>
                  <TouchableOpacity onPress={() => setCollapsed({})} style={{ marginTop: 6 }}><Text style={{ fontSize: 12, color: '#047857', fontWeight: '600' }}>{L('inventory.expandAll')}</Text></TouchableOpacity>
                </View>
              ) : views.length === 0 ? (
                <View style={styles.centered}>
                  <Ionicons name="cube-outline" size={36} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>{L('inventory.noItemsRegistered')}</Text>
                </View>
              ) : (
                <View style={styles.centered}>
                  <Text style={styles.emptyBody}>{search ? L('students.noResults') : L('inventory.noItemsInThisCamp')}</Text>
                </View>
              )
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                <Text style={styles.sectionHeaderCount}>{section.count}</Text>
                {isAdmin && (
                  <TouchableOpacity onPress={() => setAdding({ category: section.cat, subCategory: section.sub })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 'auto' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('patient.add')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            renderItem={({ item: v, index, section }) => (
              <StockRowMobile view={v} groups={groups} focusGroupId={groupFilter} showStatus={perm.isStockManager}
                isShort={shortItems.has(v.id)} isLast={index === section.data.length - 1}
                onPress={() => { setQuickUseGroupId(undefined); setSelectedId(v.id); }}
                onQuickUse={groupFilter && groupFilter in v.stocks && !isMedicineItem(v) ? () => { setQuickUseGroupId(groupFilter); setSelectedId(v.id); } : undefined} />
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
          <ItemDetailMobile view={selected} groups={groups} campCode={campCode} perm={perm} managedGroupIds={managedGroupIds} userId={userData?.userId ?? ''} userName={userName}
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
  const low = focusGroupId ? (qty < 0 || (min > 0 && getAvailableStock(v, focusGroupId) < min)) : isShort;
  // 일반 멘토에게는 부족 상태를 표시하지 않는다 (실사 필요한 음수만 빨갛게)
  const lowShown = showStatus ? low : qty < 0;
  const thumb = itemThumb(v);
  const loc = focusGroupId ? v.locations?.[focusGroupId] : undefined;
  const meta = [v.kind, v.spec, loc ? `📍 ${loc}` : '', focusGroupId ? '' : L('inventory.totalOfPlaces', { v0: groups.filter(g => g.id in v.stocks).length })].filter(Boolean).join(' · ');
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
          <Text style={[styles.badgeWarnText, exSt === 'soon' && { color: '#92400e' }]}>{exSt === 'expired' ? L('inventory.expired2') : L('inventory.expiring')}</Text>
        </View>
      )}
      <View style={{ alignItems: 'flex-end', width: 52 }}>
        <Text style={[styles.rowTotal, lowShown && { color: '#dc2626' }]}>{qty}<Text style={styles.rowUnit}>{dataLabel(v.unit)}</Text></Text>
      </View>
      {showStatus && (
        <View style={{ width: 34, alignItems: 'center' }}>
          {low ? <View style={styles.badgeLow}><Text style={styles.badgeLowText}>{L('inventory.low')}</Text></View>
            : <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('data.feverNormal')}</Text>}
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
const settleVerb = (kind: SupplyLineSettleKind) => SUPPLY_SETTLE_LABELS[kind].verb;
const guideTagText = (l: Pick<SupplyRequestLine, 'channel' | 'parentBill'>) => [l.channel, l.parentBill ? L('data.settleParent') : ''].filter(Boolean).join(' · ');
function GuideTagMobile({ line }: { line: Pick<SupplyRequestLine, 'channel' | 'parentBill'> }) {
  const t = guideTagText(line);
  if (!t) return null;
  return <Text style={{ fontSize: 9, fontWeight: '700', color: '#9a3412', backgroundColor: '#ffedd5' }}> {t} </Text>;
}
function SectionHeaderMobile({ label, count }: { label: string; count: number }) {
  return <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', paddingHorizontal: 2, paddingTop: 2 }}>{label === '캠프 공용' ? '🏕 ' : '👥 '}{label} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{count}</Text></Text>;
}
const failAlert = () => Alert.alert(L('common.error'), L('inventory.couldNotProcessPleaseCheck'));
/** 푸시 알림 요청 — 실패해도 화면 동작은 그대로 (받는 사람은 서버가 정한다) */
/**
 * 알림 요청 — 보낸 뒤 **못 받은 사람이 있으면 보낸 사람에게 알려 준다**
 * (그 자리에서 "알림 켜 주세요"라고 말할 수 있게).
 */
/** 부매니저 재고 운영 — 서버가 "내 그룹"인지 확인하고 기록한다 (실패 시 서버 메시지로 throw) */
async function stockOp<T = { from?: number; to?: number; value?: number }>(body: Record<string, unknown>): Promise<T> {
  const res = await authenticatedFetch('/api/inventory/stock-op', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || L('inventory.couldNotProcess'));
  return data as T;
}

function notifySupply(body: Record<string, unknown>) {
  authenticatedFetch('/api/inventory/notify', { method: 'POST', body: JSON.stringify(body) })
    .then(async res => {
      // 재고 부족(stock_low)은 사용 기록에 따라 자동으로 나가는 알림이라 알려 주지 않는다
      if (body.type === 'stock_low') return;
      const data = (await res.json().catch(() => null)) as { missed?: Array<{ name: string; state: string }> } | null;
      const msg = missedSummary(data?.missed);
      if (msg) Alert.alert(L('task.somePeopleDidnTReceive'), msg);
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
  const myBuys = useMemo(() => open.filter(r => r.status === 'requested' && supplyApproved(r) && supplyBuyerOf(r, settings)?.uid === userId && !supplyAllDone(r)), [open, settings, userId]);
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
    catch (e) { console.error(e); Alert.alert(L('common.error'), L('inventory.couldNotCreateTheRequest')); }
    finally { setPosting(false); }
  };
  const shareShopping = () => Share.share({ message: L('inventory.shoppingList2', { v0: shopping.map(l => `• ${l.name} ${l.total}${dataLabel(l.unit)}  (${l.who.join(', ')})`).join('\n') }) });
  const settle = (r: SupplyRequest, lineIds: string[], kind: SupplyLineSettleKind) => Alert.alert(
    SUPPLY_SETTLE_LABELS[kind].title,
    L('inventory.markItemsAsDone', { v0: lineIds.length, v1: settleVerb(kind) }),
    [{ text: L('inventory.notYet'), style: 'cancel' }, { text: L('task.done'), onPress: () => settleSupplyLines(db, r.id, lineIds, { uid: userId, name: userName }).then(() => notifySupply({ type: 'settled', requestId: r.id, lineIds })).catch(failAlert) }]);
  const defaultBuyer = settings?.defaultBuyerId ? settings.defaultBuyerName : '';

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => setEditing({ mode: 'new' })} style={styles.primaryBtn}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>{L('inventory.requestNeededItems2')}</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 5 }}>
          {([
            ['open', L('inventory.inProgress', { v0: open.length }), true],
            ['buy', L('inventory.myPurchases', { v0: myBuyLineCount }), myBuys.length > 0],
            ['settle', L('inventory.settle2', { v0: settleBadge }), settleVisible.length > 0],
            ['mine', L('inventory.myRequests', { v0: mine.length }), true],
            ['done', L('inventory.doneRejected'), true],
          ] as const).filter(([, , show]) => show).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.miniChip, id === 'settle' && settleBadge > 0 && { backgroundColor: '#fef9c3' }, id === 'buy' && { backgroundColor: '#ecfdf5' }, filter === id && styles.miniChipDark]}>
              <Text style={[styles.miniChipText, id === 'settle' && settleBadge > 0 && { color: '#854d0e' }, id === 'buy' && { color: '#047857' }, filter === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>
        {isAdmin && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: defaultBuyer ? '#ecfdf5' : '#fef2f2', borderWidth: !defaultBuyer ? 1 : 0, borderColor: '#fecaca' }}>
          <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>{L('inventory.defaultBuyer2')} <Text style={{ fontWeight: '800', color: '#111827' }}>{defaultBuyer || L('data.unspecified')}</Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{defaultBuyer ? L('inventory.buysEveryRequestWithoutA2') : isAdmin ? L('inventory.onceSetYouDonT2') : L('inventory.setByAnAdmin2')}</Text></Text>
          <TouchableOpacity onPress={() => setAssigning({ mode: 'default' })} style={styles.actBtn}><Text style={[styles.actBtnText, { color: '#047857' }]}>{defaultBuyer ? L('patient.change') : L('inventory.assign2')}</Text></TouchableOpacity>
        </View>}

        {filter === 'open' && (myBuys.length > 0 || mySettleTodo.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {myBuys.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('buy')} style={{ flex: 1, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>{L('inventory.toBuy3')} {myBuyLineCount}{L('inventory.items2')}</Text>
              </TouchableOpacity>
            )}
            {mySettleTodo.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('settle')} style={{ flex: 1, borderWidth: 1, borderColor: '#fde047', backgroundColor: '#fefce8', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#713f12' }}>{L('inventory.toSettle')} {mySettleTodo.length}{L('inventory.items')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350f' }}>{L('inventory.boughtNotYetRestocked')} {intakeWaiting.length}{L('home.text')}</Text>
            {intakeWaiting.map(r => (
              <TouchableOpacity key={r.id} onPress={() => setOpenId(r.id)}>
                <Text style={{ fontSize: 11, color: '#78350f' }} numberOfLines={1}>🏕 {r.items.map(l => `${l.name} ${l.quantity}${dataLabel(l.unit)}`).join(', ')} <Text style={{ color: '#b45309', fontWeight: '700' }}>{L('inventory.restock7')}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {isAdmin && filter === 'open' && shortage.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#991b1b' }}>{L('inventory.belowMinimum')} {shortage.length}{L('home.text')} <Text style={{ fontWeight: '400', color: '#dc2626' }}>{L('inventory.notRequestedYet')}</Text></Text>
            {showNeeds && shortage.map(n => (
              <Text key={`${n.itemId}|${n.groupId}`} style={{ fontSize: 11, color: '#374151' }}><Text style={{ fontWeight: '700' }}>{n.itemName}</Text> · {n.groupName} {n.current}/{n.min} → <Text style={{ fontWeight: '700', color: '#dc2626' }}>{n.shortage}{dataLabel(n.unit)}</Text></Text>
            ))}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => setShowNeeds(v => !v)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', paddingVertical: 7 }]}>
                <Text style={{ fontSize: 11, color: '#b91c1c' }}>{showNeeds ? L('inventory.collapse') : L('inventory.viewList')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={postNeeds} disabled={posting} style={[styles.btn, { backgroundColor: '#ef4444', paddingVertical: 7, opacity: posting ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{posting ? L('inventory.uploading') : L('inventory.addAsRequest')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {filter === 'buy' ? (
          <>
            <View style={[styles.listBox, { borderColor: '#fde68a' }]}>
              <View style={[styles.row, { backgroundColor: '#fffbeb' }]}>
                <Text style={[styles.blockTitle, { flex: 1 }]}>{L('inventory.shoppingList')} <Text style={{ fontSize: 11, fontWeight: '400', color: '#92400e' }}>{shopping.length}{L('push.itemDefault')}</Text></Text>
                <TouchableOpacity onPress={shareShopping} style={styles.actBtn}><Text style={styles.actBtnText}>{L('common.share')}</Text></TouchableOpacity>
              </View>
              {shopping.map((l, i) => (
                <View key={l.key} style={[styles.row, i === shopping.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
                    <Text style={styles.rowGroups} numberOfLines={2}>{l.who.join(' · ')}</Text>
                  </View>
                  <Text style={[styles.rowTotal, { color: '#b45309', fontSize: 15 }]}>{l.total}<Text style={styles.rowUnit}>{dataLabel(l.unit)}</Text></Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.forEachItemYouBought2')}</Text>
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
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.studentItemsArePaidBy')}</Text>
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
                    <Text style={styles.rowName}>{FOR_ICON[r.forType]} {supplyForLabel(r)}  <Text style={{ fontSize: 11, fontWeight: '400', color: '#6b7280' }}>{kind === 'envelope' ? L('inventory.homeroomAllowanceEnvelope', { v0: mentorOf(r) || L('common.unconfirmed') }) : kind === 'transfer' ? L('inventory.selfTransfer') : L('inventory.billParentsAdmin')}</Text></Text>
                  </TouchableOpacity>
                  {group.map(s => (
                    <View key={s.line.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ flex: 1, fontSize: 12, color: s.settled ? '#9ca3af' : '#1f2937', textDecorationLine: s.settled ? 'line-through' : 'none' }} numberOfLines={1}>
                        {s.line.name} {s.line.quantity}{dataLabel(s.line.unit)} · <Text style={{ fontWeight: '700' }}>{fmtWon(s.done.amount)}</Text> → {s.done.by}
                      </Text>
                      {s.settled ? (
                        <TouchableOpacity disabled={!(isAdmin || s.settled.byId === userId)} onPress={() => settleSupplyLines(db, r.id, [s.line.id], null).catch(failAlert)}>
                          <Text style={{ fontSize: 10, color: '#047857' }}>✓ {s.settled.by}{(isAdmin || s.settled.byId === userId) ? L('inventory.cancel') : ''}</Text>
                        </TouchableOpacity>
                      ) : mineToSettle ? (
                        <TouchableOpacity onPress={() => settle(r, [s.line.id], kind)} style={{ borderWidth: 1, borderColor: '#facc15', backgroundColor: '#fff', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#713f12' }}>{L('task.done')}</Text>
                        </TouchableOpacity>
                      ) : <Text style={{ fontSize: 10, color: '#854d0e' }}>{L('inventory.pending2')}</Text>}
                    </View>
                  ))}
                  {[...byPayee.entries()].map(([payee, v]) => (
                    <Text key={payee} selectable style={{ fontSize: 11, color: '#713f12', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: 6 }}>
                      {SUPPLY_SETTLE_LABELS[kind].icon} {kind === 'parent' ? L('inventory.billParents5') : ''}<Text style={{ fontWeight: '700' }}>{kind === 'parent' ? fmtWon(v.amount) : payee}</Text>{kind === 'parent' ? L('inventory.paidTo2', { v0: payee }) : <>{L('inventory.to')} <Text style={{ fontWeight: '700' }}>{fmtWon(v.amount)}</Text> {settleVerb(kind)}</>}{kind === 'transfer' && v.payTo ? `\n${v.payTo}` : ''}
                    </Text>
                  ))}
                  {mineToSettle && pendingIds.length > 1 && (
                    <TouchableOpacity onPress={() => settle(r, pendingIds, kind)} style={[styles.btn, { flex: 0, backgroundColor: '#eab308', paddingVertical: 8 }]}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{kind === 'envelope' ? L('inventory.envelopeRecordCashHandover') : kind === 'transfer' ? L('inventory.transfer') : L('inventory.billParents3')} {L('inventory.markAllDone')}</Text>
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
            <Text style={styles.emptyTitle}>{filter === 'mine' ? L('inventory.youHavenTMadeAny') : filter === 'open' ? L('inventory.noRequestsInProgress') : L('inventory.noCompletedRequests')}</Text>
            {filter !== 'done' && <Text style={styles.emptyBody}>{L('inventory.useTheButtonsAboveTo')}</Text>}
          </View>
        ) : (
          <>
            {filter === 'open' && duplicated.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 10, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => setShowDup(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#312e81' }}>
                    {L('inventory.itemsRequestedBySeveralTeachers')} <Text style={{ fontWeight: '400', color: '#4f46e5' }}>{duplicated.length}{L('inventory.kinds')}</Text>
                  </Text>
                  <Ionicons name={showDup ? 'chevron-up' : 'chevron-down'} size={14} color="#818cf8" />
                </TouchableOpacity>
                {showDup && (
                  <View style={{ backgroundColor: '#fff' }}>
                    {duplicated.map((l, i) => (
                      <View key={l.key} style={{ paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : StyleSheet.hairlineWidth, borderTopColor: '#e0e7ff' }}>
                        <Text style={{ fontSize: 12 }}>
                          <Text style={{ fontWeight: '700', color: '#111827' }}>{l.name}</Text>
                          <Text style={{ fontWeight: '800', color: '#4338ca' }}>  {l.total}{dataLabel(l.unit)}</Text>
                          <Text style={{ color: '#9ca3af' }}>  · {l.who.length}{L('home.text')}</Text>
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: 10, color: '#6b7280' }}>{l.who.join(' · ')}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {filter === 'open' && isAdmin && (() => {
              const pending = open.filter(r => r.status === 'requested' && !supplyApproved(r));
              return pending.length > 1 ? (
                <TouchableOpacity onPress={() => Alert.alert(L('inventory.approveAllUnderReview', { v0: pending.length }), L('inventory.approveAllRequestsUnderReview', { v0: pending.length }), [
                  { text: L('common.cancel'), style: 'cancel' },
                  { text: L('inventory.approve'), onPress: async () => { try { await approveSupplyRequests(db, pending.map(r => r.id), { uid: userId, name: userName }); pending.forEach(r => notifySupply({ type: 'approved', requestId: r.id })); } catch (e) { console.error(e); failAlert(); } } },
                ])} style={[styles.btn, { backgroundColor: '#4f46e5', paddingVertical: 9 }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('inventory.approveAllUnderReview', { v0: pending.length })}</Text>
                </TouchableOpacity>
              ) : null;
            })()}
            {filter === 'open' && <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.otherTeachersRequestsAreShown2')}</Text>}
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
          <SupplyBuyerPickerMobile candidates={candidates} title={assigning.mode === 'default' ? L('inventory.defaultBuyer') : L('inventory.buyerForThisRequest')}
            hint={assigning.mode === 'default' ? L('inventory.thisPersonBuysEveryRequest') : L('inventory.someoneElseBuysJustThis')}
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
          <SupplyLineCompleteMobile req={completingReq} lineIds={completing.lineIds} classMentor={mentorOf(completingReq)} userId={userId} userName={userName} views={views} groups={groups} onClose={() => setCompleting(null)} />
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
  const what = r.items.map(l => `${r.done?.[l.id] ? '✓' : ''}${l.name} ${l.quantity}${dataLabel(l.unit)}${l.groupName ? ` (${l.groupName})` : ''}`).join(', ');
  const status = supplyStatusLine(r, buyer);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.row, isLast && { borderBottomWidth: 0 }, { alignItems: 'flex-start' }]}>
      <Text style={{ fontSize: 18, marginTop: 1 }}>{FOR_ICON[r.forType]}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{supplyForLabel(r)} <Text style={styles.rowMeta}>{r.requesterName} · {fmtDateTime(r.createdAt)}</Text></Text>
        <Text style={[styles.rowGroups, { color: '#374151' }]} numberOfLines={2}>{what || L('inventory.noItems2')}</Text>
        <Text style={[styles.rowGroups, { fontSize: 10, color: r.status === 'onhold' ? '#b45309' : r.status === 'requested' ? '#047857' : '#6b7280' }]} numberOfLines={1}>{status}</Text>
        {r.note ? <Text style={[styles.rowGroups, { fontSize: 10 }]} numberOfLines={1}>📝 {r.note}</Text> : null}
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
              <Text style={[styles.rowName, d && { color: '#9ca3af', textDecorationLine: 'line-through', fontWeight: '400' }]} numberOfLines={1}>{l.name} {l.quantity}{dataLabel(l.unit)}{l.groupName ? ` → ${l.groupName}` : ''}<GuideTagMobile line={l} /></Text>
              {l.memo && !d ? <Text style={styles.rowGroups} numberOfLines={1}>{l.memo}</Text> : null}
              {d ? <Text style={[styles.rowGroups, { color: '#047857' }]} numberOfLines={1}>✓ {d.amount ? fmtWon(d.amount) : L('inventory.noAmount')} · {d.by}{d.payTo ? ` · ${d.payTo}` : ''}</Text> : null}
            </View>
            {canBuy && !r.stocked?.[l.id] && (d
              ? <TouchableOpacity onPress={() => onUndo(l.id)}><Text style={{ fontSize: 11, color: '#9ca3af' }}>{L('common.cancel')}</Text></TouchableOpacity>
              : <TouchableOpacity onPress={() => onComplete([l.id])} style={{ backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 11, paddingVertical: 6 }}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('task.done')}</Text></TouchableOpacity>)}
          </View>
        );
      })}
      {canBuy && undone.length > 1 && (
        <TouchableOpacity onPress={() => onComplete(undone)} style={{ paddingVertical: 8, alignItems: 'center', backgroundColor: '#ecfdf5' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>{L('inventory.remaining')} {undone.length}{L('inventory.itemsCompleteAtOnce')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** 품목 구매 완료 — 금액 + (선생님 물품) 송금받을 곳 */
function SupplyLineCompleteMobile({ req: r, lineIds, classMentor, userId, userName, views, groups, onClose }: {
  req: SupplyRequest; lineIds: string[]; classMentor: string; userId: string; userName: string;
  views: InventoryItemView[]; groups: InventoryGroup[]; onClose: () => void;
}) {
  const lines = r.items.filter(l => lineIds.includes(l.id));
  const isCamp = r.forType === 'camp';
  const [stockQty, setStockQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.id, String(supplyLineStockQty(l, views.find(v => v.id === l.itemId)))])));
  const [stockGroup, setStockGroup] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.id, l.groupId ?? groups[0]?.id ?? ''])));
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
      if (isCamp) {
        const res = await authenticatedFetch('/api/inventory/supply-complete', { method: 'POST', body: JSON.stringify({
          requestId: r.id,
          lines: lines.map(l => ({ lineId: l.id, amount: num(amounts[l.id]), quantity: l.itemId && !r.stocked?.[l.id] ? num(stockQty[l.id]) : 0, groupId: stockGroup[l.id] || undefined })),
        }) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || L('inventory.couldNotMarkAsDone'));
      } else {
        await completeSupplyLines(db, r.id, lines.map(l => ({ lineId: l.id, amount: num(amounts[l.id]), payTo: kind === 'transfer' && !l.parentBill ? payTo : undefined })), { uid: userId, name: userName });
        notifySupply({ type: 'lines_done', requestId: r.id, lineIds: lines.map(l => l.id) });
      }
      onClose();
    } catch (e) { console.error(e); Alert.alert(L('common.error'), e instanceof Error && e.message ? e.message : L('inventory.couldNotMarkAsDone')); }
    finally { setBusy(false); }
  };
  const submit = () => {
    const warn = [
      kind && lines.some(l => !num(amounts[l.id])) ? L('inventory.someItemsHaveNoAmount2') : '',
      kind === 'transfer' && lines.some(l => !l.parentBill) && !payTo.trim() ? L('inventory.theAccountToReceiveThe2') : '',
    ].filter(Boolean);
    if (!warn.length) { doSubmit(); return; }
    Alert.alert(L('common.ok'), warn.join('\n'), [{ text: L('inventory.enter'), style: 'cancel' }, { text: L('inventory.completeAnyway'), onPress: doSubmit }]);
  };
  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{L('inventory.purchased')} <Text style={{ fontSize: 12, fontWeight: '400', color: '#6b7280' }}>{FOR_ICON[r.forType]} {supplyForLabel(r)}</Text></Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{kind === 'envelope' ? L('inventory.aSettlementRequestGoesTo2', { v0: classMentor || L('common.unconfirmedParen') }) : kind === 'transfer' ? L('inventory.aSettlementRequestGoesTo', { v0: r.requesterName }) : L('inventory.whenYouCompleteTheQuantities')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={styles.listBox}>
            {lines.map((l, i) => (
              <View key={l.id} style={[styles.row, { flexWrap: 'wrap' }, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{l.name} <Text style={styles.rowMeta}>{l.quantity}{dataLabel(l.unit)}</Text><GuideTagMobile line={l} /></Text>
                <TextInput value={amounts[l.id]} keyboardType="number-pad" autoFocus={i === 0} onChangeText={v => setAmounts(a => ({ ...a, [l.id]: v.replace(/[^0-9]/g, '') }))}
                  placeholder={L('patient.amount')} placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 90, textAlign: 'right', paddingVertical: 5 }, kind && !num(amounts[l.id]) ? { borderColor: '#fcd34d', backgroundColor: '#fefce8' } : null]} />
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>{L('patient.krw')}</Text>
                {isCamp && (l.itemId && !r.stocked?.[l.id] ? (
                  <View style={{ flexBasis: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, paddingLeft: 6 }}>
                    <Text style={{ fontSize: 11, color: '#065f46' }}>📥 {L('inventory.stockIn')}</Text>
                    <TextInput value={stockQty[l.id]} keyboardType="number-pad" onChangeText={v => setStockQty(q => ({ ...q, [l.id]: v.replace(/[^0-9]/g, '') }))}
                      style={[styles.input, { width: 56, textAlign: 'right', paddingVertical: 3 }]} />
                    <Text style={{ fontSize: 11, color: '#065f46' }}>{dataLabel(views.find(v => v.id === l.itemId)?.unit ?? l.unit)}</Text>
                    {groups.map(g => (
                      <TouchableOpacity key={g.id} onPress={() => setStockGroup(s => ({ ...s, [l.id]: g.id }))} style={[styles.miniChip, stockGroup[l.id] === g.id && { backgroundColor: '#d1fae5' }]}>
                        <Text style={[styles.miniChipText, stockGroup[l.id] === g.id && { color: '#065f46' }]}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : !l.itemId ? <Text style={{ flexBasis: '100%', fontSize: 10, color: '#9ca3af', paddingLeft: 6 }}>{L('inventory.notAStockItemNot')}</Text> : null)}
              </View>
            ))}
          </View>
          {lines.some(l => l.parentBill) && <Text style={{ fontSize: 10, color: '#c2410c', backgroundColor: '#fff7ed', borderRadius: 6, padding: 6 }}>{L('inventory.billParentsItemsAreBilled')}</Text>}
          {kind === 'transfer' && lines.some(l => !l.parentBill) && (
            <View>
              <Text style={styles.formLabel}>{L('inventory.transferTo')}</Text>
              <TextInput value={payTo} onChangeText={setPayTo} placeholder={L('inventory.eGKakaobank333301')} placeholderTextColor="#9ca3af" style={styles.input} />
              <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{L('inventory.savedOnThisDeviceAnd')}</Text>
            </View>
          )}
          <Text style={{ textAlign: 'right', fontSize: 12, color: '#4b5563' }}>{L('inventory.total')} <Text style={{ fontWeight: '800', color: '#111827' }}>{fmtWon(total)}</Text></Text>
          <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? L('inventory.processing') : L('inventory.purchaseItems', { v0: lines.length })}</Text>
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
            <TextInput value={q} onChangeText={setQ} placeholder={L('patient.searchName')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <View style={styles.listBox}>
            {list.length === 0 && <Text style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>{candidates.length ? L('students.noResults') : L('inventory.loadingCampMembers')}</Text>}
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
  const [forType, setForType] = useState<SupplyForType>(existing?.forType ?? prefill?.forType ?? 'student');
  // "나도 필요해요": 같은 품목 그대로 — 품목 검색·추가 없이 수량·단위만
  const metoo = !!prefill && !existing;
  const defaultGroup = groups[0];
  // 학생 여러 명 — 같은 물품으로 학생마다 요청 1건씩 (담임 용돈봉투 정산이 학생별이라서). 수정할 때는 1명
  type PickedStudent = { id?: string; name: string; cls?: string; mentor?: string; code?: string };
  const [picked, setPicked] = useState<PickedStudent[]>(
    existing?.studentName ? [{ id: existing.studentId, name: existing.studentName, cls: existing.studentClass, mentor: existing.classMentor, code: existing.studentClassCode }] : []);
  const student = picked[0] ?? null;
  const setStudent = (s: PickedStudent | null) => setPicked(ps => !s ? [] : existing ? [s] : ps.some(p => (p.id ?? p.name) === (s.id ?? s.name)) ? ps : [...ps, s]);
  const removeStudent = (s: PickedStudent) => setPicked(ps => ps.filter(p => p !== s));
  const [studentQuery, setStudentQuery] = useState('');
  const [lines, setLines] = useState<SupplyRequestLine[]>(
    existing?.items ?? (prefill ? prefill.items.map(l => ({ ...l, id: newId(), quantity: 1, memo: undefined })) : []));
  const [q, setQ] = useState('');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);

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
    if (forType === 'student' && !student) { Alert.alert(L('patient.checkNeeded'), L('inventory.pleaseSelectWhichStudentThe')); return; }
    if (lines.length === 0) { Alert.alert(L('patient.checkNeeded'), L('inventory.addAtLeastOneItem')); return; }
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
        // 학생 여러 명이면 학생마다 따로 (학생 정보만 바꿔서)
        const targets = forType === 'student' ? picked : [null];
        for (const s of targets) {
          const id = await addSupplyRequest(db, {
            campCode, requesterId: userId, requesterName: userName, requesterGroup: userGroup || undefined, ...payload,
            ...(s ? { studentId: s.id, studentName: s.name, studentClass: s.cls, classMentor: s.mentor, studentClassCode: s.code } : {}),
          });
          notifySupply({ type: 'request_created', requestId: id });
        }
      }
      onClose();
    } catch (e) { console.error('구매 요청 저장 오류:', e); Alert.alert(L('common.error'), L('inventory.couldNotSaveTheRequest')); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>{existing ? L('inventory.editRequest') : metoo ? L('inventory.additionalRequest', { v0: lines.length > 1 ? L('inventory.andMore', { v0: lines[0].name, v1: lines.length - 1 }) : (lines[0]?.name ?? '') }) : L('inventory.requestNeededItems')}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          {prefill ? <Text style={{ fontSize: 11, color: '#6b7280', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8 }}>{supplyForLabel(prefill)} {L('inventory.addedTheSameItemsAs')}</Text> : null}
          <View>
            <Text style={styles.formLabel}>{L('inventory.whoNeedsIt')}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([['student', L('inventory.student')], ['mentor', L('inventory.me')], ['camp', L('inventory.campSupplies')]] as const).map(([id, label]) => (
                <TouchableOpacity key={id} onPress={() => setForType(id)} style={[styles.segBtn, forType === id && styles.segBtnOn]}>
                  <Text style={[styles.segBtnText, forType === id && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>{forType === 'student' ? L('inventory.theHomeroomMentorSettlesIt') : forType === 'mentor' ? L('inventory.youTransferTheMoneyTo') : L('inventory.itemsUsedAsCampStock')}</Text>
            {forType === 'student' && picked.map(s => (
              <View key={s.id ?? s.name} style={[styles.pickedBox, { marginTop: 6 }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a8a', flex: 1 }}>{s.name}<Text style={{ fontWeight: '400', color: '#3b82f6' }}>  {s.cls}{s.mentor ? L('inventory.homeroom', { v0: s.mentor }) : ''}</Text></Text>
                <TouchableOpacity onPress={() => removeStudent(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={16} color="#9ca3af" /></TouchableOpacity>
              </View>
            ))}
            {forType === 'student' && !existing ? <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{L('inventory.pickSeveralStudentsToFile')}</Text> : null}
            {forType === 'student' && (existing && student ? null : (
              <View style={{ marginTop: 6, gap: 4 }}>
                <TextInput value={studentQuery} onChangeText={setStudentQuery} placeholder={L('inventory.searchStudentName')} placeholderTextColor="#9ca3af" style={styles.input} />
                {studentResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className, mentor: s.classMentor || undefined, code: studentClassCode(s.classNumber) || undefined }); setStudentQuery(''); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                    <Text style={{ fontSize: 12, color: '#111827' }}>{s.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{s.className}{s.classMentor ? L('inventory.homeroom', { v0: s.classMentor }) : ''}</Text></Text>
                  </TouchableOpacity>
                ))}
                {studentQuery.trim() !== '' && studentResults.length === 0 && (
                  <TouchableOpacity onPress={() => { setStudent({ name: studentQuery.trim() }); setStudentQuery(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.ifNotOnTheRoster')} <Text style={{ fontWeight: '700' }}>"{studentQuery.trim()}"</Text>{L('inventory.toEnter')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.formLabel}>{L('inventory.whatDoYouNeed')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{lines.length}{L('inventory.itemsAddedTheBuyerDecides')}</Text></Text>
            {!metoo && <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput value={q} onChangeText={setQ} placeholder={L('inventory.searchItemsEGBandage')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
              {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={15} color="#cbd5e1" /></TouchableOpacity> : null}
            </View>}
            {q.trim() !== '' && guideResults.length > 0 && (
              <View style={[styles.listBox, { borderColor: '#fdba74' }]}>
                {guideResults.map((g, gi) => (
                  <View key={g.id} style={[{ backgroundColor: '#fff7ed' }, gi < guideResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fed7aa' }]}>
                    <TouchableOpacity onPress={() => setOpenGuide(v => v === g.id ? null : g.id)} activeOpacity={0.6} style={[styles.row, { borderBottomWidth: 0, backgroundColor: 'transparent' }]}>
                      <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{g.name} <Text style={{ fontSize: 10, fontWeight: '700', color: '#9a3412' }}>{g.channel || L('data.coupang')}{g.parentBill ? L('inventory.billParents2') : ''}</Text></Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#c2410c' }}>{openGuide === g.id ? L('inventory.collapse') : L('inventory.viewGuide')}</Text>
                    </TouchableOpacity>
                    {openGuide === g.id && (
                      <View style={{ paddingHorizontal: 10, paddingBottom: 8, gap: 6 }}>
                        <Text style={{ fontSize: 11, color: '#7c2d12', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 6, padding: 7 }}>📌 {g.guide || L('inventory.thisItemIsBoughtFrom', { v0: dataLabel(g.channel || '쿠팡') })}</Text>
                        <TouchableOpacity onPress={() => addGuide(g)} style={{ backgroundColor: '#f97316', borderRadius: 6, paddingVertical: 7, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('inventory.gotItAddToRequest')}</Text>
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
                        {stock && stock.total > 0 ? <Text style={styles.rowGroups}>{L('inventory.campStock2')} {stock.total}{dataLabel(stock.unit)} {L('inventory.yes')}</Text> : null}
                      </View>
                      {had ? <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>{had.quantity} +1</Text> : <Ionicons name="add-circle" size={22} color="#059669" />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => { setLines(ls => [...ls, { id: newId(), name: q.trim(), quantity: 1, unit: '개' }]); setQ(''); }}
                  style={[styles.row, { borderBottomWidth: 0, backgroundColor: '#f9fafb' }]}>
                  <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}><Text style={{ fontWeight: '700' }}>"{q.trim()}"</Text> {L('inventory.addManually')}</Text>
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
                      {supplyUnitChoices(l.unit).map(u => (
                        <TouchableOpacity key={u} onPress={() => upd(l.id, { unit: u })} style={[styles.miniChip, l.unit === u && styles.miniChipAmber]}>
                          <Text style={[styles.miniChipText, l.unit === u && { color: '#92400e' }]}>{dataLabel(u)}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {!metoo && <TextInput value={l.memo ?? ''} onChangeText={v => upd(l.id, { memo: v || undefined })} placeholder={L('inventory.noteColorSizeEtc')} placeholderTextColor="#9ca3af" style={[styles.input, { paddingVertical: 4, fontSize: 11 }]} />}
                    {forType === 'camp' && (l.itemId ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('inventory.restockGroup')}</Text>
                        {groups.map(g => {
                          const on = (l.groupId ?? defaultGroup?.id) === g.id;
                          return (
                            <TouchableOpacity key={g.id} onPress={() => upd(l.id, { groupId: g.id, groupName: g.name })} style={[styles.miniChip, on && { backgroundColor: '#d1fae5' }]}>
                              <Text style={[styles.miniChipText, on && { color: '#065f46' }]}>{g.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    ) : <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.notAStockItemSo')}</Text>)}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View>
            <Text style={styles.formLabel}>{L('common.memo')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('patient.optional')}</Text></Text>
            <TextInput value={note} onChangeText={setNote} multiline style={[styles.input, { minHeight: 44 }]} />
          </View>

          <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? L('task.saving') : existing ? L('inventory.saveChanges') : forType === 'student' && picked.length > 1 ? L('inventory.submitForStudents', { v0: picked.length }) : L('inventory.submitRequest')}</Text>
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
  const [note, setNote] = useState(r.note ?? '');
  const approved = supplyApproved(r);
  const buyOk = canBuy && approved;
  const canEditNote = isAdmin || (mine && isOpen);
  const [busy, setBusy] = useState(false);
  const c = SUPPLY_STATUS_COLOR[r.status];
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); failAlert(); } finally { setBusy(false); }
  };
  const act = (status: SupplyRequestStatus, opts?: { note?: string; holdUntil?: string }) =>
    run(async () => { await setSupplyRequestStatus(db, [r.id], status, userName, opts); if (status === 'rejected' || status === 'onhold') notifySupply({ type: 'status', requestId: r.id }); setMode('none'); setReason(''); });
  const saveNote = () => run(async () => { await setSupplyRequestNote(db, r.id, note); });
  const decision = supplyDecisionOf(r);
  const decide = async (d: SupplyDecision, opts?: { note?: string; holdUntil?: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await setSupplyDecision(db, r.id, d, { uid: userId, name: userName }, opts);
      if (d === 'approved' && decision !== 'approved') notifySupply({ type: 'approved', requestId: r.id });
      if (d === 'rejected' || d === 'onhold') notifySupply({ type: 'status', requestId: r.id });
      setMode('none'); setReason('');
    } catch (e) { console.error(e); Alert.alert(L('common.error'), e instanceof Error && e.message ? e.message : L('inventory.couldNotProcessPleaseCheck')); }
    finally { setBusy(false); }
  };
  // 예전 방식(구매 완료 후 따로 입고)으로 남은 요청만 — 이제는 구매 완료와 함께 바로 입고된다
  const canIntake = isAdmin && isCamp && !r.stockApplied && r.status === 'purchased' && r.items.some(l => l.itemId && !r.stocked?.[l.id]);
  const [intake, setIntake] = useState(false);
  const [intakeLines, setIntakeLines] = useState(() => r.items.filter(l => l.itemId && !r.stocked?.[l.id]).map(l => ({
    lineId: l.id, itemId: l.itemId!, itemName: l.name, groupId: l.groupId ?? groups[0]?.id ?? '', quantity: String(l.quantity),
  })));
  const doIntake = () => run(async () => {
    const lines = intakeLines.map(l => ({
      itemId: l.itemId, itemName: l.itemName, groupId: l.groupId,
      groupName: groups.find(g => g.id === l.groupId)?.name ?? '', quantity: Math.max(0, parseInt(l.quantity, 10) || 0),
    }));
    if (lines.some(l => !l.groupId)) { Alert.alert(L('patient.checkNeeded'), L('inventory.chooseAGroupToRestock')); return; }
    await receiveSupplyRequest(db, campCode, r.id, lines, userName);
    setIntake(false);
  });
  const remove = () => Alert.alert(L('inventory.cancelRequest'), L('inventory.cancelThisRequest'), [
    { text: L('inventory.no'), style: 'cancel' },
    { text: L('inventory.cancelIt'), style: 'destructive', onPress: () => run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }) },
  ]);
  const status = supplyStatusLine(r, buyer);
  const canSettle = isAdmin || settlerIsMe;
  const settleLines = supplySettleLines([r]);
  const undoneIds = r.items.filter(l => !r.done?.[l.id]).map(l => l.id);
  const HOLD_CHIPS: Array<[string, string]> = [[L('inventory.tomorrow'), addDaysStr(1)], [L('inventory.in3Days'), addDaysStr(3)], [L('inventory.in1Week'), addDaysStr(7)], [L('inventory.in2Weeks'), addDaysStr(14)], [L('data.tbd'), '']];

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
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.requesterName} · {fmtDateTime(r.createdAt)}{r.forType === 'student' && classMentor ? L('inventory.homeroom', { v0: classMentor }) : ''}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          {isOpen && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: buyer ? '#ecfdf5' : '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: buyer ? '#065f46' : '#b91c1c' }}>{buyer ? L('inventory.buyer', { v0: buyer.uid === userId ? L('common.meWord') : buyer.name, v1: buyer.isDefault ? L('inventory.defaultSuffix') : '' }) : L('inventory.noBuyerAnAdminNeeds')}</Text>
              {isAdmin && <TouchableOpacity onPress={onAssign}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.thisRequestOnly')} {r.buyerId ? L('patient.change') : L('inventory.someoneElse')}</Text></TouchableOpacity>}
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
                    <Text style={[styles.rowName, d && { color: '#6b7280' }]} numberOfLines={2}>{d ? '✓ ' : ''}{l.name} <Text style={{ color: '#b45309', fontWeight: '800' }}>{l.quantity}{dataLabel(l.unit)}</Text>{isCamp && l.groupName ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#047857' }}>  → {l.groupName}</Text> : null}<GuideTagMobile line={l} /></Text>
                    {(l.memo || (isAdmin && stock)) ? <Text style={styles.rowGroups} numberOfLines={2}>{[l.memo, isAdmin && stock ? L('inventory.campStock3', { v0: stock.total, v1: dataLabel(stock.unit) }) : ''].filter(Boolean).join(' · ')}</Text> : null}
                    {d ? <Text selectable style={[styles.rowGroups, { color: '#047857' }]}>{d.amount ? fmtWon(d.amount) : L('inventory.noAmount')} · {d.by}{d.payTo ? `\n💸 ${d.payTo}` : ''}</Text> : null}
                    {d && lk && d.amount ? <Text style={[styles.rowGroups, { color: st ? '#9ca3af' : '#a16207' }]}>{st ? L('inventory.settled', { v0: st.by }) : L('inventory.pending', { v0: lk === 'envelope' ? L('inventory.envelopeSettlement') : lk === 'transfer' ? L('inventory.transferWord') : L('inventory.parentBillingWord') })}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {buyOk && r.status !== 'rejected' && !r.stockApplied && !r.stocked?.[l.id] && (d
                      ? <TouchableOpacity onPress={() => run(() => undoSupplyLine(db, r.id, l.id))}><Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.cancelPurchase')}</Text></TouchableOpacity>
                      : isOpen ? <TouchableOpacity onPress={() => onComplete([l.id])} style={{ backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{L('task.done')}</Text></TouchableOpacity> : null)}
                    {d && lk && d.amount && canSettleLine ? (st
                      ? (isAdmin || st.byId === userId) ? <TouchableOpacity onPress={() => run(() => settleSupplyLines(db, r.id, [l.id], null))}><Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.cancelSettlement')}</Text></TouchableOpacity> : null
                      : <TouchableOpacity onPress={() => run(async () => { await settleSupplyLines(db, r.id, [l.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [l.id] }); })} style={{ backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fde047', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#713f12' }}>{SUPPLY_SETTLE_LABELS[lk].icon} {lk === 'envelope' ? L('inventory.settle') : lk === 'transfer' ? L('push.howTransfer') : L('inventory.bill')} {L('task.done')}</Text>
                        </TouchableOpacity>) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {buyOk && isOpen && undoneIds.length > 1 && (
            <TouchableOpacity onPress={() => onComplete(undoneIds)} style={[styles.btn, { flex: 0, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>{L('inventory.purchaseRemainingItemsAtOnce')}</Text>
            </TouchableOpacity>
          )}
          {settleLines.length > 0 && (
            <Text style={{ fontSize: 11, color: '#4b5563', backgroundColor: '#fefce8', borderRadius: 8, padding: 8 }}>
              {kind === 'envelope' ? L('inventory.homeroomMentorTakesItFrom', { v0: classMentor || L('common.unconfirmedParen') }) : L('inventory.transfersToTheTeacherWho', { v0: r.requesterName })}
              {' '}{L('inventory.settle')} {settleLines.filter(s => s.settled).length}/{settleLines.length} {L('inventory.remainingAmount')} {fmtWon(settleLines.filter(s => !s.settled).reduce((a, s) => a + (s.done.amount ?? 0), 0))}
            </Text>
          )}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>{L('common.memo')}</Text>
            {canEditNote ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput value={note} onChangeText={setNote} multiline style={[styles.input, { flex: 1, minHeight: 40 }]} />
                {note.trim() !== (r.note ?? '').trim() && (
                  <TouchableOpacity onPress={saveNote} disabled={busy} style={{ backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', opacity: busy ? 0.3 : 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('common.save')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : <Text style={{ fontSize: 12, color: r.note ? '#374151' : '#9ca3af', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 }}>{r.note || L('inventory.noMemo')}</Text>}
          </View>
          {approved && r.approvedBy ? <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.approvedBy', { v0: r.approvedBy, v1: fmtDateTime(r.approvedAt) })}</Text>
            : isOpen ? <Text style={{ fontSize: 10, color: '#4f46e5' }}>🔎 {L('inventory.goesToTheBuyerAfter')}</Text> : null}
          {(!isOpen || r.status === 'onhold') && (
            <Text style={{ fontSize: 11, color: r.status === 'onhold' ? '#92400e' : '#4b5563', backgroundColor: r.status === 'onhold' ? '#fffbeb' : '#f9fafb', borderRadius: 8, padding: 8 }}>
              {status}{r.handledBy ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}
            </Text>
          )}
          {isOpen && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {!mine && <TouchableOpacity onPress={onMetoo} style={[styles.btn, { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>{L('inventory.iNeedThisToo')}</Text></TouchableOpacity>}
              {mine && (!approved || isAdmin) && <TouchableOpacity onPress={onEdit} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{L('task.edit')}</Text></TouchableOpacity>}
              {mine && !supplyDoneCount(r) && <TouchableOpacity onPress={remove} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>{L('inventory.cancelRequest')}</Text></TouchableOpacity>}
            </View>
          )}

          {canIntake && (intake ? (
            <View style={{ borderWidth: 1, borderColor: '#6ee7b7', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 9, gap: 7 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#065f46' }}>{L('inventory.restockCheckTheQuantityActually')}</Text>
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
                <TouchableOpacity onPress={() => setIntake(false)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={doIntake} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 7, flex: 2, opacity: busy ? 0.5 : 1 }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{r.status === 'purchased' ? L('inventory.restock3') : L('inventory.purchasedRestocked')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIntake(true)} style={[styles.btn, { flex: 0, backgroundColor: r.status === 'purchased' ? '#f59e0b' : '#fff', borderWidth: r.status === 'purchased' ? 0 : 1, borderColor: '#a7f3d0' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: r.status === 'purchased' ? '#fff' : '#047857' }}>📥 {r.status === 'purchased' ? L('inventory.restock2') : L('inventory.purchasedRestocked')}</Text>
            </TouchableOpacity>
          ))}

          {isAdmin && (
            <View style={{ borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: '#f5f7ff', borderRadius: 10, padding: 9, gap: 7 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4338ca' }}>{L('inventory.adminActions')}</Text>
              {mode === 'none' ? (
                decision ? (
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['approved', 'pending', 'rejected', 'onhold'] as const).map(d => {
                        const on = decision === d && d !== 'pending';
                        const onBg = d === 'approved' ? '#4f46e5' : d === 'rejected' ? '#6b7280' : '#f59e0b';
                        return (
                          <TouchableOpacity key={d} disabled={busy} onPress={() => (d === 'rejected' || d === 'onhold') ? setMode(d === 'rejected' ? 'reject' : 'hold') : decide(d)}
                            style={[styles.btn, { paddingVertical: 7, borderWidth: 1, borderColor: on ? onBg : '#e5e7eb', backgroundColor: on ? onBg : '#fff', opacity: busy ? 0.4 : 1 }]}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : '#4b5563' }}>{d === 'approved' ? L('inventory.approve2') : d === 'pending' ? L('inventory.undecided') : d === 'rejected' ? L('inventory.reject') : L('inventory.hold2')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.tapAnotherButtonToChange')}</Text>
                  </View>
                ) : !r.stockApplied ? (
                  <TouchableOpacity onPress={() => act('requested')} disabled={busy} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7, flex: 0 }]}><Text style={{ fontSize: 11, color: '#374151' }}>{L('inventory.backToInProgress')}</Text></TouchableOpacity>
                ) : <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.thisRequestWasAlreadyRestocked')}</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  <TextInput value={reason} onChangeText={setReason} autoFocus placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]}
                    placeholder={mode === 'reject' ? L('inventory.reasonForRejectionEG') : L('inventory.reasonForHoldEG')} />
                  {mode === 'hold' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, color: '#6b7280', marginRight: 2 }}>{L('inventory.toBuy2')}</Text>
                      {HOLD_CHIPS.map(([label, val]) => (
                        <TouchableOpacity key={label} onPress={() => setHoldUntil(val)} style={[styles.miniChip, holdUntil === val && styles.miniChipAmber]}>
                          <Text style={[styles.miniChipText, holdUntil === val && { color: '#92400e' }]}>{label}{val ? ` ${fmtHoldDate(val)}` : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => setMode('none')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7 }]}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => decide(mode === 'reject' ? 'rejected' : 'onhold', { note: reason, holdUntil })} disabled={busy}
                      style={[styles.btn, { backgroundColor: mode === 'reject' ? '#6b7280' : '#f59e0b', paddingVertical: 7 }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{mode === 'reject' ? L('inventory.reject') : L('inventory.onHold')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

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
          {([['groups', L('inventory.groupsPackages')], ['bulk', L('inventory.bulkEntryStockCount2')], ['items', L('inventory.items4')], ['supply', L('inventory.buyersDesignatedItems')]] as const).map(([id, label]) => (
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
      Alert.alert(L('inventory.canTDelete'), L('inventory.groupStillHasStockItems2', { v0: g.name, v1: left.length, v2: left.slice(0, 3).map(v => v.name).join(', '), v3: left.length > 3 ? ' …' : '' }));
      return;
    }
    Alert.alert(L('inventory.deleteGroup2'), L('inventory.deleteGroup', { v0: g.name }), [{ text: L('common.cancel'), style: 'cancel' }, { text: L('common.delete'), style: 'destructive', onPress: () => deleteInventoryGroup(db, g.id).catch(failAlert) }]);
  };
  const savePkg = async () => {
    if (!pkgName.trim() || groups.length === 0 || busy) return;
    setBusy(true);
    try { await savePackageFromGroups(db, pkgName.trim(), groups, userName); setPkgName(''); Alert.alert(L('inventory.saved'), L('inventory.savedTheCurrentGroupSetup')); }
    catch { failAlert(); } finally { setBusy(false); }
  };
  const apply = (pkg: InventoryPackage) => Alert.alert(L('inventory.applyPackage'), L('inventory.addGroupsFromToThis', { v0: pkg.name, v1: pkg.slots.length, v2: campCode }), [
    { text: L('common.cancel'), style: 'cancel' },
    { text: L('inventory.apply'), onPress: async () => { try { const n = await applyPackageToCamp(db, campCode, pkg, groups); if (n === 0) Alert.alert(L('task.notice'), L('inventory.noGroupsAddedBecauseGroups2')); } catch { failAlert(); } } },
  ]);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <Text style={styles.blockTitle}>{campCode} {L('inventory.inventoryGroups')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{groups.length}</Text></Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.aStoragePlaceKitUnit2')}</Text>
        {groups.map(g => <GroupRowMobile key={g.id} group={g} campGroups={campGroups} onDelete={() => remove(g)} />)}
        <View style={[styles.listBox, { padding: 10, gap: 6 }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>{L('inventory.newGroup')}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput value={newName} onChangeText={setNewName} placeholder={L('inventory.groupNameEGSpring')} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
            <TextInput value={newLoc} onChangeText={setNewLoc} placeholder={L('inventory.keptAt2')} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1.3 }]} />
          </View>
          <TouchableOpacity onPress={add} disabled={!newName.trim() || busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', opacity: !newName.trim() || busy ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('inventory.addGroup')}</Text></TouchableOpacity>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.blockTitle}>{L('inventory.groupPackages2')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('inventory.companyWide')}</Text></Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.saveAGroupSetupApply')}</Text>
        <View style={styles.listBox}>
          {packages.length === 0 && <Text style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>{L('inventory.noSavedPackages')}</Text>}
          {packages.map((p, i) => (
            <View key={p.id} style={[styles.row, i === packages.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowGroups} numberOfLines={1}>{p.slots.map(s => s.label).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => apply(p)}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.apply')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert(L('inventory.deletePackage2'), L('inventory.delete2', { v0: p.name }), [{ text: L('common.cancel'), style: 'cancel' }, { text: L('common.delete'), style: 'destructive', onPress: () => deleteInventoryPackage(db, p.id).catch(failAlert) }])} style={{ paddingLeft: 6 }}>
                <Ionicons name="trash-outline" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TextInput value={pkgName} onChangeText={setPkgName} placeholder={L('inventory.saveCurrentSetupAsA2')} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
          <TouchableOpacity onPress={savePkg} disabled={!pkgName.trim() || groups.length === 0 || busy} style={[styles.btn, { flex: 0, paddingHorizontal: 14, backgroundColor: '#1f2937', opacity: !pkgName.trim() || groups.length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('common.save')}</Text></TouchableOpacity>
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
        <TextInput value={loc} onChangeText={setLoc} onEndEditing={save} placeholder={L('inventory.keptAt2')} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1.3 }]} />
        <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}><Ionicons name="trash-outline" size={16} color="#cbd5e1" /></TouchableOpacity>
      </View>
      {dirty && <TouchableOpacity onPress={save}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.saveChanges2')}</Text></TouchableOpacity>}
      {campGroups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('inventory.campGroup2')}</Text>
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
      Alert.alert(L('inventory.saved'), L('inventory.savedCells2', { v0: n }));
      setEdits({});
    } catch (e) { console.error('일괄 저장 오류:', e); failAlert(); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (changed.length === 0 || busy) return;
    if (mode === 'adjust' && !memo.trim()) { Alert.alert(L('profile.incomplete'), L('inventory.chooseAReasonForThe')); return; }
    Alert.alert(L('common.save'), L('inventory.saveCellsAs', { v0: changed.length, v1: mode === 'restock' ? L('inventory.restockModeLabel') : L('inventory.countModeLabel') }), [{ text: L('common.cancel'), style: 'cancel' }, { text: L('common.save'), onPress: doSave }]);
  };
  if (groups.length === 0) return <View style={styles.centered}><Text style={styles.emptyBody}>{L('inventory.createInventoryGroupsInGroups')}</Text></View>;
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.toolbar, { gap: 6 }]}>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.inEachCellEnter')} <Text style={{ fontWeight: '700' }}>{L('inventory.theActualQuantityNowUnits')}</Text>{L('inventory.andSaveOnlyChangedCells2')}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['restock', L('inventory.restockTermStartRefill')], ['adjust', L('inventory.stockCountAdjustment')]] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setMode(id)} style={[styles.segBtn, mode === id && styles.segBtnOn]}><Text style={[styles.segBtnText, mode === id && { color: '#fff' }]}>{label}</Text></TouchableOpacity>
          ))}
        </View>
        {mode === 'adjust' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
            {STOCKTAKE_REASONS.map(r => (
              <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#f59e0b' }]}><Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{dataLabel(r)}</Text></TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('schedule.group')}</Text>
          {groups.map(g => (
            <TouchableOpacity key={g.id} onPress={() => setGroupId(g.id)} style={[styles.miniChip, groupId === g.id && styles.miniChipAmber]}><Text style={[styles.miniChipText, groupId === g.id && { color: '#92400e' }]}>{g.name}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{dataLabel(c)}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItems')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
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
                  <Text style={styles.rowGroups}>{L('inventory.current')} {groupId in v.stocks ? cur : '–'} {dataLabel(v.unit)}</Text>
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
        <Text style={{ flex: 1, fontSize: 12, color: '#4b5563' }}>{group?.name} {L('inventory.changedCells2')} <Text style={{ fontWeight: '800', color: '#047857' }}>{changed.length}</Text></Text>
        <TouchableOpacity onPress={() => setEdits({})} disabled={busy || Object.keys(edits).length === 0} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#f3f4f6', opacity: Object.keys(edits).length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.undo')}</Text></TouchableOpacity>
        <TouchableOpacity onPress={save} disabled={busy || changed.length === 0} style={[styles.btn, { flex: 0, paddingHorizontal: 16, backgroundColor: '#059669', opacity: busy || changed.length === 0 ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? L('task.saving') : L('common.save')}</Text></TouchableOpacity>
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
  const importDefaults = () => Alert.alert(L('inventory.defaultItemSet'), L('inventory.registerDefaultItemsExistingItems2', { v0: DEFAULT_INVENTORY_ITEMS.length }), [
    { text: L('common.cancel'), style: 'cancel' },
    { text: L('inventory.post'), onPress: async () => { setBusy(true); try { const n = await importInventoryItems(db, DEFAULT_INVENTORY_ITEMS, items, userName); Alert.alert(L('task.done'), L('inventory.addedItems2', { v0: n })); } catch { failAlert(); } finally { setBusy(false); } } },
  ]);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[styles.searchBox, { flex: 1 }]}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItems')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
          <TouchableOpacity onPress={() => onEdit('new')} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#059669' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('patient.add')}</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{dataLabel(c)}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.itemsAreCompanyWideSo')} {list.length}{L('patient.pcs')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 30 }}>
        <View style={styles.listBox}>
          {list.map((v, i) => (
            <View key={v.id} style={[styles.row, { opacity: v.isActive === false ? 0.5 : 1 }, i === list.length - 1 && { borderBottomWidth: 0 }]}>
              <TouchableOpacity onPress={() => onSelect(v.id)} style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>{v.name}{v.kind ? <Text style={styles.rowMeta}>  {v.kind}</Text> : null}{v.isActive === false ? <Text style={styles.rowMeta}>  {L('inventory.inactive')}</Text> : null}</Text>
                <Text style={styles.rowGroups} numberOfLines={1}>{dataLabel(v.category)}{v.subCategory ? `·${v.subCategory}` : ''} · {INVENTORY_USAGE_LABELS[getItemUsage(v)]} · {dataLabel(v.unit)} {L('inventory.min')} {v.minStockDefault ?? 0}{v.ingredient ? ` · ${v.ingredient}` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onEdit(v)} style={{ padding: 4 }}><Ionicons name="create-outline" size={18} color="#6b7280" /></TouchableOpacity>
              <TouchableOpacity onPress={() => updateInventoryItem(db, v.id, { isActive: v.isActive === false }).catch(failAlert)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>{v.isActive === false ? L('inventory.use') : L('inventory.hidden')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={importDefaults} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#f3f4f6', opacity: busy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.loadDefaultItemSet')}</Text></TouchableOpacity>
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
        <Text style={styles.blockTitle}>{L('inventory.defaultBuyer2')}</Text>
        <View style={[styles.listBox, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: defaultBuyer ? '#111827' : '#b91c1c' }}>{defaultBuyer || L('data.unspecified')}</Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{L('inventory.thisPersonBuysEveryPurchase')}</Text>
          </View>
          <TouchableOpacity onPress={() => setPicking(true)} style={[styles.actBtn, { borderColor: '#a7f3d0' }]}><Text style={[styles.actBtnText, { color: '#047857' }]}>{defaultBuyer ? L('patient.change') : L('inventory.assign2')}</Text></TouchableOpacity>
        </View>
      </View>

      {/* 지정 품목 */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockTitle}>{L('inventory.designatedItemsCoupangBillParents')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{guides.length}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{L('inventory.theyAppearAtTheTop')}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditing('new')} style={[styles.actBtn, { backgroundColor: '#059669', borderColor: '#059669' }]}><Text style={[styles.actBtnText, { color: '#fff' }]}>{L('patient.add')}</Text></TouchableOpacity>
        </View>
        <View style={styles.listBox}>
          {guides.length === 0 && <Text style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>{L('inventory.noDesignatedItems')}</Text>}
          {guides.map((g, i) => (
            <TouchableOpacity key={g.id} onPress={() => setEditing(g)} activeOpacity={0.6} style={[styles.row, { alignItems: 'flex-start', opacity: g.isActive === false ? 0.5 : 1 }, i === guides.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rowName} numberOfLines={1}>{g.name}<GuideTagMobile line={{ channel: g.channel, parentBill: g.parentBill }} />{g.isActive === false ? <Text style={styles.rowMeta}>  {L('inventory.inactive')}</Text> : null}</Text>
                {g.keywords?.length ? <Text style={styles.rowGroups} numberOfLines={1}>{L('inventory.keywords2')} {g.keywords.join(', ')}</Text> : null}
                {g.guide ? <Text style={[styles.rowGroups, { color: '#4b5563' }]} numberOfLines={2}>{g.guide}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        {picking && (
          <SupplyBuyerPickerMobile candidates={candidates} title={L('inventory.defaultBuyer')}
            hint={L('inventory.thisPersonBuysEveryRequest')}
            clearLabel={settings?.defaultBuyerId ? L('inventory.removeDefaultBuyer') : ''}
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
    if (!name.trim()) { Alert.alert(L('patient.checkNeeded'), L('inventory.pleaseEnterTheItemName')); return; }
    setBusy(true);
    try {
      await saveSupplyGuide(db, { name, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), channel, parentBill, guide: text, isActive: active }, guide?.id);
      onClose();
    } catch (e) { console.error(e); Alert.alert(L('common.error'), L('profile.couldNotSave')); }
    finally { setBusy(false); }
  };
  const remove = () => guide && Alert.alert(L('common.delete'), L('inventory.delete', { v0: guide.name }), [
    { text: L('common.cancel'), style: 'cancel' },
    { text: L('common.delete'), style: 'destructive', onPress: () => deleteSupplyGuide(db, guide.id).then(onClose).catch(failAlert) },
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
          <Text style={[styles.modalTitle, { flex: 1 }]}>{guide ? L('inventory.editDesignatedItem') : L('inventory.addDesignatedItem')}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View><Text style={styles.formLabel}>{L('inventory.itemName')}</Text><TextInput value={name} onChangeText={setName} placeholder={L('inventory.eGSchoolBag')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.formLabel}>{L('inventory.keywords')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('inventory.commaSeparated')}</Text></Text><TextInput value={keywords} onChangeText={setKeywords} placeholder={L('inventory.eGBagBackpack')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.formLabel}>{L('inventory.whereToBuy')}</Text><TextInput value={channel} onChangeText={setChannel} placeholder={L('data.coupang')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <Toggle on={parentBill} label={L('inventory.billParentsNoEnvelopeTransfer')} onPress={() => setParentBill(v => !v)} />
          <View>
            <Text style={styles.formLabel}>{L('inventory.guideShownToMentors')}</Text>
            <TextInput value={text} onChangeText={setText} multiline placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              placeholder={L('inventory.eGThisItemIs2')} />
          </View>
          <Toggle on={active} label={L('inventory.showInSearch')} onPress={() => setActive(v => !v)} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {guide && <TouchableOpacity onPress={remove} style={[styles.btn, { flex: 0, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>{L('common.delete')}</Text></TouchableOpacity>}
            <TouchableOpacity onPress={save} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? L('task.saving') : L('common.save')}</Text>
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
  const [consumption, setConsumption] = useState<InventoryConsumption>(item?.consumption ?? 'single');
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
    if (!img) { if (picked.length) Alert.alert(L('patient.checkNeeded'), L('inventory.onlyImageFilesCanBe')); return; }
    if ((img.fileSize ?? 0) > 10 * 1024 * 1024) { Alert.alert(L('patient.checkNeeded'), L('inventory.onlyImagesUpTo10mb')); return; }
    setPhoto(img);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert(L('patient.checkNeeded'), L('inventory.pleaseEnterTheItemName2')); return; }
    setBusy(true);
    try {
      const data = {
        category, subCategory: subCategory.trim() || undefined, kind: kind.trim() || undefined, name: name.trim(),
        spec: spec.trim() || undefined, unit: unit || '개', usage, isActive,
        consumption: isMed && consumption === 'multi' ? 'multi' as const : item?.consumption ? 'single' as const : undefined,
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
            Alert.alert(L('task.notice'), L('inventory.theItemWasRegisteredBut'));
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
    } catch (e) { console.error('품목 저장 오류:', e); Alert.alert(L('common.error'), L('profile.couldNotSave')); }
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
          <Text style={[styles.modalTitle, { flex: 1 }]}>{item ? L('inventory.editItem') : L('inventory.addItem')}</Text>
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
                    : <><Ionicons name="camera-outline" size={18} color="#9ca3af" /><Text style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{L('common.images')}</Text></>}
                </TouchableOpacity>
                {photo ? <TouchableOpacity onPress={() => setPhoto(null)} style={{ paddingVertical: 3 }}><Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{L('inventory.remove')}</Text></TouchableOpacity> : null}
              </View>
            )}
            {perm.canEditItemMedia && item && (
              <View style={{ width: 76 }}>
                <View style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {itemThumb(item)
                    ? <Image source={{ uri: itemThumb(item) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <Ionicons name="cube-outline" size={20} color="#cbd5e1" />}
                </View>
                <Text style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 3, lineHeight: 12 }}>{L('inventory.inDetails')}{'\n'}{L('inventory.managePhotos')}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 10 }}>
              <View><Text style={styles.formLabel}>{L('inventory.item')}</Text>
                <TextInput value={name} onChangeText={setName} placeholder={category === '의약품' ? L('inventory.eGFestalPlus') : L('inventory.eGPaperCups')} placeholderTextColor="#9ca3af" style={styles.input} autoFocus={!item} /></View>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>{L('inventory.category')}</Text>
                <Chips values={INVENTORY_CATEGORIES} value={category} onPick={c => { setCategory(c); setSubCategory(''); if (!item) setUsage(suggestedUsages(c)[0]); }} />
              </View>
            </View>
          </View>

          {canSetStock ? (
            <View style={{ gap: 10 }}>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>{L('inventory.staffRoom')}</Text>
                <Chips values={groups!.map(g => g.id)} value={stockGroupId} onPick={setStockGroupId} label={id => groups!.find(g => g.id === id)?.name ?? ''} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={styles.formLabel}>{L('inventory.initialStockQuantity')}</Text>
                  <TextInput value={initialQty} onChangeText={setInitialQty} keyboardType="number-pad" placeholder="0" placeholderTextColor="#9ca3af" style={styles.input} /></View>
                <View style={{ flex: 1.4, gap: 5 }}>
                  <Text style={styles.formLabel}>{L('inventory.unitSingle')}</Text>
                  <Chips values={INVENTORY_UNITS} value={unit} onPick={setUnit} />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap: 5 }}>
              <Text style={styles.formLabel}>{L('inventory.unitPerSingle')}</Text>
              <Chips values={INVENTORY_UNITS} value={unit} onPick={setUnit} />
            </View>
          )}

          {/* ── 상세 설정 (접힘) ── */}
          <TouchableOpacity onPress={() => setShowDetail(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }}>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#4b5563' }}>
              {L('inventory.advanced')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('inventory.subcategoryItemTypeSpecMin')}{isMed ? L('inventory.medicine') : ''}</Text>
            </Text>
            <Ionicons name={showDetail ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
          </TouchableOpacity>

          {showDetail && (
            <View style={{ gap: 12, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 10, padding: 10 }}>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>{L('inventory.subcategory')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('inventory.optionalCanType')}</Text></Text>
                {subs.length > 0 && <Chips values={subs} value={subCategory} onPick={v => setSubCategory(subCategory === v ? '' : v)} />}
                <TextInput value={subCategory} onChangeText={setSubCategory} placeholder={L('inventory.subcategory')} placeholderTextColor="#9ca3af" style={styles.input} />
              </View>
              <View><Text style={styles.formLabel}>{L('patient.type')}</Text>
                <TextInput value={kind} onChangeText={setKind} placeholder={category === '의약품' ? L('inventory.eGDigestive') : L('patient.optional')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
              <View style={{ gap: 5 }}>
                <Text style={styles.formLabel}>{L('inventory.itemType2')}</Text>
                <Chips values={usageList} value={usage} onPick={setUsage} label={u => INVENTORY_USAGE_LABELS[u]} />
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.oralMedicineTopicalMedicineAnd2')}</Text>
              </View>
              {isMed && (
                <View style={{ gap: 5 }}>
                  <Text style={styles.formLabel}>{L('inventory.howItIsUsed')}</Text>
                  <Chips values={['single', 'multi'] as InventoryConsumption[]} value={consumption} onPick={setConsumption} label={c => c === 'single' ? L('inventory.singleUseDeductedEachTime') : L('inventory.multiUseEGOintment')} />
                  <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.multiUseItemsOintmentsSprays')}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1.4 }}><Text style={styles.formLabel}>{L('inventory.specNotes')}</Text>
                  <TextInput value={spec} onChangeText={setSpec} placeholder={L('inventory.eGTablet500mg')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
                <View style={{ flex: 1 }}><Text style={styles.formLabel}>{L('inventory.unitsPerPackage2')}</Text>
                  <TextInput value={packSize} onChangeText={setPackSize} keyboardType="number-pad" placeholder={L('inventory.eG4')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
              </View>
              {isMed && (
                <View style={{ gap: 8, backgroundColor: '#fff1f2', borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#9f1239' }}>{L('inventory.medicineDetails')}</Text>
                  <View><Text style={styles.formLabel}>{L('inventory.activeIngredient')}</Text><TextInput value={ingredient} onChangeText={setIngredient} placeholder={L('inventory.eGAcetaminophen')} placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                  {usage === 'oral' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Text style={styles.formLabel}>{L('inventory.minimumIntervalHours')}</Text><TextInput value={intervalHours} onChangeText={setIntervalHours} keyboardType="decimal-pad" placeholder={L('inventory.eG4')} placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                      <View style={{ flex: 1 }}><Text style={styles.formLabel}>{L('inventory.maxPerDayTimes')}</Text><TextInput value={maxPerDay} onChangeText={setMaxPerDay} keyboardType="number-pad" placeholder={L('inventory.eG5')} placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                    </View>
                  )}
                  <View><Text style={styles.formLabel}>{L('inventory.dosageUsage')}</Text><TextInput value={dosageNote} onChangeText={setDosageNote} placeholder={L('inventory.eGHalfATablet')} placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]} /></View>
                </View>
              )}
              <View><Text style={styles.formLabel}>{isMed ? L('inventory.cautionsOtherNotes') : L('inventory.descriptionGuide')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('patient.optional')}</Text></Text>
                <TextInput value={description} onChangeText={setDescription} placeholder={L('inventory.eGBlueBoxFor')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
              <View><Text style={styles.formLabel}>{L('inventory.minimumStock')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('inventory.defaultPerStaffRoom')}</Text></Text>
                <TextInput value={minStock} onChangeText={setMinStock} keyboardType="number-pad" placeholder={L('inventory.belowThisIsLow')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
              {item && (
                <TouchableOpacity onPress={() => setIsActive(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={isActive ? 'checkbox' : 'square-outline'} size={20} color={isActive ? '#059669' : '#9ca3af'} />
                  <Text style={{ fontSize: 13, color: '#374151' }}>{L('inventory.activeOffHidesItFrom')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity onPress={save} disabled={busy} style={[styles.btn, { flex: 0, backgroundColor: '#059669', paddingVertical: 12, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{busy ? L('task.saving') : item ? L('common.save') : L('task.add')}</Text>
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
  const media = orderedItemMedia(item);
  const cover = itemCoverMedia(item);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<ItemMedia | null>(null);
  // 1:1 넘겨보기 (대표 사진부터) — 좌우 스와이프
  const [boxW, setBoxW] = useState(0);
  const [idx, setIdx] = useState(0);
  const pagerRef = React.useRef<ScrollView>(null);
  const pos = Math.min(idx, Math.max(0, media.length - 1));
  const makeCover = async (m: ItemMedia) => {
    try { await setItemCoverMedia(db, item.id, m.path); setIdx(0); pagerRef.current?.scrollTo({ x: 0, animated: false }); }
    catch { Alert.alert(L('common.error'), L('profile.couldNotSave')); }
  };
  const add = async (picked: PickedMedia[]) => {
    if (!picked.length) return;
    if (picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024)) Alert.alert(L('task.notice'), L('inventory.filesOver50mbAreSkipped'));
    setBusy(true);
    try { await addInventoryItemMedia(db, item.id, await uploadItemMediaMobile(item.id, picked, userName)); }
    catch (e) { console.error('품목 사진 업로드 오류:', e); Alert.alert(L('common.error'), L('inventory.couldNotUploadThePhoto')); }
    finally { setBusy(false); }
  };
  const remove = async (m: ItemMedia) => {
    setDeleteBusy(true);
    try { await removeInventoryItemMedia(db, item.id, item.media ?? [], m.path, item.coverMediaPath); await deleteObject(storageRef(storage, m.path)).catch(() => {}); setDeleting(null); setIdx(0); pagerRef.current?.scrollTo({ x: 0, animated: false }); }
    catch { Alert.alert(L('common.error'), L('inventory.couldNotDelete')); }
    finally { setDeleteBusy(false); }
  };
  const open = (m: ItemMedia) => { if (m.type === 'video') Linking.openURL(m.url); else setViewer(m); };
  return (
    <View style={{ gap: 6 }}>
      <View onLayout={e => setBoxW(e.nativeEvent.layout.width)} style={{ width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' }}>
        {media.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 }}>
            <Ionicons name="cube-outline" size={56} color="#d1d5db" />
            <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>{canEdit ? L('inventory.noPhotosYetUploadPackage') : L('inventory.noPhotosRegisteredOnlyAdmins')}</Text>
          </View>
        ) : boxW > 0 ? (
          <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / boxW))}>
            {media.map(m => (
              <TouchableOpacity key={m.path} activeOpacity={0.9} onPress={() => open(m)} style={{ width: boxW, height: boxW, backgroundColor: m.type === 'video' ? '#111827' : '#f9fafb' }}>
                {m.type === 'video'
                  ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Ionicons name="play-circle" size={52} color="#fff" /><Text style={{ fontSize: 11, color: '#d1d5db' }}>{L('inventory.tapToPlayVideo')}</Text></View>
                  : <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {media.length > 1 && <Text style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{pos + 1} / {media.length}</Text>}
        {media[pos] && media[pos] === cover && media.length > 1 ? <Text style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#f59e0b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' }}>★ {L('inventory.cover')}</Text> : null}
        {media[pos]?.by ? <Text style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>{media[pos].by}</Text> : null}
        {canEdit && media[pos] && (
          <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 6 }}>
            {media[pos].type === 'image' && media[pos] !== cover && (
              <TouchableOpacity onPress={() => makeCover(media[pos])} style={{ height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="star" size={11} color="#fff" /><Text style={{ fontSize: 11, color: '#fff' }}>{L('inventory.setAsCover')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setDeleting(media[pos])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[styles.thumbRemove, { position: 'relative', top: 0, right: 0, width: 26, height: 26, borderRadius: 13 }]}><Text style={{ color: '#fff', fontSize: 12 }}>✕</Text></TouchableOpacity>
          </View>
        )}
      </View>
      {canEdit && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
          <TouchableOpacity disabled={busy} onPress={async () => add(await captureLostPhoto())} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: busy ? 0.4 : 1 }}>
            <Ionicons name="camera-outline" size={15} color="#1d4ed8" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{L('inventory.camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={async () => add(await pickLostMedia())} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: busy ? 0.4 : 1 }}>
            <Ionicons name="images-outline" size={15} color="#1d4ed8" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{busy ? L('inventory.uploading') : L('inventory.album')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => !deleteBusy && setDeleting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 380 }]}>
            {deleting && (deleting.type === 'video'
              ? <View style={{ height: 150, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam" size={36} color="#fff" /></View>
              : <Image source={{ uri: deleting.url }} style={{ width: '100%', height: 200, backgroundColor: '#f3f4f6' }} contentFit="contain" />)}
            <View style={{ padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>{L('inventory.this')} {deleting?.type === 'video' ? L('inventory.video') : L('inventory.photo')}{L('inventory.deleteIt')}</Text>
              <Text style={{ fontSize: 12, color: '#4b5563', lineHeight: 18 }}>
                <Text style={{ fontWeight: '700' }}>{item.name}</Text>{L('inventory.s')} {deleting?.type === 'video' ? L('inventory.video') : L('inventory.photo')}{L('inventory.this')} <Text style={{ fontWeight: '700', color: '#dc2626' }}>{L('inventory.itWillDisappearFromEvery')}</Text>
                {deleting?.by ? L('inventory.uploadedBy', { v0: deleting.by }) : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity onPress={() => setDeleting(null)} disabled={deleteBusy} style={[styles.btn, { backgroundColor: '#f3f4f6', paddingVertical: 11 }]}><Text style={{ fontSize: 13, color: '#374151' }}>{L('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleting && remove(deleting)} disabled={deleteBusy} style={[styles.btn, { backgroundColor: '#dc2626', paddingVertical: 11, opacity: deleteBusy ? 0.5 : 1 }]}><Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{deleteBusy ? L('inventory.deleting') : L('common.delete')}</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer.url }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          {viewer?.by ? <Text style={{ position: 'absolute', bottom: 40, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{viewer.by} {L('inventory.uploaded')}</Text> : null}
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
        <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItems2')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => setGroupFilter('')} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
          <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>{L('inventory.allStaffRooms')}</Text>
        </TouchableOpacity>
        {groups.map(g => (
          <TouchableOpacity key={g.id} onPress={() => setGroupFilter(groupFilter === g.id ? '' : g.id)} style={[styles.miniChip, groupFilter === g.id && styles.miniChipAmber]}>
            <Text style={[styles.miniChipText, groupFilter === g.id && { color: '#92400e' }]}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.theBuyerDecidesTheActual2')}</Text>

      <View>
        <Text style={styles.sectionTitle}>{L('inventory.lowStockBelowMinimum')} <Text style={{ color: '#9ca3af', fontWeight: '400' }}>{auto.length}</Text></Text>
        {auto.length === 0 ? (
          <Text style={styles.emptyBody}>{L('inventory.noLowStockItems')}</Text>
        ) : (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
            {auto.map((n, i) => {
              const v = viewOf(n.itemId);
              return (
                <TouchableOpacity key={`${n.itemId}|${n.groupId}`} onPress={() => onSelect(n.itemId)} activeOpacity={0.6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: '#e5e7eb' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{n.itemName}{v?.spec ? <Text style={{ fontWeight: '400', color: '#9ca3af' }}>  {v.spec}</Text> : null}</Text>
                    <Text style={{ fontSize: 10, color: '#6b7280' }}>{n.groupName} {L('inventory.now')} {n.current} {L('inventory.min4')} {n.min}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#dc2626' }}>−{n.shortage}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{dataLabel(n.unit)}</Text></Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{L('inventory.requestedItemsNotBoughtYet')} <Text style={{ color: '#9ca3af', fontWeight: '400' }}>{fromRequests.length}</Text></Text>
          <TouchableOpacity onPress={onGoRequests}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.stockRequests')}</Text></TouchableOpacity>
        </View>
        {fromRequests.length === 0 ? (
          <Text style={styles.emptyBody}>{L('inventory.noRequestedItemsInProgress')}</Text>
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
                      {supplyForLabel(req)}{line.groupName ? ` · ${line.groupName}` : ''}{buyer ? ` · ${buyer.name}` : ''}{line.channel ? ` · ${line.channel}` : ''}{line.parentBill ? L('inventory.billParents2') : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1f2937' }}>{line.quantity}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{dataLabel(line.unit)}</Text></Text>
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
          <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItems2')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          {MOVEMENT_FILTERS.map(f => (
            <TouchableOpacity key={f.key} onPress={() => setKind(f.key)} style={[styles.chip, kind === f.key && styles.chipActive]}>
              <Text style={[styles.chipText, kind === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          {[{ v: 7, l: L('inventory.last7Days') }, { v: 30, l: L('inventory.last30Days') }, { v: 0, l: L('inventory.allTime') }].map(d => (
            <TouchableOpacity key={d.v} onPress={() => setDays(d.v)} style={[styles.miniChip, days === d.v && styles.miniChipAmber]}>
              <Text style={[styles.miniChipText, days === d.v && { color: '#92400e' }]}>{d.l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setGroupFilter('')} style={[styles.miniChip, !groupFilter && styles.miniChipAmber]}>
            <Text style={[styles.miniChipText, !groupFilter && { color: '#92400e' }]}>{L('inventory.allStaffRooms2')}</Text>
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
          <View style={styles.centered}><Text style={styles.emptyBody}>{L('inventory.noRecords')}</Text></View>
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
        {filtered.length > 0 && <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', paddingVertical: 10 }}>{L('inventory.showsUpToTheLatest2')}</Text>}
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
  if (!perm.granted) { Alert.alert(L('common.permissionRequired'), L('inventory.pleaseAllowPhotoAccess')); return []; }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
  if (result.canceled) return [];
  return result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined }));
}

/** 카메라로 촬영 (사진) */
async function captureLostPhoto(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) { Alert.alert(L('common.permissionRequired'), L('inventory.pleaseAllowCameraAccess')); return []; }
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
          <Ionicons name="images-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>{L('inventory.choosePhotosVideos')}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={disabled} onPress={async () => onChange([...picked, ...(await captureLostPhoto())])} style={[styles.mediaBtn, disabled && { opacity: 0.5 }]}>
          <Ionicons name="camera-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>{L('inventory.camera')}</Text>
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
      <Text style={{ fontSize: 10, color: tooBig ? '#dc2626' : '#9ca3af' }}>{tooBig ? L('inventory.someFilesAreOver50mb') : L('inventory.photosVideosUpTo50mb2')}</Text>
    </View>
  );
}

function LostListMobile({ campCode, jobCodeId, students, campGroups, lostItems, isAdmin, userId, userName }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  lostItems: LostItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  // 주운 물건(found) / 찾는 물건(lost) 두 목록을 한 탭에서 전환
  const [kind, setKind] = useState<LostItemKind>('found');
  const [filter, setFilter] = useState<LostItemStatus | '전체'>('found');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = lostItems.find(l => l.id === openId) ?? null;
  const ofKind = useMemo(() => lostItems.filter(l => lostItemKind(l) === kind), [lostItems, kind]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofKind.filter(l => (filter === '전체' || l.status === filter) &&
      (!q || [l.name, l.description, l.foundPlace, l.keptAt, l.claimedBy, l.reportedBy, l.ownerName].some(f => f?.toLowerCase().includes(q))));
  }, [ofKind, filter, search]);
  const count = (s: LostItemStatus) => ofKind.filter(l => l.status === s).length;
  const openCounts = {
    found: lostItems.filter(l => lostItemKind(l) === 'found' && isLostOpen(l)).length,
    lost: lostItems.filter(l => lostItemKind(l) === 'lost' && isLostOpen(l)).length,
  };
  const SL = LOST_STATUS_LABELS_BY_KIND[kind];
  const isLost = kind === 'lost';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 }}>
          {LOST_ITEM_KINDS.map(k => {
            const on = kind === k;
            return (
              <TouchableOpacity key={k} onPress={() => { setKind(k); setFilter('found'); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: on ? '#fff' : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#111827' : '#6b7280' }}>{k === 'found' ? '📦' : '🙋'} {LOST_KIND_LABELS[k].tab}</Text>
                {openCounts[k] > 0 ? (
                  <View style={{ backgroundColor: on ? (k === 'lost' ? '#fef3c7' : '#dbeafe') : '#e5e7eb', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: on ? (k === 'lost' ? '#b45309' : '#1d4ed8') : '#6b7280' }}>{openCounts[k]}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>{LOST_KIND_LABELS[kind].tab} <Text style={{ color: isLost ? '#d97706' : '#2563eb' }}>{count('found')}</Text> <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '400' }}>{SL.found}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{isLost ? L('inventory.reportAStudentSLost') : L('inventory.anyoneCanRegisterAndCheck')}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isLost ? '#d97706' : '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Ionicons name="add" size={14} color="#fff" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{LOST_KIND_LABELS[kind].action}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder={L('inventory.searchItemPlaceStudentName')} placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {([['found', `${SL.found} ${count('found')}`], ['claimed', `${SL.claimed} ${count('claimed')}`], ['discarded', `${SL.discarded} ${count('discarded')}`], ['전체', L('common.all')]] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.chip, filter === id && { backgroundColor: '#2563eb', borderColor: '#2563eb' }]}>
              <Text style={[styles.chipText, filter === id && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {list.length === 0 ? (
          <View style={styles.centered}><Ionicons name="search-outline" size={36} color="#cbd5e1" /><Text style={styles.emptyTitle}>{ofKind.length === 0 ? (isLost ? L('inventory.noLostItemReports2') : L('inventory.noFoundItemsRegistered')) : L('inventory.noMatchingLostItems')}</Text></View>
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
                  <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{lostStatusLabel(l)}</Text></View>
                  <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>{l.name}{l.ownerName ? <Text style={{ fontSize: 10, color: '#e11d48', fontWeight: '600' }}>  {isLost ? '🙋' : '🏷️'} {l.ownerName}</Text> : null}</Text>
                  {l.matchedId ? <Text style={{ fontSize: 9, color: '#047857', fontWeight: '700' }}>{L('inventory.linked3')}</Text> : null}
                  {l.media.length > 1 && <Text style={{ fontSize: 9, color: '#9ca3af' }}>+{l.media.length - 1}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }} numberOfLines={1}>📍 {l.foundPlace || L('inventory.unknownPlace')} · {l.foundDate}</Text>
                <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{!isLost && l.keptAt ? L('inventory.keptAt3', { v0: l.keptAt }) : ''}{L('inventory.post')} {l.reportedBy}{l.status === 'claimed' && l.claimedBy ? ` · → ${l.claimedBy}` : ''}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showForm} animationType="fade" transparent onRequestClose={() => setShowForm(false)}>
        <LostItemFormMobile kind={kind} allItems={lostItems} campCode={campCode} jobCodeId={jobCodeId} students={students} campGroups={campGroups} userId={userId} userName={userName} onClose={() => setShowForm(false)} onCreated={id => { setShowForm(false); setOpenId(id); }} />
      </Modal>
      <Modal visible={!!opened} animationType="fade" transparent onRequestClose={() => setOpenId(null)}>
        {opened && <LostItemDetailMobile item={opened} allItems={lostItems} isAdmin={isAdmin} userId={userId} userName={userName} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      </Modal>
    </View>
  );
}

function LostItemFormMobile({ kind, allItems, campCode, jobCodeId, students, campGroups, userId, userName, onClose, onCreated }: {
  kind: LostItemKind; allItems: LostItem[];
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  userId: string; userName: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  /** 잃어버렸어요 신고 — 주운 물건과 문구·기본값이 다르다 */
  const isLost = kind === 'lost';
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
  const [toAll, setToAll] = useState(isLost);
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
  /** 반대쪽 목록에서 짝이 될 만한 건 — 이미 등록돼 있으면 새로 올리지 않아도 된다 */
  const matches = useMemo(
    () => (name.trim() ? suggestLostMatches({ kind, name, description, ownerStudentId: owner?.studentId }, allItems) : []),
    [kind, name, description, owner, allItems]);

  const submit = async () => {
    if (!name.trim() || busy || tooBig) return;
    setBusy(true);
    try {
      setProgress(L('inventory.registering'));
      const ownerGroup = ownerGroupLabel?.toLowerCase();
      const id = await addLostItem(db, {
        campCode, kind, name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined,
        foundDate, keptAt: isLost ? undefined : keptAt.trim() || undefined, reportedBy: userName, reportedById: userId,
        jobCodeId: jobCodeId || undefined, notify,
        ownerStudentId: owner?.studentId, ownerName: owner?.name, ownerClassCode: owner?.className,
        ownerClassMentor: owner?.classMentor, ownerUnitMentor: owner?.unitMentor, ownerGroup,
        notifyScope: owner ? (toAll ? 'all' : 'owner') : undefined,
        notifyTargets: owner && !toAll ? targets : undefined,
      });
      if (picked.length) {
        setProgress(L('inventory.uploadingPhotosVideos', { v0: picked.length }));
        const media = await uploadLostMediaMobile(campCode, id, picked);
        await addLostItemMedia(db, id, media);
      }
      if (notify) {
        authenticatedFetch('/api/inventory/notify-lost', { method: 'POST', body: JSON.stringify({ lostItemId: id }) })
          .then(async res => {
            const data = (await res.json().catch(() => null)) as { sent?: number; missed?: Array<{ name: string; state: string }> } | null;
            const msg = missedSummary(data?.missed);
            if (msg) Alert.alert(L('task.somePeopleDidnTReceive'), msg);
          })
          .catch(e => console.warn('분실물 알림 요청 실패:', e));
      }
      onCreated(id);
    } catch (e) { console.error('분실물 등록 오류:', e); Alert.alert(L('common.error'), L('inventory.anErrorOccurredWhileRegistering')); }
    finally { setBusy(false); setProgress(''); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>{isLost ? L('inventory.iLostSomething') : L('inventory.iFoundIt')}</Text>
          <TouchableOpacity onPress={onClose} disabled={busy} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          <View><Text style={styles.label}>{L('inventory.item')}</Text><TextInput value={name} onChangeText={setName} placeholder={L('inventory.eGBlueWaterBottle')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
          {matches.length > 0 ? (
            <View style={{ borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>
                💡 {isLost ? L('inventory.aSimilarItemIsAlready') : L('inventory.aStudentIsLookingFor')}
              </Text>
              {matches.map(m => (
                <TouchableOpacity key={m.item.id} onPress={() => onCreated(m.item.id)} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{m.item.name}</Text>
                  <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>{m.item.reportedBy} · {m.item.foundPlace || L('inventory.noPlaceGiven')}{m.item.ownerName ? ` · ${m.item.ownerName}` : ''}</Text>
                </TouchableOpacity>
              ))}
              <Text style={{ fontSize: 10, color: '#b45309' }}>{L('inventory.tapToOpenItIf')}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={styles.label}>{isLost ? L('inventory.lastSeenAt') : L('inventory.foundAt')}</Text><TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder={isLost ? L('inventory.eGCafeteriaBus') : L('inventory.eGAuditorium3rdFloor')} placeholderTextColor="#9ca3af" style={styles.input} /></View>
            <View style={{ width: 120 }}><Text style={styles.label}>{isLost ? L('inventory.dateLost') : L('inventory.dateFound')}</Text><TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          </View>
          {!isLost ? <View><Text style={styles.label}>{L('inventory.keptAt2')}</Text><TextInput value={keptAt} onChangeText={setKeptAt} placeholder={L('inventory.eGLostFoundBox')} placeholderTextColor="#9ca3af" style={styles.input} /></View> : null}
          <View><Text style={styles.label}>{isLost ? L('inventory.descriptionColorFeaturesEtc') : L('inventory.descriptionFeaturesNameTagEtc')}</Text><TextInput value={description} onChangeText={setDescription} multiline placeholder={isLost ? L('inventory.eGBlackHoodieWhite') : L('inventory.eGStickerOnThe')} placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} /></View>
          <View>
            <Text style={styles.label}>{isLost ? L('inventory.studentWhoLostItOptional') : L('inventory.nameTagIfTheOwner')}</Text>
            {owner ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#fecdd3', backgroundColor: '#fff1f2', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#9f1239' }}>{owner.name}</Text>
                <Text style={{ flex: 1, fontSize: 10, color: '#be123c' }} numberOfLines={1}>{[owner.className, owner.classMentor && L('inventory.homeroom2', { v0: owner.classMentor }), owner.unitMentor && L('inventory.room', { v0: owner.unitMentor })].filter(Boolean).join(' · ')}</Text>
                <TouchableOpacity onPress={() => setOwner(null)}><Text style={{ color: '#fb7185' }}>✕</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                <TextInput value={ownerQuery} onChangeText={setOwnerQuery} placeholder={L('inventory.searchStudentNameLeaveBlank')} placeholderTextColor="#9ca3af" style={styles.input} />
                {ownerResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setOwner(s); setOwnerQuery(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                    <Text style={{ fontSize: 12, color: '#111827' }}>{s.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{s.className}{s.classMentor ? L('inventory.homeroom', { v0: s.classMentor }) : ''}</Text></Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => setNotify(v => !v)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
              <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={18} color={notify ? '#2563eb' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.sendPushNotification')}</Text>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                  {!notify ? L('inventory.notSentToAnyone')
                    : owner && !toAll
                      ? (targets.length
                          ? L('inventory.sentOnlyToS', { v0: owner.name, v1: targets.map(t => LOST_NOTIFY_TARGET_LABELS[t].ko).join(' · ') })
                          : L('inventory.chooseRecipients'))
                      : isLost ? L('inventory.sentToAllCampTeachers2') : L('inventory.sentToAllCampTeachers')}
                </Text>
              </View>
            </TouchableOpacity>
            {notify && owner ? (
              <View style={{ padding: 10, gap: 6, backgroundColor: '#f9fafb', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4b5563' }}>
                  {L('inventory.recipients')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{isLost ? L('inventory.thisReportNamesAStudent') : L('inventory.thisItemHasAName')}</Text>
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
                          <Text style={{ fontSize: 11, color: '#9ca3af' }}>  {loading ? L('inventory.checking') : who || (t === 'groupManager' ? `${ownerGroupLabel ?? ''} 부매니저 없음`.trim() : L('inventory.noOneAssigned'))}</Text>
                        </Text>
                        {(() => {
                          if (toAll || !who) return null;
                          const names = t === 'groupManager' ? groupManagerNames : [who];
                          const bad = names.map(n => reachOfName(n)).find(st => st && st !== 'ok');
                          if (bad) return <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>🔕 {MISSED_STATE_LABELS[bad]?.ko ?? L('inventory.canTReceive2')}</Text>;
                          if (names.every(n => reachOfName(n) === 'ok')) return <Text style={{ fontSize: 10, color: '#047857' }}>{L('inventory.canReceive2')}</Text>;
                          return null;
                        })()}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
                  <TouchableOpacity onPress={() => setToAll(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name={toAll ? 'checkbox' : 'square-outline'} size={18} color={toAll ? '#2563eb' : '#9ca3af'} />
                    <Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.allCampTeachers')}</Text>
                  </TouchableOpacity>
                  {toAll ? (
                    <TouchableOpacity onPress={() => { setShowCheck(v => !v); loadCampUsers(); }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>
                        {checking ? L('inventory.checking') : showCheck ? L('inventory.collapse') : L('inventory.checkWhoCanReceive')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {toAll && showCheck && preview ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 3 }}>
                    <Text style={{ fontSize: 11, color: '#374151' }}>
                      <Text style={{ fontWeight: '700' }}>{preview.total}{L('common.people2')}</Text> {L('inventory.of')} <Text style={{ fontWeight: '700', color: '#047857' }}>{preview.ok.length}{L('common.people2')}</Text>{L('inventory.canReceive')}
                      {preview.missed.length > 0 ? <Text> · <Text style={{ fontWeight: '700', color: '#dc2626' }}>{preview.missed.length}{L('common.people2')}</Text>{L('inventory.canTReceive')}</Text> : null}
                    </Text>
                    {preview.missed.length > 0 ? (
                      <Text style={{ fontSize: 11, color: '#6b7280', lineHeight: 16 }}>
                        {preview.missed.map(m => `${m.name}(${(isEnglishUI() ? MISSED_STATE_LABELS[m.state]?.en : MISSED_STATE_LABELS[m.state]?.ko) ?? L('inventory.cannotReceive')})`).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {!toAll && preview && preview.missed.length > 0 ? (
                  <Text style={{ fontSize: 11, color: '#dc2626' }}>
                    🔕 {preview.missed.map(m => `${m.name}(${(isEnglishUI() ? MISSED_STATE_LABELS[m.state]?.en : MISSED_STATE_LABELS[m.state]?.ko) ?? L('inventory.cannotReceive')})`).join(', ')} {L('inventory.askThemToTurnOn')}
                  </Text>
                ) : null}
                {!toAll && preview && preview.total === 0 && targets.length > 0 ? (
                  <Text style={{ fontSize: 11, color: '#b45309' }}>{L('inventory.theChosenTeacherIsnT')}</Text>
                ) : null}
                {!toAll && targets.length === 0 ? (
                  <Text style={{ fontSize: 11, color: '#b45309' }}>{L('inventory.chooseAtLeastOnePerson')}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {progress ? <Text style={{ fontSize: 11, color: '#2563eb', textAlign: 'center' }}>{progress}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || busy || tooBig} style={[styles.btn, { backgroundColor: isLost ? '#d97706' : '#2563eb', opacity: !name.trim() || busy || tooBig ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? L('inventory.registering') : isLost ? L('inventory.submitReport') : L('inventory.post')}</Text></TouchableOpacity>
          </View>
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function LostItemDetailMobile({ item, allItems, isAdmin, userId, userName, onClose, onOpen }: {
  item: LostItem; allItems: LostItem[]; isAdmin: boolean; userId: string; userName: string; onClose: () => void; onOpen: (id: string) => void;
}) {
  const canDelete = isAdmin || item.reportedById === userId;
  const kind = lostItemKind(item);
  const isLost = kind === 'lost';
  const SL = LOST_STATUS_LABELS_BY_KIND[kind];
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

  /** 이미 연결된 짝 / 연결 후보 (열려 있는 건에만 제안) */
  const matched = useMemo(() => (item.matchedId ? allItems.find(l => l.id === item.matchedId) ?? null : null), [item.matchedId, allItems]);
  const matches = useMemo(
    () => (item.matchedId || item.status !== 'found' ? [] : suggestLostMatches(item, allItems)),
    [item, allItems]);
  const link = (otherId: string, otherName: string) => {
    if (busy) return;
    Alert.alert(L('inventory.linkAsTheSameItem'), L('inventory.linkAndAsTheSame2', { v0: item.name, v1: otherName }), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('inventory.link3'), onPress: async () => {
        setBusy(true);
        try {
          await linkLostItems(db, item.id, otherId, { name: userName, claimedName: claimName.trim() || undefined });
          // 신고한 선생님(과 학생 담당)에게 "찾았어요" — 연결한 본인은 제외
          authenticatedFetch('/api/inventory/notify-lost', { method: 'POST', body: JSON.stringify({ lostItemId: item.id, event: 'matched' }) })
            .then(async res => {
              const data = (await res.json().catch(() => null)) as { sent?: number; missed?: Array<{ name: string; state: string }> } | null;
              const msg = missedSummary(data?.missed);
              if (msg) Alert.alert(L('task.somePeopleDidnTReceive'), msg);
            })
            .catch(e => console.warn('분실물 연결 알림 요청 실패:', e));
        }
        catch (e) { console.error('분실물 연결 오류:', e); Alert.alert(L('common.error'), L('inventory.anErrorOccurredWhileLinking')); }
        finally { setBusy(false); }
      } },
    ]);
  };

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
    catch (e) { console.error('첨부 추가 오류:', e); Alert.alert(L('common.error'), L('inventory.anErrorOccurredWhileUploading')); }
    finally { setBusy(false); }
  };
  const removeMedia = (m: LostItemMedia) => {
    Alert.alert(L('inventory.deleteAttachment'), L('inventory.deleteThisAttachment'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: async () => { try { await deleteObject(storageRef(storage, m.path)); } catch { /* 없으면 무시 */ } await removeLostItemMedia(db, item.id, item.media, m.path); } },
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
    Alert.alert(L('patient.deleteRecord'), L('inventory.deleteThisLostFoundRecord'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: async () => {
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
              <View style={{ backgroundColor: isLost ? '#fef3c7' : '#e0f2fe', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: isLost ? '#b45309' : '#0369a1' }}>{LOST_KIND_LABELS[kind].tab}</Text></View>
              <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{lostStatusLabel(item)}</Text></View>
              <Text style={[styles.modalTitle, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{L('inventory.post')} {item.reportedBy} · {fmtDateTime(item.createdAt)}{item.status !== 'found' && item.claimedHandler ? L('inventory.marked2', { v0: item.claimedHandler }) : ''}</Text>
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
                      ? <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', gap: 2 }}><Ionicons name="play-circle" size={28} color="#fff" /><Text style={{ fontSize: 9, color: '#fff' }}>{L('inventory.openVideo')}</Text></View>
                      : <Image source={{ uri: m.url }} style={{ flex: 1 }} contentFit="cover" />}
                  </TouchableOpacity>
                  {canDelete && <TouchableOpacity onPress={() => removeMedia(m)} style={styles.thumbRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></TouchableOpacity>}
                </View>
              ))}
            </View>
          )}
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          {picked.length > 0 && (
            <TouchableOpacity onPress={uploadMore} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb', opacity: busy ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? L('task.uploading') : L('inventory.uploadAttachments', { v0: picked.length })}</Text></TouchableOpacity>
          )}

          {editing ? (
            <View style={{ gap: 8 }}>
              <TextInput value={name} onChangeText={setName} placeholder={L('inventory.item2')} placeholderTextColor="#9ca3af" style={styles.input} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder={isLost ? L('inventory.lastSeenAt') : L('inventory.foundAt')} placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
                <TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={[styles.input, { width: 120 }]} />
              </View>
              {!isLost ? <TextInput value={keptAt} onChangeText={setKeptAt} placeholder={L('inventory.keptAt2')} placeholderTextColor="#9ca3af" style={styles.input} /> : null}
              <TextInput value={description} onChangeText={setDescription} multiline placeholder={L('inventory.description')} placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setEditing(false)} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('common.save')}</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', padding: 10, gap: 4 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>📍 {isLost ? L('inventory.lastSeenAt') : L('inventory.foundAt')}: <Text style={{ fontWeight: '700' }}>{item.foundPlace || '—'}</Text> · {isLost ? L('inventory.dateLost') : L('inventory.dateFound')} <Text style={{ fontWeight: '700' }}>{item.foundDate}</Text></Text>
              {!isLost ? <Text style={{ fontSize: 12, color: '#374151' }}>{L('inventory.keptAt')} <Text style={{ fontWeight: '700' }}>{item.keptAt || '—'}</Text></Text> : null}
              {item.description ? <Text style={{ fontSize: 12, color: '#4b5563' }}>📝 {item.description}</Text> : null}
              {item.ownerName ? <Text style={{ fontSize: 12, color: '#be123c' }}>{isLost ? L('inventory.studentWhoLostIt') : L('inventory.nameTag')}: <Text style={{ fontWeight: '700' }}>{item.ownerName}</Text>{item.ownerClassCode ? ` (${item.ownerClassCode})` : ''}</Text> : null}
              {item.status === 'claimed' ? <Text style={{ fontSize: 12, color: '#047857' }}>✅ {isLost ? L('inventory.foundBy', { v0: item.claimedBy || L('inventory.ownerWord') }) : L('inventory.returnedTo', { v0: item.claimedBy || L('inventory.ownerWord') })}</Text> : null}
              <TouchableOpacity onPress={() => setEditing(true)}><Text style={{ fontSize: 11, color: '#2563eb' }}>{L('inventory.editInfo')}</Text></TouchableOpacity>
            </View>
          )}

          {matched ? (
            <View style={{ borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#065f46' }}>{L('inventory.linked')} {LOST_KIND_LABELS[lostItemKind(matched)].tab}</Text>
              <TouchableOpacity onPress={() => onOpen(matched.id)}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{matched.name}</Text>
                <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>{L('inventory.post')} {matched.reportedBy} · {matched.foundPlace || L('inventory.noPlaceGiven')}</Text>
              </TouchableOpacity>
              {item.matchedBy ? <Text style={{ fontSize: 10, color: '#047857' }}>{item.matchedBy} {L('inventory.link2')} {fmtDateTime(item.matchedAt)}</Text> : null}
            </View>
          ) : matches.length > 0 ? (
            <View style={{ borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>
                💡 {isLost ? L('inventory.thisMightBeItFound') : L('inventory.someoneIsLookingForThis')}
              </Text>
              {matches.map(m => (
                <View key={m.item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 7 }}>
                  <TouchableOpacity onPress={() => onOpen(m.item.id)} style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{m.item.name}</Text>
                    <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>{m.item.reportedBy} · {m.item.foundPlace || L('inventory.noPlaceGiven')}{m.item.ownerName ? ` · ${m.item.ownerName}` : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => link(m.item.id, m.item.name)} disabled={busy} style={{ backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, opacity: busy ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{L('inventory.link')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={{ fontSize: 10, color: '#b45309' }}>{L('inventory.onceLinkedBothWillBe')}{SL.claimed}{L('inventory.text')}</Text>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>{L('inventory.changeStatus')}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {LOST_ITEM_STATUSES.map(s => {
                const on = item.status === s; const sc = LOST_STATUS_COLOR[s];
                return (
                  <TouchableOpacity key={s} onPress={() => setStatus(s)} disabled={busy} style={[styles.btn, { backgroundColor: on ? sc.bg : '#fff', borderWidth: 1, borderColor: on ? sc.bg : '#e5e7eb' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? sc.text : '#6b7280' }}>{SL[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(claiming || item.status === 'claimed') && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={claimName} onChangeText={setClaimName} placeholder={isLost ? L('inventory.nameOfTheStudentPerson2') : L('inventory.nameOfTheStudentPerson')} placeholderTextColor="#9ca3af" autoFocus={claiming} style={[styles.input, { flex: 1 }]} />
                <TouchableOpacity onPress={() => setStatus('claimed')} disabled={busy || !claimName.trim()} style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, opacity: busy || !claimName.trim() ? 0.4 : 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{item.status === 'claimed' ? L('inventory.saveName') : L('inventory.mark', { v0: SL.claimed })}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {canDelete && <TouchableOpacity onPress={remove} disabled={busy} style={{ alignItems: 'center', paddingVertical: 8 }}><Text style={{ fontSize: 11, color: '#ef4444' }}>{L('patient.deleteRecord')}</Text></TouchableOpacity>}
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

/** 다회용 약: 미개봉 · 사용 중 · 거의 다 씀 + 개봉 / 거의 다 씀 / 다 씀 (캠프 스태프 누구나) */
function MultiUseRowMobile({ view, groupId, campCode }: { view: InventoryItemView; groupId: string; campCode: string }) {
  const [busy, setBusy] = useState(false);
  const stock = getGroupStock(view, groupId);
  const opened = getOpenedCount(view, groupId);
  const nearly = getNearlyEmptyCount(view, groupId);
  const exec = async (action: 'open' | 'nearly' | 'unnearly' | 'finish') => {
    setBusy(true);
    try { await stockOp({ op: 'multi', campCode, itemId: view.id, groupId, action }); }
    catch (e) { Alert.alert(L('common.error'), e instanceof Error ? e.message : L('inventory.couldNotProcess')); }
    finally { setBusy(false); }
  };
  const run = (action: 'open' | 'nearly' | 'unnearly' | 'finish') => {
    if (busy) return;
    if (action === 'finish') Alert.alert(L('inventory.usedUp'), L('inventory.markOneInUseAs', { v0: view.name }), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('inventory.usedUp'), style: 'destructive', onPress: () => exec('finish') },
    ]);
    else exec(action);
  };
  const chip = (label: string, color: string, onPress: () => void) => (
    <TouchableOpacity disabled={busy} onPress={onPress} style={{ borderWidth: 1, borderColor: color, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, opacity: busy ? 0.4 : 1 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.unopened', { v0: Math.max(0, stock - opened) })} · {L('inventory.inUse', { v0: opened })}{nearly > 0 ? <Text style={{ color: '#ea580c', fontWeight: '700' }}> · {L('inventory.nearlyEmpty', { v0: nearly })}</Text> : null}</Text>
      {stock - opened > 0 ? chip(L('inventory.open'), '#047857', () => run('open')) : null}
      {opened > nearly ? chip(L('inventory.nearlyEmpty2'), '#c2410c', () => run('nearly')) : null}
      {nearly > 0 ? chip(L('inventory.unmarkNearlyEmpty'), '#6b7280', () => run('unnearly')) : null}
      {opened > 0 ? chip(L('inventory.usedUp'), '#dc2626', () => run('finish')) : null}
    </View>
  );
}

function ItemDetailMobile({ view, groups, campCode, perm, managedGroupIds, userId, userName, initialUseGroupId, defaultGroupId, onRequest, onClose, onEditItem }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; perm: InventoryPerm; userId: string; userName: string;
  /** 입고 · 조정 · 이동할 수 있는 그룹 (부매니저는 자기 그룹) */
  managedGroupIds: Set<string>;
  initialUseGroupId?: string; defaultGroupId?: string;
  onRequest: (view: InventoryItemView, groupId?: string) => void;
  onClose: () => void; onEditItem?: () => void;
}) {
  const isAdmin = perm.canManageStock;
  const isMedicine = isMedicineItem(view);
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
      if (value === null) { Alert.alert(L('patient.checkNeeded'), L('inventory.enterTheDateAs2026')); return; }
    }
    setMetaBusy(true);
    try {
      await setStockMeta(db, campCode, view.id, meta.groupId, meta.kind === 'expiry' ? { expiry: value || null } : { location: value || null });
      setMeta(null);
    } catch { Alert.alert(L('common.error'), L('profile.couldNotSave')); }
    finally { setMetaBusy(false); }
  };
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [showAllMoves, setShowAllMoves] = useState(false);
  const [mode, setMode] = useState<{ type: 'use' | 'restock' | 'adjust' | 'min'; groupId: string } | null>(
    initialUseGroupId && !isMedicineItem(view) ? { type: 'use', groupId: initialUseGroupId } : null);
  const [useReason, setUseReason] = useState('');
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
        if (!useReason) { Alert.alert(L('inventory.pleaseChooseAReason')); return; }
        if (useReason === USE_REASON_OTHER && !memo.trim()) { Alert.alert(L('inventory.pleaseDescribeTheReason')); return; }
        const reason = useReason === USE_REASON_OTHER ? memo.trim() : useReason;
        await recordStockUse(db, campCode, { ...base, quantity: n, memo: reason }, { uid: userId, name: userName });
        notifySupply({ type: 'stock_low', campCode, itemId: view.id, groupId: group.id });
      } else if (mode.type === 'restock') {
        if (!(n > 0)) return;
        const ex = restockExpiry ? normExpiry(restockExpiry) : '';
        if (ex === null) { Alert.alert(L('patient.checkNeeded'), L('inventory.enterTheExpiryAs2026')); return; }
        if (isAdmin) {
          await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
          if (ex) await setStockMeta(db, campCode, view.id, group.id, { expiry: ex });
        } else {
          // 부매니저: 서버가 "내 그룹"인지 확인하고 기록한다
          await stockOp({ op: 'restock', campCode, itemId: view.id, groupId: group.id, quantity: n, expiry: ex || undefined, memo: memo.trim() || undefined });
        }
        setRestockExpiry('');
      } else if (mode.type === 'adjust') {
        if (!memo.trim()) { Alert.alert(L('profile.incomplete'), L('inventory.pleaseEnterTheReasonFor')); return; }
        if (isAdmin) {
          await adjustStockTo(db, campCode, { ...base, current, target: n, reason: memo.trim() }, userName);
        } else {
          await stockOp({ op: 'adjust', campCode, itemId: view.id, groupId: group.id, target: n, reason: memo.trim() });
        }
      } else {
        await setGroupMinStock(db, campCode, view.id, group.id, qty === '' ? null : Math.max(0, n || 0));
      }
      setMode(null); setQty(''); setMemo('');
    } catch (e) {
      console.error('재고 처리 오류:', e);
      Alert.alert(L('common.error'), e instanceof Error && e.message ? e.message : L('inventory.anErrorOccurredWhileProcessing'));
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>{dataLabel(view.category)}{view.subCategory ? ` · ${view.subCategory}` : ''}{view.kind ? ` · ${view.kind}` : ''}</Text>
            <Text style={styles.modalTitle}>{view.name} {view.spec ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#9ca3af' }}>{view.spec}</Text> : null}</Text>
            {isMultiUse(view) ? <Text style={{ fontSize: 10, color: '#c2410c' }}>♻ {L('inventory.multiUse')}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#047857', lineHeight: 26 }}>{view.total}<Text style={{ fontSize: 11, color: '#9ca3af' }}>{dataLabel(view.unit)}</Text></Text>
            <Text style={{ fontSize: 9, color: '#9ca3af' }}>{L('inventory.currentTotalStock')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          <ItemMediaSectionMobile item={view} canEdit={perm.canEditItemMedia} userName={userName} />
          {(view.description || view.dosageNote) ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#d1fae5', backgroundColor: '#ecfdf5', padding: 10, gap: 2 }}>
              {view.dosageNote ? <Text style={{ fontSize: 11, color: '#065f46' }}>📋 {view.dosageNote}</Text> : null}
              {view.description ? <Text style={{ fontSize: 11, color: '#374151' }}>ℹ️ {view.description}</Text> : null}
            </View>
          ) : null}

          {/* 교무실별 수량 */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>{L('inventory.quantityByStaffRoom')}</Text>
              {perm.canEditItem && onEditItem && <TouchableOpacity onPress={onEditItem}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.editItem')}</Text></TouchableOpacity>}
            </View>
            {groups.length === 0 ? <Text style={styles.emptyBody}>{L('inventory.noStaffRoomsInventoryGroups')}</Text> : (
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                {groups.map((g, i) => {
                  const n = getGroupStock(view, g.id);
                  const min = getMinStock(view, g.id);
                  const low = min > 0 && getAvailableStock(view, g.id) < min;
                  return (
                    <View key={g.id} style={{ paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6', gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{g.name} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{g.location ?? ''}</Text></Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: low && perm.isStockManager ? '#dc2626' : '#1f2937' }}>{n}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{dataLabel(view.unit)}</Text></Text>
                        {perm.isStockManager ? <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.min2')} {min}</Text> : null}
                        {perm.isStockManager ? (low
                          ? <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>{L('inventory.low3')}{min - getAvailableStock(view, g.id)}</Text>
                          : <Text style={{ fontSize: 9, color: '#9ca3af' }}>{L('data.feverNormal')}</Text>) : null}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity onPress={() => setMeta({ groupId: g.id, kind: 'location', value: view.locations[g.id] ?? '' })}>
                          <Text style={{ fontSize: 11, color: view.locations[g.id] ? '#374151' : '#cbd5e1' }}>📍 {view.locations[g.id] || L('inventory.addLocation')}</Text>
                        </TouchableOpacity>
                        {(() => {
                          const ex = view.expiries[g.id]; const st = expiryState(ex);
                          if (!ex) return isAdmin ? <TouchableOpacity onPress={() => setMeta({ groupId: g.id, kind: 'expiry', value: '' })}><Text style={{ fontSize: 11, color: '#cbd5e1' }}>{L('inventory.expiry2')}</Text></TouchableOpacity> : null;
                          return (
                            <TouchableOpacity disabled={!isAdmin} onPress={() => setMeta({ groupId: g.id, kind: 'expiry', value: ex })}>
                              <Text style={{ fontSize: 11, fontWeight: st === 'ok' ? '400' : '700', color: st === 'expired' ? '#dc2626' : st === 'soon' ? '#b45309' : '#6b7280' }}>⏳ {fmtExpiry(ex)}{st === 'expired' ? L('inventory.past') : st === 'soon' ? L('inventory.soon') : ''}</Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                      {isMultiUse(view) && g.id in view.stocks ? <MultiUseRowMobile view={view} groupId={g.id} campCode={campCode} /> : null}
                      {(managedGroupIds.has(g.id) || g.id in view.stocks) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {g.id in view.stocks && !isMedicine && (
                            <TouchableOpacity onPress={() => { setMode({ type: 'use', groupId: g.id }); setQty('1'); setMemo(''); setUseReason(''); }} style={{ backgroundColor: '#2563eb', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{L('inventory.use4')}</Text>
                            </TouchableOpacity>
                          )}
                          {managedGroupIds.has(g.id) && (
                            <>
                              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>{L('inventory.restock6')}</Text></TouchableOpacity>
                              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.adjust')}</Text></TouchableOpacity>
                              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => { setMode(null); setTransferFrom(g.id); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#4f46e5' }}>{L('inventory.move2')}</Text></TouchableOpacity>
                              {isAdmin && (
                                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => { setMode({ type: 'min', groupId: g.id }); setQty(view.minStocks?.[g.id] != null ? String(view.minStocks[g.id]) : ''); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.min2')}</Text></TouchableOpacity>
                              )}
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
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{meta.kind === 'location' ? L('inventory.exactLocation') : L('inventory.expiry2')} · {groups.find(g => g.id === meta.groupId)?.name}</Text>
              <TextInput value={meta.value} onChangeText={v => setMeta({ ...meta, value: v })} autoFocus placeholderTextColor="#9ca3af" style={[styles.input, { backgroundColor: '#fff' }]}
                placeholder={meta.kind === 'location' ? L('inventory.eGMedicineBoxSlot') : L('inventory.n20261231Or2026')} keyboardType={meta.kind === 'expiry' ? 'numbers-and-punctuation' : 'default'} />
              {meta.kind === 'expiry' && <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('inventory.ifSeveralEnterTheEarliest')}</Text>}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {meta.value ? <TouchableOpacity onPress={() => setMeta({ ...meta, value: '' })} style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}><Text style={{ fontSize: 12, color: '#ef4444' }}>{L('inventory.clear')}</Text></TouchableOpacity> : null}
                <TouchableOpacity onPress={() => setMeta(null)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveMeta} disabled={metaBusy} style={[styles.btn, { backgroundColor: '#1f2937', opacity: metaBusy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{L('common.save')}</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {mode && group && (
            <View style={{ borderRadius: 10, borderWidth: 1, padding: 10, gap: 8, borderColor: mode.type === 'use' ? '#bfdbfe' : mode.type === 'restock' ? '#a7f3d0' : '#fde68a', backgroundColor: mode.type === 'use' ? '#eff6ff' : mode.type === 'restock' ? '#ecfdf5' : '#fffbeb' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>
                {mode.type === 'use' ? L('inventory.use3') : mode.type === 'restock' ? L('inventory.restock5') : mode.type === 'adjust' ? L('inventory.adjustThisStaffRoomOnly') : L('inventory.minimumQuantity')} · {group.name} <Text style={{ fontWeight: '400', color: '#6b7280' }}>{L('inventory.current')} {current}{dataLabel(view.unit)}</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" autoFocus
                  placeholder={mode.type === 'use' ? L('patient.quantityUsed') : mode.type === 'restock' ? L('inventory.restockQuantity') : mode.type === 'adjust' ? L('inventory.quantityAfterAdjustment') : L('inventory.leaveBlankForDefault', { v0: view.minStockDefault ?? 0 })} placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 130 }]} />
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{dataLabel(view.unit)}</Text>
                {mode.type === 'restock' && qty ? <Text style={{ fontSize: 11, color: '#047857' }}>→ {current + (parseInt(qty, 10) || 0)}</Text> : null}
                {mode.type === 'use' && qty ? <Text style={{ fontSize: 11, color: '#1d4ed8' }}>→ {current - (parseInt(qty, 10) || 0)} {L('inventory.left')}</Text> : null}
                {mode.type === 'adjust' && qty ? <Text style={{ fontSize: 11, color: '#b45309' }}>{L('inventory.difference')} {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</Text> : null}
              </View>
              {mode.type === 'restock' && (
                <TextInput value={restockExpiry} onChangeText={setRestockExpiry} placeholder={L('inventory.expiryOptional20261231')} placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation" style={[styles.input, { backgroundColor: '#fff' }]} />
              )}
              {mode.type !== 'min' && (
                <>
                  {mode.type === 'use' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {USE_REASONS.map(r => (
                        <TouchableOpacity key={r} onPress={() => setUseReason(useReason === r ? '' : r)} style={[styles.miniChip, useReason === r && { backgroundColor: '#2563eb' }]}>
                          <Text style={[styles.miniChipText, useReason === r && { color: '#fff' }]}>{dataLabel(r)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {mode.type === 'adjust' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {ADJUST_REASONS.map(r => (
                        <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#f59e0b' }]}>
                          <Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{dataLabel(r)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {(mode.type !== 'use' || useReason === USE_REASON_OTHER) && <TextInput value={memo} onChangeText={setMemo} placeholder={mode.type === 'use' ? L('inventory.reasonRequired') : mode.type === 'restock' ? L('patient.noteOptional') : L('inventory.pickAboveOrTypeIt')} placeholderTextColor="#9ca3af" style={styles.input} />}
                </>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setMode(null)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', opacity: busy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? L('inventory.processing') : L('common.save')}</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {/* 변동 내역 */}
          <View>
            <Text style={styles.sectionTitle}>{L('inventory.changeHistory')} <Text style={{ color: '#9ca3af', fontWeight: '400' }}>({movements.length}{L('inventory.entries')}</Text></Text>
            {movements.length === 0 ? <Text style={styles.emptyBody}>{L('inventory.noChangesInThisCamp')}</Text> : (
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
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280' }}>{showAllMoves ? L('inventory.collapse2') : L('inventory.showEarlierEntries', { v0: movements.length - 4 })}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* 사용하기 · 필요한 물품 요청 — 누구나 */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          {isMedicine ? (
            <Text style={{ flex: 1, alignSelf: 'center', fontSize: 11, color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 8, padding: 8 }}>{L('inventory.logMedicineUseInThe')}</Text>
          ) : (
          <TouchableOpacity disabled={!useGroupId}
            onPress={() => { if (useGroupId) { setMode({ type: 'use', groupId: useGroupId }); setQty('1'); setMemo(''); setUseReason(''); } }}
            style={[styles.btn, { backgroundColor: useGroupId ? '#2563eb' : '#e5e7eb' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: useGroupId ? '#fff' : '#9ca3af' }}>{L('inventory.use2')}</Text>
          </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onRequest(view, defaultGroupId)} style={[styles.btn, { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#047857' }}>{L('inventory.requestNeededItems3')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!transferFrom} animationType="fade" transparent onRequestClose={() => setTransferFrom(null)}>
        {transferFrom && (
          <StockTransferMobile view={view} groups={groups} campCode={campCode} fromGroupId={transferFrom}
            managedGroupIds={isAdmin ? null : managedGroupIds}
            userId={userId} userName={userName} onClose={() => setTransferFrom(null)} />
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==================== 🔁 그룹(교무실) 간 재고 이동 (모바일) ====================

function StockTransferMobile({ view, groups, campCode, fromGroupId, managedGroupIds, userId, userName, onClose }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; fromGroupId: string; userId: string; userName: string; onClose: () => void;
  /** 부매니저: 내 그룹 — 보내거나 받는 쪽 중 하나가 여기 있어야 한다. 관리자는 null(제한 없음) */
  managedGroupIds?: Set<string> | null;
}) {
  const [from, setFrom] = useState(fromGroupId);
  // 부매니저: 보내는 곳이 내 그룹이 아니면 받는 곳은 내 그룹만 (다른 그룹 재고를 가져오기)
  const others = groups.filter(g => g.id !== from
    && (!managedGroupIds || canTransferBetween(managedGroupIds, from, g.id)));
  const [to, setTo] = useState(others[0]?.id ?? '');
  useEffect(() => {
    if (!others.some(g => g.id === to)) setTo(others[0]?.id ?? '');
  }, [from, to, others]);
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
      if (!managedGroupIds) {
        const res = await transferStock(db, campCode, {
          itemId: view.id, itemName: view.name,
          fromGroupId: fromGroup.id, fromGroupName: fromGroup.name,
          toGroupId: toGroup.id, toGroupName: toGroup.name,
          quantity: n, memo: memo.trim() || undefined,
        }, { uid: userId, name: userName });
        setDone(res);
        notifySupply({ type: 'stock_low', campCode, itemId: view.id, groupId: fromGroup.id });
      } else {
        // 부매니저: 서버가 권한 확인 · 기록 · 알림(가져온 그룹 부매니저, 재고 부족)까지 처리
        const res = await stockOp<{ from: number; to: number }>({
          op: 'transfer', campCode, itemId: view.id, fromGroupId: fromGroup.id, toGroupId: toGroup.id,
          quantity: n, memo: memo.trim() || undefined,
        });
        setDone(res);
      }
    } catch (e) {
      Alert.alert(L('inventory.couldNotMove2'), e instanceof Error ? e.message : L('inventory.pleaseTryAgain'));
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{L('inventory.moveToAnotherStaffRoom2')}</Text>
            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{L('inventory.itSDeductedFromThe')}</Text>
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
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#047857' }}>{view.total}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{dataLabel(view.unit)}</Text></Text>
          </View>

          {done ? (
            <View style={{ borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12, gap: 3 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#065f46' }}>{L('inventory.moved')}</Text>
              <Text style={{ fontSize: 12, color: '#374151' }}>{fromGroup?.name} {done.from}{dataLabel(view.unit)} · {toGroup?.name} {done.to}{dataLabel(view.unit)}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('inventory.recordedInBothStockLogs')}</Text>
            </View>
          ) : (
            <>
              <View>
                <Text style={styles.fieldLabel}>{L('inventory.fromStaffRoom')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {groups.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => setFrom(g.id)} style={[styles.miniChip, from === g.id && styles.miniChipAmber]}>
                      <Text style={[styles.miniChipText, from === g.id && { color: '#92400e', fontWeight: '700' }]}>{g.name} {getGroupStock(view, g.id)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={styles.fieldLabel}>{L('inventory.toStaffRoom')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {others.length === 0 ? <Text style={styles.emptyBody}>{L('inventory.nowhereToMoveTo2')}</Text> : others.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => setTo(g.id)} style={[styles.miniChip, to === g.id && { backgroundColor: '#e0e7ff', borderColor: '#c7d2fe' }]}>
                      <Text style={[styles.miniChipText, to === g.id && { color: '#4338ca', fontWeight: '700' }]}>{g.name} {getGroupStock(view, g.id)}{g.id in view.stocks ? '' : L('inventory.new2')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>{L('inventory.quantityToMove')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" style={[styles.input, { width: 110 }]} placeholder="0" placeholderTextColor="#9ca3af" />
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{dataLabel(view.unit)}</Text>
                  {[1, 5, 10].filter(x => x <= fromCur).map(x => (
                    <TouchableOpacity key={x} onPress={() => setQty(String(x))} style={styles.miniChip}><Text style={styles.miniChipText}>{x}</Text></TouchableOpacity>
                  ))}
                  {fromCur > 0 && <TouchableOpacity onPress={() => setQty(String(fromCur))} style={styles.miniChip}><Text style={styles.miniChipText}>{L('inventory.all')}</Text></TouchableOpacity>}
                </View>
                {n > fromCur ? <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{L('inventory.youCanTSendMore')}{fromCur}{dataLabel(view.unit)}{L('inventory.text4')}</Text> : null}
                {!invalid ? (
                  <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 6, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
                    {fromGroup?.name} {fromCur} → <Text style={{ fontWeight: '800', color: '#dc2626' }}>{fromCur - n}</Text> · {toGroup?.name} {toCur} → <Text style={{ fontWeight: '800', color: '#047857' }}>{toCur + n}</Text>
                    <Text style={{ color: '#9ca3af' }}>  {L('common.all')} {view.total} {L('inventory.unchanged')}</Text>
                  </Text>
                ) : null}
              </View>

              <View>
                <Text style={styles.fieldLabel}>{L('inventory.reasonForMoveOptional')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {TRANSFER_REASONS.map(r => (
                    <TouchableOpacity key={r} onPress={() => setMemo(memo === r ? '' : r)} style={[styles.miniChip, memo === r && { backgroundColor: '#4f46e5', borderColor: '#4f46e5' }]}>
                      <Text style={[styles.miniChipText, memo === r && { color: '#fff' }]}>{dataLabel(r)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={memo} onChangeText={setMemo} placeholder={L('inventory.youCanAlsoTypeIt')} placeholderTextColor="#9ca3af" style={styles.input} />
              </View>
            </>
          )}
          <View style={{ height: 12 }} />
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 13, color: '#4b5563' }}>{done ? L('common.close') : L('common.cancel')}</Text></TouchableOpacity>
          {!done && (
            <TouchableOpacity onPress={submit} disabled={invalid || busy} style={[styles.btn, { backgroundColor: '#4f46e5', opacity: invalid || busy ? 0.4 : 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{busy ? L('inventory.moving') : L('inventory.move')}</Text>
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
