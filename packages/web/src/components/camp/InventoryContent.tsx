'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiBox, FiSearch, FiPlus, FiSettings, FiPackage, FiX, FiCopy, FiClipboard, FiCamera, FiImage, FiVideo } from 'react-icons/fi';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { jobCodesService, stSheetService, CampCode } from '@/lib/stSheetService';
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
  INVENTORY_USAGES,
  INVENTORY_USAGE_LABELS,
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
  buildInventoryViews,
  computePurchaseNeeds,
  getGroupStock,
  getMinStock,
  INVENTORY_CATEGORIES,
  INVENTORY_SUBCATEGORIES,
  INVENTORY_UNITS,
  INVENTORY_MOVEMENT_LABELS,
  DEFAULT_INVENTORY_ITEMS,
} from '@smis-mentor/shared';
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
  SupplyStore,
  SupplyStoreSummary,
  SupplyForType,
  LostItem,
  LostItemMedia,
  LostItemStatus,
  InventoryUsage,
  CampGroup,
} from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'lost' | 'manage';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORY_STYLE: Record<InventoryCategory, string> = {
  의약품: 'bg-rose-50 text-rose-700 border-rose-100',
  문구류: 'bg-blue-50 text-blue-700 border-blue-100',
  전자제품: 'bg-violet-50 text-violet-700 border-violet-100',
  위생도구: 'bg-teal-50 text-teal-700 border-teal-100',
  기타: 'bg-gray-50 text-gray-600 border-gray-200',
};

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
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeSupplyRequests(db, campCode, setRequests);
    const u3 = subscribeLostItems(db, campCode, setLostItems);
    return () => { u1(); u3(); };
  }, [campCode]);
  const keptLostCount = useMemo(() => lostItems.filter(l => l.status === 'found').length, [lostItems]);

  const views = useMemo(() => buildInventoryViews(items, stocks, groups), [items, stocks, groups]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  // 탭 배지: 관리자는 새 요청(보류 제외) 전체, 그 외는 내가 올렸거나 사오기로 한 진행 중 요청
  // 관리자는 여기에 재고 입고 대기 + 아직 요청 안 된 재고 부족분도 더함
  const requestBadge = useMemo(() => isAdmin
    ? requests.filter(r => r.status === 'requested' || needsStockIntake(r)).length + uncoveredPurchaseNeeds(needs, requests).length
    : requests.filter(r => isSupplyOpen(r.status) && (r.requesterId === userData?.userId || r.buyerId === userData?.userId)).length,
  [requests, needs, isAdmin, userData?.userId]);

  const [subTab, setSubTab] = useState<SubTab>('stock');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => views.find(v => v.id === selectedId) ?? null, [views, selectedId]);

  if (!activeJobCodeId || !campCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-4">
        <FiBox className="h-10 w-10 text-gray-300 mb-2" aria-hidden />
        <p className="text-gray-600 font-medium">{activeJobCodeId ? '캠프 정보를 불러오는 중...' : '활성 캠프를 선택해주세요.'}</p>
      </div>
    );
  }

  const tabs: { id: SubTab; title: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'stock', title: isForeign ? 'Stock' : '재고 현황', icon: <FiBox className="w-3.5 h-3.5" /> },
    { id: 'request', title: isForeign ? 'Request' : '재고 요청', icon: <FiClipboard className="w-3.5 h-3.5" />, badge: requestBadge },
    { id: 'lost', title: isForeign ? 'Lost & Found' : '분실물', icon: <FiSearch className="w-3.5 h-3.5" />, badge: keptLostCount },
    ...(isAdmin ? [{ id: 'manage' as SubTab, title: '관리', icon: <FiSettings className="w-3.5 h-3.5" /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 세부탭 바 */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative flex items-center justify-center gap-1.5 ${
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
          <>
            <StockTab views={views} groups={groups} needs={needs} isAdmin={isAdmin} onSelect={setSelectedId} />
          </>
        )}
        {subTab === 'request' && (
          <SupplyRequestTab campCode={campCode} requests={requests} items={items} views={views} groups={groups} needs={needs} students={students} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
        )}
        {subTab === 'lost' && (
          <LostTab campCode={campCode} jobCodeId={activeJobCodeId ?? ''} students={students} campGroups={campGroups} lostItems={lostItems} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
        )}
        {subTab === 'manage' && isAdmin && (
          <ManageTab campCode={campCode} items={items} views={views} groups={groups} packages={packages} campGroups={campGroups} userName={userName} onSelect={setSelectedId} />
        )}
      </div>

      {selected && (
        <ItemDetailModal
          view={selected}
          groups={groups}
          campCode={campCode}
          isAdmin={isAdmin}
          userName={userName}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ==================== 📦 재고 현황 ====================

function StockTab({ views, groups, needs, isAdmin, onSelect }: {
  views: InventoryItemView[];
  groups: InventoryGroup[];
  needs: PurchaseNeed[];
  isAdmin: boolean;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [showInactive, setShowInactive] = useState(false);
  // 기본: 이 캠프 그룹에 둔 적 있는 품목만 (기본 세트 전체 140여 개가 다 보이지 않게)
  const [placedOnly, setPlacedOnly] = useState(true);
  const anyPlaced = useMemo(() => views.some(v => Object.keys(v.stocks).length > 0), [views]);

  const shortItems = useMemo(() => new Set(needs.map(n => n.itemId)), [needs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (!showInactive && v.isActive === false) return false;
      if (placedOnly && anyPlaced && Object.keys(v.stocks).length === 0) return false;
      if (category !== '전체' && v.category !== category) return false;
      if (groupFilter !== '전체' && getGroupStock(v, groupFilter) <= 0) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, groupFilter, showInactive, placedOnly, anyPlaced]);

  // 세부 분류별로 묶어서 표시
  const sections = useMemo(() => {
    const map = new Map<string, InventoryItemView[]>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 검색 + 필터 */}
      <div className="space-y-2">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명 · 종류 · 규격 검색"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:border-emerald-400" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                category === c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
              }`}>{c}</button>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center">
            <span className="text-[10px] text-gray-400 shrink-0">그룹</span>
            {[{ id: '전체', name: '전체' }, ...groups].map(g => (
              <button key={g.id} onClick={() => setGroupFilter(g.id)}
                className={`px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap border transition-colors ${
                  groupFilter === g.id ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold' : 'bg-white text-gray-500 border-gray-200'
                }`}>{g.name}</button>
            ))}
            {anyPlaced && (
              <label className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 shrink-0 cursor-pointer">
                <input type="checkbox" checked={!placedOnly} onChange={e => setPlacedOnly(!e.target.checked)} className="w-3 h-3" />전체 품목 보기
              </label>
            )}
            {isAdmin && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3 h-3" />사용 안 함 포함
              </label>
            )}
          </div>
        )}
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
          이 캠프에 재고 그룹이 아직 없습니다. {isAdmin ? '관리 탭에서 패키지를 적용하거나 그룹을 추가해주세요.' : '관리자가 그룹을 등록하면 수량이 표시됩니다.'}
        </div>
      )}

      {views.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FiBox className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">등록된 품목이 없습니다.</p>
          {isAdmin && <p className="text-[11px] text-gray-400 mt-1">관리 탭 › 기본 품목 세트 불러오기로 시작할 수 있습니다.</p>}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">검색 결과가 없습니다.</p>
      ) : (
        sections.map(([title, list]) => (
          <div key={title}>
            <p className="text-[11px] font-bold text-gray-500 mb-1.5 px-0.5">{title} <span className="text-gray-300 font-normal">{list.length}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {list.map(v => (
                <ItemCard key={v.id} view={v} groups={groups} isShort={shortItems.has(v.id)} onClick={() => onSelect(v.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ItemCard({ view, groups, isShort, onClick }: {
  view: InventoryItemView;
  groups: InventoryGroup[];
  isShort: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`text-left bg-white rounded-xl border shadow-sm px-3 py-2.5 hover:border-emerald-300 transition-colors ${
        view.isActive === false ? 'opacity-60 border-dashed border-gray-300' : isShort ? 'border-red-200' : 'border-gray-200'
      }`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-gray-900 truncate">{view.name}</span>
            {view.kind && <span className="text-[10px] text-gray-500">{view.kind}</span>}
            {view.spec && <span className="text-[10px] text-gray-400">{view.spec}</span>}
            {view.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500">사용 안 함</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {groups.map(g => {
              const n = getGroupStock(view, g.id);
              const min = getMinStock(view, g.id);
              const low = n < 0 || (min > 0 && n < min);
              return (
                <span key={g.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  low ? 'bg-red-50 text-red-700 border-red-200 font-semibold' : n > 0 ? 'bg-gray-50 text-gray-700 border-gray-100' : 'bg-white text-gray-300 border-gray-100'
                }`}>{g.name} {n}{n < 0 ? ' · 실사 필요' : ''}</span>
              );
            })}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-extrabold leading-none ${isShort ? 'text-red-600' : 'text-emerald-700'}`}>{view.total}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">{view.unit}</span></p>
          <p className="text-[9px] text-gray-400 mt-0.5">총 재고</p>
        </div>
      </div>
    </button>
  );
}

// ==================== 품목 상세 (그룹별 수량 · 입고 · 조정 · 이력) ====================

function ItemDetailModal({ view, groups, campCode, isAdmin, userName, onClose }: {
  view: InventoryItemView;
  groups: InventoryGroup[];
  campCode: string;
  isAdmin: boolean;
  userName: string;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [mode, setMode] = useState<{ type: 'restock' | 'adjust' | 'min'; groupId: string } | null>(null);
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState(false);

  const group = groups.find(g => g.id === mode?.groupId);
  const current = mode ? getGroupStock(view, mode.groupId) : 0;

  const submit = async () => {
    if (!mode || !group || busy) return;
    const n = parseInt(qty, 10);
    if (isNaN(n) || n < 0) return;
    setBusy(true);
    try {
      const base = { itemId: view.id, itemName: view.name, groupId: group.id, groupName: group.name };
      if (mode.type === 'restock') {
        if (n <= 0) return;
        await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
      } else if (mode.type === 'adjust') {
        if (!memo.trim()) { alert('조정 사유를 입력해주세요.'); return; }
        await adjustStockTo(db, campCode, { ...base, current, target: n, reason: memo.trim() }, userName);
      } else {
        await setGroupMinStock(db, campCode, view.id, group.id, qty === '' ? null : n);
      }
      setMode(null); setQty(''); setMemo('');
    } catch (e) {
      console.error('재고 처리 오류:', e);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[view.category] ?? CATEGORY_STYLE.기타}`}>{view.category}{view.subCategory ? ` · ${view.subCategory}` : ''}</span>
              {view.kind && <span className="text-[10px] text-gray-500">{view.kind}</span>}
              {view.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500">사용 안 함</span>}
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-1">{view.name} {view.spec && <span className="text-xs font-normal text-gray-400">{view.spec}</span>}</h2>
            {view.description && <p className="text-[11px] text-gray-600 mt-0.5">ℹ️ {view.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-extrabold text-emerald-700 leading-none">{view.total}<span className="text-xs text-gray-400 ml-0.5">{view.unit}</span></p>
              <p className="text-[9px] text-gray-400">전체 재고 (그룹 합)</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 그룹별 수량 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold text-gray-700">그룹별 수량</p>
              {isAdmin && <button onClick={() => setEditItem(true)} className="text-[11px] text-emerald-700 hover:underline">품목 수정</button>}
            </div>
            {groups.length === 0 ? (
              <p className="text-[11px] text-gray-400">재고 그룹이 없습니다.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-semibold">그룹</th>
                      <th className="text-right px-2 py-1.5 font-semibold">현재</th>
                      <th className="text-right px-2 py-1.5 font-semibold">최소</th>
                      <th className="text-left px-2 py-1.5 font-semibold">상태</th>
                      {isAdmin && <th className="px-2 py-1.5" />}
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
                          <td className="px-3 py-1.5">
                            <span className="font-semibold text-gray-800">{g.name}</span>
                            {g.location && <span className="text-gray-400 ml-1">{g.location}</span>}
                          </td>
                          <td className={`text-right px-2 py-1.5 font-bold ${low ? 'text-red-600' : 'text-gray-800'}`}>{n}</td>
                          <td className="text-right px-2 py-1.5 text-gray-500">{min}{isOverride && <span className="text-[9px] text-amber-600 ml-0.5">*</span>}</td>
                          <td className="px-2 py-1.5">
                            {low ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">구매 필요 (−{min - n})</span>
                              : <span className="text-[10px] text-gray-400">충분</span>}
                          </td>
                          {isAdmin && (
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              <button onClick={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }} className="text-[10px] font-semibold text-emerald-700 hover:underline mr-2">+입고</button>
                              <button onClick={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }} className="text-[10px] text-gray-500 hover:underline mr-2">조정</button>
                              <button onClick={() => { setMode({ type: 'min', groupId: g.id }); setQty(isOverride ? String(view.minStocks[g.id]) : ''); setMemo(''); }} className="text-[10px] text-gray-500 hover:underline">최소</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {isAdmin && <p className="text-[10px] text-gray-400 mt-1">최소 수량 기본값 {view.minStockDefault ?? 0}{view.unit} (품목 수정에서 변경) · * 표시는 그룹별 예외</p>}
          </div>

          {/* 입고 / 조정 / 최소 폼 */}
          {mode && group && (
            <div className={`rounded-xl border p-3 space-y-2 ${mode.type === 'restock' ? 'border-emerald-200 bg-emerald-50' : mode.type === 'adjust' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className="text-xs font-bold text-gray-800">
                {mode.type === 'restock' ? '📥 재고 입고' : mode.type === 'adjust' ? '✏️ 수량 직접 조정' : '📏 최소 보유 수량'} · {group.name}
                <span className="font-normal text-gray-500 ml-1">현재 {current}{view.unit}</span>
              </p>
              <div className="flex gap-2 items-center">
                <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} autoFocus
                  placeholder={mode.type === 'restock' ? '입고 수량' : mode.type === 'adjust' ? '조정 후 수량' : `비우면 기본값(${view.minStockDefault ?? 0})`}
                  className="w-32 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
                <span className="text-xs text-gray-500">{view.unit}</span>
                {mode.type === 'restock' && qty && <span className="text-[11px] text-emerald-700">→ {current + (parseInt(qty, 10) || 0)}{view.unit}</span>}
                {mode.type === 'adjust' && qty && <span className="text-[11px] text-amber-700">차이 {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</span>}
              </div>
              {mode.type !== 'min' && (
                <input value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder={mode.type === 'restock' ? '메모 (선택, 예: 이마트 구매)' : '조정 사유 (필수, 예: 실사 차이)'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
              )}
              <div className="flex gap-2">
                <button onClick={() => setMode(null)} className="flex-1 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg">취소</button>
                <button onClick={submit} disabled={busy}
                  className="flex-1 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">{busy ? '처리 중...' : '저장'}</button>
              </div>
            </div>
          )}

          {/* 변동 내역 */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1.5">변동 내역 <span className="text-gray-400 font-normal">({movements.length}건)</span></p>
            {movements.length === 0 ? (
              <p className="text-[11px] text-gray-400">이 캠프에서 아직 변동이 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {movements.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-400 w-20 shrink-0">{fmtDateTime(m.at)}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-700">
                      {m.refLabel ? <b className="text-gray-800">{m.refLabel}</b> : INVENTORY_MOVEMENT_LABELS[m.reason]}
                      <span className="text-gray-400"> · {m.groupName}</span>
                      {m.memo && <span className="text-gray-500"> · {m.memo}</span>}
                    </span>
                    <span className="text-gray-400 shrink-0">{m.by}</span>
                    <span className={`font-bold shrink-0 w-10 text-right ${m.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editItem && (
        <ItemFormModal item={view} userName={userName} onClose={() => setEditItem(false)} />
      )}
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
const STORE_ICON_WEB: Record<string, string> = { 다이소: '🛍', 약국: '💊', 마트: '🛒', 기타: '📦' };

function addDaysStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtHoldDate(s?: string): string {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}
/** 목록·상세에 쓰는 상태 한 줄 설명 */
function supplyStatusLine(r: SupplyRequest): string {
  if (r.status === 'onhold') return `⏸ 보류${r.holdUntil ? ` · ${fmtHoldDate(r.holdUntil)} 구매 예정` : ''}${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'rejected') return `반려${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'purchased') return `구매 완료${r.handledBy ? ` · ${r.handledBy}` : ''}${r.forType === 'camp' ? (r.stockApplied ? ' · 재고 입고됨' : needsStockIntake(r) ? ' · 📥 재고 입고 대기' : '') : ''}`;
  return r.buyerName ? `🙋 ${r.buyerName} 쌤이 사올 예정` : '';
}

type SupplyEditing = { mode: 'new'; prefill?: SupplyRequest } | { mode: 'edit'; req: SupplyRequest };

function SupplyRequestTab({ campCode, requests, items, views, groups, needs, students, isAdmin, userId, userName }: {
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
      alert(`캠프 공용 요청 ${n}건(구매처별)으로 올렸습니다. 필요하면 요청을 열어 수량·구매처를 고치세요.`);
    } catch (e) { console.error(e); alert('요청을 만들지 못했습니다.'); }
    finally { setPosting(false); }
  };
  const [filter, setFilter] = useState<'open' | 'mine' | 'done'>('open');
  const [byStore, setByStore] = useState(false);
  const [editing, setEditing] = useState<SupplyEditing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = requests.find(r => r.id === openId) ?? null;
  const open = useMemo(() => requests.filter(r => isSupplyOpen(r.status)), [requests]);
  const pending = useMemo(() => open.filter(r => r.status === 'requested'), [open]);
  const mine = useMemo(() => requests.filter(r => r.requesterId === userId), [requests, userId]);
  const list = filter === 'open' ? open : filter === 'mine' ? mine : requests.filter(r => !isSupplyOpen(r.status));
  const summary = useMemo(() => summarizeSupplyRequests(pending), [pending]);
  const [copied, setCopied] = useState('');
  const me = { uid: userId, name: userName };

  const copyStore = async (g: SupplyStoreSummary) => {
    const text = `[${g.store} 장보기]\n${g.lines.map(l => `• ${l.name} ${l.total}${l.unit}  (${l.who.join(', ')})`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); setCopied(g.store); setTimeout(() => setCopied(''), 1500); } catch { /* noop */ }
  };
  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.error(e); alert('처리하지 못했습니다. 권한을 확인해주세요.'); } };

  return (
    <div className="px-4 py-3 space-y-3">
      <button onClick={() => setEditing({ mode: 'new' })} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        <FiPlus className="w-4 h-4" />필요한 물품 요청하기
      </button>
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['open', `진행 중 ${open.length}`], ['mine', `내 요청 ${mine.length}`], ['done', '완료·반려']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${filter === id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
        ))}
        {filter === 'open' && pending.length > 0 && (
          <button onClick={() => setByStore(v => !v)} className={`ml-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold ${byStore ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>🛍 구매처별 장보기</button>
        )}
      </div>
      {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
          <p className="text-[12px] font-bold text-amber-900">📥 구매했지만 재고 입고 전 {intakeWaiting.length}건</p>
          {intakeWaiting.map(r => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left text-[11px] text-amber-900 hover:underline truncate">
              {STORE_ICON_WEB[r.store] ?? '📦'} {r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ')} <span className="text-amber-700">→ 입고 처리</span>
            </button>
          ))}
        </div>
      )}
      {isAdmin && filter === 'open' && shortage.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[12px] font-bold text-red-800">📉 최소 수량 미만 {shortage.length}건 <span className="font-normal text-red-600">· 아직 요청 안 됨</span></p>
            <button onClick={() => setShowNeeds(v => !v)} className="px-2 py-1 text-[11px] text-red-700 bg-white border border-red-200 rounded-lg">{showNeeds ? '접기' : '목록 보기'}</button>
            <button onClick={postNeeds} disabled={posting} className="px-2 py-1 text-[11px] font-bold text-white bg-red-500 rounded-lg disabled:opacity-40">{posting ? '올리는 중...' : '요청으로 올리기'}</button>
          </div>
          {showNeeds && shortage.map(n => (
            <p key={`${n.itemId}|${n.groupId}`} className="text-[11px] text-gray-700"><b>{n.itemName}</b> · {n.groupName} 현재 {n.current}/최소 {n.min} → <b className="text-red-600">{n.shortage}{n.unit}</b></p>
          ))}
          <p className="text-[10px] text-red-500">의약품은 약국, 나머지는 다이소로 나눠 '캠프 공용' 요청이 만들어지고, 구매 완료 후 입고하면 재고에 반영됩니다.</p>
        </div>
      )}
      {filter === 'open' && !byStore && open.length > 0 && (
        <p className="text-[10px] text-gray-400">다른 선생님 요청도 함께 보입니다. 같은 게 필요하면 <b>나도 필요해요</b>, 사러 갈 때는 <b>제가 사올게요</b>를 눌러주세요.</p>
      )}

      {filter === 'open' && byStore ? (
        <div className="space-y-2">
          {summary.map(g => {
            const reqs = pending.filter(r => g.requestIds.includes(r.id));
            const unclaimed = reqs.filter(r => !r.buyerId).map(r => r.id);
            const buyers = [...new Set(reqs.map(r => r.buyerName).filter(Boolean))] as string[];
            const completable = reqs.filter(r => isAdmin || r.buyerId === userId).map(r => r.id);
            return (
              <div key={g.store} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm font-bold text-gray-900">{STORE_ICON_WEB[g.store] ?? '📦'} {g.store} <span className="text-[11px] font-normal text-amber-800">{g.requestIds.length}건 · {g.lines.length}품목</span></p>
                    <button onClick={() => copyStore(g)} className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg"><FiCopy className="inline w-3 h-3 mr-0.5" />{copied === g.store ? '복사됨' : '복사'}</button>
                  </div>
                  <p className="text-[11px] text-gray-600">{buyers.length ? `🙋 사올 사람: ${buyers.join(', ')}` : '아직 사오기로 한 사람이 없어요'}</p>
                  <div className="flex gap-1.5">
                    {unclaimed.length > 0 && (
                      <button onClick={() => run(() => setSupplyBuyer(db, unclaimed, me))} className="flex-1 py-1.5 text-[11px] font-bold text-amber-800 bg-white border border-amber-300 rounded-lg">🙋 제가 사올게요 ({unclaimed.length}건)</button>
                    )}
                    {completable.length > 0 && (
                      <button onClick={() => { if (confirm(`${g.store} 요청 ${completable.length}건을 구매 완료로 처리할까요?`)) run(() => setSupplyRequestStatus(db, completable, 'purchased', userName)); }}
                        className="flex-1 py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">✓ 구매 완료 ({completable.length}건)</button>
                    )}
                  </div>
                </div>
                {g.lines.map(l => {
                  const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
                  return (
                    <div key={l.key} className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-100 text-[12px]">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{l.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{l.who.join(' · ')}{isAdmin && stock ? ` · 캠프 재고 ${stock.total}${stock.unit}` : ''}</p>
                      </div>
                      <span className="font-extrabold text-amber-700">{l.total}<span className="text-[10px] text-gray-400 ml-0.5">{l.unit}</span></span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {open.some(r => r.status === 'onhold') && <p className="text-[10px] text-gray-400">⏸ 보류 중인 요청 {open.filter(r => r.status === 'onhold').length}건은 장보기 목록에서 빠져 있습니다.</p>}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiClipboard className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{filter === 'mine' ? '올린 요청이 없습니다.' : filter === 'open' ? '진행 중인 요청이 없습니다.' : '완료된 요청이 없습니다.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {list.map(r => {
            const last = r.comments?.[r.comments.length - 1];
            const status = supplyStatusLine(r);
            return (
              <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50">
                <span className="text-lg leading-none mt-0.5">{STORE_ICON_WEB[r.store] ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{supplyForLabel(r)} <span className="text-[11px] font-normal text-gray-400">{supplyStoreLabel(r)}</span></p>
                  <p className="text-[12px] text-gray-700 truncate">{r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ')}</p>
                  {status && <p className={`text-[10px] truncate ${r.status === 'onhold' ? 'text-amber-700' : r.buyerName && isSupplyOpen(r.status) ? 'text-emerald-700' : 'text-gray-500'}`}>{status}</p>}
                  {last && <p className="text-[10px] text-gray-500 truncate">💬 {r.comments!.length} · <b className={last.admin ? 'text-indigo-700' : ''}>{last.name}</b> {last.text}</p>}
                  <p className="text-[10px] text-gray-400">{r.requesterName} · {fmtDateTime(r.createdAt)}</p>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${SUPPLY_STATUS_STYLE[r.status]}`}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</span>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <SupplyRequestFormModal campCode={campCode} existing={editing.mode === 'edit' ? editing.req : undefined} prefill={editing.mode === 'new' ? editing.prefill : undefined}
          groups={groups} items={items} views={views} students={students} userId={userId} userName={userName} onClose={() => setEditing(null)} />
      )}
      {opened && !editing && (
        <SupplyRequestDetailModal req={opened} campCode={campCode} groups={groups} views={views} isAdmin={isAdmin} userId={userId} userName={userName}
          onEdit={() => setEditing({ mode: 'edit', req: opened })} onMetoo={() => { setEditing({ mode: 'new', prefill: opened }); setOpenId(null); }} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function SupplyRequestFormModal({ campCode, existing, prefill, groups, items, views, students, userId, userName, onClose }: {
  campCode: string; existing?: SupplyRequest; prefill?: SupplyRequest; groups: InventoryGroup[]; items: InventoryItem[]; views: InventoryItemView[]; students: STSheetStudent[];
  userId: string; userName: string; onClose: () => void;
}) {
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const base = existing ?? prefill;
  const [forType, setForType] = useState<SupplyForType>(existing?.forType ?? (prefill?.forType === 'camp' ? 'camp' : 'student'));
  const [student, setStudent] = useState<{ id?: string; name: string; cls?: string } | null>(
    existing?.studentName ? { id: existing.studentId, name: existing.studentName, cls: existing.studentClass } : null);
  const [studentQuery, setStudentQuery] = useState('');
  const defaultGroup = groups[0];
  const [store, setStore] = useState<SupplyStore>(base?.store ?? '다이소');
  const [storeEtc, setStoreEtc] = useState(base?.storeEtc ?? '');
  // "나도 필요해요": 같은 구매처·물품을 새 줄 ID로 복사 (수량은 1부터)
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
  const addItem = (i: InventoryItem) => {
    const had = lines.find(l => l.itemId === i.id);
    if (had) setLines(ls => ls.map(l => l.id === had.id ? { ...l, quantity: l.quantity + 1 } : l));
    else setLines(ls => [...ls, { id: newId(), itemId: i.id, name: itemLabel(i), quantity: 1, unit: i.unit, groupId: defaultGroup?.id, groupName: defaultGroup?.name }]);
    setQ(''); // 고르면 검색 목록 닫기
  };
  const upd = (id: string, patch: Partial<SupplyRequestLine>) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const submit = async () => {
    if (forType === 'student' && !student) { alert('어떤 학생을 위한 물품인지 선택해주세요.'); return; }
    if (store === '기타' && !storeEtc.trim()) { alert('구매처를 입력해주세요.'); return; }
    if (lines.length === 0) { alert('필요한 물품을 하나 이상 담아주세요.'); return; }
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
    } catch (e) { console.error('구매 요청 저장 오류:', e); alert('요청을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const seg = (on: boolean) => `flex-1 py-2 rounded-xl text-xs font-bold border ${on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`;
  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{existing ? '요청 수정' : prefill ? '🙋 나도 필요해요' : '📝 필요한 물품 요청'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {prefill && <p className="text-[11px] text-gray-500 bg-amber-50 rounded-xl px-3 py-2">{supplyForLabel(prefill)} 요청과 같은 구매처·물품을 담았어요. 누구 것인지와 수량만 바꿔서 올리면 장보기 목록에 합쳐집니다.</p>}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1.5">① 누가 필요한가요?</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setForType('student')} className={seg(forType === 'student')}>👧 학생</button>
              <button type="button" onClick={() => setForType('mentor')} className={seg(forType === 'mentor')}>🧑‍🏫 멘토(나)</button>
              <button type="button" onClick={() => setForType('camp')} className={seg(forType === 'camp')}>🏕 캠프 공용</button>
            </div>
            {forType === 'camp' && <p className="mt-1.5 text-[10px] text-gray-500">상비약·소모품처럼 캠프 재고로 쓰는 물건. 재고 품목을 검색해 담고 넣을 그룹을 고르면, 구매 후 관리자가 입고할 때 재고에 반영됩니다.</p>}
            {forType === 'student' && (student ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2">
                <span className="flex-1 text-sm font-bold text-blue-900">{student.name} <span className="font-normal text-blue-500 text-xs">{student.cls}</span></span>
                <button onClick={() => setStudent(null)} className="text-xs text-gray-500">변경</button>
              </div>
            ) : (
              <div className="relative mt-2">
                <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="학생 이름 검색" className={inputCls} />
                {studentQuery.trim() && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {studentResults.map(s => (
                      <button key={s.studentId} type="button" onClick={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className }); setStudentQuery(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                        {s.name} <span className="text-[11px] text-gray-400">{s.className}{s.classMentor ? ` · 담임 ${s.classMentor}` : ''}</span>
                      </button>
                    ))}
                    {studentResults.length === 0 && (
                      <button type="button" onClick={() => { setStudent({ name: studentQuery.trim() }); setStudentQuery(''); }} className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">명단에 없으면 <b>"{studentQuery.trim()}"</b>로 입력</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1.5">② 어디서 사야 하나요?</p>
            <div className="flex gap-1.5">
              {SUPPLY_STORES.map(s => <button key={s} type="button" onClick={() => setStore(s)} className={seg(store === s)}>{STORE_ICON_WEB[s]} {s}</button>)}
            </div>
            {store === '기타' && <input value={storeEtc} onChange={e => setStoreEtc(e.target.value)} placeholder="구매처 (예: 편의점, 쿠팡)" className={`${inputCls} mt-2`} />}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-800">③ 무엇이 필요한가요? <span className="font-normal text-gray-400">{lines.length}개 담음</span></p>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} placeholder="물품 검색 (예: 밴드, 치약, 보드마카)" className={`${inputCls} pl-9`} />
              {q.trim() && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-emerald-200 shadow-lg divide-y divide-gray-100 overflow-hidden max-h-64 overflow-y-auto">
                  {results.map(i => {
                    const had = lines.find(l => l.itemId === i.id);
                    const stock = views.find(v => v.id === i.id);
                    return (
                      <button key={i.id} type="button" onClick={() => addItem(i)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-50">
                        <span className="flex-1 min-w-0 text-[12px] truncate"><b>{i.name}</b> <span className="text-gray-400">{[i.kind, i.spec].filter(Boolean).join(' · ')}</span>{stock && stock.total > 0 ? <span className="text-emerald-600"> · 캠프 재고 {stock.total}</span> : null}</span>
                        <span className="text-[11px] font-bold text-emerald-600">{had ? `${had.quantity} +1` : '+ 담기'}</span>
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => { setLines(ls => [...ls, { id: newId(), name: q.trim(), quantity: 1, unit: '개' }]); setQ(''); }} className="w-full text-left px-3 py-1.5 text-[12px] text-gray-600 bg-gray-50 hover:bg-gray-100"><b>"{q.trim()}"</b> 직접 추가</button>
                </div>
              )}
            </div>
            {lines.length > 0 && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {lines.map(l => (
                  <div key={l.id} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-gray-900 truncate">{l.name}</span>
                      <button type="button" onClick={() => upd(l.id, { quantity: Math.max(1, l.quantity - 1) })} className="w-6 h-6 rounded border border-gray-200 text-gray-500">−</button>
                      <span className="w-7 text-center text-sm font-extrabold">{l.quantity}</span>
                      <button type="button" onClick={() => upd(l.id, { quantity: l.quantity + 1 })} className="w-6 h-6 rounded border border-gray-200 text-gray-500">+</button>
                      <button type="button" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))} className="text-gray-300 hover:text-red-500 px-1">🗑️</button>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {[...new Set([l.unit, ...UNITS])].map(u => (
                        <button key={u} type="button" onClick={() => upd(l.id, { unit: u })} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${l.unit === u ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{u}</button>
                      ))}
                      <input value={l.memo ?? ''} onChange={e => upd(l.id, { memo: e.target.value || undefined })} placeholder="메모 (색상·사이즈 등)" className="flex-1 min-w-[120px] text-[11px] border border-gray-200 rounded px-2 py-0.5 outline-none" />
                    </div>
                    {forType === 'camp' && (l.itemId ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-500">입고 그룹</span>
                        {groups.map(g => {
                          const on = (l.groupId ?? defaultGroup?.id) === g.id;
                          return <button key={g.id} type="button" onClick={() => upd(l.id, { groupId: g.id, groupName: g.name })} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>{g.name}</button>;
                        })}
                      </div>
                    ) : <p className="text-[10px] text-gray-400">재고 품목이 아니라 입고되지 않아요</p>)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1">메모 <span className="font-normal text-gray-400">(선택)</span></p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="예: 오늘 저녁까지 필요해요, 학생 개인 비용" className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={submit} disabled={busy} className="w-full py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">{busy ? '저장 중...' : existing ? '수정 저장' : '요청 올리기'}</button>
        </div>
      </div>
    </div>
  );
}

function SupplyRequestDetailModal({ req: r, campCode, groups, views, isAdmin, userId, userName, onEdit, onMetoo, onClose }: {
  req: SupplyRequest; campCode: string; groups: InventoryGroup[]; views: InventoryItemView[]; isAdmin: boolean; userId: string; userName: string;
  onEdit: () => void; onMetoo: () => void; onClose: () => void;
}) {
  const mine = r.requesterId === userId;
  const isOpen = isSupplyOpen(r.status);
  const iAmBuyer = r.buyerId === userId;
  const [mode, setMode] = useState<'none' | 'reject' | 'hold'>('none');
  const isCamp = r.forType === 'camp';
  // 캠프 공용 입고: 줄별 그룹·수량 (기본은 요청값)
  const canIntake = isAdmin && isCamp && !r.stockApplied && r.status !== 'rejected';
  const [intake, setIntake] = useState(false);
  const [intakeLines, setIntakeLines] = useState(() => r.items.filter(l => l.itemId).map(l => ({
    lineId: l.id, itemId: l.itemId!, itemName: l.name,
    groupId: l.groupId ?? groups[0]?.id ?? '', quantity: String(l.quantity),
  })));
  const doIntake = () => run(async () => {
    const lines = intakeLines.map(l => ({
      itemId: l.itemId, itemName: l.itemName, groupId: l.groupId,
      groupName: groups.find(g => g.id === l.groupId)?.name ?? '', quantity: Math.max(0, parseInt(l.quantity, 10) || 0),
    }));
    if (lines.some(l => !l.groupId)) { alert('입고할 그룹을 골라주세요.'); return; }
    await receiveSupplyRequest(db, campCode, r.id, lines, userName);
    setIntake(false);
  });
  const purchase = () => (isCamp && isAdmin ? setIntake(true) : act('purchased'));
  const [reason, setReason] = useState('');
  const [holdUntil, setHoldUntil] = useState(addDaysStr(7));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); alert('처리하지 못했습니다. 권한을 확인해주세요.'); } finally { setBusy(false); }
  };
  const act = (status: SupplyRequestStatus, opts?: { note?: string; holdUntil?: string }) =>
    run(async () => { await setSupplyRequestStatus(db, [r.id], status, userName, opts); setMode('none'); setReason(''); });
  const send = () => run(async () => { await addSupplyComment(db, r.id, { uid: userId, name: userName, text: comment, admin: isAdmin }); setComment(''); });
  const status = supplyStatusLine(r);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${SUPPLY_STATUS_STYLE[r.status]}`}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</span>
              <h2 className="text-base font-bold text-gray-900">{STORE_ICON_WEB[r.store]} {supplyStoreLabel(r)}</h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{r.requesterName} · {fmtDateTime(r.createdAt)}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm"><span className="text-[11px] text-gray-500 mr-2">누구</span><b className="text-blue-900">{r.forType === 'student' ? '👧 ' : '🧑‍🏫 '}{supplyForLabel(r)}</b></div>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            {r.items.map(l => {
              const stock = l.itemId ? views.find(v => v.id === l.itemId) : undefined;
              return (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{l.name}{isCamp && l.groupName ? <span className="text-[11px] font-normal text-emerald-700"> → {l.groupName}</span> : null}</p>
                    {(l.memo || (isAdmin && stock)) && <p className="text-[10px] text-gray-500">{[l.memo, isAdmin && stock ? `캠프 재고 ${stock.total}${stock.unit}` : ''].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <span className="font-extrabold text-amber-700">{l.quantity}<span className="text-[10px] text-gray-400 ml-0.5">{l.unit}</span></span>
                </div>
              );
            })}
          </div>
          {r.note && <p className="text-[12px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2">📝 {r.note}</p>}
          {!isOpen || r.status === 'onhold' ? (
            <p className={`text-[11px] rounded-xl px-3 py-2 ${r.status === 'onhold' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>{status}{r.handledBy && r.status !== 'purchased' ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}</p>
          ) : null}

          {/* 사오기 */}
          {isOpen && (r.buyerId ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
              <span className="flex-1 text-[12px] font-bold text-emerald-800">🙋 {iAmBuyer ? '제가' : `${r.buyerName} 쌤이`} 사오기로 했어요</span>
              {iAmBuyer && <button onClick={() => run(() => setSupplyBuyer(db, [r.id], null))} className="text-[11px] text-gray-500 hover:underline">취소</button>}
              {(iAmBuyer || isAdmin) && <button onClick={purchase} disabled={busy} className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">✓ 사왔어요</button>}
            </div>
          ) : (
            <button onClick={() => run(() => setSupplyBuyer(db, [r.id], { uid: userId, name: userName }))} disabled={busy}
              className="w-full py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">🙋 제가 사올게요</button>
          ))}
          <div className="flex gap-2">
            {isOpen && !mine && <button onClick={onMetoo} className="flex-1 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">🙋 나도 필요해요</button>}
            {mine && isOpen && <button onClick={onEdit} className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 rounded-xl">수정</button>}
            {mine && isOpen && <button onClick={() => { if (confirm('이 요청을 취소할까요?')) run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }); }} className="flex-1 py-2 text-xs text-red-500 border border-red-200 rounded-xl">요청 취소</button>}
          </div>

          {/* 캠프 공용 → 재고 입고 */}
          {canIntake && (intake ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 space-y-1.5">
              <p className="text-[11px] font-bold text-emerald-800">📥 재고 입고 — 실제로 산 수량(낱개)과 넣을 그룹을 확인하세요</p>
              {intakeLines.map((l, idx) => (
                <div key={l.lineId} className="flex items-center gap-1.5">
                  <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-800 truncate">{l.itemName}</span>
                  <select value={l.groupId} onChange={e => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, groupId: e.target.value } : x))} className="text-[11px] border border-emerald-200 rounded-lg px-1.5 py-1 bg-white w-24">
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <input type="number" min={0} value={l.quantity} onChange={e => setIntakeLines(ls => ls.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className="w-16 text-[12px] border border-emerald-200 rounded-lg px-1.5 py-1 bg-white text-right" />
                </div>
              ))}
              {r.items.some(l => !l.itemId) && <p className="text-[10px] text-gray-500">재고 품목이 아닌 {r.items.filter(l => !l.itemId).map(l => l.name).join(', ')}은(는) 입고하지 않아요.</p>}
              <div className="flex gap-1.5">
                <button onClick={() => setIntake(false)} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">취소</button>
                <button onClick={doIntake} disabled={busy} className="flex-[2] py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">{r.status === 'purchased' ? '재고에 입고' : '구매 완료 + 재고 입고'}</button>
              </div>
            </div>
          ) : r.status === 'purchased' && (
            <button onClick={() => setIntake(true)} className="w-full py-2 text-xs font-bold text-white bg-amber-500 rounded-xl">📥 재고에 입고하기</button>
          ))}

          {/* 관리자 처리 */}
          {isAdmin && (mode !== 'none' || isOpen || !r.stockApplied) && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-2">
              <p className="text-[10px] font-bold text-indigo-700">관리자 처리</p>
              {mode === 'none' ? (
                isOpen ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => setMode('reject')} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">반려</button>
                    {r.status === 'onhold'
                      ? <button onClick={() => act('requested')} disabled={busy} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">보류 해제</button>
                      : <button onClick={() => setMode('hold')} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">⏸ 보류</button>}
                    <button onClick={purchase} disabled={busy} className="flex-[1.4] py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">✓ 구매 완료{isCamp ? ' + 입고' : ''}</button>
                  </div>
                ) : (
                  <button onClick={() => act('requested')} disabled={busy} className="w-full py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">다시 진행 중으로</button>
                )
              ) : (
                <div className="space-y-1.5">
                  <input value={reason} onChange={e => setReason(e.target.value)} autoFocus
                    placeholder={mode === 'reject' ? '반려 사유 (예: 캠프 재고로 대체, 살 필요 없음)' : '보류 사유 (예: 이번 장보기엔 못 사요)'} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none bg-white" />
                  {mode === 'hold' && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-gray-500 mr-0.5">구매 예정</span>
                      {([['내일', 1], ['3일 뒤', 3], ['1주 뒤', 7]] as const).map(([label, n]) => (
                        <button key={label} type="button" onClick={() => setHoldUntil(addDaysStr(n))} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${holdUntil === addDaysStr(n) ? 'bg-amber-200 text-amber-900' : 'bg-white border border-gray-200 text-gray-600'}`}>{label}</button>
                      ))}
                      <input type="date" value={holdUntil} onChange={e => setHoldUntil(e.target.value)} className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
                      <button type="button" onClick={() => setHoldUntil('')} className={`px-2 py-0.5 rounded text-[10px] ${!holdUntil ? 'bg-amber-200 text-amber-900' : 'text-gray-400'}`}>미정</button>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => setMode('none')} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">취소</button>
                    <button onClick={() => act(mode === 'reject' ? 'rejected' : 'onhold', { note: reason, holdUntil })} disabled={busy}
                      className={`flex-1 py-1.5 text-[11px] font-bold text-white rounded-lg ${mode === 'reject' ? 'bg-gray-500' : 'bg-amber-500'}`}>{mode === 'reject' ? '반려' : '보류'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 메모·댓글 */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-gray-700">💬 메모·댓글 {r.comments?.length ? r.comments.length : ''}</p>
            {(r.comments ?? []).map(c => (
              <div key={c.id} className={`rounded-xl px-3 py-1.5 ${c.admin ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-1.5">
                  <b className={`text-[11px] ${c.admin ? 'text-indigo-700' : 'text-gray-800'}`}>{c.name}</b>
                  {c.admin && <span className="text-[9px] px-1 rounded bg-indigo-100 text-indigo-700 font-bold">관리자</span>}
                  <span className="text-[10px] text-gray-400">{fmtDateTime(c.at)}</span>
                  {isAdmin && <button onClick={() => run(() => deleteSupplyComment(db, r.id, c))} className="ml-auto text-[10px] text-gray-300 hover:text-red-500">삭제</button>}
                </div>
                <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && comment.trim()) send(); }}
                placeholder={isAdmin ? '예: 이번엔 못 사고 다음 주에 살게요' : '예: 저희 반도 2개 필요해요, 제가 내일 다이소 가요'} className="flex-1 text-[12px] border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-emerald-400" />
              <button onClick={send} disabled={busy || !comment.trim()} className="px-3 text-[12px] font-bold text-white bg-gray-800 rounded-xl disabled:opacity-30">등록</button>
            </div>
          </div>
        </div>
      </div>
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
  const [filter, setFilter] = useState<LostItemStatus | '전체'>('found');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = lostItems.find(l => l.id === openId) ?? null;

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lostItems.filter(l =>
      (filter === '전체' || l.status === filter) &&
      (!q || [l.name, l.description, l.foundPlace, l.keptAt, l.claimedBy, l.reportedBy].some(f => f?.toLowerCase().includes(q)))
    );
  }, [lostItems, filter, search]);
  const counts = useMemo(() => ({
    found: lostItems.filter(l => l.status === 'found').length,
    claimed: lostItems.filter(l => l.status === 'claimed').length,
    discarded: lostItems.filter(l => l.status === 'discarded').length,
  }), [lostItems]);

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-800">분실물 <span className="text-blue-600">{counts.found}</span><span className="text-[10px] text-gray-400 font-normal ml-1">보관 중</span></p>
          <p className="text-[10px] text-gray-400">누구나 등록·확인할 수 있습니다. 주인을 찾으면 "주인 찾음"으로 바꿔주세요.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0"><FiPlus className="w-3 h-3" />분실물 등록</button>
      </div>
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="물품명 · 장소 · 학생 이름 검색"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-400" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {([['found', `보관 중 ${counts.found}`], ['claimed', `주인 찾음 ${counts.claimed}`], ['discarded', `폐기 ${counts.discarded}`], ['전체', '전체']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${filter === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiSearch className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{lostItems.length === 0 ? '등록된 분실물이 없습니다.' : '해당하는 분실물이 없습니다.'}</p>
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
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${LOST_STATUS_STYLE[l.status]}`}>{LOST_ITEM_STATUS_LABELS[l.status]}</span>
                    <span className="text-sm font-bold text-gray-900 truncate">{l.name}</span>
                    {l.ownerName && <span className="text-[10px] text-rose-600 shrink-0">🏷️ {l.ownerName}</span>}
                    {l.media.length > 1 && <span className="text-[9px] text-gray-400 shrink-0">+{l.media.length - 1}</span>}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5 truncate">📍 {l.foundPlace || '장소 미상'} · {l.foundDate}</p>
                  <p className="text-[10px] text-gray-400 truncate">{l.keptAt ? `보관: ${l.keptAt} · ` : ''}등록 {l.reportedBy}{l.status === 'claimed' && l.claimedBy ? ` · → ${l.claimedBy}` : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && <LostItemFormModal campCode={campCode} jobCodeId={jobCodeId} students={students} campGroups={campGroups} userId={userId} userName={userName} onClose={() => setShowForm(false)} onCreated={id => { setShowForm(false); setOpenId(id); }} />}
      {opened && <LostItemDetailModal item={opened} isAdmin={isAdmin} userId={userId} userName={userName} onClose={() => setOpenId(null)} />}
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
          <FiCamera className="w-4 h-4" />사진 · 영상 추가
          <input type="file" accept="image/*,video/*" multiple disabled={disabled} className="hidden"
            onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) onChange([...files, ...picked]); e.target.value = ''; }} />
        </label>
      </div>
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {previews.map(({ f, url }, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
              {f.type.startsWith('video/') ? <video src={url} className="w-full h-full object-cover" muted playsInline /> : <img src={url} alt="" className="w-full h-full object-cover" />}
              {f.type.startsWith('video/') && <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white flex items-center gap-0.5"><FiVideo className="w-2.5 h-2.5" />영상</span>}
              {!disabled && <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>}
              {f.size > 50 * 1024 * 1024 && <span className="absolute inset-x-0 bottom-0 text-[9px] text-center bg-red-600 text-white">50MB 초과</span>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400">사진·영상 각 50MB 이하. 여러 개 첨부 가능합니다.</p>
    </div>
  );
}

function LostItemFormModal({ campCode, jobCodeId, students, campGroups, userId, userName, onClose, onCreated }: {
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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const tooBig = files.some(f => f.size > 50 * 1024 * 1024);

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
      if (files.length) {
        setProgress(`사진·영상 ${files.length}개 업로드 중...`);
        const media = await uploadLostMedia(campCode, id, files);
        await addLostItemMedia(db, id, media);
      }
      if (notify) authenticatedPost('/api/inventory/notify-lost', { lostItemId: id }).catch(e => console.warn('분실물 알림 요청 실패:', e));
      onCreated(id);
    } catch (e) {
      console.error('분실물 등록 오류:', e);
      alert('등록 중 오류가 발생했습니다.');
    } finally { setBusy(false); setProgress(''); }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]" onClick={busy ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">🔍 분실물 등록</h2>
          <button onClick={onClose} disabled={busy} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <MediaPicker files={files} onChange={setFiles} disabled={busy} />
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">물품명 *</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 파란색 물통, 안경, 후드집업" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">발견 장소</p>
              <input value={foundPlace} onChange={e => setFoundPlace(e.target.value)} placeholder="예: 강당, 3층 복도" className={inputCls} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">발견일</p>
              <input type="date" value={foundDate} max={todayStr()} onChange={e => setFoundDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">보관 장소</p>
            <input value={keptAt} onChange={e => setKeptAt(e.target.value)} placeholder="예: 2층 교무실 분실물 박스" className={inputCls} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">설명 <span className="font-normal text-gray-400">(특징, 이름표 여부 등)</span></p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="예: 뚜껑에 스티커 붙어 있음, 이름 없음" className={`${inputCls} resize-none`} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">🏷️ 이름표 (주인을 아는 경우)</p>
            {owner ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="text-sm font-semibold text-rose-800">{owner.name}</span>
                <span className="text-[11px] text-rose-700/80">{[owner.className, owner.classMentor && `담임 ${owner.classMentor}`, owner.unitMentor && `방 ${owner.unitMentor}`].filter(Boolean).join(' · ')}</span>
                <button type="button" onClick={() => setOwner(null)} className="ml-auto text-rose-400 hover:text-rose-600 text-xs">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input value={ownerQuery} onChange={e => setOwnerQuery(e.target.value)} placeholder="학생 이름 검색 (모르면 비워두세요)" className={inputCls} />
                {ownerResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {ownerResults.map(s => (
                      <button key={s.studentId} type="button" onClick={() => { setOwner(s); setOwnerQuery(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50">
                        {s.name} <span className="text-[11px] text-gray-400">{s.className}{s.classMentor ? ` · 담임 ${s.classMentor}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="w-4 h-4 mt-0.5" />
            <span className="text-[12px] text-gray-700">
              푸시 알림 보내기
              <span className="block text-[10px] text-gray-400">
                {owner ? '담임 · 방 담당 · 그룹 매니저에게 보냅니다' : '캠프 선생님 전체에게 보냅니다 — 중요하지 않은 물품이면 끄세요'}
              </span>
            </span>
          </label>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 space-y-1.5">
          {progress && <p className="text-[11px] text-blue-600 text-center">{progress}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl disabled:opacity-40">취소</button>
            <button onClick={submit} disabled={!name.trim() || busy || tooBig} className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-40">{busy ? '등록 중...' : '등록'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LostItemDetailModal({ item, isAdmin, userId, userName, onClose }: {
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
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<LostItemMedia | null>(null);

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
    } catch (e) { console.error('첨부 추가 오류:', e); alert('업로드 중 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };
  const removeMedia = async (m: LostItemMedia) => {
    if (!confirm('이 첨부를 삭제할까요?')) return;
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
    if (!confirm('이 분실물 기록과 첨부를 삭제할까요?')) return;
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
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LOST_STATUS_STYLE[item.status]}`}>{LOST_ITEM_STATUS_LABELS[item.status]}</span>
            <h2 className="text-base font-bold text-gray-900 mt-1">{item.name}</h2>
            <p className="text-[10px] text-gray-400">등록 {item.reportedBy} · {fmtDateTime(item.createdAt)}{item.status !== 'found' && item.claimedHandler ? ` · ${LOST_ITEM_STATUS_LABELS[item.status]} 처리 ${item.claimedHandler} ${fmtDateTime(item.claimedAt)}` : ''}</p>
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
                  {m.type === 'video' && <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white flex items-center gap-0.5 pointer-events-none"><FiVideo className="w-2.5 h-2.5" />영상</span>}
                  {canDelete && <button type="button" onClick={() => removeMedia(m)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>}
                </div>
              ))}
            </div>
          )}
          <div>
            <MediaPicker files={newFiles} onChange={setNewFiles} disabled={busy} />
            {newFiles.length > 0 && (
              <button onClick={uploadMore} disabled={busy} className="mt-1.5 w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-xl disabled:opacity-40">{busy ? '업로드 중...' : `${newFiles.length}개 첨부 업로드`}</button>
            )}
          </div>

          {/* 정보 */}
          {editing ? (
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="물품명" />
              <div className="grid grid-cols-2 gap-2">
                <input value={foundPlace} onChange={e => setFoundPlace(e.target.value)} className={inputCls} placeholder="발견 장소" />
                <input type="date" value={foundDate} onChange={e => setFoundDate(e.target.value)} className={inputCls} />
              </div>
              <input value={keptAt} onChange={e => setKeptAt(e.target.value)} className={inputCls} placeholder="보관 장소" />
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="설명" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg">취소</button>
                <button onClick={saveEdit} disabled={busy} className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg disabled:opacity-40">저장</button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-[12px] text-gray-700 space-y-1">
              <p>📍 발견 장소: <b>{item.foundPlace || '—'}</b> · 발견일 <b>{item.foundDate}</b></p>
              <p>📦 보관 장소: <b>{item.keptAt || '—'}</b></p>
              {item.description && <p className="text-gray-600">📝 {item.description}</p>}
              {item.ownerName && <p className="text-rose-700">🏷️ 이름표: <b>{item.ownerName}</b>{item.ownerClassCode ? ` (${item.ownerClassCode})` : ''}</p>}
              {item.status === 'claimed' && <p className="text-emerald-700">✅ {item.claimedBy || '주인'}에게 돌려줌</p>}
              <button onClick={() => setEditing(true)} className="text-[11px] text-blue-600 hover:underline">정보 수정</button>
            </div>
          )}

          {/* 상태 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-700">상태 변경</p>
            <div className="flex gap-1.5">
              {LOST_ITEM_STATUSES.map(s => (
                <button key={s} onClick={() => setStatus(s)} disabled={busy}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${item.status === s ? `${LOST_STATUS_STYLE[s]} border-transparent` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {LOST_ITEM_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {(claiming || item.status === 'claimed') && (
              <div className="flex gap-2 items-center">
                <input value={claimName} onChange={e => setClaimName(e.target.value)} placeholder="돌려준 학생(사람) 이름" className={`${inputCls} flex-1`} autoFocus={claiming} />
                <button onClick={() => setStatus('claimed')} disabled={busy || !claimName.trim()} className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{item.status === 'claimed' ? '이름 저장' : '주인 찾음 처리'}</button>
              </div>
            )}
          </div>

          {canDelete && (
            <button onClick={remove} disabled={busy} className="w-full py-2 text-[11px] text-red-500 hover:bg-red-50 rounded-lg">기록 삭제</button>
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
    if (mode === 'adjust' && !memo.trim()) { alert('실사 조정 사유를 입력해주세요. (예: 29기 종료 실사)'); return; }
    if (!confirm(`${changed.length}칸을 ${mode === 'restock' ? '입고(기수 시작·보충)' : '실사 조정'}으로 저장할까요?`)) return;
    setBusy(true);
    try {
      const n = await setStockLevels(db, campCode, changed, {
        reason: mode, refLabel: mode === 'restock' ? '일괄 입고' : '실사', memo: memo.trim() || undefined,
      }, userName);
      alert(`${n}칸을 저장했습니다.`);
      setEdits({});
    } catch (e) {
      console.error('일괄 저장 오류:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  };

  if (groups.length === 0) return <p className="text-[11px] text-gray-400">먼저 그룹 · 패키지에서 재고 그룹을 만들어주세요.</p>;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800">📋 일괄 입력 · 실사</p>
        <p className="text-[10px] text-gray-400">칸에 <b>지금 실제 수량(낱개)</b>을 적고 저장하세요. 바뀐 칸만 기록되고, 차이는 변동 내역에 남습니다.</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {([['restock', '입고 (기수 시작·보충)'], ['adjust', '실사 조정']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${mode === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
          ))}
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={mode === 'adjust' ? '사유 (필수, 예: 29기 종료 실사)' : '메모 (선택, 예: 이마트 구매분)'}
            className="flex-1 min-w-[160px] text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto items-center">
          {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border ${category === c ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{c}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목 검색" className="ml-auto w-32 text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none" />
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh] rounded-xl border border-gray-200 bg-white">
        <table className="text-[11px] min-w-full">
          <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-gray-50 min-w-[150px]">품목</th>
              {groups.map(g => <th key={g.id} className="px-1.5 py-1.5 font-semibold whitespace-nowrap">{g.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.id} className="border-t border-gray-100">
                <td className="px-2 py-1 sticky left-0 bg-white">
                  <span className="font-semibold text-gray-800">{v.name}</span>
                  {(v.kind || v.spec) && <span className="text-gray-400 ml-1 text-[10px]">{[v.kind, v.spec].filter(Boolean).join(' · ')}</span>}
                  <span className="text-gray-300 ml-1 text-[10px]">{v.unit}</span>
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
        <span className="text-[11px] text-gray-500">바뀐 칸 <b className="text-emerald-700">{changed.length}</b></span>
        <div className="flex gap-1.5">
          <button onClick={() => setEdits({})} disabled={busy || Object.keys(edits).length === 0} className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg disabled:opacity-40">되돌리기</button>
          <button onClick={save} disabled={busy || changed.length === 0} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== ⚙️ 관리 (관리자) ====================

function ManageTab({ campCode, items, views, groups, packages, campGroups, userName, onSelect }: {
  campCode: string;
  items: InventoryItem[];
  views: InventoryItemView[];
  groups: InventoryGroup[];
  packages: InventoryPackage[];
  campGroups: CampGroup[];
  userName: string;
  onSelect: (id: string) => void;
}) {
  const [section, setSection] = useState<'items' | 'groups' | 'bulk'>('groups');
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-1.5">
        {([['groups', '그룹 · 패키지'], ['bulk', '일괄 입력 · 실사'], ['items', '품목 관리']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${section === id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
        ))}
      </div>
      {section === 'groups'
        ? <GroupManager campCode={campCode} groups={groups} packages={packages} campGroups={campGroups} views={views} userName={userName} />
        : section === 'bulk'
          ? <BulkStockEditor campCode={campCode} views={views} groups={groups} userName={userName} />
          : <ItemManager items={items} views={views} userName={userName} onSelect={onSelect} />}
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
      alert(`"${g.name}" 그룹에 재고가 남아 있습니다 (${left.length}개 품목: ${left.slice(0, 3).map(v => v.name).join(', ')}${left.length > 3 ? ' …' : ''}).\n일괄 입력·실사에서 다른 그룹으로 옮기거나 0으로 맞춘 뒤 삭제해주세요.`);
      return;
    }
    if (!confirm(`"${g.name}" 그룹을 삭제할까요?`)) return;
    await deleteInventoryGroup(db, g.id);
  };
  const savePkg = async () => {
    if (!pkgName.trim() || groups.length === 0 || busy) return;
    setBusy(true);
    try { await savePackageFromGroups(db, pkgName.trim(), groups, userName); setPkgName(''); }
    finally { setBusy(false); }
  };
  const apply = async (pkg: InventoryPackage) => {
    if (!confirm(`패키지 "${pkg.name}"의 그룹 ${pkg.slots.length}개를 이 캠프(${campCode})에 추가할까요?\n추가 후 그룹명·호실만 수정하면 됩니다.`)) return;
    const n = await applyPackageToCamp(db, campCode, pkg, groups);
    if (n === 0) alert('이미 같은 슬롯의 그룹이 있어 추가된 그룹이 없습니다.');
  };

  return (
    <div className="space-y-4">
      {/* 현재 캠프 그룹 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800">{campCode} 재고 그룹 <span className="text-gray-400 font-normal">({groups.length})</span></p>
        <p className="text-[10px] text-gray-400">보관 장소/키트 단위. 그룹명과 호실(보관 장소)은 기수마다 바꿔 쓰면 됩니다.</p>
        {groups.map(g => <GroupRow key={g.id} group={g} campGroups={campGroups} onDelete={() => remove(g)} />)}
        {campGroups.length > 0 && <p className="text-[10px] text-gray-400">"캠프 그룹"을 연결하면 환자 탭에서 학생 반에 맞는 그룹이 자동 선택됩니다.</p>}
        <div className="flex gap-1.5 items-center pt-1">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="그룹명 (예: Spring)" className="w-32 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <input value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="보관 장소 (예: 2층 교무실)" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <button onClick={add} disabled={!newName.trim() || busy} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40"><FiPlus className="w-3 h-3" />그룹</button>
        </div>
      </div>

      {/* 패키지 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-bold text-gray-800 flex items-center gap-1"><FiPackage className="w-3.5 h-3.5" />그룹 패키지 <span className="text-gray-400 font-normal">(회사 공통)</span></p>
        <p className="text-[10px] text-gray-400">그룹 구성을 저장해 두고 다음 기수에 적용한 뒤 그룹명·호실만 부여하세요.</p>
        {packages.length === 0 && <p className="text-[11px] text-gray-400">저장된 패키지가 없습니다.</p>}
        {packages.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded-lg px-2.5 py-1.5">
            <span className="font-semibold text-gray-800">{p.name}</span>
            <span className="text-gray-400 flex-1 truncate">{p.slots.map(s => s.label).join(' · ')}</span>
            <button onClick={() => apply(p)} className="text-emerald-700 font-semibold hover:underline">이 캠프에 적용</button>
            <button onClick={() => { if (confirm(`패키지 "${p.name}"을 삭제할까요?`)) deleteInventoryPackage(db, p.id); }} className="text-gray-300 hover:text-red-500">🗑️</button>
          </div>
        ))}
        <div className="flex gap-1.5 items-center pt-1">
          <input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder="현재 구성을 패키지로 저장 — 이름 (예: 제주 기본 세트)" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          <button onClick={savePkg} disabled={!pkgName.trim() || groups.length === 0 || busy} className="px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 rounded-lg disabled:opacity-40">저장</button>
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
      <input value={loc} onChange={e => setLoc(e.target.value)} onBlur={save} placeholder="보관 장소 / 호실" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
      {campGroups.length > 0 && (
        <select value={group.campGroupName ?? ''} onChange={e => updateInventoryGroup(db, group.id, { campGroupName: e.target.value })}
          className="w-24 text-[11px] border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white" title="연결할 캠프 그룹">
          <option value="">캠프 그룹 —</option>
          {campGroups.map(cg => <option key={cg.name} value={cg.name}>{cg.name}</option>)}
        </select>
      )}
      {dirty && <button onClick={save} className="text-[10px] font-semibold text-emerald-700">저장</button>}
      <button onClick={onDelete} className="text-gray-300 hover:text-red-500 text-xs px-1">🗑️</button>
    </div>
  );
}

function ItemManager({ items, views, userName, onSelect }: {
  items: InventoryItem[]; views: InventoryItemView[]; userName: string; onSelect: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const importDefaults = async () => {
    if (!confirm(`기본 품목 세트 ${DEFAULT_INVENTORY_ITEMS.length}개를 등록할까요? (이미 있는 품목은 건너뜁니다)`)) return;
    setBusy(true);
    try {
      const n = await importInventoryItems(db, DEFAULT_INVENTORY_ITEMS, items, userName);
      alert(`${n}개 품목을 추가했습니다.`);
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목 검색" className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none" />
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg"><FiPlus className="w-3 h-3" />품목 추가</button>
        <button onClick={importDefaults} disabled={busy} className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg disabled:opacity-40" title="시트 품목 + 상비약 대표 브랜드">기본 세트 불러오기</button>
      </div>
      <p className="text-[10px] text-gray-400">품목은 회사 공통입니다 — 여기서 바꾸면 모든 캠프에 반영됩니다. 수량은 캠프별로 품목 상세에서 입고합니다.</p>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {list.length === 0 && <p className="text-[11px] text-gray-400 px-3 py-3">품목이 없습니다.</p>}
        {list.map(v => (
          <div key={v.id} className={`flex items-center gap-2 px-3 py-2 text-[11px] ${v.isActive === false ? 'opacity-50' : ''}`}>
            <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 ${CATEGORY_STYLE[v.category] ?? CATEGORY_STYLE.기타}`}>{v.category}{v.subCategory ? `·${v.subCategory}` : ''}</span>
            <button onClick={() => onSelect(v.id)} className="flex-1 min-w-0 text-left truncate">
              <b className="text-gray-900">{v.name}</b>
              {v.kind && <span className="text-gray-500 ml-1">{v.kind}</span>}
              {v.spec && <span className="text-gray-400 ml-1">{v.spec}</span>}
              <span className="text-gray-400 ml-1">· {INVENTORY_USAGE_LABELS[getItemUsage(v)]} · {v.unit} · 최소 {v.minStockDefault ?? 0}{v.ingredient ? ` · ${v.ingredient}` : ''}</span>
            </button>
            {v.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500 shrink-0">사용 안 함</span>}
            <button onClick={() => setEditing(v)} className="text-gray-400 hover:text-emerald-700 shrink-0">✏️</button>
            <button onClick={() => updateInventoryItem(db, v.id, { isActive: v.isActive === false })} className="text-[10px] text-gray-400 hover:text-gray-700 shrink-0">{v.isActive === false ? '사용' : '사용 안 함'}</button>
          </div>
        ))}
      </div>
      {(showForm || editing) && (
        <ItemFormModal item={editing ?? undefined} userName={userName} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ==================== 품목 추가/수정 폼 ====================

function ItemFormModal({ item, userName, onClose }: { item?: InventoryItem; userName: string; onClose: () => void }) {
  const [category, setCategory] = useState<InventoryCategory>(item?.category ?? '의약품');
  const [subCategory, setSubCategory] = useState(item?.subCategory ?? '');
  const [kind, setKind] = useState(item?.kind ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [spec, setSpec] = useState(item?.spec ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '개');
  const [packSize, setPackSize] = useState(item?.packSize ? String(item.packSize) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [minStockDefault, setMinStockDefault] = useState(item?.minStockDefault != null ? String(item.minStockDefault) : '');
  const [isActive, setIsActive] = useState(item?.isActive !== false);
  const [usage, setUsage] = useState<InventoryUsage>(item ? getItemUsage(item) : 'oral');
  const [ingredient, setIngredient] = useState(item?.ingredient ?? '');
  const [intervalHours, setIntervalHours] = useState(item?.intervalHours != null ? String(item.intervalHours) : '');
  const [maxPerDay, setMaxPerDay] = useState(item?.maxPerDay != null ? String(item.maxPerDay) : '');
  const [dosageNote, setDosageNote] = useState(item?.dosageNote ?? '');
  const [busy, setBusy] = useState(false);

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
      if (item) await updateInventoryItem(db, item.id, data);
      else await addInventoryItem(db, { ...data, createdBy: userName });
      onClose();
    } catch (e) {
      console.error('품목 저장 오류:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400';
  const subs = INVENTORY_SUBCATEGORIES[category] ?? [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{item ? '품목 수정' : '품목 추가'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">분류 *</p>
            <div className="flex gap-1.5 flex-wrap">
              {INVENTORY_CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => { setCategory(c); setSubCategory(''); }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${category === c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">세부 분류</p>
              <input list="inv-subcats" value={subCategory} onChange={e => setSubCategory(e.target.value)} placeholder={subs.length ? subs.join(' / ') : '(선택)'} className={inputCls} />
              <datalist id="inv-subcats">{subs.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">종류</p>
              <input value={kind} onChange={e => setKind(e.target.value)} placeholder="예: 소화제, 진통제(아세트)" className={inputCls} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">품목명 *</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 타이레놀" className={inputCls} autoFocus={!item} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <p className="text-xs font-bold text-gray-700 mb-1">규격/비고</p>
              <input value={spec} onChange={e => setSpec(e.target.value)} placeholder="알약 500mg" className={inputCls} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">단위 (낱개)</p>
              <input list="inv-units" value={unit} onChange={e => setUnit(e.target.value)} className={inputCls} />
              <datalist id="inv-units">{INVENTORY_UNITS.map(u => <option key={u} value={u} />)}</datalist>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">포장당 낱개</p>
              <input type="number" min={1} value={packSize} onChange={e => setPackSize(e.target.value)} placeholder="예: 4" className={inputCls} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">유형 *</p>
            <div className="flex gap-1.5 flex-wrap">
              {INVENTORY_USAGES.map(u => (
                <button key={u} type="button" onClick={() => setUsage(u)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${usage === u ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{INVENTORY_USAGE_LABELS[u]}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">먹는 약·바르는 약·처치 소모품은 환자 탭에서 사용 기록할 수 있고, 비품은 위치·수량만 관리합니다.</p>
          </div>
          {usage === 'oral' && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
              <p className="text-xs font-bold text-emerald-800">복용 안내 · 경고 <span className="font-normal text-emerald-700/70">(포장 설명서 기준으로 관리자가 입력)</span></p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3 sm:col-span-1">
                  <p className="text-[11px] text-gray-600 mb-0.5">주성분</p>
                  <input value={ingredient} onChange={e => setIngredient(e.target.value)} placeholder="아세트아미노펜" className={inputCls} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 mb-0.5">최소 간격(시간)</p>
                  <input type="number" min={0} step={0.5} value={intervalHours} onChange={e => setIntervalHours(e.target.value)} placeholder="예: 4" className={inputCls} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 mb-0.5">1일 최대(회)</p>
                  <input type="number" min={0} value={maxPerDay} onChange={e => setMaxPerDay(e.target.value)} placeholder="예: 4" className={inputCls} />
                </div>
              </div>
              <textarea value={dosageNote} onChange={e => setDosageNote(e.target.value)} rows={2} placeholder="예: 만 7~12세 1정, 만 12세 이상 1~2정 (포장 설명서 확인)" className={`${inputCls} resize-none`} />
              <p className="text-[10px] text-gray-500">같은 주성분끼리 간격·횟수를 계산합니다 (예: 타이레놀과 판콜에이는 둘 다 아세트아미노펜).</p>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">설명 · 안내 <span className="font-normal text-gray-400">(약 선택 시 그대로 표시)</span></p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="예: 해열·진통제로 사용하는 약품. 식후 복용" className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">최소 보유 수량 (그룹당 기본값)</p>
              <input type="number" min={0} value={minStockDefault} onChange={e => setMinStockDefault(e.target.value)} placeholder="0 = 구매 필요 판단 안 함" className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4" />
              사용 중 <span className="text-[10px] text-gray-400">(해제 시 새 보고에서 숨김, 기록은 유지)</span>
            </label>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl">취소</button>
          <button onClick={save} disabled={!name.trim() || busy} className="flex-1 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
