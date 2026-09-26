'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiBox, FiSearch, FiPlus, FiSettings, FiPackage, FiX, FiCopy, FiClipboard, FiCamera, FiImage, FiVideo, FiShoppingCart, FiList, FiChevronRight, FiRepeat } from 'react-icons/fi';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { jobCodesService, stSheetService, CampCode } from '@/lib/stSheetService';
import { getUsersByJobCodeId } from '@/lib/firebaseService';
import type { STSheetStudent } from '@/lib/stSheetService';
import {
  subscribeInventoryItems,
  subscribeInventoryStocks,
  subscribeInventoryGroups,
  subscribeInventoryPackages,
  subscribeInventoryMovements,
  addInventoryItem,
  updateInventoryItem,
  importInventoryItems,
  addInventoryGroup,
  updateInventoryGroup,
  deleteInventoryGroup,
  savePackageFromGroups,
  applyPackageToCamp,
  deleteInventoryPackage,
  setGroupMinStock,
  restock,
  adjustStockTo,
  setStockLevels,
  getCampGroups,
  findGroupByClassCode,
  itemLabel,
  getItemUsage,
  INVENTORY_USAGE_LABELS,
  INVENTORY_USAGE_ORDER,
  missedSummary,
  LOST_NOTIFY_TARGETS,
  LOST_NOTIFY_TARGET_LABELS,
  lostNotifyPreview,
  lostGroupManagers,
  MISSED_STATE_LABELS,
  suggestedUsages,
  inventoryPerm,
  managedStockGroupIds,
  canTransferBetween,
  transferStock,
  subscribeCampMovements,
  movementLabel,
  MOVEMENT_FILTERS,
  TRANSFER_REASONS,
  supplyProgress,
  subscribeSupplyRequests,
  addSupplyRequest,
  updateSupplyRequest,
  setSupplyRequestStatus,
  setSupplyBuyer,
  setSupplyDefaultBuyer,
  subscribeSupplyGuides,
  ADJUST_REASONS,
  STOCKTAKE_REASONS,
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
  LOST_ITEM_KINDS,
  LOST_KIND_LABELS,
  LOST_STATUS_LABELS_BY_KIND,
  lostItemKind,
  lostStatusLabel,
  isLostOpen,
  suggestLostMatches,
  linkLostItems,
  buildInventoryViews,
  computePurchaseNeeds,
  getGroupStock,
  getMinStock,
  INVENTORY_CATEGORIES,
  INVENTORY_SUBCATEGORIES,
  INVENTORY_UNITS,
  DEFAULT_INVENTORY_ITEMS, dataLabel, L, isEnglishUI } from '@smis-mentor/shared';
import type {
  InventoryItem,
  InventoryItemView,
  InventoryStock,
  InventoryGroup,
  InventoryPackage,
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
  InventoryUsage,
  InventoryPerm,
  LostNotifyTarget,
  NotifyUserLike,
  MovementFilterKey,
  CampGroup,
} from '@smis-mentor/shared';
import { fmtHoldDate, supplyStatusLine } from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'purchase' | 'movement' | 'lost' | 'manage';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORY_STYLE: Record<InventoryCategory, string> = {
  의약품: 'bg-rose-50 text-rose-700 border-rose-100',
  문구류: 'bg-blue-50 text-blue-700 border-blue-100',
  전자제품: 'bg-violet-50 text-violet-700 border-violet-100',
  위생도구: 'bg-teal-50 text-teal-700 border-teal-100',
  생활용품: 'bg-amber-50 text-amber-700 border-amber-100',
  서류: 'bg-slate-50 text-slate-700 border-slate-200',
  교구: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  기타: 'bg-gray-50 text-gray-600 border-gray-200',
};

/** 푸시 알림 요청 — 실패해도 화면 동작은 그대로 (받는 사람은 서버가 정한다) */
/**
 * 알림 요청 — 보낸 뒤 **못 받은 사람이 있으면 보낸 사람에게 알려 준다**
 * (그 자리에서 "알림 켜 주세요"라고 말할 수 있게).
 */
function notifySupply(body: Record<string, unknown>) {
  authenticatedPost<{ sent?: number; missed?: Array<{ name: string; state: string }> }>('/api/inventory/notify', body)
    .then(data => {
      // 재고 부족(stock_low)은 사용 기록에 따라 자동으로 나가는 알림이라 알려 주지 않는다
      if (body.type === 'stock_low') return;
      const msg = missedSummary(data?.missed);
      if (msg) toast(`🔕 ${msg}`, { duration: 7000 });
    })
    .catch(e => console.warn('알림 요청 실패:', e));
}

function fmtDateTime(ts: InventoryMovement['at'] | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 캠프 › 재고 — 품목은 회사 공통, 수량은 캠프·그룹별 */
export default function InventoryContent() {
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

  // 캠프 그룹(Spring 등 · 반 코드)과 학생 명단 — 재고 그룹 연결, 분실물 이름표 알림에 사용
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
  const [packages, setPackages] = useState<InventoryPackage[]>([]);
  useEffect(() => subscribeInventoryItems(db, setItems), []);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeInventoryStocks(db, campCode, setStocks);
    const u2 = subscribeInventoryGroups(db, campCode, setGroups);
    return () => { u1(); u2(); };
  }, [campCode]);
  useEffect(() => { if (isAdmin) return subscribeInventoryPackages(db, setPackages); }, [isAdmin]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [supplySettings, setSupplySettings] = useState<SupplySettings | null>(null);
  const [supplyGuides, setSupplyGuides] = useState<SupplyGuide[]>([]);
  useEffect(() => subscribeSupplyGuides(db, setSupplyGuides), []);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeSupplyRequests(db, campCode, setRequests);
    const u2 = subscribeSupplySettings(db, campCode, setSupplySettings);
    const u3 = subscribeLostItems(db, campCode, setLostItems);
    return () => { u1(); u2(); u3(); };
  }, [campCode]);
  const keptLostCount = useMemo(() => lostItems.filter(l => l.status === 'found').length, [lostItems]);

  const views = useMemo(() => buildInventoryViews(items, stocks, groups), [items, stocks, groups]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  // 탭 배지: 관리자는 새 요청(보류 제외) 전체, 그 외는 내가 올렸거나 사오기로 한 진행 중 요청
  // 관리자는 여기에 재고 입고 대기 + 아직 요청 안 된 재고 부족분도 더함
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 목록에서 바로 '사용'을 누르면 그 그룹의 사용 입력을 연 채로 상세를 연다
  const [quickUseGroupId, setQuickUseGroupId] = useState<string | undefined>(undefined);
  // 내 그룹 (멘토 배정 그룹 ↔ 재고 그룹의 캠프 그룹 이름) — 재고 현황 기본 필터
  const myInvGroupId = useMemo(() => {
    const g = userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group?.toLowerCase();
    if (!g) return undefined;
    return groups.find(x => (x.campGroupName ?? x.name).toLowerCase() === g)?.id;
  }, [userData?.jobExperiences, activeJobCodeId, groups]);
  const selected = useMemo(() => views.find(v => v.id === selectedId) ?? null, [views, selectedId]);
  // 기존 권한 체계 그대로 — admin / 그룹 역할 '부매니저'
  const perm = useMemo(() => inventoryPerm(userData as { role?: string; jobExperiences?: Array<{ id: string; groupRole?: string }> } | null, activeJobCodeId),
    [userData, activeJobCodeId]);
  /** 입고 · 조정 · 이동할 수 있는 그룹 — 관리자 전체, 부매니저는 자기 그룹 */
  const managedGroupIds = useMemo(
    () => managedStockGroupIds(perm, groups, userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group),
    [perm, groups, userData?.jobExperiences, activeJobCodeId]);
  // 상세에서 '필요한 물품 요청' → 재고 요청 탭의 작성 폼을 미리 채워 연다
  const [requestPrefill, setRequestPrefill] = useState<{ req: SupplyRequest; nonce: number } | null>(null);
  const askSupply = (v: InventoryItemView, groupId?: string) => {
    const g = groups.find(x => x.id === (groupId ?? myInvGroupId)) ?? groups[0];
    setRequestPrefill({
      nonce: Date.now(),
      req: {
        forType: 'camp',
        items: [{ id: 'pf', itemId: v.id, name: v.name, quantity: 1, unit: v.unit || '개', groupId: g?.id, groupName: g?.name }],
      } as unknown as SupplyRequest,
    });
    setSelectedId(null);
    setSubTab('request');
  };
  // 부매니저·관리자 요약: 재고 부족 / 미처리 요청
  const openRequestCount = useMemo(() => requests.filter(r => isSupplyOpen(r.status)).length, [requests]);

  if (!activeJobCodeId || !campCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-4">
        <FiBox className="h-10 w-10 text-gray-300 mb-2" aria-hidden />
        <p className="text-gray-600 font-medium">{activeJobCodeId ? L('inventory.loadingCampInfo') : L('patient.pleaseSelectAnActiveCamp')}</p>
      </div>
    );
  }

  // 상단 메뉴 — 재고 현황 · 재고 요청 · 구매 목록 · 입출고 기록 · 분실물 · 관리
  // (구매 목록·입출고 기록은 기존에 관리 정보를 보던 범위 = 부매니저·관리자)
  const tabs: { id: SubTab; title: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'stock', title: L('inventory.stock'), icon: <FiBox className="w-3.5 h-3.5" /> },
    { id: 'request', title: L('inventory.request'), icon: <FiClipboard className="w-3.5 h-3.5" />, badge: requestBadge },
    ...(perm.isStockManager ? [{ id: 'purchase' as SubTab, title: L('inventory.toBuy'), icon: <FiShoppingCart className="w-3.5 h-3.5" /> }] : []),
    ...(perm.isStockManager ? [{ id: 'movement' as SubTab, title: L('inventory.history'), icon: <FiList className="w-3.5 h-3.5" /> }] : []),
    { id: 'lost', title: L('inventory.lostFound'), icon: <FiSearch className="w-3.5 h-3.5" />, badge: keptLostCount },
    ...(isAdmin ? [{ id: 'manage' as SubTab, title: L('inventory.manage'), icon: <FiSettings className="w-3.5 h-3.5" /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 세부탭 바 */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)}
              className={`flex-1 min-w-[88px] px-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative flex items-center justify-center gap-1.5 ${
                subTab === tab.id ? 'text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.icon}{tab.title}
              {!!tab.badge && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{tab.badge}</span>
              )}
              {subTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === 'stock' && (
          <StockTab campCode={campCode} views={views} groups={groups} needs={needs} perm={perm} userName={userName} myGroupId={myInvGroupId}
            openRequestCount={openRequestCount} onGoRequests={() => setSubTab('request')}
            onSelect={id => { setQuickUseGroupId(undefined); setSelectedId(id); }}
            onQuickUse={(id, gid) => { setQuickUseGroupId(gid); setSelectedId(id); }} />
        )}
        {subTab === 'request' && (
          <SupplyRequestTab campCode={campCode} jobCodeId={activeJobCodeId ?? ''} requests={requests} settings={supplySettings} guides={supplyGuides} campGroups={campGroups}
            prefill={requestPrefill} onPrefillDone={() => setRequestPrefill(null)}
            userGroup={userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group} items={items} views={views} groups={groups} needs={needs} students={students} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
        )}
        {subTab === 'purchase' && perm.isStockManager && (
          <PurchaseListTab views={views} groups={groups} needs={needs} requests={requests} settings={supplySettings}
            onSelect={id => { setQuickUseGroupId(undefined); setSelectedId(id); }} onGoRequests={() => setSubTab('request')} />
        )}
        {subTab === 'movement' && perm.isStockManager && (
          <MovementTab campCode={campCode} groups={groups} views={views} />
        )}
        {subTab === 'lost' && (
          <LostTab campCode={campCode} jobCodeId={activeJobCodeId ?? ''} students={students} campGroups={campGroups} lostItems={lostItems} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
        )}
        {subTab === 'manage' && isAdmin && (
          <ManageTab campCode={campCode} items={items} views={views} groups={groups} packages={packages} campGroups={campGroups} perm={perm} userName={userName} onSelect={setSelectedId} />
        )}
      </div>

      {selected && (
        <ItemDetailModal
          view={selected}
          groups={groups}
          campCode={campCode}
          perm={perm}
          managedGroupIds={managedGroupIds}
          userId={userData?.userId ?? ''}
          userName={userName}
          initialUseGroupId={quickUseGroupId}
          defaultGroupId={myInvGroupId}
          onRequest={askSupply}
          onClose={() => { setSelectedId(null); setQuickUseGroupId(undefined); }}
        />
      )}
    </div>
  );
}

// ==================== 📦 재고 현황 ====================

function StockTab({ campCode, views, groups, needs, perm, userName, myGroupId, openRequestCount, onGoRequests, onSelect, onQuickUse }: {
  campCode: string;
  views: InventoryItemView[];
  groups: InventoryGroup[];
  needs: PurchaseNeed[];
  perm: InventoryPerm;
  userName: string;
  myGroupId?: string;
  openRequestCount: number;
  onGoRequests: () => void;
  onSelect: (id: string) => void;
  onQuickUse: (id: string, groupId: string) => void;
}) {
  // 관리자: 품목 추가 (추가하면 바로 상세를 열어 그룹 수량 확인)
  const [adding, setAdding] = useState<{ category?: InventoryCategory; subCategory?: string } | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  // 처음 한 번은 '내 교무실(그룹)'으로 (직접 바꾸면 그대로 둠)
  const [groupTouched, setGroupTouched] = useState(false);
  useEffect(() => { if (!groupTouched && myGroupId) setGroupFilter(myGroupId); }, [myGroupId, groupTouched]);
  const [showInactive, setShowInactive] = useState(false);
  // 부매니저·관리자 전용: 부족한 물품만 보기
  const [shortOnly, setShortOnly] = useState(false);
  // 기본: 이 캠프에 둔 적 있는 품목만 (회사 공통 품목 전체가 다 보이지 않게)
  const [placedOnly, setPlacedOnly] = useState(true);
  const anyPlaced = useMemo(() => views.some(v => Object.keys(v.stocks).length > 0), [views]);

  /** 선택한 교무실 기준 부족 품목 (전체면 어느 한 곳이라도 부족하면) */
  const shortIds = useMemo(() => new Set(
    needs.filter(n => groupFilter === '전체' || n.groupId === groupFilter).map(n => n.itemId)
  ), [needs, groupFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (!showInactive && v.isActive === false) return false;
      if (placedOnly && anyPlaced && Object.keys(v.stocks).length === 0) return false;
      if (category !== '전체' && v.category !== category) return false;
      if (groupFilter !== '전체' && !(groupFilter in v.stocks)) return false;
      if (shortOnly && perm.isStockManager && !shortIds.has(v.id)) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, groupFilter, showInactive, placedOnly, anyPlaced, shortOnly, shortIds, perm.isStockManager]);

  // 분류(세부 분류)별로 묶어서 표시 — 행 안에서는 분류를 반복하지 않는다
  const sections = useMemo(() => {
    const map = new Map<string, { cat: InventoryCategory; sub?: string; list: InventoryItemView[] }>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, { cat: v.category, sub: v.subCategory, list: [] });
      map.get(key)!.list.push(v);
    });
    return [...map.entries()];
  }, [filtered]);

  const selCls = 'text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-emerald-400';

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 부매니저·관리자 요약 — 재고 부족 / 미처리 요청 (일반 멘토에게는 표시하지 않음) */}
      {perm.isStockManager && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShortOnly(v => !v)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              shortOnly ? 'border-red-400 bg-red-50' : shortIds.size > 0 ? 'border-red-200 bg-red-50/60 hover:border-red-300' : 'border-gray-200 bg-white'
            }`}>
            <p className="text-[11px] text-gray-500">{L('inventory.lowStock')}{shortOnly ? L('inventory.viewing') : ''}</p>
            <p className={`text-lg font-extrabold leading-tight ${shortIds.size > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {shortIds.size}<span className="text-[11px] font-semibold text-gray-400 ml-0.5">{L('inventory.items3')}</span>
            </p>
          </button>
          <button onClick={onGoRequests} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-emerald-300 transition-colors">
            <p className="text-[11px] text-gray-500">{L('inventory.openRequests')}</p>
            <p className={`text-lg font-extrabold leading-tight ${openRequestCount > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
              {openRequestCount}<span className="text-[11px] font-semibold text-gray-400 ml-0.5">{L('home.text')}</span>
              <FiChevronRight className="inline w-3.5 h-3.5 text-gray-300 ml-0.5" />
            </p>
          </button>
        </div>
      )}

      {/* 교무실 · 분류 · 검색 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={groupFilter} onChange={e => { setGroupTouched(true); setGroupFilter(e.target.value); }} className={`${selCls} flex-1 min-w-0`}>
            <option value="전체">{L('inventory.allStaffRoomsTotal')}</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.id === myGroupId ? '★ ' : ''}{g.name}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value as InventoryCategory | '전체')} className={`${selCls} w-28 shrink-0`}>
            <option value="전체">{L('inventory.allCategories')}</option>
            {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{dataLabel(c)}</option>)}
          </select>
          {perm.canEditItem && (
            <button onClick={() => setAdding({ category: category === '전체' ? undefined : category })}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gray-800 hover:bg-gray-900">
              <FiPlus className="w-3 h-3" />{L('inventory.addItem')}
            </button>
          )}
        </div>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.searchItems2')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:border-emerald-400" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {perm.isStockManager && (
            <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} className="w-3.5 h-3.5" />{L('inventory.showLowStockItemsOnly')}
            </label>
          )}
          {anyPlaced && (
            <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer">
              <input type="checkbox" checked={!placedOnly} onChange={e => setPlacedOnly(!e.target.checked)} className="w-3.5 h-3.5" />{L('inventory.showItemsNotInThis')}
            </label>
          )}
          {perm.isAdmin && (
            <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3.5 h-3.5" />{L('inventory.includeInactive')}
            </label>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
          {L('inventory.thisCampHasNoStaff')} {perm.isAdmin ? L('inventory.applyAPackageOrAdd') : L('inventory.quantitiesAppearOnceAnAdmin')}
        </div>
      )}

      {views.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FiBox className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{L('inventory.noItemsRegistered')}</p>
          {perm.isAdmin && <p className="text-[11px] text-gray-400 mt-1">{L('inventory.youCanStartFromManage')}</p>}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">{shortOnly ? L('inventory.noLowStockItems') : L('students.noResults')}</p>
      ) : (
        sections.map(([title, { cat, sub, list }]) => (
          <div key={title}>
            <div className="flex items-center gap-2 mb-1 px-0.5">
              <p className="flex-1 text-[11px] font-bold text-gray-500">{sub ? `${dataLabel(cat)} · ${sub}` : dataLabel(cat)} <span className="text-gray-300 font-normal">{list.length}</span></p>
              {perm.canEditItem && <button onClick={() => setAdding({ category: cat, subCategory: sub })} className="text-[10px] font-semibold text-emerald-700 hover:underline">{L('patient.add')}</button>}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
              {list.map(v => (
                <ItemRow key={v.id} view={v} groupId={groupFilter === '전체' ? undefined : groupFilter}
                  showStatus={perm.isStockManager} isShort={shortIds.has(v.id)}
                  onClick={() => onSelect(v.id)}
                  onQuickUse={groupFilter !== '전체' && groupFilter in v.stocks ? () => onQuickUse(v.id, groupFilter) : undefined} />
              ))}
            </div>
          </div>
        ))
      )}
      {adding && <ItemFormModal preset={adding} groups={groups} campCode={campCode} defaultGroupId={groupFilter === '전체' ? myGroupId : groupFilter}
        perm={perm} userName={userName} onClose={() => setAdding(null)} onCreated={id => onSelect(id)} />}
    </div>
  );
}

/** 목록 한 줄 — 모든 행·썸네일 크기를 통일해 빠르게 훑을 수 있게 한다 */
function ItemRow({ view, groupId, showStatus, isShort, onClick, onQuickUse }: {
  view: InventoryItemView;
  /** 선택한 교무실 (없으면 전체 합계) */
  groupId?: string;
  showStatus: boolean;
  isShort: boolean;
  onClick: () => void;
  onQuickUse?: () => void;
}) {
  const qty = groupId ? getGroupStock(view, groupId) : view.total;
  const min = groupId ? getMinStock(view, groupId) : 0;
  const low = groupId ? (qty < 0 || (min > 0 && qty < min)) : isShort;
  // 일반 멘토에게는 부족 상태를 표시하지 않는다 (수량이 음수인 실사 필요만 빨갛게)
  const lowShown = showStatus ? low : qty < 0;
  const thumb = itemThumb(view);
  const ex = earliestExpiry(view, groupId);
  const exSt = expiryState(ex);
  const loc = groupId ? view.locations?.[groupId] : undefined;
  const meta = [view.kind, view.spec, loc ? `📍 ${loc}` : ''].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center h-[56px] hover:bg-gray-50 transition-colors">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-2.5 h-full pl-3 pr-2 text-left">
        {thumb
          ? <img src={thumb} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100 shrink-0" loading="lazy" />
          : <span className="w-9 h-9 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300"><FiBox className="w-4 h-4" /></span>}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={`text-[13px] font-semibold truncate ${view.isActive === false ? 'text-gray-400' : 'text-gray-900'}`}>{view.name}</span>
            {view.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500 shrink-0">{L('inventory.inactive')}</span>}
            {(exSt === 'expired' || exSt === 'soon') && (
              <span className={`text-[9px] px-1 rounded font-bold shrink-0 ${exSt === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                ⏳ {fmtExpiry(ex)} {exSt === 'expired' ? L('inventory.expired') : L('inventory.expiring')}
              </span>
            )}
          </span>
          <span className="block text-[10px] text-gray-400 truncate h-[13px]">{meta}</span>
        </span>
      </button>
      <button onClick={onClick} className="shrink-0 w-[72px] h-full text-right pr-2 flex flex-col justify-center">
        <span className={`text-sm font-extrabold leading-none ${lowShown ? 'text-red-600' : 'text-gray-900'}`}>
          {qty}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">{dataLabel(view.unit)}</span>
        </span>
      </button>
      {showStatus && (
        <button onClick={onClick} className="shrink-0 w-[46px] h-full flex items-center justify-center">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${low ? 'bg-red-100 text-red-700' : 'text-gray-400'}`}>{low ? L('inventory.low') : L('data.feverNormal')}</span>
        </button>
      )}
      {onQuickUse && (
        <button onClick={onQuickUse} title={L('inventory.usageLogInThisStaff')}
          className="shrink-0 mr-2 px-2 py-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md">{L('inventory.use4')}</button>
      )}
    </div>
  );
}

// ==================== 품목 사진·영상 ====================

async function uploadItemMedia(itemId: string, files: File[], by: string): Promise<ItemMedia[]> {
  const out: ItemMedia[] = [];
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) continue;
    const path = inventoryItemMediaPath(itemId, f.name || 'media');
    const r = storageRef(storage, path);
    await uploadBytes(r, f, { contentType: f.type || undefined });
    out.push({ url: await getDownloadURL(r), path, type: f.type.startsWith('video/') ? 'video' : 'image', name: f.name, size: f.size, by });
  }
  return out;
}

/**
 * 품목이 어떻게 생겼는지 — 보기는 스태프 누구나, 등록·삭제는 관리자만.
 * (Firestore·Storage 규칙에서도 관리자만 쓰기·삭제가 되도록 막혀 있다)
 */
function ItemMediaSection({ item, canEdit, userName }: { item: InventoryItem; canEdit: boolean; userName: string }) {
  const [deleting, setDeleting] = useState<ItemMedia | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const media = item.media ?? [];
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ItemMedia | null>(null);
  const add = async (files: File[]) => {
    if (!files.length) return;
    if (files.some(f => f.size > 50 * 1024 * 1024)) alert(L('inventory.filesOver50mbAreSkipped'));
    setBusy(true);
    try { await addInventoryItemMedia(db, item.id, await uploadItemMedia(item.id, files, userName)); }
    catch (e) { console.error('품목 사진 업로드 오류:', e); alert(L('inventory.couldNotUploadThePhoto')); }
    finally { setBusy(false); }
  };
  const remove = async (m: ItemMedia) => {
    setDeleteBusy(true);
    try { await removeInventoryItemMedia(db, item.id, media, m.path); await deleteObject(storageRef(storage, m.path)).catch(() => {}); setDeleting(null); }
    catch (e) { console.error(e); alert(L('inventory.couldNotDelete')); }
    finally { setDeleteBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-bold text-gray-700">{L('inventory.photosVideos')} <span className="font-normal text-gray-400">{media.length || ''}</span></p>
        {canEdit && (
          <label className={`flex items-center gap-1 text-[13px] font-semibold cursor-pointer ${busy ? 'text-gray-400' : 'text-blue-700 hover:underline'}`}>
            <FiCamera className="w-3.5 h-3.5" />{busy ? L('inventory.uploading') : L('task.add')}
            <input type="file" accept="image/*,video/*" multiple disabled={busy} className="hidden" onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {media.length === 0 ? (
        <p className="text-[13px] text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">
          {canEdit ? L('inventory.noPhotosYetUploadPackage') : L('inventory.noPhotosRegisteredOnlyAdmins')}
        </p>
      ) : (
        <div className="space-y-2">
          {media.map(m => (
            <div key={m.path} className="relative w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              {m.type === 'video'
                ? <video src={m.url} className="w-full max-h-[420px] bg-black" controls playsInline preload="metadata" />
                : <img src={m.url} alt="" className="w-full max-h-[420px] object-contain bg-gray-50 cursor-zoom-in" loading="lazy" onClick={() => setViewing(m)} />}
              {m.by && <span className="absolute bottom-1.5 left-1.5 text-[11px] px-1.5 py-0.5 rounded bg-black/50 text-white pointer-events-none">{m.by}</span>}
              {canEdit && (
                <button onClick={() => setDeleting(m)} title={L('common.delete')} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-[13px] flex items-center justify-center hover:bg-red-600">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {deleting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !deleteBusy && setDeleting(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-100">
              {deleting.type === 'video'
                ? <video src={deleting.url} className="w-full max-h-56 bg-black" muted playsInline preload="metadata" />
                : <img src={deleting.url} alt="" className="w-full max-h-56 object-contain" />}
            </div>
            <div className="px-5 py-4 space-y-2">
              <h3 className="text-lg font-bold text-gray-900">{L('inventory.this')} {deleting.type === 'video' ? L('inventory.video') : L('inventory.photo')}{L('inventory.deleteIt')}</h3>
              <p className="text-[14px] text-gray-600 leading-relaxed">
                <b>{item.name}</b>{L('inventory.s')} {deleting.type === 'video' ? L('inventory.video') : L('inventory.photo')}{L('inventory.this')} <b className="text-red-600">{L('inventory.itWillDisappearFromEvery')}</b>
                {deleting.by ? <> ({deleting.by} {L('inventory.uploaded2')}</> : null}
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDeleting(null)} disabled={deleteBusy} className="flex-1 py-2 text-base text-gray-700 bg-gray-100 rounded-xl">{L('common.cancel')}</button>
                <button onClick={() => remove(deleting)} disabled={deleteBusy} className="flex-1 py-2 text-base font-bold text-white bg-red-600 rounded-xl disabled:opacity-50">{deleteBusy ? L('inventory.deleting') : L('common.delete')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {viewing && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[80] p-4" onClick={() => setViewing(null)}>
          {viewing.type === 'video'
            ? <video src={viewing.url} className="max-w-full max-h-full" controls autoPlay playsInline onClick={e => e.stopPropagation()} />
            : <img src={viewing.url} alt="" className="max-w-full max-h-full object-contain" />}
          <button onClick={() => setViewing(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center"><FiX /></button>
          {viewing.by && <p className="absolute bottom-4 inset-x-0 text-center text-[13px] text-white/70">{viewing.by} {L('inventory.uploaded')}</p>}
        </div>
      )}
    </div>
  );
}

// ==================== 품목 상세 (그룹별 수량 · 입고 · 조정 · 이력) ====================

function ItemDetailModal({ view, groups, campCode, perm, managedGroupIds, userId, userName, initialUseGroupId, defaultGroupId, onRequest, onClose }: {
  view: InventoryItemView;
  groups: InventoryGroup[];
  campCode: string;
  perm: InventoryPerm;
  /** 입고 · 조정 · 이동할 수 있는 그룹 (부매니저는 자기 그룹) */
  managedGroupIds: Set<string>;
  userId: string;
  userName: string;
  initialUseGroupId?: string;
  defaultGroupId?: string;
  onRequest: (view: InventoryItemView, groupId?: string) => void;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [mode, setMode] = useState<{ type: 'use' | 'restock' | 'adjust' | 'min'; groupId: string } | null>(
    initialUseGroupId ? { type: 'use', groupId: initialUseGroupId } : null);
  const [qty, setQty] = useState(initialUseGroupId ? '1' : '');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState(false);
  // 그룹 간 이동 — 일반 수량 조정과 헷갈리지 않도록 별도 화면
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const isMedicine = ['oral', 'topical'].includes(getItemUsage(view));
  // 그룹별 유효기간(관리자) · 세부 위치(누구나)
  const [meta, setMeta] = useState<{ groupId: string; kind: 'location' | 'expiry'; value: string } | null>(null);
  const [restockExpiry, setRestockExpiry] = useState('');
  const saveMeta = async () => {
    if (!meta || busy) return;
    setBusy(true);
    try {
      await setStockMeta(db, campCode, view.id, meta.groupId, meta.kind === 'expiry' ? { expiry: meta.value || null } : { location: meta.value || null });
      setMeta(null);
    } catch (e) { console.error(e); alert(L('profile.couldNotSave')); }
    finally { setBusy(false); }
  };
  const [showAllMoves, setShowAllMoves] = useState(false);

  const group = groups.find(g => g.id === mode?.groupId);
  const current = mode ? getGroupStock(view, mode.groupId) : 0;
  /** 바로 사용할 교무실 — 내 교무실 → 재고가 있는 첫 곳 */
  const useGroupId = (defaultGroupId && defaultGroupId in view.stocks) ? defaultGroupId
    : groups.find(g => getGroupStock(view, g.id) > 0)?.id;

  const submit = async () => {
    if (!mode || !group || busy) return;
    const n = parseInt(qty, 10);
    if (isNaN(n) || n < 0) return;
    setBusy(true);
    try {
      const base = { itemId: view.id, itemName: view.name, groupId: group.id, groupName: group.name };
      if (mode.type === 'use') {
        if (n <= 0) return;
        await recordStockUse(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, { uid: userId, name: userName });
        notifySupply({ type: 'stock_low', campCode, itemId: view.id, groupId: group.id });
      } else if (mode.type === 'restock') {
        if (n <= 0) return;
        if (perm.canManageStock) {
          await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
          if (restockExpiry) await setStockMeta(db, campCode, view.id, group.id, { expiry: restockExpiry });
        } else {
          // 부매니저: 서버가 "내 그룹"인지 확인하고 기록한다
          await authenticatedPost('/api/inventory/stock-op', {
            op: 'restock', campCode, itemId: view.id, groupId: group.id, quantity: n,
            expiry: restockExpiry || undefined, memo: memo.trim() || undefined,
          });
        }
        setRestockExpiry('');
      } else if (mode.type === 'adjust') {
        if (!memo.trim()) { alert(L('inventory.pleaseEnterTheReasonFor')); return; }
        if (perm.canManageStock) {
          await adjustStockTo(db, campCode, { ...base, current, target: n, reason: memo.trim() }, userName);
        } else {
          await authenticatedPost('/api/inventory/stock-op', {
            op: 'adjust', campCode, itemId: view.id, groupId: group.id, target: n, reason: memo.trim(),
          });
        }
      } else {
        await setGroupMinStock(db, campCode, view.id, group.id, qty === '' ? null : n);
      }
      setMode(null); setQty(''); setMemo('');
    } catch (e) {
      console.error('재고 처리 오류:', e);
      alert(e instanceof Error && e.message ? e.message : L('inventory.anErrorOccurredWhileProcessing'));
    } finally {
      setBusy(false);
    }
  };

  return (
    // 데스크톱은 오른쪽 사이드 패널, 모바일은 바텀시트
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center sm:items-stretch sm:justify-end z-50" onClick={onClose}>
      <div className="bg-white w-full sm:w-[560px] lg:w-[680px] sm:max-w-full rounded-t-2xl sm:rounded-none shadow-2xl flex flex-col max-h-[92vh] sm:max-h-none sm:h-full" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[12px] px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[view.category] ?? CATEGORY_STYLE.기타}`}>{dataLabel(view.category)}{view.subCategory ? ` · ${view.subCategory}` : ''}</span>
              {view.kind && <span className="text-[12px] text-gray-500">{view.kind}</span>}
              {view.isActive === false && <span className="text-[11px] px-1 rounded bg-gray-100 text-gray-500">{L('inventory.inactive')}</span>}
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-1">{view.name} {view.spec && <span className="text-sm font-normal text-gray-400">{view.spec}</span>}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-3xl font-extrabold text-emerald-700 leading-none">{view.total}<span className="text-sm text-gray-400 ml-0.5">{dataLabel(view.unit)}</span></p>
              <p className="text-[11px] text-gray-400">{L('inventory.currentTotalStock')}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 사용 방법 · 주의사항 */}
          {(view.description || view.dosageNote) && (
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 px-3 py-2 space-y-0.5">
              {view.dosageNote && <p className="text-[13px] text-emerald-900">📋 {view.dosageNote}</p>}
              {view.description && <p className="text-[13px] text-gray-700">ℹ️ {view.description}</p>}
            </div>
          )}

          {/* 교무실별 수량 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-bold text-gray-700">{L('inventory.quantityByStaffRoom')}</p>
              {perm.canEditItem && <button onClick={() => setEditItem(true)} className="text-[13px] text-emerald-700 hover:underline">{L('inventory.editItem')}</button>}
            </div>
            {groups.length === 0 ? (
              <p className="text-[13px] text-gray-400">{L('inventory.noStaffRoomsInventoryGroups')}</p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{L('inventory.staffRoom2')}</th>
                      <th className="text-right px-2 py-2 font-semibold">{L('inventory.current')}</th>
                      {perm.isStockManager && <th className="text-right px-2 py-2 font-semibold">{L('inventory.min2')}</th>}
                      {perm.isStockManager && <th className="text-left px-2 py-2 font-semibold">{L('inventory.status')}</th>}
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => {
                      const n = getGroupStock(view, g.id);
                      const min = getMinStock(view, g.id);
                      const low = min > 0 && n < min;
                      const isOverride = view.minStocks?.[g.id] != null;
                      return (
                        <tr key={g.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <span className="font-semibold text-gray-800">{g.name}</span>
                            {g.location && <span className="text-gray-400 ml-1">{g.location}</span>}
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <button onClick={() => setMeta({ groupId: g.id, kind: 'location', value: view.locations[g.id] ?? '' })}
                                className={`text-[12px] ${view.locations[g.id] ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>📍 {view.locations[g.id] || L('inventory.addLocation')}</button>
                              {(() => {
                                const ex = view.expiries[g.id]; const st = expiryState(ex);
                                if (!ex) return perm.canManageStock ? <button onClick={() => setMeta({ groupId: g.id, kind: 'expiry', value: '' })} className="text-[12px] text-gray-300 hover:text-gray-500">{L('inventory.expiry2')}</button> : null;
                                return <button disabled={!perm.canManageStock} onClick={() => setMeta({ groupId: g.id, kind: 'expiry', value: ex })}
                                  className={`text-[12px] px-1 rounded ${st === 'expired' ? 'bg-red-100 text-red-700 font-bold' : st === 'soon' ? 'bg-amber-100 text-amber-800 font-bold' : 'text-gray-500'}`}>⏳ {fmtExpiry(ex)}{st === 'expired' ? L('inventory.past') : st === 'soon' ? L('inventory.soon') : ''}</button>;
                              })()}
                            </div>
                          </td>
                          <td className={`text-right px-2 py-2 font-bold ${low && perm.isStockManager ? 'text-red-600' : 'text-gray-800'}`}>{n}</td>
                          {perm.isStockManager && <td className="text-right px-2 py-2 text-gray-500">{min}{isOverride && <span className="text-[11px] text-amber-600 ml-0.5">*</span>}</td>}
                          {perm.isStockManager && (
                            <td className="px-2 py-2">
                              {low ? <span className="text-[12px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{L('inventory.low2')}{min - n})</span>
                                : <span className="text-[12px] text-gray-400">{L('data.feverNormal')}</span>}
                            </td>
                          )}
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {g.id in view.stocks && (
                              <button onClick={() => { setMode({ type: 'use', groupId: g.id }); setQty('1'); setMemo(''); }} className="text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-2 py-1 mr-2">{L('inventory.use4')}</button>
                            )}
                            {managedGroupIds.has(g.id) && (
                              <>
                                <button onClick={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }} className="text-[12px] font-semibold text-emerald-700 hover:underline mr-2">{L('inventory.restock6')}</button>
                                <button onClick={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }} className="text-[12px] text-gray-500 hover:underline mr-2">{L('inventory.adjust')}</button>
                                <button onClick={() => { setMode(null); setTransferFrom(g.id); }} title={L('inventory.exchangeWithOtherGroups')} className="text-[12px] font-semibold text-indigo-600 hover:underline mr-2">{L('inventory.move2')}</button>
                                {perm.canManageStock && (
                                  <button onClick={() => { setMode({ type: 'min', groupId: g.id }); setQty(isOverride ? String(view.minStocks[g.id]) : ''); setMemo(''); }} className="text-[12px] text-gray-500 hover:underline">{L('inventory.min2')}</button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {perm.isSubManager && managedGroupIds.size > 0 && <p className="text-[12px] text-gray-400 mt-1">{L('inventory.forYourGroupSStock')} <b>{L('inventory.restockAdjustMove')}</b>{L('inventory.moveAlsoWorksForTaking')}</p>}
            {perm.canManageStock && <p className="text-[12px] text-gray-400 mt-1">{L('inventory.defaultMinimumQuantity')} {view.minStockDefault ?? 0}{dataLabel(view.unit)} {L('inventory.changeInEditItemMeans')} <b>{L('inventory.adjust')}</b>{L('inventory.changesOnlyThisStaffRoom')} <b>{L('inventory.move2')}</b>{L('inventory.movesItToAnotherStaff')}</p>}
          </div>

          {/* 세부 위치 · 유효기간 */}
          {meta && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-sm font-bold text-gray-800">{meta.kind === 'location' ? L('inventory.exactLocation') : L('inventory.expiry2')} · {groups.find(g => g.id === meta.groupId)?.name}</p>
              {meta.kind === 'location' ? (
                <input value={meta.value} onChange={e => setMeta({ ...meta, value: e.target.value })} autoFocus placeholder={L('inventory.eGMedicineBoxSlot')}
                  className="w-full text-base border border-gray-200 rounded-lg px-2.5 py-2 outline-none bg-white" />
              ) : (
                <div className="flex items-center gap-2">
                  <input type="date" value={meta.value} onChange={e => setMeta({ ...meta, value: e.target.value })} className="text-base border border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
                  <span className="text-[12px] text-gray-400">{L('inventory.ifSeveralTheEarliestDate')}</span>
                </div>
              )}
              <div className="flex gap-2">
                {meta.value && <button onClick={() => setMeta({ ...meta, value: '' })} className="px-3 py-2 text-sm text-red-500 bg-white border border-red-200 rounded-lg">{L('inventory.clear')}</button>}
                <button onClick={() => setMeta(null)} className="flex-1 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg">{L('common.cancel')}</button>
                <button onClick={saveMeta} disabled={busy} className="flex-1 py-2 text-sm font-bold text-white bg-gray-800 rounded-lg disabled:opacity-50">{L('common.save')}</button>
              </div>
            </div>
          )}

          {/* 사용 / 입고 / 조정 / 최소 폼 */}
          {mode && group && (
            <div className={`rounded-xl border p-3 space-y-2 ${mode.type === 'use' ? 'border-blue-200 bg-blue-50' : mode.type === 'restock' ? 'border-emerald-200 bg-emerald-50' : mode.type === 'adjust' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className="text-sm font-bold text-gray-800">
                {mode.type === 'use' ? L('inventory.use3') : mode.type === 'restock' ? L('inventory.restock5') : mode.type === 'adjust' ? L('inventory.adjustThisStaffRoomOnly') : L('inventory.minimumQuantity')} · {group.name}
                <span className="font-normal text-gray-500 ml-1">{L('inventory.current')} {current}{dataLabel(view.unit)}</span>
              </p>
              <div className="flex gap-2 items-center">
                <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} autoFocus
                  placeholder={mode.type === 'restock' ? L('inventory.restockQuantity') : mode.type === 'adjust' ? L('inventory.quantityAfterAdjustment') : L('inventory.leaveBlankForDefault', { v0: view.minStockDefault ?? 0 })}
                  className="w-32 text-base border border-gray-200 rounded-lg px-2.5 py-2 outline-none bg-white" />
                <span className="text-sm text-gray-500">{dataLabel(view.unit)}</span>
                {mode.type === 'restock' && qty && <span className="text-[13px] text-emerald-700">→ {current + (parseInt(qty, 10) || 0)}{dataLabel(view.unit)}</span>}
                {mode.type === 'use' && qty && <span className="text-[13px] text-blue-700">→ {current - (parseInt(qty, 10) || 0)}{dataLabel(view.unit)} {L('inventory.left')}</span>}
                {mode.type === 'restock' && (
                  <label className="ml-auto flex items-center gap-1 text-[12px] text-gray-500">{L('inventory.expiry')}
                    <input type="date" value={restockExpiry} onChange={e => setRestockExpiry(e.target.value)} className="text-[13px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
                  </label>
                )}
                {mode.type === 'adjust' && qty && <span className="text-[13px] text-amber-700">{L('inventory.difference')} {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</span>}
              </div>
              {mode.type !== 'min' && (
                <>
                {mode.type === 'use' && isMedicine && (
                  <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">{L('inventory.medicineGivenOrAppliedTo')} <b>{L('inventory.patientTab')}</b>{L('inventory.isDeductedAutomaticallyWhenYou')}</p>
                )}
                {mode.type === 'use' && (
                  <div className="flex flex-wrap gap-1">
                    {USE_REASONS.map(r => (
                      <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
                        className={`px-2 py-0.5 rounded-full text-[12px] font-semibold border ${memo === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{dataLabel(r)}</button>
                    ))}
                  </div>
                )}
                {mode.type === 'adjust' && (
                  <div className="flex flex-wrap gap-1">
                    {ADJUST_REASONS.map(r => (
                      <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
                        className={`px-2 py-0.5 rounded-full text-[12px] font-semibold border ${memo === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>{dataLabel(r)}</button>
                    ))}
                  </div>
                )}
                <input value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder={mode.type === 'use' ? L('inventory.whatWasItUsedFor') : mode.type === 'restock' ? L('inventory.noteOptionalEGBought2') : L('inventory.pickAboveOrTypeIt')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 outline-none bg-white" />
                </>
              )}
              <div className="flex gap-2">
                <button onClick={() => setMode(null)} className="flex-1 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg">{L('common.cancel')}</button>
                <button onClick={submit} disabled={busy}
                  className="flex-1 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">{busy ? L('inventory.processing') : L('common.save')}</button>
              </div>
            </div>
          )}

          {/* 변동 내역 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1.5">{L('inventory.changeHistory')} <span className="text-gray-400 font-normal">({movements.length}{L('inventory.entries')}</span></p>
            {movements.length === 0 ? (
              <p className="text-[13px] text-gray-400">{L('inventory.noChangesInThisCamp')}</p>
            ) : (
              <div className="space-y-1">
                {(showAllMoves ? movements : movements.slice(0, 4)).map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-[13px] bg-gray-50 rounded-lg px-2.5 py-2">
                    <span className="text-gray-400 w-20 shrink-0">{fmtDateTime(m.at)}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-700">
                      <b className="text-gray-800">{movementLabel(m)}</b>
                      <span className="text-gray-400"> · {m.groupName}</span>
                      {m.memo && <span className="text-gray-500"> · {m.memo}</span>}
                    </span>
                    <span className="text-gray-400 shrink-0">{m.by}</span>
                    <span className={`font-bold shrink-0 w-10 text-right ${m.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                  </div>
                ))}
                {movements.length > 4 && (
                  <button onClick={() => setShowAllMoves(v => !v)} className="w-full py-1 text-[13px] font-semibold text-gray-500 hover:text-gray-800">
                    {showAllMoves ? L('inventory.collapse2') : L('inventory.showEarlierEntries', { v0: movements.length - 4 })}
                  </button>
                )}
              </div>
            )}
          </div>

          <ItemMediaSection item={view} canEdit={perm.canEditItemMedia} userName={userName} />
        </div>

        {/* 사용하기 · 필요한 물품 요청 — 누구나 */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => { if (useGroupId) { setMode({ type: 'use', groupId: useGroupId }); setQty('1'); setMemo(''); } }}
            disabled={!useGroupId}
            className="flex-1 py-3 text-base font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:bg-gray-200 disabled:text-gray-400">
            {L('inventory.use2')}
          </button>
          <button onClick={() => onRequest(view, defaultGroupId)}
            className="flex-1 py-3 text-base font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl">
            {L('inventory.requestNeededItems3')}
          </button>
        </div>
      </div>

      {transferFrom && (
        <StockTransferModal view={view} groups={groups} campCode={campCode} fromGroupId={transferFrom}
          managedGroupIds={perm.canManageStock ? null : managedGroupIds}
          userId={userId} userName={userName} onClose={() => setTransferFrom(null)} />
      )}

      {editItem && (
        <ItemFormModal item={view} groups={groups} perm={perm} userName={userName} onClose={() => setEditItem(false)} />
      )}
    </div>
  );
}

// ==================== 🔁 그룹(교무실) 간 재고 이동 ====================
// 보내는 그룹 −, 받는 그룹 + 가 하나의 트랜잭션으로 처리되어 전체 재고 합계는 변하지 않는다.

function StockTransferModal({ view, groups, campCode, fromGroupId, managedGroupIds, userId, userName, onClose }: {
  view: InventoryItemView;
  groups: InventoryGroup[];
  campCode: string;
  fromGroupId: string;
  /** 부매니저: 내 그룹 — 보내거나 받는 쪽 중 하나가 여기 있어야 한다. 관리자는 null(제한 없음) */
  managedGroupIds?: Set<string> | null;
  userId: string;
  userName: string;
  onClose: () => void;
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
        const res = await authenticatedPost<{ from: number; to: number }>('/api/inventory/stock-op', {
          op: 'transfer', campCode, itemId: view.id, fromGroupId: fromGroup.id, toGroupId: toGroup.id,
          quantity: n, memo: memo.trim() || undefined,
        });
        setDone(res);
      }
    } catch (e) {
      console.error('그룹 간 이동 오류:', e);
      alert(e instanceof Error ? e.message : L('inventory.couldNotMove'));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5"><FiRepeat className="w-4 h-4 text-indigo-600" />{L('inventory.moveToAnotherStaffRoom')}</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">{L('inventory.itSDeductedFromThe')}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 물품 */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
            {itemThumb(view)
              ? <img src={itemThumb(view)} alt="" className="w-11 h-11 rounded-lg object-cover bg-gray-100 shrink-0" />
              : <span className="w-11 h-11 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300"><FiBox /></span>}
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{view.name}</p>
              <p className="text-[13px] text-gray-400 truncate">{[view.kind, view.spec].filter(Boolean).join(' · ') || dataLabel(view.category)}</p>
            </div>
            <span className="ml-auto text-right shrink-0">
              <span className="block text-lg font-extrabold text-emerald-700 leading-none">{view.total}{dataLabel(view.unit)}</span>
              <span className="block text-[11px] text-gray-400">{L('common.all')}</span>
            </span>
          </div>

          {done ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-1">
              <p className="text-base font-bold text-emerald-800">{L('inventory.moved')}</p>
              <p className="text-[14px] text-gray-700">{fromGroup?.name} <b>{done.from}{dataLabel(view.unit)}</b> · {toGroup?.name} <b>{done.to}{dataLabel(view.unit)}</b></p>
              <p className="text-[13px] text-gray-500">{L('inventory.recordedInBothStockLogs')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <div>
                  <p className="text-[13px] font-bold text-gray-600 mb-1">{L('inventory.fromStaffRoom')}</p>
                  <select value={from} onChange={e => setFrom(e.target.value)} className="w-full text-base border border-gray-200 rounded-lg px-2 py-2 bg-white outline-none">
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <p className="text-[13px] text-gray-500 mt-1">{L('inventory.onHand')} <b className="text-gray-800">{fromCur}{dataLabel(view.unit)}</b></p>
                </div>
                <div className="pb-7 text-gray-300 text-xl">→</div>
                <div>
                  <p className="text-[13px] font-bold text-gray-600 mb-1">{L('inventory.toStaffRoom')}</p>
                  <select value={to} onChange={e => setTo(e.target.value)} className="w-full text-base border border-gray-200 rounded-lg px-2 py-2 bg-white outline-none">
                    {others.length === 0 && <option value="">{L('inventory.nowhereToMoveTo')}</option>}
                    {others.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <p className="text-[13px] text-gray-500 mt-1">{L('inventory.onHand')} <b className="text-gray-800">{toCur}{dataLabel(view.unit)}</b>{!(to in view.stocks) && to ? L('inventory.new') : ''}</p>
                </div>
              </div>

              <div>
                <p className="text-[13px] font-bold text-gray-600 mb-1">{L('inventory.quantityToMove')}</p>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={fromCur} value={qty} onChange={e => setQty(e.target.value)} autoFocus
                    className="w-28 text-base border border-gray-200 rounded-lg px-2.5 py-2 outline-none bg-white" />
                  <span className="text-sm text-gray-500">{dataLabel(view.unit)}</span>
                  <div className="flex gap-1 ml-auto">
                    {[1, 5, 10].filter(x => x <= fromCur).map(x => (
                      <button key={x} type="button" onClick={() => setQty(String(x))} className="px-2 py-1 text-[13px] border border-gray-200 rounded-md text-gray-600 hover:border-indigo-300">{x}</button>
                    ))}
                    {fromCur > 0 && <button type="button" onClick={() => setQty(String(fromCur))} className="px-2 py-1 text-[13px] border border-gray-200 rounded-md text-gray-600 hover:border-indigo-300">{L('inventory.all')}</button>}
                  </div>
                </div>
                {n > fromCur && <p className="text-[13px] text-red-600 mt-1">{L('inventory.youCanTSendMore')}{fromCur}{dataLabel(view.unit)}{L('inventory.text4')}</p>}
                {!invalid && (
                  <p className="text-[13px] text-gray-600 mt-1.5 bg-gray-50 rounded-lg px-2 py-2">
                    {fromGroup?.name} {fromCur} → <b className="text-red-600">{fromCur - n}</b> · {toGroup?.name} {toCur} → <b className="text-emerald-700">{toCur + n}</b>
                    <span className="text-gray-400"> {L('patient.total2')} {view.total} {L('inventory.unchanged')}</span>
                  </p>
                )}
              </div>

              <div>
                <p className="text-[13px] font-bold text-gray-600 mb-1">{L('inventory.reasonForMove')} <span className="font-normal text-gray-400">{L('patient.optional')}</span></p>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {TRANSFER_REASONS.map(r => (
                    <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
                      className={`px-2 py-0.5 rounded-full text-[12px] font-semibold border ${memo === r ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>{dataLabel(r)}</button>
                  ))}
                </div>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={L('inventory.youCanAlsoTypeIt')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 outline-none bg-white" />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-base text-gray-600 bg-gray-100 rounded-xl">{done ? L('common.close') : L('common.cancel')}</button>
          {!done && (
            <button onClick={submit} disabled={invalid || busy}
              className="flex-1 py-2.5 text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-40">{busy ? L('inventory.moving') : L('inventory.move')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 📝 재고 요청 (멘토 구매 요청 · 모두 공유) ====================

const SUPPLY_STATUS_STYLE: Record<SupplyRequestStatus, string> = {
  requested: 'bg-blue-100 text-blue-700',
  onhold: 'bg-amber-100 text-amber-800',
  purchased: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-gray-100 text-gray-500',
};
/** 진행 상태 배지 (대기 → 승인 → 구매 중 → 입고 완료) */
const PROGRESS_STYLE: Record<string, string> = {
  waiting: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  buying: 'bg-indigo-100 text-indigo-700',
  bought: 'bg-emerald-100 text-emerald-700',
  received: 'bg-emerald-100 text-emerald-700',
  onhold: 'bg-amber-100 text-amber-800',
  rejected: 'bg-gray-100 text-gray-500',
};
const FOR_ICON: Record<SupplyForType, string> = { student: '👧', mentor: '🧑‍🏫', camp: '🏕' };
const PAYTO_KEY = 'smis.supply.payTo';

function addDaysStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
type SupplyBuyer = ReturnType<typeof supplyBuyerOf>;
const settleVerb = (kind: SupplyLineSettleKind) => SUPPLY_SETTLE_LABELS[kind].verb;
/** 관리자 지정 품목(쿠팡·학부모 청구) 표시 */
function GuideTag({ line }: { line: Pick<SupplyRequestLine, 'channel' | 'parentBill'> }) {
  if (!line.channel && !line.parentBill) return null;
  return <span className="ml-1 inline-block text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-800 font-bold align-middle">{[line.channel, line.parentBill ? L('data.settleParent') : ''].filter(Boolean).join(' · ')}</span>;
}
function SectionHeader({ label, count }: { label: string; count: number }) {
  return <p className="px-1 pt-1 text-[11px] font-bold text-gray-500">{label === '캠프 공용' ? '🏕 ' : '👥 '}{label} <span className="font-normal text-gray-400">{count}</span></p>;
}

function readPayTo(): string { try { return localStorage.getItem(PAYTO_KEY) ?? ''; } catch { return ''; } }
function savePayTo(v: string) { try { localStorage.setItem(PAYTO_KEY, v); } catch { /* noop */ } }

type SupplyEditing = { mode: 'new'; prefill?: SupplyRequest } | { mode: 'edit'; req: SupplyRequest };
type SupplyAssigning = { mode: 'default' } | { mode: 'reqs'; reqs: SupplyRequest[] };

function SupplyRequestTab({ campCode, jobCodeId, requests, settings, guides, campGroups, items, views, groups, needs, students, isAdmin, userId, userName, userGroup, prefill, onPrefillDone }: {
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
  const [filter, setFilter] = useState<'open' | 'buy' | 'settle' | 'mine' | 'done'>('open');
  const [editing, setEditing] = useState<SupplyEditing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!prefill) return;
    setEditing({ mode: 'new', prefill: prefill.req });
    onPrefillDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);
  const [assigning, setAssigning] = useState<SupplyAssigning | null>(null);
  const [completing, setCompleting] = useState<{ reqId: string; lineIds: string[] } | null>(null);
  const opened = requests.find(r => r.id === openId) ?? null;
  const completingReq = completing ? requests.find(r => r.id === completing.reqId) ?? null : null;

  const buyerOf = (r: SupplyRequest) => supplyBuyerOf(r, settings);
  const canBuy = (r: SupplyRequest) => isAdmin || buyerOf(r)?.uid === userId;
  const mentorOf = (r: SupplyRequest) => (r.classMentor || students.find(s => s.studentId === r.studentId)?.classMentor || '').trim();
  const isMe = (name: string) => !!name && name.trim() === userName.trim();
  /** 정산 책임자: 학생 → 담임, 선생님 → 요청한 본인 */
  const settlerIsMe = (r: SupplyRequest) => (r.forType === 'student' ? isMe(mentorOf(r)) : r.requesterId === userId);

  const open = useMemo(() => requests.filter(r => isSupplyOpen(r.status)), [requests]);
  const mine = useMemo(() => requests.filter(r => r.requesterId === userId), [requests, userId]);
  // 내가 사 올 것 (관리자 포함, 담당이 나인 것만)
  const myBuys = useMemo(() => open.filter(r => r.status === 'requested' && supplyBuyerOf(r, settings)?.uid === userId && !supplyAllDone(r)), [open, settings, userId]);
  const myBuyLineCount = myBuys.reduce((a, r) => a + r.items.length - supplyDoneCount(r), 0);
  const shopping = useMemo(() => supplyShoppingList(myBuys), [myBuys]);
  // 여러 요청에 걸쳐 같은 물품이 있으면 묶어서 (규격·단위가 다르면 따로 합산된다)
  const duplicated = useMemo(() => supplyShoppingList(open).filter(l => l.who.length >= 2), [open]);
  const [showDup, setShowDup] = useState(true);
  // 정산
  const settleAll = useMemo(() => supplySettleLines(requests), [requests]);
  /** 이 줄을 내가 정산하는가 — 학부모 청구는 관리자 */
  const settlesLine = (s: SupplySettleLine) => (s.kind === 'parent' ? isAdmin : settlerIsMe(s.req) || isAdmin);
  const settleVisible = settleAll.filter(s => isAdmin || (s.kind !== 'parent' && settlerIsMe(s.req)) || s.done.byId === userId);
  const mySettleTodo = settleVisible.filter(s => !s.settled && (s.kind === 'parent' ? false : settlerIsMe(s.req)));
  const settleBadge = isAdmin ? settleVisible.filter(s => !s.settled).length : mySettleTodo.length;
  const settleByReq = useMemo(() => {
    const m = new Map<string, SupplySettleLine[]>();
    settleVisible.forEach(s => { const k = `${s.req.id}|${s.kind}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); });
    return [...m.values()].sort((a, b) => Number(a.every(s => s.settled)) - Number(b.every(s => s.settled)));
  }, [settleVisible]);
  const list = filter === 'open' ? open : filter === 'mine' ? mine : requests.filter(r => !isSupplyOpen(r.status));

  // 관리자: 재고 부족분 / 입고 대기
  const shortage = useMemo(() => uncoveredPurchaseNeeds(needs, requests), [needs, requests]);
  const intakeWaiting = useMemo(() => requests.filter(needsStockIntake), [requests]);
  const [showNeeds, setShowNeeds] = useState(false);
  const [posting, setPosting] = useState(false);
  const postNeeds = async () => {
    if (posting || shortage.length === 0) return;
    setPosting(true);
    try { await addCampRequestsFromNeeds(db, campCode, shortage, items, { uid: userId, name: userName }); }
    catch (e) { console.error(e); alert(L('inventory.couldNotCreateTheRequest')); }
    finally { setPosting(false); }
  };
  const [copied, setCopied] = useState(false);
  const copyShopping = async () => {
    const text = L('inventory.shoppingList2', { v0: shopping.map(l => `• ${l.name} ${l.total}${dataLabel(l.unit)}  (${l.who.join(', ')})`).join('\n') });
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };
  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.error(e); alert(L('inventory.couldNotProcessPleaseCheck')); } };
  const defaultBuyer = settings?.defaultBuyerId ? settings.defaultBuyerName : '';

  return (
    <div className="px-4 py-3 space-y-3">
      <button onClick={() => setEditing({ mode: 'new' })} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        <FiPlus className="w-4 h-4" />{L('inventory.requestNeededItems2')}
      </button>
      {isAdmin && <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${defaultBuyer ? 'bg-emerald-50' : 'bg-red-50 border border-red-200'}`}>
        <span className="flex-1 text-[12px] text-gray-700">{L('inventory.defaultBuyer2')} <b className="text-gray-900">{defaultBuyer || L('data.unspecified')}</b>
          <span className="text-[10px] text-gray-400 ml-1">{defaultBuyer ? L('inventory.buysEveryRequestWithoutA') : isAdmin ? L('inventory.onceSetYouDonT') : L('inventory.setByAnAdmin')}</span></span>
        <button onClick={() => setAssigning({ mode: 'default' })} className="shrink-0 px-2 py-1 text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded-lg">{defaultBuyer ? L('patient.change') : L('inventory.assign')}</button>
      </div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          ['open', L('inventory.inProgress', { v0: open.length }), true],
          ['buy', L('inventory.myPurchases', { v0: myBuyLineCount }), myBuys.length > 0],
          ['settle', L('inventory.settle2', { v0: settleBadge }), settleVisible.length > 0],
          ['mine', L('inventory.myRequests', { v0: mine.length }), true],
          ['done', L('inventory.doneRejected'), true],
        ] as const).filter(([, , show]) => show).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${filter === id ? 'bg-gray-800 text-white' : id === 'settle' && settleBadge ? 'bg-yellow-100 text-yellow-800' : id === 'buy' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
        ))}
      </div>

      {filter === 'open' && (myBuys.length > 0 || mySettleTodo.length > 0) && (
        <div className="flex gap-2">
          {myBuys.length > 0 && <button onClick={() => setFilter('buy')} className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[12px] font-bold text-emerald-800">{L('inventory.toBuy3')} {myBuyLineCount}{L('inventory.items2')}</button>}
          {mySettleTodo.length > 0 && <button onClick={() => setFilter('settle')} className="flex-1 rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-left text-[12px] font-bold text-yellow-900">{L('inventory.toSettle')} {mySettleTodo.length}{L('inventory.items')}</button>}
        </div>
      )}
      {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
          <p className="text-[12px] font-bold text-amber-900">{L('inventory.boughtNotYetRestocked')} {intakeWaiting.length}{L('home.text')}</p>
          {intakeWaiting.map(r => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left text-[11px] text-amber-900 hover:underline truncate">
              🏕 {r.items.map(l => `${l.name} ${l.quantity}${dataLabel(l.unit)}`).join(', ')} <span className="text-amber-700">{L('inventory.restock4')}</span>
            </button>
          ))}
        </div>
      )}
      {isAdmin && filter === 'open' && shortage.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[12px] font-bold text-red-800">{L('inventory.belowMinimum')} {shortage.length}{L('home.text')} <span className="font-normal text-red-600">{L('inventory.notRequestedYet')}</span></p>
            <button onClick={() => setShowNeeds(v => !v)} className="px-2 py-1 text-[11px] text-red-700 bg-white border border-red-200 rounded-lg">{showNeeds ? L('inventory.collapse') : L('inventory.viewList')}</button>
            <button onClick={postNeeds} disabled={posting} className="px-2 py-1 text-[11px] font-bold text-white bg-red-500 rounded-lg disabled:opacity-40">{posting ? L('inventory.uploading') : L('inventory.addAsRequest')}</button>
          </div>
          {showNeeds && shortage.map(n => (
            <p key={`${n.itemId}|${n.groupId}`} className="text-[11px] text-gray-700"><b>{n.itemName}</b> · {n.groupName} {L('inventory.current')} {n.current}{L('inventory.min3')} {n.min} → <b className="text-red-600">{n.shortage}{dataLabel(n.unit)}</b></p>
          ))}
        </div>
      )}

      {filter === 'buy' ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <p className="flex-1 text-sm font-bold text-gray-900">{L('inventory.shoppingList')} <span className="text-[11px] font-normal text-amber-800">{shopping.length}{L('push.itemDefault')}</span></p>
              <button onClick={copyShopping} className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg"><FiCopy className="inline w-3 h-3 mr-0.5" />{copied ? L('inventory.copied') : L('task.copy2')}</button>
            </div>
            {shopping.map(l => (
              <div key={l.key} className="flex items-center gap-2 px-3 py-1.5 border-t border-amber-100 bg-white text-[12px]">
                <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 truncate">{l.name}</p><p className="text-[10px] text-gray-500 truncate">{l.who.join(' · ')}</p></div>
                <span className="font-extrabold text-amber-700">{l.total}<span className="text-[10px] text-gray-400 ml-0.5">{dataLabel(l.unit)}</span></span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">{L('inventory.forEachItemYouBought')} <b>{L('task.done')}</b>{L('inventory.andEnterTheAmountStudent')}</p>
          {sectionsOf(myBuys, r => r).map(sec => (
            <div key={sec.key} className="space-y-2">
              <SectionHeader label={sec.label} count={sec.items.length} />
              {sec.items.map(r => (
                <SupplyLinesCard key={r.id} req={r} canBuy onOpen={() => setOpenId(r.id)}
                  onComplete={ids => setCompleting({ reqId: r.id, lineIds: ids })} onUndo={id => run(() => undoSupplyLine(db, r.id, id))} />
              ))}
            </div>
          ))}
        </div>
      ) : filter === 'settle' ? (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">{L('inventory.studentItems')} <b>{L('inventory.theHomeroomMentorTakesIt')}</b>{L('inventory.teacherItems')} <b>{L('inventory.theTeacherTransfersIt')}</b>{L('inventory.toTheBuyerThenTap')}</p>
          {sectionsOf(settleByReq, g => g[0].req).map(sec => (
          <div key={sec.key} className="space-y-2">
          <SectionHeader label={sec.label} count={sec.items.length} />
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
              <div key={`${r.id}|${kind}`} className={`rounded-xl border px-3 py-2 space-y-1.5 ${pendingIds.length ? (kind === 'parent' ? 'border-orange-300 bg-orange-50' : 'border-yellow-300 bg-yellow-50') : 'border-gray-200 bg-white'}`}>
                <button onClick={() => setOpenId(r.id)} className="w-full text-left">
                  <p className="text-[13px] font-bold text-gray-900">{FOR_ICON[r.forType]} {supplyForLabel(r)}
                    <span className="ml-1 text-[11px] font-normal text-gray-500">{kind === 'envelope' ? L('inventory.homeroomAllowanceEnvelope', { v0: mentorOf(r) || L('common.unconfirmed') }) : kind === 'transfer' ? L('inventory.selfTransfer') : L('inventory.billParentsAdmin')}</span></p>
                </button>
                {group.map(s => (
                  <div key={s.line.id} className="flex items-center gap-2 text-[12px]">
                    <span className={`flex-1 min-w-0 truncate ${s.settled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{s.line.name} {s.line.quantity}{dataLabel(s.line.unit)} · <b>{fmtWon(s.done.amount)}</b> → {s.done.by}</span>
                    {s.settled ? (
                      <span className="text-[10px] text-emerald-700 shrink-0">✓ {s.settled.by}{(isAdmin || s.settled.byId === userId) && <button onClick={() => run(() => settleSupplyLines(db, r.id, [s.line.id], null))} className="ml-1 text-gray-400 hover:underline">{L('common.cancel')}</button>}</span>
                    ) : mineToSettle ? (
                      <button onClick={() => run(async () => { await settleSupplyLines(db, r.id, [s.line.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [s.line.id] }); })} className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-yellow-900 bg-white border border-yellow-400 rounded">{L('task.done')}</button>
                    ) : <span className="text-[10px] text-yellow-800 shrink-0">{L('inventory.pending2')}</span>}
                  </div>
                ))}
                {[...byPayee.entries()].map(([payee, v]) => (
                  <p key={payee} className="text-[11px] text-yellow-900 bg-white/70 rounded-lg px-2 py-1">
                    {SUPPLY_SETTLE_LABELS[kind].icon} {kind === 'parent' ? <>{L('inventory.billParents4')} <b>{fmtWon(v.amount)}</b> {L('inventory.text3')} <b>{payee}</b>{L('inventory.paidTo')}</> : <><b>{payee}</b>{L('inventory.to')} <b>{fmtWon(v.amount)}</b> {settleVerb(kind)}</>}{kind === 'transfer' && v.payTo ? <> · <span className="select-all font-semibold">{v.payTo}</span></> : null}
                  </p>
                ))}
                {mineToSettle && pendingIds.length > 1 && (
                  <button onClick={() => { if (confirm(L('inventory.markAllItemsAsDone', { v0: pendingIds.length, v1: settleVerb(kind) }))) run(async () => { await settleSupplyLines(db, r.id, pendingIds, { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: pendingIds }); }); }}
                    className="w-full py-1.5 text-[11px] font-bold text-white bg-yellow-500 rounded-lg">{kind === 'envelope' ? L('inventory.envelopeRecordCashHandover') : kind === 'transfer' ? L('inventory.transfer') : L('inventory.billParents3')} {L('inventory.markAllDone')}</button>
                )}
              </div>
            );
          })}
          </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiClipboard className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{filter === 'mine' ? L('inventory.youHavenTMadeAny') : filter === 'open' ? L('inventory.noRequestsInProgress') : L('inventory.noCompletedRequests')}</p>
        </div>
      ) : (
        <>
          {filter === 'open' && duplicated.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 overflow-hidden">
              <button onClick={() => setShowDup(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <span className="flex-1 text-[12px] font-bold text-indigo-900">{L('inventory.itemsRequestedBySeveralTeachers')} <span className="font-normal text-indigo-700/70">{duplicated.length}{L('inventory.kinds')}</span></span>
                <span className="text-indigo-400 text-[11px]">{showDup ? '▲' : '▼'}</span>
              </button>
              {showDup && (
                <div className="bg-white/70 divide-y divide-indigo-100">
                  {duplicated.map(l => (
                    <div key={l.key} className="px-3 py-1.5">
                      <p className="text-[12px]">
                        <b className="text-gray-900">{l.name}</b>
                        <span className="font-extrabold text-indigo-700 ml-1.5">{l.total}{dataLabel(l.unit)}</span>
                        <span className="text-gray-400 ml-1">· {l.who.length}{L('home.text')}</span>
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">{l.who.join(' · ')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {filter === 'open' && <p className="text-[10px] text-gray-400">{L('inventory.otherTeachersRequestsAreShown')} <b>{L('inventory.iNeedThisToo2')}</b>{L('inventory.text2')}</p>}
          {sectionsOf(list, r => r).map(sec => (
          <div key={sec.key} className="space-y-1">
          <SectionHeader label={sec.label} count={sec.items.length} />
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {sec.items.map(r => {
              const last = r.comments?.[r.comments.length - 1];
              const status = supplyStatusLine(r, buyerOf(r));
              return (
                <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50">
                  <span className="text-lg leading-none mt-0.5">{FOR_ICON[r.forType]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{supplyForLabel(r)} <span className="text-[11px] font-normal text-gray-400">{r.requesterName} · {fmtDateTime(r.createdAt)}</span></p>
                    <p className="text-[12px] text-gray-700 truncate">{r.items.map(l => `${r.done?.[l.id] ? '✓' : ''}${l.name} ${l.quantity}${dataLabel(l.unit)}${l.groupName ? ` (${l.groupName})` : ''}`).join(', ')}</p>
                    <p className={`text-[10px] truncate ${r.status === 'onhold' ? 'text-amber-700' : r.status === 'requested' ? 'text-emerald-700' : 'text-gray-500'}`}>{status}</p>
                    {last && <p className="text-[10px] text-gray-500 truncate">💬 {r.comments!.length} · <b className={last.admin ? 'text-indigo-700' : ''}>{last.name}</b> {last.text}</p>}
                  </div>
                  {(() => { const pg = supplyProgress(r, !!buyerOf(r)); return (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${PROGRESS_STYLE[pg.key] ?? SUPPLY_STATUS_STYLE[r.status]}`}>{pg.label}</span>
                  ); })()}
                </button>
              );
            })}
          </div>
          </div>
          ))}
        </>
      )}

      {editing && (
        <SupplyRequestFormModal campCode={campCode} existing={editing.mode === 'edit' ? editing.req : undefined} prefill={editing.mode === 'new' ? editing.prefill : undefined}
          groups={groups} guides={guides} items={items} views={views} students={students} userId={userId} userName={userName} userGroup={userGroup} onClose={() => setEditing(null)} />
      )}
      {opened && !editing && !assigning && !completing && (
        <SupplyRequestDetailModal req={opened} buyer={buyerOf(opened)} canBuy={canBuy(opened)} settlerIsMe={settlerIsMe(opened)} campCode={campCode} groups={groups} views={views}
          isAdmin={isAdmin} userId={userId} userName={userName} classMentor={mentorOf(opened)}
          onAssign={() => setAssigning({ mode: 'reqs', reqs: [opened] })} onComplete={ids => setCompleting({ reqId: opened.id, lineIds: ids })}
          onEdit={() => setEditing({ mode: 'edit', req: opened })} onMetoo={() => { setEditing({ mode: 'new', prefill: opened }); setOpenId(null); }} onClose={() => setOpenId(null)} />
      )}
      {assigning && (
        <SupplyBuyerPicker candidates={candidates} title={assigning.mode === 'default' ? L('inventory.defaultBuyer') : L('inventory.buyerForThisRequest')}
          hint={assigning.mode === 'default' ? L('inventory.thisPersonBuysEveryRequest') : L('inventory.someoneElseBuysJustThis')}
          clearLabel={assigning.mode === 'default' ? (settings?.defaultBuyerId ? '기본 담당 해제' : '') : (assigning.reqs.some(r => r.buyerId) ? '기본 담당으로 되돌리기' : '')}
          onClose={() => setAssigning(null)}
          onPick={c => {
            const a = assigning; setAssigning(null);
            const buyer = c ? { uid: c.uid, name: c.name } : null;
            run(async () => {
              if (a.mode === 'default') { await setSupplyDefaultBuyer(db, campCode, buyer, userName); if (buyer) notifySupply({ type: 'default_buyer', campCode }); }
              else { const ids = a.reqs.map(r => r.id); await setSupplyBuyer(db, ids, buyer, userName); if (buyer) notifySupply({ type: 'buyer_assigned', requestIds: ids }); }
            });
          }} />
      )}
      {completing && completingReq && (
        <SupplyLineCompleteModal req={completingReq} lineIds={completing.lineIds} classMentor={mentorOf(completingReq)} userId={userId} userName={userName} onClose={() => setCompleting(null)} />
      )}
    </div>
  );
}

/** 요청 1건의 품목들 — 구매 담당이 품목별 완료 */
function SupplyLinesCard({ req: r, canBuy, onOpen, onComplete, onUndo }: {
  req: SupplyRequest; canBuy: boolean; onOpen: () => void; onComplete: (lineIds: string[]) => void; onUndo: (lineId: string) => void;
}) {
  const undone = r.items.filter(l => !r.done?.[l.id]).map(l => l.id);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={onOpen} className="w-full text-left flex items-center gap-2 px-3 py-2 bg-gray-50">
        <span className="flex-1 min-w-0 text-[13px] font-bold text-gray-900 truncate">{FOR_ICON[r.forType]} {supplyForLabel(r)} <span className="text-[11px] font-normal text-gray-400">{r.requesterName}</span></span>
        <span className="text-[10px] text-gray-500">{supplyDoneCount(r)}/{r.items.length}</span>
      </button>
      {r.note && <p className="px-3 pt-1 text-[11px] text-gray-500">📝 {r.note}</p>}
      {r.items.map(l => {
        const d = r.done?.[l.id];
        return (
          <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-100">
            <div className="flex-1 min-w-0">
              <p className={`text-[12px] truncate ${d ? 'text-gray-400 line-through' : 'font-semibold text-gray-900'}`}>{l.name} {l.quantity}{dataLabel(l.unit)}{l.groupName ? ` → ${l.groupName}` : ''}<GuideTag line={l} /></p>
              {l.memo && !d && <p className="text-[10px] text-gray-500 truncate">{l.memo}</p>}
              {d && <p className="text-[10px] text-emerald-700 truncate">✓ {d.amount ? fmtWon(d.amount) : L('inventory.noAmount')} · {d.by}{d.payTo ? ` · ${d.payTo}` : ''}</p>}
            </div>
            {canBuy && (d
              ? <button onClick={() => onUndo(l.id)} className="text-[10px] text-gray-400 hover:underline shrink-0">{L('common.cancel')}</button>
              : <button onClick={() => onComplete([l.id])} className="shrink-0 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">{L('task.done')}</button>)}
          </div>
        );
      })}
      {canBuy && undone.length > 1 && (
        <button onClick={() => onComplete(undone)} className="w-full py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border-t border-emerald-100">{L('inventory.remaining')} {undone.length}{L('inventory.itemsCompleteAtOnce')}</button>
      )}
    </div>
  );
}

/** 품목 구매 완료 — 금액 + (선생님 물품) 송금받을 곳 */
function SupplyLineCompleteModal({ req: r, lineIds, classMentor, userId, userName, onClose }: {
  req: SupplyRequest; lineIds: string[]; classMentor: string; userId: string; userName: string; onClose: () => void;
}) {
  const lines = r.items.filter(l => lineIds.includes(l.id));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.id, r.done?.[l.id]?.amount ? String(r.done[l.id].amount) : ''])));
  const [payTo, setPayTo] = useState(() => readPayTo());
  const [busy, setBusy] = useState(false);
  const num = (s: string) => parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0;
  const total = lines.reduce((a, l) => a + num(amounts[l.id]), 0);
  const kind = supplySettleKind(r);
  const submit = async () => {
    if (kind && lines.some(l => !num(amounts[l.id])) && !confirm(L('inventory.someItemsHaveNoAmount'))) return;
    if (kind === 'transfer' && lines.some(l => !l.parentBill) && !payTo.trim() && !confirm(L('inventory.theAccountToReceiveThe'))) return;
    setBusy(true);
    try {
      if (kind === 'transfer' && payTo.trim()) savePayTo(payTo.trim());
      await completeSupplyLines(db, r.id, lines.map(l => ({ lineId: l.id, amount: num(amounts[l.id]), payTo: kind === 'transfer' && !l.parentBill ? payTo : undefined })), { uid: userId, name: userName });
      notifySupply({ type: 'lines_done', requestId: r.id, lineIds: lines.map(l => l.id) });
      onClose();
    } catch (e) { console.error(e); alert(L('inventory.couldNotMarkAsDone')); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{L('inventory.purchased')} <span className="text-sm font-normal text-gray-500">{FOR_ICON[r.forType]} {supplyForLabel(r)}</span></h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{kind === 'envelope' ? L('inventory.aSettlementRequestGoesTo2', { v0: classMentor || L('common.unconfirmedParen') }) : kind === 'transfer' ? L('inventory.aSettlementRequestGoesTo', { v0: r.requesterName }) : L('inventory.campSuppliesAnAdminRestocks')}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {lines.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 truncate">{l.name} <span className="font-normal text-gray-500">{l.quantity}{dataLabel(l.unit)}</span><GuideTag line={l} /></span>
              <input inputMode="numeric" value={amounts[l.id]} onChange={e => setAmounts(a => ({ ...a, [l.id]: e.target.value.replace(/[^0-9]/g, '') }))} autoFocus={lines[0].id === l.id}
                placeholder={L('patient.amount')} className={`w-24 text-right text-sm border rounded-lg px-2 py-1 outline-none ${kind && !num(amounts[l.id]) ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`} />
              <span className="text-[11px] text-gray-400">{L('patient.krw')}</span>
            </div>
          ))}
          {lines.some(l => l.parentBill) && <p className="text-[10px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1">{L('inventory.billParentsItemsAreBilled')}</p>}
          {kind === 'transfer' && lines.some(l => !l.parentBill) && (
            <div className="pt-1">
              <p className="text-[11px] font-bold text-gray-700 mb-1">{L('inventory.transferTo')}</p>
              <input value={payTo} onChange={e => setPayTo(e.target.value)} placeholder={L('inventory.eGKakaobank333301')} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400" />
              <p className="text-[10px] text-gray-400 mt-0.5">{L('inventory.savedOnThisDeviceAnd')}</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 space-y-2">
          <p className="text-right text-[12px] text-gray-600">{L('inventory.total')} <b className="text-gray-900">{fmtWon(total)}</b></p>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 text-xs text-gray-600 bg-gray-100 rounded-xl">{L('common.cancel')}</button>
            <button onClick={submit} disabled={busy} className="flex-[2] py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{busy ? L('inventory.processing') : L('inventory.purchaseItems', { v0: lines.length })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 구매 담당 고르기 (관리자) */
function SupplyBuyerPicker({ candidates, title, hint, clearLabel, onPick, onClose }: {
  candidates: SupplyBuyerCandidate[]; title: string; hint: string; clearLabel: string; onPick: (c: SupplyBuyerCandidate | null) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = candidates.filter(c => !q.trim() || c.name.includes(q.trim()) || c.tag.includes(q.trim()));
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">🛒 {title}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder={L('patient.searchName')} className="mt-2 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {list.length === 0 && <p className="px-5 py-6 text-center text-xs text-gray-400">{candidates.length ? L('students.noResults') : L('inventory.loadingCampMembers')}</p>}
          {list.map(c => (
            <button key={c.uid} onClick={() => onPick(c)} className="w-full text-left flex items-center gap-2 px-5 py-2 hover:bg-emerald-50">
              <span className="flex-1 text-sm font-semibold text-gray-900">{c.name}</span>
              {c.tag && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.rank === 0 ? 'bg-indigo-100 text-indigo-700' : c.rank === 1 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{c.tag}</span>}
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          {clearLabel && <button onClick={() => onPick(null)} className="flex-1 py-2 text-xs text-red-500 border border-red-200 rounded-xl">{clearLabel}</button>}
          <button onClick={onClose} className="flex-1 py-2 text-xs text-gray-600 bg-gray-100 rounded-xl">{L('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

function SupplyRequestFormModal({ campCode, existing, prefill, groups, guides, items, views, students, userId, userName, userGroup, onClose }: {
  campCode: string; existing?: SupplyRequest; prefill?: SupplyRequest; groups: InventoryGroup[]; guides: SupplyGuide[]; items: InventoryItem[]; views: InventoryItemView[]; students: STSheetStudent[];
  userId: string; userName: string; userGroup?: string; onClose: () => void;
}) {
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const [forType, setForType] = useState<SupplyForType>(existing?.forType ?? (prefill?.forType === 'camp' ? 'camp' : 'student'));
  const [student, setStudent] = useState<{ id?: string; name: string; cls?: string; mentor?: string; code?: string } | null>(
    existing?.studentName ? { id: existing.studentId, name: existing.studentName, cls: existing.studentClass, mentor: existing.classMentor, code: existing.studentClassCode } : null);
  const [studentQuery, setStudentQuery] = useState('');
  const defaultGroup = groups[0];
  // "나도 필요해요": 같은 물품을 새 줄 ID로 복사 (수량은 1부터)
  const [lines, setLines] = useState<SupplyRequestLine[]>(
    existing?.items ?? (prefill ? prefill.items.map(l => ({ ...l, id: newId(), quantity: 1, memo: undefined })) : []));
  const [q, setQ] = useState('');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const UNITS = ['개', '박스', '통', '팩', '병', '세트'];
  const studentResults = useMemo(() => { const t = studentQuery.trim(); return t ? students.filter(s => s.name.includes(t)).slice(0, 6) : []; }, [students, studentQuery]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter(i => i.isActive !== false && [i.name, i.kind, i.spec, i.ingredient, i.subCategory].some(f => f?.toLowerCase().includes(t))).slice(0, 12) : [];
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
    if (forType === 'student' && !student) { alert(L('inventory.pleaseSelectWhichStudentThe')); return; }
    if (lines.length === 0) { alert(L('inventory.addAtLeastOneItem')); return; }
    setBusy(true);
    try {
      const payload = {
        forType,
        studentId: forType === 'student' ? student?.id : undefined,
        studentName: forType === 'student' ? student?.name : undefined,
        studentClass: forType === 'student' ? student?.cls : undefined,
        classMentor: forType === 'student' ? student?.mentor : undefined,
        studentClassCode: forType === 'student' ? student?.code : undefined,
        // 캠프 공용만 입고 그룹을 가진다
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
    } catch (e) { console.error('구매 요청 저장 오류:', e); alert(L('inventory.couldNotSaveTheRequest')); }
    finally { setBusy(false); }
  };
  const seg = (on: boolean) => `flex-1 py-2 rounded-xl text-xs font-bold border ${on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`;
  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{existing ? L('inventory.editRequest') : prefill ? L('inventory.iNeedThisToo') : L('inventory.requestNeededItems')}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {prefill && <p className="text-[11px] text-gray-500 bg-amber-50 rounded-xl px-3 py-2">{supplyForLabel(prefill)} {L('inventory.addedTheSameItemsAs')}</p>}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1.5">{L('inventory.whoNeedsIt')}</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setForType('student')} className={seg(forType === 'student')}>{L('inventory.student')}</button>
              <button type="button" onClick={() => setForType('mentor')} className={seg(forType === 'mentor')}>{L('inventory.me')}</button>
              <button type="button" onClick={() => setForType('camp')} className={seg(forType === 'camp')}>{L('inventory.campSupplies')}</button>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-500">{forType === 'student' ? L('inventory.theHomeroomMentorSettlesIt') : forType === 'mentor' ? L('inventory.youTransferTheMoneyTo') : L('inventory.itemsUsedAsCampStock')}</p>
            {forType === 'student' && (student ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2">
                <span className="flex-1 text-sm font-bold text-blue-900">{student.name} <span className="font-normal text-blue-500 text-xs">{student.cls}{student.mentor ? L('inventory.homeroom', { v0: student.mentor }) : ''}</span></span>
                <button onClick={() => setStudent(null)} className="text-xs text-gray-500">{L('patient.change')}</button>
              </div>
            ) : (
              <div className="relative mt-2">
                <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder={L('inventory.searchStudentName')} className={inputCls} />
                {studentQuery.trim() && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {studentResults.map(s => (
                      <button key={s.studentId} type="button" onClick={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className, mentor: s.classMentor || undefined, code: studentClassCode(s.classNumber) || undefined }); setStudentQuery(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                        {s.name} <span className="text-[11px] text-gray-400">{s.className}{s.classMentor ? L('inventory.homeroom', { v0: s.classMentor }) : ''}</span>
                      </button>
                    ))}
                    {studentResults.length === 0 && (
                      <button type="button" onClick={() => { setStudent({ name: studentQuery.trim() }); setStudentQuery(''); }} className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">{L('inventory.ifNotOnTheRoster')} <b>"{studentQuery.trim()}"</b>{L('inventory.toEnter')}</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-800">{L('inventory.whatDoYouNeed')} <span className="font-normal text-gray-400">{lines.length}{L('inventory.itemsAddedTheBuyerDecides')}</span></p>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} placeholder={L('inventory.searchItemsEGBandage')} className={`${inputCls} pl-9`} />
              {q.trim() && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-emerald-200 shadow-lg divide-y divide-gray-100 overflow-hidden max-h-80 overflow-y-auto">
                  {guideResults.map(g => (
                    <div key={g.id} className="bg-orange-50">
                      <button type="button" onClick={() => setOpenGuide(v => v === g.id ? null : g.id)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-orange-100">
                        <span className="flex-1 min-w-0 text-[12px] truncate"><b>{g.name}</b> <span className="text-[10px] px-1 py-0.5 rounded bg-orange-200 text-orange-900 font-bold">{g.channel || L('data.coupang')}{g.parentBill ? L('inventory.billParents2') : ''}</span></span>
                        <span className="text-[11px] font-bold text-orange-700">{openGuide === g.id ? L('inventory.collapse') : L('inventory.viewGuide')}</span>
                      </button>
                      {openGuide === g.id && (
                        <div className="px-3 pb-2 space-y-1.5">
                          <p className="text-[11px] text-orange-900 whitespace-pre-wrap bg-white rounded-lg px-2 py-1.5 border border-orange-200">📌 {g.guide || L('inventory.thisItemIsBoughtFrom', { v0: dataLabel(g.channel || '쿠팡') })}</p>
                          <button type="button" onClick={() => addGuide(g)} className="w-full py-1 text-[11px] font-bold text-white bg-orange-500 rounded-lg">{L('inventory.gotItAddToRequest')}</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {results.map(i => {
                    const had = lines.find(l => l.itemId === i.id);
                    const stock = views.find(v => v.id === i.id);
                    return (
                      <button key={i.id} type="button" onClick={() => addItem(i)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-50">
                        {itemThumb(i) ? <img src={itemThumb(i)} alt="" className="w-8 h-8 rounded object-cover bg-gray-100 shrink-0" loading="lazy" /> : null}
                        <span className="flex-1 min-w-0 text-[12px] truncate"><b>{i.name}</b> <span className="text-gray-400">{[i.kind, i.spec].filter(Boolean).join(' · ')}</span>{stock && stock.total > 0 ? <span className="text-emerald-600"> {L('inventory.campStock')} {stock.total}</span> : null}</span>
                        <span className="text-[11px] font-bold text-emerald-600">{had ? `${had.quantity} +1` : L('inventory.add')}</span>
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => { setLines(ls => [...ls, { id: newId(), name: q.trim(), quantity: 1, unit: '개' }]); setQ(''); }} className="w-full text-left px-3 py-1.5 text-[12px] text-gray-600 bg-gray-50 hover:bg-gray-100"><b>"{q.trim()}"</b> {L('inventory.addManually')}</button>
                </div>
              )}
            </div>
            {lines.length > 0 && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {lines.map(l => (
                  <div key={l.id} className="px-3 py-2 space-y-1.5">
                    {l.guideId && (() => { const g = guides.find(x => x.id === l.guideId); return g?.guide ? <p className="text-[10px] text-orange-800 bg-orange-50 rounded px-2 py-1 whitespace-pre-wrap">📌 {g.guide}</p> : null; })()}
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-gray-900 truncate">{l.name}<GuideTag line={l} /></span>
                      <button type="button" onClick={() => upd(l.id, { quantity: Math.max(1, l.quantity - 1) })} className="w-6 h-6 rounded border border-gray-200 text-gray-500">−</button>
                      <span className="w-7 text-center text-sm font-extrabold">{l.quantity}</span>
                      <button type="button" onClick={() => upd(l.id, { quantity: l.quantity + 1 })} className="w-6 h-6 rounded border border-gray-200 text-gray-500">+</button>
                      <button type="button" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))} className="text-gray-300 hover:text-red-500 px-1">🗑️</button>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {[...new Set([l.unit, ...UNITS])].map(u => (
                        <button key={u} type="button" onClick={() => upd(l.id, { unit: u })} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${l.unit === u ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{u}</button>
                      ))}
                      <input value={l.memo ?? ''} onChange={e => upd(l.id, { memo: e.target.value || undefined })} placeholder={L('inventory.noteColorSizeEtc')} className="flex-1 min-w-[120px] text-[11px] border border-gray-200 rounded px-2 py-0.5 outline-none" />
                    </div>
                    {forType === 'camp' && (l.itemId ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-500">{L('inventory.restockGroup')}</span>
                        {groups.map(g => {
                          const on = (l.groupId ?? defaultGroup?.id) === g.id;
                          return <button key={g.id} type="button" onClick={() => upd(l.id, { groupId: g.id, groupName: g.name })} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>{g.name}</button>;
                        })}
                      </div>
                    ) : <p className="text-[10px] text-gray-400">{L('inventory.notAStockItemSo')}</p>)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1">{L('common.memo')} <span className="font-normal text-gray-400">{L('patient.optional')}</span></p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={L('inventory.eGNeededByTonight')} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={submit} disabled={busy} className="w-full py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">{busy ? L('task.saving') : existing ? L('inventory.saveChanges') : L('inventory.submitRequest')}</button>
        </div>
      </div>
    </div>
  );
}

function SupplyRequestDetailModal({ req: r, buyer, canBuy, settlerIsMe, campCode, groups, views, isAdmin, userId, userName, classMentor, onAssign, onComplete, onEdit, onMetoo, onClose }: {
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
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); alert(L('inventory.couldNotProcessPleaseCheck')); } finally { setBusy(false); }
  };
  const act = (status: SupplyRequestStatus, opts?: { note?: string; holdUntil?: string }) =>
    run(async () => { await setSupplyRequestStatus(db, [r.id], status, userName, opts); if (status === 'rejected' || status === 'onhold') notifySupply({ type: 'status', requestId: r.id }); setMode('none'); setReason(''); });
  const send = () => run(async () => { await addSupplyComment(db, r.id, { uid: userId, name: userName, text: comment, admin: isAdmin }); notifySupply({ type: 'comment', requestId: r.id }); setComment(''); });
  // 캠프 공용 입고 (관리자)
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
    if (lines.some(l => !l.groupId)) { alert(L('inventory.chooseAGroupToRestock')); return; }
    await receiveSupplyRequest(db, campCode, r.id, lines, userName);
    setIntake(false);
  });
  const status = supplyStatusLine(r, buyer);
  const canSettle = isAdmin || settlerIsMe;
  const settleLines = supplySettleLines([r]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-1.5">
              {(() => { const pg = supplyProgress(r, !!buyer); return (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${PROGRESS_STYLE[pg.key] ?? SUPPLY_STATUS_STYLE[r.status]}`}>{pg.label}</span>
              ); })()}
              <h2 className="text-base font-bold text-gray-900">{FOR_ICON[r.forType]} {supplyForLabel(r)}</h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{r.requesterName} · {fmtDateTime(r.createdAt)}{r.forType === 'student' && classMentor ? L('inventory.homeroom', { v0: classMentor }) : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 구매 담당 */}
          {isOpen && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${buyer ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <span className={`flex-1 text-[12px] font-bold ${buyer ? 'text-emerald-800' : 'text-red-700'}`}>{buyer ? L('inventory.buyer', { v0: buyer.uid === userId ? L('common.meWord') : buyer.name, v1: buyer.isDefault ? L('inventory.defaultBuyerSuffix') : '' }) : L('inventory.noBuyerAnAdminNeeds')}</span>
              {isAdmin && <button onClick={onAssign} className="text-[11px] font-semibold text-emerald-700 hover:underline">{L('inventory.thisRequestOnly')} {r.buyerId ? L('patient.change') : L('inventory.someoneElse')}</button>}
            </div>
          )}
          {/* 품목 (품목별 구매 완료 · 정산) */}
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            {r.items.map(l => {
              const d = r.done?.[l.id];
              const st = r.settlements?.[l.id];
              const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
              const lk = supplyLineSettleKind(r, l);
              const canSettleLine = lk === 'parent' ? isAdmin : canSettle;
              return (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate ${d ? 'text-gray-500' : 'text-gray-900'}`}>{d ? '✓ ' : ''}{l.name} <span className="font-extrabold text-amber-700">{l.quantity}{dataLabel(l.unit)}</span>{isCamp && l.groupName ? <span className="text-[11px] font-normal text-emerald-700"> → {l.groupName}</span> : null}<GuideTag line={l} /></p>
                    {(l.memo || (isAdmin && stock)) && <p className="text-[10px] text-gray-500">{[l.memo, isAdmin && stock ? L('inventory.campStock3', { v0: stock.total, v1: dataLabel(stock.unit) }) : ''].filter(Boolean).join(' · ')}</p>}
                    {d && <p className="text-[10px] text-emerald-700">{d.amount ? fmtWon(d.amount) : L('inventory.noAmount')} · {d.by} · {fmtDateTime(d.at)}{d.payTo ? ` · 💸 ${d.payTo}` : ''}</p>}
                    {d && lk && d.amount ? <p className={`text-[10px] ${st ? 'text-gray-400' : 'text-yellow-700'}`}>{st ? L('inventory.settled', { v0: st.by }) : L('inventory.pending', { v0: lk === 'envelope' ? L('inventory.envelopeSettlement') : lk === 'transfer' ? L('inventory.transferWord') : L('inventory.parentBillingWord') })}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {canBuy && r.status !== 'rejected' && !r.stockApplied && (d
                      ? <button onClick={() => run(() => undoSupplyLine(db, r.id, l.id))} className="text-[10px] text-gray-400 hover:underline">{L('inventory.cancelPurchase')}</button>
                      : isOpen && <button onClick={() => onComplete([l.id])} className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">{L('task.done')}</button>)}
                    {d && lk && d.amount && canSettleLine ? (st
                      ? (isAdmin || st.byId === userId) && <button onClick={() => run(() => settleSupplyLines(db, r.id, [l.id], null))} className="text-[10px] text-gray-400 hover:underline">{L('inventory.cancelSettlement')}</button>
                      : <button onClick={() => run(async () => { await settleSupplyLines(db, r.id, [l.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [l.id] }); })} className="px-2 py-0.5 text-[10px] font-bold text-yellow-900 bg-yellow-100 border border-yellow-300 rounded">{SUPPLY_SETTLE_LABELS[lk].icon} {lk === 'envelope' ? L('inventory.settle') : lk === 'transfer' ? L('push.howTransfer') : L('inventory.bill')} {L('task.done')}</button>) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {canBuy && isOpen && r.items.filter(l => !r.done?.[l.id]).length > 1 && (
            <button onClick={() => onComplete(r.items.filter(l => !r.done?.[l.id]).map(l => l.id))} className="w-full py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">{L('inventory.purchaseRemainingItemsAtOnce')}</button>
          )}
          {settleLines.length > 0 && (
            <p className="text-[11px] text-gray-600 bg-yellow-50 rounded-xl px-3 py-2">
              {kind === 'envelope' ? L('inventory.homeroomMentorTakesItFrom', { v0: classMentor || L('common.unconfirmedParen') }) : L('inventory.transfersToTheTeacherWho', { v0: r.requesterName })}
              {' '}{L('inventory.settle')} {settleLines.filter(s => s.settled).length}/{settleLines.length} {L('inventory.remainingAmount')} {fmtWon(settleLines.filter(s => !s.settled).reduce((a, s) => a + (s.done.amount ?? 0), 0))}
            </p>
          )}
          {r.note && <p className="text-[12px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2">📝 {r.note}</p>}
          {(!isOpen || r.status === 'onhold') && (
            <p className={`text-[11px] rounded-xl px-3 py-2 ${r.status === 'onhold' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>{status}{r.handledBy ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}</p>
          )}
          <div className="flex gap-2">
            {isOpen && !mine && <button onClick={onMetoo} className="flex-1 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">{L('inventory.iNeedThisToo')}</button>}
            {mine && isOpen && <button onClick={onEdit} className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 rounded-xl">{L('task.edit')}</button>}
            {mine && isOpen && !supplyDoneCount(r) && <button onClick={() => { if (confirm(L('inventory.cancelThisRequest'))) run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }); }} className="flex-1 py-2 text-xs text-red-500 border border-red-200 rounded-xl">{L('inventory.cancelRequest')}</button>}
          </div>

          {/* 캠프 공용 → 재고 입고 */}
          {canIntake && (intake ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 space-y-1.5">
              <p className="text-[11px] font-bold text-emerald-800">{L('inventory.restockCheckTheQuantityActually')}</p>
              {intakeLines.map((l, idx) => (
                <div key={l.lineId} className="flex items-center gap-1.5">
                  <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-800 truncate">{l.itemName}</span>
                  <select value={l.groupId} onChange={e => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, groupId: e.target.value } : x))} className="text-[11px] border border-emerald-200 rounded-lg px-1.5 py-1 bg-white w-24">
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <input type="number" min={0} value={l.quantity} onChange={e => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className="w-16 text-[12px] border border-emerald-200 rounded-lg px-1.5 py-1 bg-white text-right" />
                </div>
              ))}
              {r.items.some(l => !l.itemId) && <p className="text-[10px] text-gray-500">{L('inventory.notStockItems')} {r.items.filter(l => !l.itemId).map(l => l.name).join(', ')}{L('inventory.wonTBeRestocked')}</p>}
              <div className="flex gap-1.5">
                <button onClick={() => setIntake(false)} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">{L('common.cancel')}</button>
                <button onClick={doIntake} disabled={busy} className="flex-[2] py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">{r.status === 'purchased' ? L('inventory.restock3') : L('inventory.purchasedRestocked')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIntake(true)} className={`w-full py-2 text-xs font-bold rounded-xl ${r.status === 'purchased' ? 'text-white bg-amber-500' : 'text-emerald-700 bg-white border border-emerald-200'}`}>📥 {r.status === 'purchased' ? L('inventory.restock2') : L('inventory.purchasedRestocked')}</button>
          ))}

          {/* 관리자 처리 */}
          {isAdmin && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-2">
              <p className="text-[10px] font-bold text-indigo-700">{L('inventory.adminActions')}</p>
              {mode === 'none' ? (
                isOpen ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => setMode('reject')} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">{L('inventory.reject')}</button>
                    {r.status === 'onhold'
                      ? <button onClick={() => act('requested')} disabled={busy} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">{L('inventory.releaseHold')}</button>
                      : <button onClick={() => setMode('hold')} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">{L('inventory.hold')}</button>}
                  </div>
                ) : !r.stockApplied ? (
                  <button onClick={() => act('requested')} disabled={busy} className="w-full py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">{L('inventory.backToInProgress')}</button>
                ) : <p className="text-[10px] text-gray-400">{L('inventory.thisRequestWasAlreadyRestocked')}</p>
              ) : (
                <div className="space-y-1.5">
                  <input value={reason} onChange={e => setReason(e.target.value)} autoFocus
                    placeholder={mode === 'reject' ? L('inventory.reasonForRejectionEG') : L('inventory.reasonForHoldEG')} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none bg-white" />
                  {mode === 'hold' && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-gray-500 mr-0.5">{L('inventory.toBuy2')}</span>
                      {([[L('inventory.tomorrow'), 1], [L('inventory.in3Days'), 3], [L('inventory.in1Week'), 7]] as const).map(([label, n]) => (
                        <button key={label} type="button" onClick={() => setHoldUntil(addDaysStr(n))} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${holdUntil === addDaysStr(n) ? 'bg-amber-200 text-amber-900' : 'bg-white border border-gray-200 text-gray-600'}`}>{label}</button>
                      ))}
                      <input type="date" value={holdUntil} onChange={e => setHoldUntil(e.target.value)} className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
                      <button type="button" onClick={() => setHoldUntil('')} className={`px-2 py-0.5 rounded text-[10px] ${!holdUntil ? 'bg-amber-200 text-amber-900' : 'text-gray-400'}`}>{L('data.tbd')}</button>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => setMode('none')} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">{L('common.cancel')}</button>
                    <button onClick={() => act(mode === 'reject' ? 'rejected' : 'onhold', { note: reason, holdUntil })} disabled={busy}
                      className={`flex-1 py-1.5 text-[11px] font-bold text-white rounded-lg ${mode === 'reject' ? 'bg-gray-500' : 'bg-amber-500'}`}>{mode === 'reject' ? L('inventory.reject') : L('inventory.onHold')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 메모·댓글 */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-gray-700">{L('inventory.notesComments')} {r.comments?.length ? r.comments.length : ''}</p>
            {(r.comments ?? []).map(c => (
              <div key={c.id} className={`rounded-xl px-3 py-1.5 ${c.admin ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-1.5">
                  <b className={`text-[11px] ${c.admin ? 'text-indigo-700' : 'text-gray-800'}`}>{c.name}</b>
                  {c.admin && <span className="text-[9px] px-1 rounded bg-indigo-100 text-indigo-700 font-bold">{L('common.roleAdmin')}</span>}
                  <span className="text-[10px] text-gray-400">{fmtDateTime(c.at)}</span>
                  {isAdmin && <button onClick={() => run(() => deleteSupplyComment(db, r.id, c))} className="ml-auto text-[10px] text-gray-300 hover:text-red-500">{L('common.delete')}</button>}
                </div>
                <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && comment.trim()) send(); }}
                placeholder={isAdmin ? L('inventory.eGCanTBuy') : L('inventory.eGOurClassNeeds')} className="flex-1 text-[12px] border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-emerald-400" />
              <button onClick={send} disabled={busy || !comment.trim()} className="px-3 text-[12px] font-bold text-white bg-gray-800 rounded-xl disabled:opacity-30">{L('inventory.post')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ==================== 🛒 구매 목록 (부매니저 · 관리자) ====================
// 자동 부족 알림(최소 재고 미달)과 진행 중인 물품 요청을 한 곳에 모아 본다.
// 이미 요청으로 올라간 부족분은 uncoveredPurchaseNeeds 가 걸러 주므로 중복되지 않는다.

function PurchaseListTab({ views, groups, needs, requests, settings, onSelect, onGoRequests }: {
  views: InventoryItemView[];
  groups: InventoryGroup[];
  needs: PurchaseNeed[];
  requests: SupplyRequest[];
  settings: SupplySettings | null;
  onSelect: (id: string) => void;
  onGoRequests: () => void;
}) {
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [search, setSearch] = useState('');

  /** ① 자동: 최소 재고 미달인데 아직 요청에 안 들어간 것 */
  const auto = useMemo(() => {
    const q = search.trim().toLowerCase();
    return uncoveredPurchaseNeeds(needs, requests)
      .filter(n => groupFilter === '전체' || n.groupId === groupFilter)
      .filter(n => !q || n.itemName.toLowerCase().includes(q))
      .sort((a, b) => b.shortage - a.shortage);
  }, [needs, requests, groupFilter, search]);

  /** ② 요청: 아직 구매가 끝나지 않은 품목 줄 */
  const fromRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Array<{ req: SupplyRequest; line: SupplyRequestLine }> = [];
    requests.forEach(r => {
      if (!isSupplyOpen(r.status)) return;
      r.items.forEach(line => {
        if (r.done?.[line.id]) return;
        if (groupFilter !== '전체' && line.groupId && line.groupId !== groupFilter) return;
        if (q && !line.name.toLowerCase().includes(q)) return;
        out.push({ req: r, line });
      });
    });
    return out;
  }, [requests, groupFilter, search]);

  const viewOf = (itemId?: string) => (itemId ? views.find(v => v.id === itemId) : undefined);
  const selCls = 'text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-emerald-400';

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-2">
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className={`${selCls} flex-1 min-w-0`}>
          <option value="전체">{L('inventory.allStaffRooms')}</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="relative flex-1">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.item2')} className="w-full pl-8 pr-2 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none" />
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        {L('inventory.theBuyerDecidesTheActual')} <b>{L('inventory.restock')}</b>{L('inventory.themToUpdateStock')}
      </p>

      {/* ① 자동 부족 */}
      <div>
        <p className="text-[11px] font-bold text-gray-500 mb-1 px-0.5">{L('inventory.lowStockBelowMinimum')} <span className="text-gray-300 font-normal">{auto.length}</span></p>
        {auto.length === 0 ? (
          <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">{L('inventory.noLowStockItems')}</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">{L('inventory.itemSpec')}</th>
                  <th className="text-left px-2 py-1.5 font-semibold">{L('inventory.staffRoom2')}</th>
                  <th className="text-right px-2 py-1.5 font-semibold">{L('inventory.current')}</th>
                  <th className="text-right px-2 py-1.5 font-semibold">{L('inventory.min2')}</th>
                  <th className="text-right px-2 py-1.5 font-semibold">{L('inventory.low')}</th>
                </tr>
              </thead>
              <tbody>
                {auto.map(n => {
                  const v = viewOf(n.itemId);
                  return (
                    <tr key={`${n.itemId}|${n.groupId}`} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(n.itemId)}>
                      <td className="px-3 py-1.5">
                        <b className="text-gray-900">{n.itemName}</b>
                        {v?.spec && <span className="text-gray-400 ml-1">{v.spec}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{n.groupName}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-red-600">{n.current}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{n.min}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-800">{n.shortage}{dataLabel(n.unit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ② 요청에서 올라온 것 */}
      <div>
        <div className="flex items-center gap-2 mb-1 px-0.5">
          <p className="flex-1 text-[11px] font-bold text-gray-500">{L('inventory.requestedItemsNotBoughtYet')} <span className="text-gray-300 font-normal">{fromRequests.length}</span></p>
          <button onClick={onGoRequests} className="text-[10px] font-semibold text-emerald-700 hover:underline">{L('inventory.stockRequestsTab')}</button>
        </div>
        {fromRequests.length === 0 ? (
          <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">{L('inventory.noRequestedItemsInProgress')}</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {fromRequests.map(({ req, line }) => {
              const buyer = supplyBuyerOf(req, settings);
              const pg = supplyProgress(req, !!buyer);
              const v = viewOf(line.itemId);
              return (
                <div key={`${req.id}|${line.id}`} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <span className="flex-1 min-w-0">
                    <b className="text-gray-900">{line.name}</b>
                    {v?.spec && <span className="text-gray-400 ml-1">{v.spec}</span>}
                    <span className="text-gray-400 ml-1">· {supplyForLabel(req)}{line.groupName ? ` · ${line.groupName}` : ''}</span>
                    {line.channel && <span className="ml-1 text-[9px] px-1 rounded bg-sky-50 text-sky-700 border border-sky-100">{line.channel}</span>}
                    {line.parentBill && <span className="ml-1 text-[9px] px-1 rounded bg-violet-50 text-violet-700 border border-violet-100">{L('inventory.parentBillingWord')}</span>}
                  </span>
                  <span className="shrink-0 font-bold text-gray-800">{line.quantity}{dataLabel(line.unit)}</span>
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    pg.key === 'buying' ? 'bg-emerald-50 text-emerald-700' : pg.key === 'approved' ? 'bg-blue-50 text-blue-700' : pg.key === 'onhold' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}>{pg.label}</span>
                  {buyer && <span className="shrink-0 text-gray-400 w-12 truncate text-right">{buyer.name}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 📋 입출고 기록 (부매니저 · 관리자) ====================

function MovementTab({ campCode, groups, views }: {
  campCode: string;
  groups: InventoryGroup[];
  views: InventoryItemView[];
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeCampMovements(db, campCode, setMovements), [campCode]);
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [kind, setKind] = useState<MovementFilterKey>('all');
  const [days, setDays] = useState<number>(7);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const reasons = MOVEMENT_FILTERS.find(f => f.key === kind)?.reasons ?? [];
    const since = days > 0 ? Date.now() - days * 86400000 : 0;
    return movements.filter(m => {
      if (groupFilter !== '전체' && m.groupId !== groupFilter) return false;
      if (reasons.length > 0 && !reasons.includes(m.reason)) return false;
      if (since && (m.at?.toMillis?.() ?? 0) < since) return false;
      if (q && !(m.itemName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [movements, groupFilter, kind, days, search]);

  const selCls = 'text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-emerald-400';

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-2">
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className={`${selCls} flex-1 min-w-0`}>
          <option value="전체">{L('inventory.allStaffRooms')}</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className={`${selCls} w-24 shrink-0`}>
          <option value={7}>{L('inventory.last7Days')}</option>
          <option value={30}>{L('inventory.last30Days')}</option>
          <option value={0}>{L('inventory.allTime')}</option>
        </select>
      </div>
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.searchItems2')}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:border-emerald-400" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {MOVEMENT_FILTERS.map(f => (
          <button key={f.key} onClick={() => setKind(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${
              kind === f.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>{f.label}</button>
        ))}
      </div>

      <p className="text-[10px] text-gray-400">{L('inventory.showsUpToTheLatest')}</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">{L('inventory.noRecords')}</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {filtered.map(m => {
            const v = views.find(x => x.id === m.itemId);
            return (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                <span className="text-gray-400 w-[76px] shrink-0">{fmtDateTime(m.at)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">
                    <b className="text-gray-900">{m.itemName}</b>
                    {v?.spec && <span className="text-gray-400 ml-1">{v.spec}</span>}
                  </span>
                  <span className="block text-[10px] text-gray-500 truncate">
                    {m.groupName}
                    <span className="text-gray-400"> · {movementLabel(m)}</span>
                    {m.memo && <span className="text-gray-400"> · {m.memo}</span>}
                  </span>
                </span>
                <span className="text-gray-400 shrink-0 w-12 truncate text-right">{m.by}</span>
                <span className={`font-bold shrink-0 w-11 text-right ${m.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== 🔍 분실물 ====================

const LOST_STATUS_STYLE: Record<LostItemStatus, string> = {
  found: 'bg-blue-100 text-blue-700',
  claimed: 'bg-emerald-100 text-emerald-700',
  discarded: 'bg-gray-100 text-gray-500',
};

/** 파일 → Storage 업로드 → 미디어 메타 */
async function uploadLostMedia(campCode: string, lostItemId: string, files: File[]): Promise<LostItemMedia[]> {
  const out: LostItemMedia[] = [];
  for (const f of files) {
    const path = lostItemMediaPath(campCode, lostItemId, f.name || 'media');
    const r = storageRef(storage, path);
    await uploadBytes(r, f, { contentType: f.type || undefined });
    const url = await getDownloadURL(r);
    out.push({ url, path, type: f.type.startsWith('video/') ? 'video' : 'image', name: f.name, size: f.size });
  }
  return out;
}

function LostTab({ campCode, jobCodeId, students, campGroups, lostItems, isAdmin, userId, userName }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  lostItems: LostItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  // 주운 물건 / 찾는 물건
  const [kind, setKind] = useState<LostItemKind>('found');
  const [filter, setFilter] = useState<LostItemStatus | '전체'>('found');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = lostItems.find(l => l.id === openId) ?? null;

  const ofKind = useMemo(() => lostItems.filter(l => lostItemKind(l) === kind), [lostItems, kind]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofKind.filter(l =>
      (filter === '전체' || l.status === filter) &&
      (!q || [l.name, l.description, l.foundPlace, l.keptAt, l.claimedBy, l.reportedBy].some(f => f?.toLowerCase().includes(q)))
    );
  }, [ofKind, filter, search]);
  const counts = useMemo(() => ({
    found: ofKind.filter(l => l.status === 'found').length,
    claimed: ofKind.filter(l => l.status === 'claimed').length,
    discarded: ofKind.filter(l => l.status === 'discarded').length,
  }), [ofKind]);
  const openCounts = useMemo(() => ({
    found: lostItems.filter(l => lostItemKind(l) === 'found' && isLostOpen(l)).length,
    lost: lostItems.filter(l => lostItemKind(l) === 'lost' && isLostOpen(l)).length,
  }), [lostItems]);
  const SL = LOST_STATUS_LABELS_BY_KIND[kind];

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 주운 물건 / 찾는 물건 */}
      <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
        {LOST_ITEM_KINDS.map(k => (
          <button key={k} onClick={() => { setKind(k); setFilter('found'); }}
            className={`flex-1 py-2 text-[13px] font-bold transition-colors ${kind === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {LOST_KIND_LABELS[k].tab}
            <span className={`ml-1.5 text-[11px] font-semibold ${kind === k ? 'text-white/80' : 'text-gray-400'}`}>{k === 'found' ? openCounts.found : openCounts.lost}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400 flex-1">
          {kind === 'found'
            ? L('inventory.registerFoundItemsToFind')
            : L('inventory.registeringALostItemNotifies')}
        </p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0">
          <FiPlus className="w-3 h-3" />{LOST_KIND_LABELS[kind].action}
        </button>
      </div>
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.searchItemPlaceStudentName')}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-400" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {([['found', `${SL.found} ${counts.found}`], ['claimed', `${SL.claimed} ${counts.claimed}`], ['discarded', `${SL.discarded} ${counts.discarded}`], ['전체', L('common.all')]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${filter === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiSearch className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{ofKind.length === 0 ? (kind === 'found' ? L('inventory.noFoundItemsRegistered') : L('inventory.noLostItemReports')) : L('inventory.nothingMatches')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map(l => {
            const thumb = l.media.find(m => m.type === 'image');
            const video = l.media.find(m => m.type === 'video');
            return (
              <button key={l.id} onClick={() => setOpenId(l.id)} className={`text-left bg-white rounded-xl border shadow-sm overflow-hidden hover:border-blue-300 flex ${l.status === 'found' ? 'border-blue-100' : 'border-gray-200 opacity-80'}`}>
                <div className="w-20 h-20 bg-gray-100 shrink-0 flex items-center justify-center overflow-hidden">
                  {thumb ? <img src={thumb.url} alt={l.name} className="w-full h-full object-cover" />
                    : video ? <video src={video.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    : <FiImage className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${LOST_STATUS_STYLE[l.status]}`}>{lostStatusLabel(l)}</span>
                    <span className="text-sm font-bold text-gray-900 truncate">{l.name}</span>
                    {l.ownerName && <span className="text-[10px] text-rose-600 shrink-0">🏷️ {l.ownerName}</span>}
                    {l.media.length > 1 && <span className="text-[9px] text-gray-400 shrink-0">+{l.media.length - 1}</span>}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5 truncate">📍 {l.foundPlace || L('inventory.unknownPlace')} · {l.foundDate}{l.matchedId ? L('inventory.linked2') : ''}</p>
                  <p className="text-[10px] text-gray-400 truncate">{l.keptAt ? L('inventory.keptAt3', { v0: l.keptAt }) : ''}{L('inventory.post')} {l.reportedBy}{l.status === 'claimed' && l.claimedBy ? ` · → ${l.claimedBy}` : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && <LostItemFormModal kind={kind} allItems={lostItems} campCode={campCode} jobCodeId={jobCodeId} students={students} campGroups={campGroups} userId={userId} userName={userName} onClose={() => setShowForm(false)} onCreated={id => { setShowForm(false); setOpenId(id); }} />}
      {opened && <LostItemDetailModal item={opened} allItems={lostItems} isAdmin={isAdmin} userId={userId} userName={userName} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  );
}

/** 사진·영상 선택 + 미리보기 (등록·추가 공용) */
function MediaPicker({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const previews = useMemo(() => files.map(f => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach(p => URL.revokeObjectURL(p.url)), [previews]);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs font-semibold cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'}`}>
          <FiCamera className="w-4 h-4" />{L('inventory.addPhotosVideos')}
          <input type="file" accept="image/*,video/*" multiple disabled={disabled} className="hidden"
            onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) onChange([...files, ...picked]); e.target.value = ''; }} />
        </label>
      </div>
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {previews.map(({ f, url }, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
              {f.type.startsWith('video/') ? <video src={url} className="w-full h-full object-cover" muted playsInline /> : <img src={url} alt="" className="w-full h-full object-cover" />}
              {f.type.startsWith('video/') && <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white flex items-center gap-0.5"><FiVideo className="w-2.5 h-2.5" />{L('inventory.video')}</span>}
              {!disabled && <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>}
              {f.size > 50 * 1024 * 1024 && <span className="absolute inset-x-0 bottom-0 text-[9px] text-center bg-red-600 text-white">{L('inventory.over50mb')}</span>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400">{L('inventory.photosVideosUpTo50mb')}</p>
    </div>
  );
}

function LostItemFormModal({ kind, allItems, campCode, jobCodeId, students, campGroups, userId, userName, onClose, onCreated }: {
  kind: LostItemKind; allItems: LostItem[];
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  userId: string; userName: string; onClose: () => void; onCreated: (id: string) => void;
}) {
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
  const [toAll, setToAll] = useState(isLost); // 잃어버린 물건은 누가 주웠을지 모르니 캠프 전체가 기본
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
  /** 이 사람이 알림을 받을 수 있나 (이름으로 찾음) */
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
  const [files, setFiles] = useState<File[]>([]);
  /** 반대쪽(주운 물건 ↔ 찾는 물건)에서 짝이 될 만한 건 */
  const matches = useMemo(
    () => (name.trim() ? suggestLostMatches({ kind, name, description, ownerStudentId: owner?.studentId }, allItems) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, description, owner?.studentId, allItems, kind]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const tooBig = files.some(f => f.size > 50 * 1024 * 1024);

  const submit = async () => {
    if (!name.trim() || busy || tooBig) return;
    setBusy(true);
    try {
      setProgress(L('inventory.registering'));
      const ownerGroup = ownerGroupLabel?.toLowerCase();
      const id = await addLostItem(db, {
        campCode, name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined,
        foundDate, keptAt: keptAt.trim() || undefined, reportedBy: userName, reportedById: userId,
        jobCodeId: jobCodeId || undefined, notify, kind,
        ownerStudentId: owner?.studentId, ownerName: owner?.name, ownerClassCode: owner?.className,
        ownerClassMentor: owner?.classMentor, ownerUnitMentor: owner?.unitMentor, ownerGroup,
        notifyScope: owner ? (toAll ? 'all' : 'owner') : undefined,
        notifyTargets: owner && !toAll ? targets : undefined,
      });
      if (files.length) {
        setProgress(L('inventory.uploadingPhotosVideos', { v0: files.length }));
        const media = await uploadLostMedia(campCode, id, files);
        await addLostItemMedia(db, id, media);
      }
      if (notify) {
        authenticatedPost<{ sent?: number; missed?: Array<{ name: string; state: string }> }>('/api/inventory/notify-lost', { lostItemId: id })
          .then(data => {
            const msg = missedSummary(data?.missed);
            if (msg) toast(`🔕 ${msg}`, { duration: 8000 });
            else if (data?.sent) toast.success(L('inventory.notifiedPeople', { v0: data.sent }));
          })
          .catch(e => console.warn('분실물 알림 요청 실패:', e));
      }
      onCreated(id);
    } catch (e) {
      console.error('분실물 등록 오류:', e);
      alert(L('inventory.anErrorOccurredWhileRegistering'));
    } finally { setBusy(false); setProgress(''); }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]" onClick={busy ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{isLost ? L('inventory.iLostSomething') : L('inventory.registerAFoundItem')}</h2>
          <button onClick={onClose} disabled={busy} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <MediaPicker files={files} onChange={setFiles} disabled={busy} />
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.item')}</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={L('inventory.eGBlueWaterBottle')} className={inputCls} autoFocus />
          </div>

          {/* 반대쪽에서 짝이 될 만한 건 제안 */}
          {matches.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5">
              <p className="text-[12px] font-bold text-amber-900">
                💡 {isLost ? L('inventory.couldThisBeItSomeone') : L('inventory.someoneIsLookingForThis2')}
              </p>
              {matches.map(({ item: m }) => (
                <button type="button" key={m.id} onClick={() => onCreated(m.id)} className="w-full text-left text-[11px] text-gray-700 bg-white rounded-lg border border-amber-100 px-2.5 py-1.5 hover:border-amber-300">
                  <b className="text-gray-900">{m.name}</b>
                  {m.ownerName && <span className="text-rose-600 ml-1">🏷️ {m.ownerName}</span>}
                  <span className="text-gray-400 ml-1">· {m.foundPlace || L('inventory.unknownPlace')} · {m.foundDate} · {m.reportedBy}</span>
                  {m.description && <span className="block text-gray-500 truncate">{m.description}</span>}
                </button>
              ))}
              <p className="text-[10px] text-amber-700">
                {L('inventory.tapToOpenItAnd')} <b>{L('inventory.link3')}</b>{L('inventory.itThereOtherwiseYouCan')}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">{isLost ? L('inventory.lastSeenAt') : L('inventory.foundAt')}</p>
              <input value={foundPlace} onChange={e => setFoundPlace(e.target.value)} placeholder={L('inventory.eGAuditorium3rdFloor')} className={inputCls} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">{isLost ? L('inventory.dateLost') : L('inventory.dateFound')}</p>
              <input type="date" value={foundDate} max={todayStr()} onChange={e => setFoundDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          {!isLost && (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.keptAt2')}</p>
              <input value={keptAt} onChange={e => setKeptAt(e.target.value)} placeholder={L('inventory.eGLostFoundBox')} className={inputCls} />
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.description')} <span className="font-normal text-gray-400">{L('inventory.featuresNameTagEtc')}</span></p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={L('inventory.eGStickerOnThe')} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">{isLost ? L('inventory.studentWhoLostIt2') : L('inventory.nameTagIfTheOwner')}<span className="font-normal text-gray-400">{isLost ? L('inventory.optionalLeaveBlankIfIt') : ''}</span></p>
            {owner ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="text-sm font-semibold text-rose-800">{owner.name}</span>
                <span className="text-[11px] text-rose-700/80">{[owner.className, owner.classMentor && L('inventory.homeroom2', { v0: owner.classMentor }), owner.unitMentor && L('inventory.room', { v0: owner.unitMentor })].filter(Boolean).join(' · ')}</span>
                <button type="button" onClick={() => setOwner(null)} className="ml-auto text-rose-400 hover:text-rose-600 text-xs">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input value={ownerQuery} onChange={e => setOwnerQuery(e.target.value)} placeholder={L('inventory.searchStudentNameLeaveBlank')} className={inputCls} />
                {ownerResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {ownerResults.map(s => (
                      <button key={s.studentId} type="button" onClick={() => { setOwner(s); setOwnerQuery(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50">
                        {s.name} <span className="text-[11px] text-gray-400">{s.className}{s.classMentor ? L('inventory.homeroom', { v0: s.classMentor }) : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="w-4 h-4 mt-0.5" />
              <span className="text-[12px] text-gray-700">
                {L('inventory.sendPushNotification')}
                <span className="block text-[10px] text-gray-400">
                  {!notify ? L('inventory.notSentToAnyone')
                    : owner && !toAll
                      ? (targets.length
                          ? L('inventory.sentOnlyToS', { v0: owner.name, v1: targets.map(t => LOST_NOTIFY_TARGET_LABELS[t].ko).join(' · ') })
                          : L('inventory.chooseRecipients'))
                      : L('inventory.sentToAllCampTeachers')}
                </span>
              </span>
            </label>
            {notify && owner && (
              <div className="px-3 py-2 bg-gray-50/60 space-y-1.5">
                <p className="text-[11px] font-bold text-gray-600">
                  {L('inventory.recipients')} <span className="font-normal text-gray-400">{L('inventory.thisItemHasAName')}</span>
                </p>
                <div className={`space-y-1 ${toAll ? 'opacity-40' : ''}`}>
                  {LOST_NOTIFY_TARGETS.map(t => {
                    const who = t === 'classMentor' ? owner.classMentor
                      : t === 'unitMentor' ? owner.unitMentor
                      : groupManagerNames.join(', ');
                    // 부매니저는 명단을 불러와야 이름을 알 수 있다
                    const loading = t === 'groupManager' && !campUsers;
                    return (
                      <label key={t} className={`flex items-center gap-2 ${toAll || (!who && !loading) ? 'cursor-default' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={!toAll && targets.includes(t)} disabled={toAll || (!who && !loading)}
                          onChange={() => toggleTarget(t)} className="w-4 h-4" />
                        <span className="text-[12px] text-gray-700 flex-1 min-w-0">
                          {LOST_NOTIFY_TARGET_LABELS[t].ko}
                          <span className="text-[11px] text-gray-400 ml-1">
                            {loading ? L('inventory.checking') : who || (t === 'groupManager' ? `${ownerGroupLabel ?? ''} 부매니저 없음`.trim() : L('inventory.noOneAssigned'))}
                          </span>
                        </span>
                        {(() => {
                          if (toAll || !who) return null;
                          // 부매니저가 여러 명이면 한 명이라도 못 받으면 알려 준다
                          const names = t === 'groupManager' ? groupManagerNames : [who];
                          const bad = names.map(n => reachOfName(n)).find(st => st && st !== 'ok');
                          if (bad) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shrink-0 font-bold">🔕 {MISSED_STATE_LABELS[bad]?.ko ?? L('inventory.canTReceive2')}</span>;
                          if (names.every(n => reachOfName(n) === 'ok')) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">{L('inventory.canReceive2')}</span>;
                          return null;
                        })()}
                      </label>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 pt-1 border-t border-gray-200 cursor-pointer">
                  <input type="checkbox" checked={toAll} onChange={e => setToAll(e.target.checked)} className="w-4 h-4" />
                  <span className="text-[12px] text-gray-700 flex-1">{L('inventory.allCampTeachers')}</span>
                  {toAll && (
                    <button type="button" onClick={e => { e.preventDefault(); setShowCheck(v => !v); loadCampUsers(); }}
                      className="text-[11px] font-semibold text-blue-700 hover:underline shrink-0">
                      {checking ? L('inventory.checking') : showCheck ? L('inventory.collapse') : L('inventory.checkWhoCanReceive')}
                    </button>
                  )}
                </label>
                {/* 전체 발송 — 누르면 누가 못 받는지 */}
                {toAll && showCheck && preview && (
                  <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 space-y-1">
                    <p className="text-[11px] text-gray-700">
                      <b>{preview.total}{L('common.people2')}</b> {L('inventory.of')} <b className="text-emerald-700">{preview.ok.length}{L('common.people2')}</b>{L('inventory.canReceive')}
                      {preview.missed.length > 0 && <> · <b className="text-red-600">{preview.missed.length}{L('common.people2')}</b>{L('inventory.canTReceive')}</>}
                    </p>
                    {preview.missed.length > 0 && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        {preview.missed.map(m => `${m.name}(${(isEnglishUI() ? MISSED_STATE_LABELS[m.state]?.en : MISSED_STATE_LABELS[m.state]?.ko) ?? L('inventory.cannotReceive')})`).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                {/* 담당 선생님 — 고른 사람 중 못 받는 사람 요약 */}
                {!toAll && preview && preview.missed.length > 0 && (
                  <p className="text-[11px] text-red-600">
                    🔕 {preview.missed.map(m => `${m.name}(${(isEnglishUI() ? MISSED_STATE_LABELS[m.state]?.en : MISSED_STATE_LABELS[m.state]?.ko) ?? L('inventory.cannotReceive')})`).join(', ')} {L('inventory.askThemToTurnOn')}
                  </p>
                )}
                {!toAll && preview && preview.total === 0 && targets.length > 0 && (
                  <p className="text-[11px] text-amber-700">{L('inventory.theChosenTeacherIsnT')}</p>
                )}
                {!toAll && targets.length === 0 && (
                  <p className="text-[11px] text-amber-700">{L('inventory.chooseAtLeastOnePerson')}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 space-y-1.5">
          {progress && <p className="text-[11px] text-blue-600 text-center">{progress}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl disabled:opacity-40">{L('common.cancel')}</button>
            <button onClick={submit} disabled={!name.trim() || busy || tooBig} className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-40">{busy ? L('inventory.registering') : L('inventory.post')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LostItemDetailModal({ item, allItems, isAdmin, userId, userName, onClose, onOpen }: {
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
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<LostItemMedia | null>(null);

  const matched = useMemo(() => (item.matchedId ? allItems.find(l => l.id === item.matchedId) ?? null : null), [item.matchedId, allItems]);
  const matches = useMemo(
    () => (item.matchedId || item.status !== 'found' ? [] : suggestLostMatches(item, allItems)),
    [item, allItems]
  );
  const link = async (otherId: string, otherName: string) => {
    if (busy) return;
    if (!confirm(L('inventory.linkAndAsTheSame', { v0: item.name, v1: otherName }))) return;
    setBusy(true);
    try {
      await linkLostItems(db, item.id, otherId, { name: userName, claimedName: claimName.trim() || undefined });
      // 신고한 선생님(과 학생 담당)에게 "찾았어요" — 연결한 본인은 제외
      authenticatedPost<{ sent?: number; missed?: Array<{ name: string; state: string }> }>('/api/inventory/notify-lost', { lostItemId: item.id, event: 'matched' })
        .then(data => {
          const msg = missedSummary(data?.missed);
          if (msg) toast(`🔕 ${msg}`, { duration: 8000 });
          else if (data?.sent) toast.success(L('inventory.notifiedPeopleThatItWas', { v0: data.sent }));
        })
        .catch(e => console.warn('분실물 연결 알림 요청 실패:', e));
    } catch (e) {
      console.error('분실물 연결 오류:', e);
      alert(L('inventory.anErrorOccurredWhileLinking'));
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await updateLostItem(db, item.id, { name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined, foundDate, keptAt: keptAt.trim() || undefined });
      setEditing(false);
    } finally { setBusy(false); }
  };
  const uploadMore = async () => {
    if (newFiles.length === 0 || busy) return;
    setBusy(true);
    try {
      const media = await uploadLostMedia(item.campCode, item.id, newFiles);
      await addLostItemMedia(db, item.id, media);
      setNewFiles([]);
    } catch (e) { console.error('첨부 추가 오류:', e); alert(L('inventory.anErrorOccurredWhileUploading')); }
    finally { setBusy(false); }
  };
  const removeMedia = async (m: LostItemMedia) => {
    if (!confirm(L('inventory.deleteThisAttachment'))) return;
    try { await deleteObject(storageRef(storage, m.path)); } catch { /* 이미 없으면 무시 */ }
    await removeLostItemMedia(db, item.id, item.media, m.path);
  };
  const setStatus = async (status: LostItemStatus) => {
    if (busy) return;
    if (status === 'claimed' && !claimName.trim()) { setClaiming(true); return; }
    setBusy(true);
    try { await setLostItemStatus(db, item.id, status, userName, claimName); setClaiming(false); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(L('inventory.deleteThisLostFoundRecord'))) return;
    setBusy(true);
    try {
      await Promise.all(item.media.map(m => deleteObject(storageRef(storage, m.path)).catch(() => undefined)));
      await deleteLostItem(db, item.id);
      onClose();
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isLost ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{LOST_KIND_LABELS[kind].tab}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LOST_STATUS_STYLE[item.status]}`}>{lostStatusLabel(item)}</span>
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-1">{item.name}</h2>
            <p className="text-[10px] text-gray-400">{L('inventory.post')} {item.reportedBy} · {fmtDateTime(item.createdAt)}{item.status !== 'found' && item.claimedHandler ? L('inventory.marked', { v0: lostStatusLabel(item), v1: item.claimedHandler, v2: fmtDateTime(item.claimedAt) }) : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 미디어 */}
          {item.media.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {item.media.map(m => (
                <div key={m.path} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  <button type="button" onClick={() => setViewer(m)} className="w-full h-full">
                    {m.type === 'video' ? <video src={m.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                  </button>
                  {m.type === 'video' && <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white flex items-center gap-0.5 pointer-events-none"><FiVideo className="w-2.5 h-2.5" />{L('inventory.video')}</span>}
                  {canDelete && <button type="button" onClick={() => removeMedia(m)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>}
                </div>
              ))}
            </div>
          )}
          <div>
            <MediaPicker files={newFiles} onChange={setNewFiles} disabled={busy} />
            {newFiles.length > 0 && (
              <button onClick={uploadMore} disabled={busy} className="mt-1.5 w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-xl disabled:opacity-40">{busy ? L('task.uploading') : L('inventory.uploadAttachments', { v0: newFiles.length })}</button>
            )}
          </div>

          {/* 정보 */}
          {editing ? (
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder={L('inventory.item2')} />
              <div className="grid grid-cols-2 gap-2">
                <input value={foundPlace} onChange={e => setFoundPlace(e.target.value)} className={inputCls} placeholder={L('inventory.foundAt')} />
                <input type="date" value={foundDate} onChange={e => setFoundDate(e.target.value)} className={inputCls} />
              </div>
              <input value={keptAt} onChange={e => setKeptAt(e.target.value)} className={inputCls} placeholder={L('inventory.keptAt2')} />
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder={L('inventory.description')} />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg">{L('common.cancel')}</button>
                <button onClick={saveEdit} disabled={busy} className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg disabled:opacity-40">{L('common.save')}</button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-[12px] text-gray-700 space-y-1">
              <p>📍 {isLost ? L('inventory.lastSeenAt') : L('inventory.foundAt')}: <b>{item.foundPlace || '—'}</b> · {isLost ? L('inventory.dateLost') : L('inventory.dateFound')} <b>{item.foundDate}</b></p>
              {!isLost && <p>{L('inventory.keptAt')} <b>{item.keptAt || '—'}</b></p>}
              {item.description && <p className="text-gray-600">📝 {item.description}</p>}
              {item.ownerName && <p className="text-rose-700">{isLost ? L('inventory.studentWhoLostIt') : L('inventory.nameTag')}: <b>{item.ownerName}</b>{item.ownerClassCode ? ` (${item.ownerClassCode})` : ''}</p>}
              {item.status === 'claimed' && <p className="text-emerald-700">✅ {isLost ? L('inventory.foundBy', { v0: item.claimedBy || L('inventory.ownerWord') }) : L('inventory.returnedTo', { v0: item.claimedBy || L('inventory.ownerWord') })}</p>}
              <button onClick={() => setEditing(true)} className="text-[11px] text-blue-600 hover:underline">{L('inventory.editInfo')}</button>
            </div>
          )}

          {/* 짝 연결 */}
          {matched ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-bold text-emerald-800">{L('inventory.linked')} {LOST_KIND_LABELS[lostItemKind(matched)].tab}</p>
              <button type="button" onClick={() => onOpen(matched.id)} className="mt-1 w-full text-left">
                <p className="text-[12px] font-bold text-gray-900 hover:underline">{matched.name}</p>
                <p className="text-[10px] text-gray-500">{L('inventory.post')} {matched.reportedBy} · {matched.foundPlace || L('inventory.noPlaceGiven')}</p>
              </button>
              {item.matchedBy && <p className="text-[10px] text-emerald-700 mt-1">{item.matchedBy} {L('inventory.link2')} {fmtDateTime(item.matchedAt)}</p>}
            </div>
          ) : matches.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-800">
                💡 {isLost ? L('inventory.thisMightBeItFound') : L('inventory.someoneIsLookingForThis')}
              </p>
              {matches.map(m => (
                <div key={m.item.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 px-2.5 py-2">
                  <button type="button" onClick={() => onOpen(m.item.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-[12px] font-bold text-gray-900 truncate hover:underline">{m.item.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{m.item.reportedBy} · {m.item.foundPlace || L('inventory.noPlaceGiven')}{m.item.ownerName ? ` · ${m.item.ownerName}` : ''}</p>
                  </button>
                  <button type="button" onClick={() => link(m.item.id, m.item.name)} disabled={busy}
                    className="shrink-0 px-2.5 py-1.5 text-[11px] font-bold text-white bg-amber-600 rounded-lg disabled:opacity-40">{L('inventory.link')}</button>
                </div>
              ))}
              <p className="text-[10px] text-amber-700">{L('inventory.onceLinkedBothWillBe')}{SL.claimed}{L('inventory.text')}</p>
            </div>
          ) : null}

          {/* 상태 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-700">{L('inventory.changeStatus')}</p>
            <div className="flex gap-1.5">
              {LOST_ITEM_STATUSES.map(s => (
                <button key={s} onClick={() => setStatus(s)} disabled={busy}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${item.status === s ? `${LOST_STATUS_STYLE[s]} border-transparent` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {SL[s]}
                </button>
              ))}
            </div>
            {(claiming || item.status === 'claimed') && (
              <div className="flex gap-2 items-center">
                <input value={claimName} onChange={e => setClaimName(e.target.value)} placeholder={isLost ? L('inventory.nameOfTheStudentPerson2') : L('inventory.nameOfTheStudentPerson')} className={`${inputCls} flex-1`} autoFocus={claiming} />
                <button onClick={() => setStatus('claimed')} disabled={busy || !claimName.trim()} className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{item.status === 'claimed' ? L('inventory.saveName') : L('inventory.mark', { v0: SL.claimed })}</button>
              </div>
            )}
          </div>

          {canDelete && (
            <button onClick={remove} disabled={busy} className="w-full py-2 text-[11px] text-red-500 hover:bg-red-50 rounded-lg">{L('patient.deleteRecord')}</button>
          )}
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setViewer(null); }}>
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center"><FiX className="w-5 h-5" /></button>
          {viewer.type === 'video'
            ? <video src={viewer.url} controls autoPlay playsInline className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()} />
            : <img src={viewer.url} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />}
        </div>
      )}
    </div>
  );
}

// ==================== 📋 일괄 입력 · 실사 (관리자) ====================

/**
 * 구글시트처럼 행=품목, 열=그룹 표에서 수량을 바로 입력.
 * 저장하면 바뀐 칸만 품목별 트랜잭션으로 "최종 수량" 설정 (입력 중 약 복용 차감이 있어도 덮어쓰지 않음)
 */
function BulkStockEditor({ campCode, views, groups, userName }: {
  campCode: string; views: InventoryItemView[]; groups: InventoryGroup[]; userName: string;
}) {
  const [category, setCategory] = useState<InventoryCategory | '전체'>('의약품');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'restock' | 'adjust'>('restock');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => v.isActive !== false && (category === '전체' || v.category === category) &&
      (!q || [v.name, v.kind, v.subCategory, v.spec].some(f => f?.toLowerCase().includes(q))));
  }, [views, category, search]);

  const key = (itemId: string, groupId: string) => `${itemId}|${groupId}`;
  const changed = useMemo(() => {
    const out: { itemId: string; itemName: string; groupId: string; groupName: string; target: number }[] = [];
    Object.entries(edits).forEach(([k, val]) => {
      if (val.trim() === '') return;
      const [itemId, groupId] = k.split('|');
      const v = views.find(x => x.id === itemId);
      const g = groups.find(x => x.id === groupId);
      const n = parseInt(val, 10);
      if (!v || !g || isNaN(n) || n === getGroupStock(v, groupId)) return;
      out.push({ itemId, itemName: v.name, groupId, groupName: g.name, target: n });
    });
    return out;
  }, [edits, views, groups]);

  const save = async () => {
    if (changed.length === 0 || busy) return;
    if (mode === 'adjust' && !memo.trim()) { alert(L('inventory.enterTheReasonForThe')); return; }
    if (!confirm(L('inventory.saveCellsAs', { v0: changed.length, v1: mode === 'restock' ? L('inventory.restockModeLabel') : L('inventory.countModeLabel') }))) return;
    setBusy(true);
    try {
      const n = await setStockLevels(db, campCode, changed, {
        reason: mode, refLabel: mode === 'restock' ? '일괄 입고' : '실사', memo: memo.trim() || undefined,
      }, userName);
      alert(L('inventory.savedCells', { v0: n }));
      setEdits({});
    } catch (e) {
      console.error('일괄 저장 오류:', e);
      alert(L('task.failedToSaveTask2'));
    } finally { setBusy(false); }
  };

  if (groups.length === 0) return <p className="text-[11px] text-gray-400">{L('inventory.createInventoryGroupsInGroups')}</p>;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800">{L('inventory.bulkEntryStockCount')}</p>
        <p className="text-[10px] text-gray-400">{L('inventory.inEachCellEnter')} <b>{L('inventory.theActualQuantityNowUnits')}</b>{L('inventory.andSaveOnlyChangedCells')}</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {([['restock', L('inventory.restockTermStartRefill')], ['adjust', L('inventory.stockCountAdjustment')]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${mode === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
          ))}
          {mode === 'adjust' && STOCKTAKE_REASONS.map(r => (
            <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${memo === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>{dataLabel(r)}</button>
          ))}
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={mode === 'adjust' ? L('inventory.reasonRequiredButtonOrType') : L('inventory.noteOptionalEGBought')}
            className="flex-1 min-w-[160px] text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto items-center">
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border ${category === c ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{dataLabel(c)}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.searchItems')} className="ml-auto w-32 text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none" />
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh] rounded-xl border border-gray-200 bg-white">
        <table className="text-[11px] min-w-full">
          <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-gray-50 min-w-[150px]">{L('push.itemDefault')}</th>
              {groups.map(g => <th key={g.id} className="px-1.5 py-1.5 font-semibold whitespace-nowrap">{g.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.id} className="border-t border-gray-100">
                <td className="px-2 py-1 sticky left-0 bg-white">
                  <span className="font-semibold text-gray-800">{v.name}</span>
                  {(v.kind || v.spec) && <span className="text-gray-400 ml-1 text-[10px]">{[v.kind, v.spec].filter(Boolean).join(' · ')}</span>}
                  <span className="text-gray-300 ml-1 text-[10px]">{dataLabel(v.unit)}</span>
                </td>
                {groups.map(g => {
                  const k = key(v.id, g.id);
                  const cur = getGroupStock(v, g.id);
                  const val = edits[k];
                  const dirty = val !== undefined && val.trim() !== '' && parseInt(val, 10) !== cur;
                  return (
                    <td key={g.id} className="px-1 py-0.5 text-center">
                      <input type="number" inputMode="numeric" value={val ?? (g.id in v.stocks ? String(cur) : '')}
                        placeholder="–"
                        onChange={e => setEdits(prev => ({ ...prev, [k]: e.target.value }))}
                        className={`w-14 text-center rounded border px-1 py-0.5 outline-none ${dirty ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800' : cur < 0 ? 'border-red-300 text-red-600' : 'border-gray-200'}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-gray-50 py-2">
        <span className="text-[11px] text-gray-500">{L('inventory.changedCells')} <b className="text-emerald-700">{changed.length}</b></span>
        <div className="flex gap-1.5">
          <button onClick={() => setEdits({})} disabled={busy || Object.keys(edits).length === 0} className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg disabled:opacity-40">{L('inventory.undo')}</button>
          <button onClick={save} disabled={busy || changed.length === 0} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">{busy ? L('task.saving') : L('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== ⚙️ 관리 (관리자) ====================

function ManageTab({ campCode, items, views, groups, packages, campGroups, perm, userName, onSelect }: {
  campCode: string;
  perm: InventoryPerm;
  items: InventoryItem[];
  views: InventoryItemView[];
  groups: InventoryGroup[];
  packages: InventoryPackage[];
  campGroups: CampGroup[];
  userName: string;
  onSelect: (id: string) => void;
}) {
  const [section, setSection] = useState<'items' | 'groups' | 'bulk' | 'guides'>('groups');
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-1.5">
        {([['groups', L('inventory.groupsPackages')], ['bulk', L('inventory.bulkEntryStockCount2')], ['items', L('inventory.items4')], ['guides', L('inventory.designatedItemsCoupang')]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${section === id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
        ))}
      </div>
      {section === 'groups'
        ? <GroupManager campCode={campCode} groups={groups} packages={packages} campGroups={campGroups} views={views} userName={userName} />
        : section === 'bulk'
          ? <BulkStockEditor campCode={campCode} views={views} groups={groups} userName={userName} />
          : section === 'guides'
            ? <SupplyGuideManager />
            : <ItemManager items={items} views={views} groups={groups} perm={perm} userName={userName} onSelect={onSelect} />}
    </div>
  );
}

function GroupManager({ campCode, groups, packages, campGroups, views, userName }: {
  campCode: string; groups: InventoryGroup[]; packages: InventoryPackage[]; campGroups: CampGroup[]; views: InventoryItemView[]; userName: string;
}) {
  const [newName, setNewName] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [pkgName, setPkgName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await addInventoryGroup(db, { campCode, name: newName.trim(), location: newLoc.trim() || undefined, order: groups.length });
      setNewName(''); setNewLoc('');
    } finally { setBusy(false); }
  };
  const remove = async (g: InventoryGroup) => {
    const left = views.filter(v => getGroupStock(v, g.id) !== 0);
    if (left.length > 0) {
      alert(L('inventory.groupStillHasStockItems', { v0: g.name, v1: left.length, v2: left.slice(0, 3).map(v => v.name).join(', '), v3: left.length > 3 ? ' …' : '' }));
      return;
    }
    if (!confirm(L('inventory.deleteGroup', { v0: g.name }))) return;
    await deleteInventoryGroup(db, g.id);
  };
  const savePkg = async () => {
    if (!pkgName.trim() || groups.length === 0 || busy) return;
    setBusy(true);
    try { await savePackageFromGroups(db, pkgName.trim(), groups, userName); setPkgName(''); }
    finally { setBusy(false); }
  };
  const apply = async (pkg: InventoryPackage) => {
    if (!confirm(L('inventory.addGroupsFromPackageTo', { v0: pkg.name, v1: pkg.slots.length, v2: campCode }))) return;
    const n = await applyPackageToCamp(db, campCode, pkg, groups);
    if (n === 0) alert(L('inventory.noGroupsAddedBecauseGroups'));
  };

  return (
    <div className="space-y-4">
      {/* 현재 캠프 그룹 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800">{campCode} {L('inventory.inventoryGroups')} <span className="text-gray-400 font-normal">({groups.length})</span></p>
        <p className="text-[10px] text-gray-400">{L('inventory.aStoragePlaceKitUnit')}</p>
        {groups.map(g => <GroupRow key={g.id} group={g} campGroups={campGroups} onDelete={() => remove(g)} />)}
        {campGroups.length > 0 && <p className="text-[10px] text-gray-400">{L('inventory.linkingACampGroupAuto')}</p>}
        <div className="flex gap-1.5 items-center pt-1">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={L('inventory.groupNameEGSpring')} className="w-32 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <input value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder={L('inventory.storagePlaceEG2nd')} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <button onClick={add} disabled={!newName.trim() || busy} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40"><FiPlus className="w-3 h-3" />{L('schedule.group')}</button>
        </div>
      </div>

      {/* 패키지 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800 flex items-center gap-1"><FiPackage className="w-3.5 h-3.5" />{L('inventory.groupPackages')} <span className="text-gray-400 font-normal">{L('inventory.companyWide')}</span></p>
        <p className="text-[10px] text-gray-400">{L('inventory.saveAGroupSetupAnd')}</p>
        {packages.length === 0 && <p className="text-[11px] text-gray-400">{L('inventory.noSavedPackages')}</p>}
        {packages.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded-lg px-2.5 py-1.5">
            <span className="font-semibold text-gray-800">{p.name}</span>
            <span className="text-gray-400 flex-1 truncate">{p.slots.map(s => s.label).join(' · ')}</span>
            <button onClick={() => apply(p)} className="text-emerald-700 font-semibold hover:underline">{L('inventory.applyToThisCamp')}</button>
            <button onClick={() => { if (confirm(L('inventory.deletePackage', { v0: p.name }))) deleteInventoryPackage(db, p.id); }} className="text-gray-300 hover:text-red-500">🗑️</button>
          </div>
        ))}
        <div className="flex gap-1.5 items-center pt-1">
          <input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder={L('inventory.saveCurrentSetupAsA')} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <button onClick={savePkg} disabled={!pkgName.trim() || groups.length === 0 || busy} className="px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 rounded-lg disabled:opacity-40">{L('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

function GroupRow({ group, campGroups, onDelete }: { group: InventoryGroup; campGroups: CampGroup[]; onDelete: () => void }) {
  const [name, setName] = useState(group.name);
  const [loc, setLoc] = useState(group.location ?? '');
  useEffect(() => { setName(group.name); setLoc(group.location ?? ''); }, [group.name, group.location]);
  const dirty = name.trim() !== group.name || loc.trim() !== (group.location ?? '');
  const save = () => {
    if (!name.trim()) return;
    updateInventoryGroup(db, group.id, { name: name.trim(), location: loc.trim() || undefined });
  };
  return (
    <div className="flex gap-1.5 items-center">
      <span className="text-[10px] text-gray-300 w-4 text-right">{group.order + 1}</span>
      <input value={name} onChange={e => setName(e.target.value)} onBlur={save} className="w-32 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none font-semibold" />
      <input value={loc} onChange={e => setLoc(e.target.value)} onBlur={save} placeholder={L('inventory.storagePlaceRoom')} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
      {campGroups.length > 0 && (
        <select value={group.campGroupName ?? ''} onChange={e => updateInventoryGroup(db, group.id, { campGroupName: e.target.value })}
          className="w-24 text-[11px] border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white" title={L('inventory.campGroupToLink')}>
          <option value="">{L('inventory.campGroup')}</option>
          {campGroups.map(cg => <option key={cg.name} value={cg.name}>{cg.name}</option>)}
        </select>
      )}
      {dirty && <button onClick={save} className="text-[10px] font-semibold text-emerald-700">{L('common.save')}</button>}
      <button onClick={onDelete} className="text-gray-300 hover:text-red-500 text-xs px-1">🗑️</button>
    </div>
  );
}

function ItemManager({ items, views, groups, perm, userName, onSelect }: {
  items: InventoryItem[]; views: InventoryItemView[]; groups: InventoryGroup[]; perm: InventoryPerm; userName: string; onSelect: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const importDefaults = async () => {
    if (!confirm(L('inventory.registerDefaultItemsExistingItems', { v0: DEFAULT_INVENTORY_ITEMS.length }))) return;
    setBusy(true);
    try {
      const n = await importInventoryItems(db, DEFAULT_INVENTORY_ITEMS, items, userName);
      alert(L('inventory.addedItems', { v0: n }));
    } finally { setBusy(false); }
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => !q || [v.name, v.kind, v.subCategory, v.spec].some(f => f?.toLowerCase().includes(q)));
  }, [views, search]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 items-center">
        <div className="relative flex-1">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={L('inventory.searchItems')} className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none" />
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg"><FiPlus className="w-3 h-3" />{L('inventory.addItem')}</button>
        <button onClick={importDefaults} disabled={busy} className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg disabled:opacity-40" title={L('inventory.sheetItemsCommonMedicineBrands')}>{L('inventory.loadDefaultSet')}</button>
      </div>
      <p className="text-[10px] text-gray-400">{L('inventory.itemsAreCompanyWideChanges')}</p>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {list.length === 0 && <p className="text-[11px] text-gray-400 px-3 py-3">{L('inventory.noItems')}</p>}
        {list.map(v => (
          <div key={v.id} className={`flex items-center gap-2 px-3 py-2 text-[11px] ${v.isActive === false ? 'opacity-50' : ''}`}>
            <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 ${CATEGORY_STYLE[v.category] ?? CATEGORY_STYLE.기타}`}>{dataLabel(v.category)}{v.subCategory ? `·${v.subCategory}` : ''}</span>
            <button onClick={() => onSelect(v.id)} className="flex-1 min-w-0 text-left truncate">
              <b className="text-gray-900">{v.name}</b>
              {v.kind && <span className="text-gray-500 ml-1">{v.kind}</span>}
              {v.spec && <span className="text-gray-400 ml-1">{v.spec}</span>}
              <span className="text-gray-400 ml-1">· {INVENTORY_USAGE_LABELS[getItemUsage(v)]} · {dataLabel(v.unit)} {L('inventory.min')} {v.minStockDefault ?? 0}{v.ingredient ? ` · ${v.ingredient}` : ''}</span>
            </button>
            {v.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500 shrink-0">{L('inventory.inactive')}</span>}
            <button onClick={() => setEditing(v)} className="text-gray-400 hover:text-emerald-700 shrink-0">✏️</button>
            <button onClick={() => updateInventoryItem(db, v.id, { isActive: v.isActive === false })} className="text-[10px] text-gray-400 hover:text-gray-700 shrink-0">{v.isActive === false ? L('inventory.use') : L('inventory.inactive')}</button>
          </div>
        ))}
      </div>
      {(showForm || editing) && (
        <ItemFormModal item={editing ?? undefined} groups={groups} perm={perm} userName={userName} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ==================== 품목 추가/수정 폼 ====================

function ItemFormModal({ item, preset, groups, campCode, defaultGroupId, perm, userName, onClose, onCreated }: {
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
  const [packSize, setPackSize] = useState(item?.packSize ? String(item.packSize) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [minStockDefault, setMinStockDefault] = useState(item?.minStockDefault != null ? String(item.minStockDefault) : '');
  const [isActive, setIsActive] = useState(item?.isActive !== false);
  const [usage, setUsage] = useState<InventoryUsage>(item ? getItemUsage(item) : (preset?.category ?? '의약품') === '의약품' ? 'oral' : 'operational');
  const [ingredient, setIngredient] = useState(item?.ingredient ?? '');
  const [intervalHours, setIntervalHours] = useState(item?.intervalHours != null ? String(item.intervalHours) : '');
  const [maxPerDay, setMaxPerDay] = useState(item?.maxPerDay != null ? String(item.maxPerDay) : '');
  const [dosageNote, setDosageNote] = useState(item?.dosageNote ?? '');
  const [busy, setBusy] = useState(false);
  // 상세 설정은 기본으로 접어둔다
  const [showDetail, setShowDetail] = useState(false);
  // 신규 등록 — 보관 교무실 · 최초 재고
  const canSetStock = !item && !!campCode && !!groups?.length;
  const [stockGroupId, setStockGroupId] = useState(defaultGroupId ?? groups?.[0]?.id ?? '');
  const [initialQty, setInitialQty] = useState('');
  // 신규 등록 — 이미지 (관리자만). 품목이 만들어진 뒤 업로드한다
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  const pickPhoto = (f?: File | null) => {
    setPhotoError('');
    if (!f) { setPhoto(null); if (photoUrl) URL.revokeObjectURL(photoUrl); setPhotoUrl(null); return; }
    if (!f.type.startsWith('image/')) { setPhotoError(L('inventory.onlyImageFilesCanBe2')); return; }
    if (f.size > 10 * 1024 * 1024) { setPhotoError(L('inventory.onlyImagesUpTo10mb')); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(f);
    setPhotoUrl(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const data = {
        category,
        subCategory: subCategory.trim() || undefined,
        kind: kind.trim() || undefined,
        name: name.trim(),
        spec: spec.trim() || undefined,
        unit: unit.trim() || '개',
        packSize: packSize ? Math.max(1, parseInt(packSize, 10) || 1) : undefined,
        description: description.trim() || undefined,
        minStockDefault: minStockDefault === '' ? undefined : Math.max(0, parseInt(minStockDefault, 10) || 0),
        isActive,
        usage,
        ingredient: ingredient.trim() || undefined,
        intervalHours: intervalHours === '' ? undefined : Math.max(0, parseFloat(intervalHours) || 0),
        maxPerDay: maxPerDay === '' ? undefined : Math.max(0, parseInt(maxPerDay, 10) || 0),
        dosageNote: dosageNote.trim() || undefined,
      };
      if (item) {
        await updateInventoryItem(db, item.id, data);
      } else {
        const id = await addInventoryItem(db, { ...data, createdBy: userName });
        // 이미지는 품목이 만들어진 뒤 업로드 — 실패해도 품목 등록 자체는 살린다
        if (photo && perm.canEditItemMedia) {
          try {
            const uploaded = await uploadItemMedia(id, [photo], userName);
            if (uploaded.length) await addInventoryItemMedia(db, id, uploaded);
          } catch (e) {
            console.error('품목 이미지 업로드 오류:', e);
            alert(L('inventory.theItemWasRegisteredBut'));
          }
        }
        // 최초 재고
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
    } catch (e) {
      console.error('품목 저장 오류:', e);
      alert(L('task.failedToSaveTask2'));
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full text-base border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400';
  const subs = INVENTORY_SUBCATEGORIES[category] ?? [];
  const primaryUsages = suggestedUsages(category);
  const otherUsages = INVENTORY_USAGE_ORDER.filter(u => !primaryUsages.includes(u));
  const isMed = usage === 'oral' || usage === 'topical';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{item ? L('inventory.editItem') : L('inventory.addItem')}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── 기본 정보 ── */}
          <div className="flex gap-3">
            {/* 물품 이미지 — 관리자만, 선택 항목 */}
            {perm.canEditItemMedia && !item && (
              <div className="shrink-0">
                <label className="block w-[72px] h-[72px] rounded-xl border border-dashed border-gray-300 bg-gray-50 overflow-hidden cursor-pointer relative hover:border-emerald-400">
                  {photoUrl
                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex flex-col items-center justify-center text-gray-400"><FiCamera className="w-4 h-4" /><span className="text-[11px] mt-0.5">{L('common.images')}</span></span>}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {photo && (
                  <button type="button" onClick={() => pickPhoto(null)} className="w-full mt-1 text-[12px] text-gray-400 hover:text-red-500">{L('inventory.remove')}</button>
                )}
              </div>
            )}
            {perm.canEditItemMedia && item && (
              <div className="shrink-0">
                <div className="w-[72px] h-[72px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                  {itemThumb(item) ? <img src={itemThumb(item)} alt="" className="w-full h-full object-cover" /> : <FiBox className="w-5 h-5 text-gray-300" />}
                </div>
                <p className="w-full mt-1 text-[11px] text-gray-400 text-center leading-tight">{L('inventory.inDetails')}<br />{L('inventory.managePhotos')}</p>
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.item')}</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={L('inventory.eGTylenol')} className={inputCls} autoFocus={!item} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.category')}</p>
                <select value={category} onChange={e => { const c = e.target.value as InventoryCategory; setCategory(c); setSubCategory(''); if (!item) setUsage(suggestedUsages(c)[0]); }} className={inputCls}>
                  {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{dataLabel(c)}</option>)}
                </select>
              </div>
            </div>
          </div>
          {photoError && <p className="text-[13px] text-red-600">{photoError}</p>}

          {canSetStock && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.staffRoom')}</p>
                <select value={stockGroupId} onChange={e => setStockGroupId(e.target.value)} className={inputCls}>
                  {groups!.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.initialStock')}</p>
                <input type="number" min={0} value={initialQty} onChange={e => setInitialQty(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.unitSingle')}</p>
                <input list="inv-units" value={unit} onChange={e => setUnit(e.target.value)} className={inputCls} />
                <datalist id="inv-units">{INVENTORY_UNITS.map(u => <option key={u} value={u} />)}</datalist>
              </div>
            </div>
          )}
          {!canSetStock && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.unitSingle')}</p>
              <input list="inv-units2" value={unit} onChange={e => setUnit(e.target.value)} className={inputCls} />
              <datalist id="inv-units2">{INVENTORY_UNITS.map(u => <option key={u} value={u} />)}</datalist>
            </div>
          )}

          {/* ── 상세 설정 (접힘) ── */}
          <button type="button" onClick={() => setShowDetail(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-bold text-gray-600 hover:border-gray-300">
            <span>{L('inventory.advanced')} <span className="font-normal text-gray-400">{L('inventory.subcategoryItemTypeSpecMin')}{isMed ? L('inventory.medicineInfo') : ''}</span></span>
            <span className="text-gray-400">{showDetail ? '▲' : '▼'}</span>
          </button>

          {showDetail && (
            <div className="space-y-3 rounded-xl border border-gray-100 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.subcategory')}</p>
                  <input list="inv-subcats" value={subCategory} onChange={e => setSubCategory(e.target.value)} placeholder={subs.length ? subs.join(' / ') : L('patient.optional')} className={inputCls} />
                  <datalist id="inv-subcats">{subs.map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-1">{L('patient.type')}</p>
                  <input value={kind} onChange={e => setKind(e.target.value)} placeholder={L('inventory.eGDigestivePainReliever')} className={inputCls} />
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.itemType')}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {primaryUsages.map(u => (
                    <button key={u} type="button" onClick={() => setUsage(u)}
                      className={`px-2.5 py-1 rounded-full text-[13px] font-semibold border ${usage === u ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{INVENTORY_USAGE_LABELS[u]}</button>
                  ))}
                  {otherUsages.map(u => (
                    <button key={u} type="button" onClick={() => setUsage(u)}
                      className={`px-2.5 py-1 rounded-full text-[13px] border ${usage === u ? 'bg-gray-800 text-white border-gray-800 font-semibold' : 'bg-white text-gray-400 border-gray-200'}`}>{INVENTORY_USAGE_LABELS[u]}</button>
                  ))}
                </div>
                <p className="text-[12px] text-gray-400 mt-1">{L('inventory.oralMedicineTopicalMedicineAnd')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.specNotes')}</p>
                  <input value={spec} onChange={e => setSpec(e.target.value)} placeholder={L('inventory.tablet500mg')} className={inputCls} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.unitsPerPackage')}</p>
                  <input type="number" min={1} value={packSize} onChange={e => setPackSize(e.target.value)} placeholder={L('inventory.eG4')} className={inputCls} />
                </div>
              </div>

              {isMed && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
                  <p className="text-sm font-bold text-emerald-800">{L('inventory.medicineDetails')} <span className="font-normal text-emerald-700/70">{L('inventory.enteredByAnAdminFrom')}</span></p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3 sm:col-span-1">
                      <p className="text-[13px] text-gray-600 mb-0.5">{L('inventory.activeIngredient')}</p>
                      <input value={ingredient} onChange={e => setIngredient(e.target.value)} placeholder={L('inventory.acetaminophen')} className={inputCls} />
                    </div>
                    <div>
                      <p className="text-[13px] text-gray-600 mb-0.5">{L('inventory.minimumIntervalHours')}</p>
                      <input type="number" min={0} step={0.5} value={intervalHours} onChange={e => setIntervalHours(e.target.value)} placeholder={L('inventory.eG4')} className={inputCls} />
                    </div>
                    <div>
                      <p className="text-[13px] text-gray-600 mb-0.5">{L('inventory.maxPerDayTimes')}</p>
                      <input type="number" min={0} value={maxPerDay} onChange={e => setMaxPerDay(e.target.value)} placeholder={L('inventory.eG4')} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-600 mb-0.5">{L('inventory.dosageUsage')}</p>
                    <textarea value={dosageNote} onChange={e => setDosageNote(e.target.value)} rows={2} placeholder={L('inventory.eGAges712')} className={`${inputCls} resize-none`} />
                  </div>
                  <p className="text-[12px] text-gray-500">{L('inventory.intervalsAndCountsAreCalculated')}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{isMed ? L('inventory.cautionsOtherNotes') : L('inventory.descriptionGuide')} <span className="font-normal text-gray-400">{L('inventory.shownAsIsWhenSelected')}</span></p>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={L('inventory.eGFeverReducerPain')} className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-1">{L('inventory.minimumStockDefaultPerStaff')}</p>
                  <input type="number" min={0} value={minStockDefault} onChange={e => setMinStockDefault(e.target.value)} placeholder={L('inventory.n0NeverFlagAsLow')} className={inputCls} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4" />
                  {L('inventory.active')} <span className="text-[12px] text-gray-400">{L('inventory.whenOffHiddenFromNew')}</span>
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-base text-gray-600 bg-gray-100 rounded-xl">{L('common.cancel')}</button>
          <button onClick={save} disabled={!name.trim() || busy} className="flex-1 py-2.5 text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">{busy ? L('task.saving') : L('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== 🛒 관리자 지정 품목 가이드 (쿠팡 · 학부모 청구) ====================

function SupplyGuideManager() {
  const [guides, setGuides] = useState<SupplyGuide[]>([]);
  useEffect(() => subscribeSupplyGuides(db, setGuides), []);
  const [editing, setEditing] = useState<SupplyGuide | 'new' | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800">{L('inventory.adminDesignatedItems')} <span className="text-gray-400 font-normal">{guides.length}</span></p>
          <p className="text-[10px] text-gray-400">{L('inventory.itemsLikeSchoolBagsSlippers')}</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg"><FiPlus className="w-3 h-3" />{L('task.add')}</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {guides.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">{L('inventory.noDesignatedItems')}</p>}
        {guides.map(g => (
          <button key={g.id} onClick={() => setEditing(g)} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${g.isActive === false ? 'opacity-50' : ''}`}>
            <p className="text-[13px] font-bold text-gray-900">{g.name} <GuideTag line={{ channel: g.channel, parentBill: g.parentBill }} />{g.isActive === false && <span className="ml-1 text-[10px] text-gray-400">{L('inventory.inactive')}</span>}</p>
            {g.keywords?.length ? <p className="text-[10px] text-gray-400">{L('inventory.keywords2')} {g.keywords.join(', ')}</p> : null}
            <p className="text-[11px] text-gray-600 line-clamp-2 whitespace-pre-wrap">{g.guide}</p>
          </button>
        ))}
      </div>
      {editing && <SupplyGuideFormModal guide={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SupplyGuideFormModal({ guide, onClose }: { guide?: SupplyGuide; onClose: () => void }) {
  const [name, setName] = useState(guide?.name ?? '');
  const [keywords, setKeywords] = useState((guide?.keywords ?? []).join(', '));
  const [channel, setChannel] = useState(guide?.channel ?? '쿠팡');
  const [parentBill, setParentBill] = useState(guide?.parentBill ?? true);
  const [text, setText] = useState(guide?.guide ?? '');
  const [active, setActive] = useState(guide?.isActive !== false);
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400';
  const save = async () => {
    if (!name.trim()) { alert(L('inventory.pleaseEnterTheItemName')); return; }
    setBusy(true);
    try {
      await saveSupplyGuide(db, { name, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), channel, parentBill, guide: text, isActive: active }, guide?.id);
      onClose();
    } catch (e) { console.error(e); alert(L('profile.couldNotSave')); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{guide ? L('inventory.editDesignatedItem') : L('inventory.addDesignatedItem')}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div><p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.itemName')}</p><input value={name} onChange={e => setName(e.target.value)} placeholder={L('inventory.eGSchoolBag')} className={inputCls} /></div>
          <div><p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.keywords')} <span className="font-normal text-gray-400">{L('inventory.commaSeparated')}</span></p><input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={L('inventory.eGBagBackpack')} className={inputCls} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.whereToBuy')}</p><input value={channel} onChange={e => setChannel(e.target.value)} placeholder={L('data.coupang')} className={inputCls} /></div>
            <label className="flex items-end gap-1.5 pb-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={parentBill} onChange={e => setParentBill(e.target.checked)} />{L('inventory.billParents')}</label>
          </div>
          <div><p className="text-xs font-bold text-gray-700 mb-1">{L('inventory.guideShownToMentors')}</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className={`${inputCls} resize-none`}
              placeholder={L('inventory.eGThisItemIs')} /></div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />{L('inventory.showInSearch')}</label>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          {guide && <button onClick={() => { if (confirm(L('inventory.delete', { v0: guide.name }))) deleteSupplyGuide(db, guide.id).then(onClose); }} className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl">{L('common.delete')}</button>}
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{busy ? L('task.saving') : L('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
