'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiBox, FiSearch, FiPlus, FiShoppingCart, FiSettings, FiPackage, FiX, FiCopy, FiClipboard, FiCheck } from 'react-icons/fi';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { jobCodesService, CampCode } from '@/lib/stSheetService';
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
  subscribeInventoryRequests,
  subscribeInventoryRequestEntries,
  subscribePurchaseItems,
  createInventoryRequest,
  updateInventoryRequest,
  deleteInventoryRequest,
  saveInventoryRequestEntry,
  addPurchaseItems,
  updatePurchaseItem,
  deletePurchaseItem,
  receivePurchaseItem,
  summarizeRequestEntries,
  PURCHASE_STATUS_LABELS,
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
  InventoryRequest,
  InventoryRequestEntry,
  InventoryRequestLine,
  PurchaseItem,
} from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'purchase' | 'manage';

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

function fmtDateTime(ts: InventoryMovement['at']): string {
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
  const [requests, setRequests] = useState<InventoryRequest[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeInventoryRequests(db, campCode, setRequests);
    const u2 = subscribePurchaseItems(db, campCode, setPurchases);
    return () => { u1(); u2(); };
  }, [campCode]);

  const views = useMemo(() => buildInventoryViews(items, stocks), [items, stocks]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  const openRequests = useMemo(() => requests.filter(r => r.status === 'open'), [requests]);
  const pendingPurchases = useMemo(() => purchases.filter(p => p.status !== 'received').length, [purchases]);

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
    { id: 'request', title: isForeign ? 'Request' : '재고 요청', icon: <FiClipboard className="w-3.5 h-3.5" />, badge: openRequests.length },
    { id: 'purchase', title: isForeign ? 'To buy' : '구매 필요', icon: <FiShoppingCart className="w-3.5 h-3.5" />, badge: needs.length + pendingPurchases },
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
            {openRequests.length > 0 && (
              <button onClick={() => setSubTab('request')} className="mx-4 mt-3 w-[calc(100%-2rem)] text-left rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 hover:bg-blue-100 transition-colors">
                <p className="text-[11px] font-bold text-blue-800">📝 {openRequests.map(r => r.title).join(', ')} 진행 중</p>
                <p className="text-[10px] text-blue-700">필요한 물품과 수량을 재고 요청 탭에서 입력해주세요 →</p>
              </button>
            )}
            <StockTab views={views} groups={groups} needs={needs} isAdmin={isAdmin} onSelect={setSelectedId} />
          </>
        )}
        {subTab === 'request' && (
          <RequestTab campCode={campCode} requests={requests} items={items} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
        )}
        {subTab === 'purchase' && (
          <PurchaseTab needs={needs} groups={groups} purchases={purchases} items={items} campCode={campCode} isAdmin={isAdmin} userName={userName} onSelect={setSelectedId} />
        )}
        {subTab === 'manage' && isAdmin && (
          <ManageTab campCode={campCode} items={items} views={views} groups={groups} packages={packages} userName={userName} onSelect={setSelectedId} />
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

  const shortItems = useMemo(() => new Set(needs.map(n => n.itemId)), [needs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (!showInactive && v.isActive === false) return false;
      if (category !== '전체' && v.category !== category) return false;
      if (groupFilter !== '전체' && getGroupStock(v, groupFilter) <= 0) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, groupFilter, showInactive]);

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
            {isAdmin && (
              <label className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 shrink-0 cursor-pointer">
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
              const low = min > 0 && n < min;
              return (
                <span key={g.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  low ? 'bg-red-50 text-red-700 border-red-200 font-semibold' : n > 0 ? 'bg-gray-50 text-gray-700 border-gray-100' : 'bg-white text-gray-300 border-gray-100'
                }`}>{g.name} {n}</span>
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

// ==================== 🛒 구매 필요 ====================

function PurchaseTab({ needs, groups, purchases, items, campCode, isAdmin, userName, onSelect }: {
  needs: PurchaseNeed[]; groups: InventoryGroup[]; purchases: PurchaseItem[]; items: InventoryItem[];
  campCode: string; isAdmin: boolean; userName: string; onSelect: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const activePurchases = useMemo(() => purchases.filter(p => p.status !== 'received'), [purchases]);
  const receivedPurchases = useMemo(() => purchases.filter(p => p.status === 'received'), [purchases]);
  const text = useMemo(() => {
    const a = needs.map(n => `${n.itemName} / ${n.groupName} / 현재 ${n.current}${n.unit} / 최소 ${n.min}${n.unit} / 부족 ${n.shortage}${n.unit}`);
    const b = activePurchases.map(p => `${p.name} / ${p.quantity}${p.unit}${p.requestTitle ? ` / ${p.requestTitle}` : ''}${p.status === 'ordered' ? ' / 주문함' : ''}`);
    return [a.length ? `[최소 수량 미만]\n${a.join('\n')}` : '', b.length ? `[구매 목록]\n${b.join('\n')}` : ''].filter(Boolean).join('\n\n');
  }, [needs, activePurchases]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  // 품목별로 묶기
  const byItem = useMemo(() => {
    const map = new Map<string, PurchaseNeed[]>();
    needs.forEach(n => { if (!map.has(n.itemId)) map.set(n.itemId, []); map.get(n.itemId)!.push(n); });
    return [...map.entries()];
  }, [needs]);

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">최소 수량 미만 <span className="text-red-600">{needs.length}</span></p>
          <p className="text-[10px] text-gray-400">그룹별 현재 수량이 최소 보유 수량보다 적은 항목 (전체가 충분해도 표시)</p>
        </div>
        {(needs.length > 0 || activePurchases.length > 0) && (
          <button onClick={copy} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-emerald-300">
            <FiCopy className="w-3 h-3" />{copied ? '복사됨' : '텍스트 복사'}
          </button>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="text-[11px] text-gray-400">재고 그룹이 없어 계산할 수 없습니다.</p>
      ) : needs.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiShoppingCart className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">모든 그룹의 재고가 최소 수량 이상입니다.</p>
          <p className="text-[10px] text-gray-400 mt-1">최소 수량은 품목 수정 또는 품목 상세의 그룹별 "최소"에서 설정합니다.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {byItem.map(([itemId, list]) => (
            <button key={itemId} onClick={() => onSelect(itemId)} className="w-full text-left bg-white rounded-xl border border-red-100 px-3 py-2 hover:border-red-300">
              <p className="text-sm font-bold text-gray-900">{list[0].itemName}</p>
              <div className="mt-1 space-y-0.5">
                {list.map(n => (
                  <p key={n.groupId} className="text-[11px] text-gray-600">
                    <span className="font-semibold text-red-700">{n.groupName}</span> · 현재 {n.current}{n.unit} / 최소 {n.min}{n.unit} → <b className="text-red-600">부족 {n.shortage}{n.unit}</b>
                  </p>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 구매 목록 (요청 취합분 · 수동) */}
      <div className="pt-2">
        <p className="text-sm font-bold text-gray-800">구매 목록 <span className="text-amber-600">{activePurchases.length}</span></p>
        <p className="text-[10px] text-gray-400 mb-2">재고 요청 취합에서 추가된 항목. {isAdmin ? '주문 → 입고 처리하면 해당 그룹 재고에 반영됩니다.' : '상태는 관리자가 관리합니다.'}</p>
        {activePurchases.length === 0 ? (
          <p className="text-[11px] text-gray-400">구매 목록이 비어 있습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {activePurchases.map(p => (
              <PurchaseRow key={p.id} purchase={p} items={items} groups={groups} campCode={campCode} isAdmin={isAdmin} userName={userName} />
            ))}
          </div>
        )}
        {receivedPurchases.length > 0 && (
          <details className="mt-2 group">
            <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 list-none flex items-center gap-1">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>입고 완료 {receivedPurchases.length}건
            </summary>
            <div className="mt-1 space-y-1">
              {receivedPurchases.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <FiCheck className="w-3 h-3 text-emerald-500" />
                  <span className="flex-1 truncate line-through">{p.name} {p.quantity}{p.unit}{p.groupName ? ` → ${p.groupName}` : ''}</span>
                  {isAdmin && <button onClick={() => deletePurchaseItem(db, p.id)} className="hover:text-red-500">🗑️</button>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function PurchaseRow({ purchase: p, items, groups, campCode, isAdmin, userName }: {
  purchase: PurchaseItem; items: InventoryItem[]; groups: InventoryGroup[]; campCode: string; isAdmin: boolean; userName: string;
}) {
  const [receiving, setReceiving] = useState(false);
  const linked = items.find(i => i.id === p.itemId);
  const [itemId, setItemId] = useState(p.itemId ?? '');
  const [groupId, setGroupId] = useState(p.groupId ?? groups[0]?.id ?? '');
  const [qty, setQty] = useState(String(linked?.packSize ? p.quantity * linked.packSize : p.quantity));
  const [busy, setBusy] = useState(false);
  const target = items.find(i => i.id === itemId);
  const group = groups.find(g => g.id === groupId);

  const receive = async () => {
    if (busy) return;
    const n = parseInt(qty, 10);
    if (!target || !group || isNaN(n) || n < 0) { alert('품목·그룹·수량을 확인해주세요.'); return; }
    setBusy(true);
    try {
      await receivePurchaseItem(db, campCode, p, { itemId: target.id, itemName: target.name, groupId: group.id, groupName: group.name, quantity: n }, userName);
      setReceiving(false);
    } catch (e) { console.error('입고 처리 오류:', e); alert('입고 처리 중 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-white rounded-xl border px-3 py-2 ${p.status === 'ordered' ? 'border-blue-200' : 'border-amber-200'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${p.status === 'ordered' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>{PURCHASE_STATUS_LABELS[p.status]}</span>
        <span className="flex-1 min-w-0 text-[12px] text-gray-800 truncate"><b>{p.name}</b> {p.quantity}{p.unit}{p.memo ? <span className="text-gray-400"> · {p.memo}</span> : null}</span>
        {p.requestTitle && <span className="text-[10px] text-gray-400 shrink-0">{p.requestTitle}</span>}
        {isAdmin && !receiving && (
          <div className="flex items-center gap-1 shrink-0">
            {p.status === 'needed' && <button onClick={() => updatePurchaseItem(db, p.id, { status: 'ordered' })} className="text-[10px] font-semibold text-blue-700 hover:underline">주문함</button>}
            {p.status === 'ordered' && <button onClick={() => updatePurchaseItem(db, p.id, { status: 'needed' })} className="text-[10px] text-gray-400 hover:underline">주문 취소</button>}
            <button onClick={() => setReceiving(true)} className="text-[10px] font-semibold text-emerald-700 hover:underline">입고 처리</button>
            <button onClick={() => { if (confirm('구매 목록에서 삭제할까요?')) deletePurchaseItem(db, p.id); }} className="text-gray-300 hover:text-red-500 text-[11px]">🗑️</button>
          </div>
        )}
      </div>
      {receiving && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 space-y-1.5">
          <p className="text-[10px] font-bold text-emerald-800">📥 입고 처리 — 어느 품목·그룹에 낱개 몇 개를 넣을까요?</p>
          <div className="flex gap-1.5 flex-wrap items-center">
            <select value={itemId} onChange={e => setItemId(e.target.value)} className="text-[11px] border border-emerald-200 rounded-lg px-2 py-1 bg-white flex-1 min-w-[120px]">
              <option value="">품목 선택</option>
              {items.filter(i => i.isActive !== false).map(i => <option key={i.id} value={i.id}>{i.name}{i.spec ? ` (${i.spec})` : ''}</option>)}
            </select>
            <select value={groupId} onChange={e => setGroupId(e.target.value)} className="text-[11px] border border-emerald-200 rounded-lg px-2 py-1 bg-white w-28">
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} className="text-[11px] border border-emerald-200 rounded-lg px-2 py-1 bg-white w-20" />
            <span className="text-[10px] text-gray-500">{target?.unit ?? '개'}{target?.packSize ? ` (1포장 = ${target.packSize}${target.unit})` : ''}</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setReceiving(false)} className="px-2.5 py-1 text-[11px] text-gray-500 bg-white border border-gray-200 rounded-lg">취소</button>
            <button onClick={receive} disabled={busy} className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-50">{busy ? '처리 중...' : '입고 + 완료'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 📝 재고 요청 (취합) ====================

function RequestTab({ campCode, requests, items, isAdmin, userId, userName }: {
  campCode: string; requests: InventoryRequest[]; items: InventoryItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = requests.find(r => r.id === openId) ?? null;

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createInventoryRequest(db, { campCode, title: title.trim(), dueDate: dueDate || undefined, note: note.trim() || undefined, createdBy: userName, createdById: userId });
      setTitle(''); setDueDate(''); setNote(''); setShowCreate(false); setOpenId(id);
    } finally { setBusy(false); }
  };

  if (opened) {
    return <RequestDetail request={opened} items={items} isAdmin={isAdmin} userId={userId} userName={userName} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">재고 요청</p>
          <p className="text-[10px] text-gray-400">관리자가 요청을 만들면 선생님들이 각자 필요한 물품과 수량을 입력하고, 관리자가 한 화면에서 합산해 구매 목록에 추가합니다.</p>
        </div>
        {isAdmin && !showCreate && (
          <button onClick={() => { setShowCreate(true); setTitle(`${new Date().getMonth() + 1}월 재고 요청`); }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg shrink-0"><FiPlus className="w-3 h-3" />재고 요청 만들기</button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-emerald-200 p-3 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목 (예: 9월 재고 요청)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none" autoFocus />
          <div className="flex gap-2">
            <input type="date" value={dueDate} min={todayStr()} onChange={e => setDueDate(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="안내 (선택, 예: 수요일까지 입력해주세요)" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg">취소</button>
            <button onClick={create} disabled={!title.trim() || busy} className="flex-1 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">만들기</button>
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <FiClipboard className="h-9 w-9 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">진행 중인 재고 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {requests.map(r => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className={`w-full text-left bg-white rounded-xl border px-3 py-2.5 hover:border-emerald-300 ${r.status === 'open' ? 'border-blue-200' : 'border-gray-200 opacity-70'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${r.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{r.status === 'open' ? '진행 중' : '마감'}</span>
                <span className="text-sm font-bold text-gray-900 flex-1 truncate">{r.title}</span>
                {r.dueDate && <span className="text-[10px] text-gray-400">~{r.dueDate}</span>}
              </div>
              {r.note && <p className="text-[11px] text-gray-500 mt-0.5">{r.note}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestDetail({ request, items, isAdmin, userId, userName, onBack }: {
  request: InventoryRequest; items: InventoryItem[]; isAdmin: boolean; userId: string; userName: string; onBack: () => void;
}) {
  const [entries, setEntries] = useState<InventoryRequestEntry[]>([]);
  useEffect(() => subscribeInventoryRequestEntries(db, request.id, setEntries), [request.id]);
  const mine = entries.find(e => e.userId === userId);
  const isOpen = request.status === 'open';

  // 내 요청 편집
  const [lines, setLines] = useState<InventoryRequestLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => { if (!dirty) setLines(mine?.items ?? []); }, [mine, dirty]);

  const newLine = (): InventoryRequestLine => ({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: '', quantity: 1, unit: '개' });
  const update = (id: string, patch: Partial<InventoryRequestLine>) => { setDirty(true); setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l)); };
  const onNameChange = (id: string, name: string) => {
    const matched = items.find(i => i.name === name.trim());
    update(id, { name, itemId: matched?.id, ...(matched ? { unit: matched.unit } : {}) });
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveInventoryRequestEntry(db, { requestId: request.id, campCode: request.campCode, userId, userName, items: lines });
      setDirty(false); setSavedAt(Date.now());
    } catch (e) { console.error('요청 저장 오류:', e); alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  // 취합 (관리자)
  const summary = useMemo(() => summarizeRequestEntries(entries), [entries]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const addToPurchase = async () => {
    const sel = summary.filter(s => checked.has(s.key));
    if (sel.length === 0 || adding) return;
    setAdding(true);
    try {
      const n = await addPurchaseItems(db, request.campCode, sel.map(s => ({
        itemId: s.itemId, name: s.name, quantity: s.total, unit: s.unit,
        memo: s.requesters.map(r => `${r.userName} ${r.quantity}${s.unit}${r.memo ? `(${r.memo})` : ''}`).join(', '),
      })), userName, { id: request.id, title: request.title });
      alert(`${n}개 항목을 구매 목록에 추가했습니다.`);
      setChecked(new Set());
    } finally { setAdding(false); }
  };

  const inputCls = 'text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none bg-white';

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="flex items-start gap-2">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-800 mt-0.5">← 목록</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{isOpen ? '진행 중' : '마감'}</span>
            <h3 className="text-sm font-bold text-gray-900 truncate">{request.title}</h3>
            {request.dueDate && <span className="text-[10px] text-gray-400">~{request.dueDate}</span>}
          </div>
          {request.note && <p className="text-[11px] text-gray-500 mt-0.5">{request.note}</p>}
          <p className="text-[10px] text-gray-400 mt-0.5">{entries.length}명 입력 · 만든 사람 {request.createdBy}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => updateInventoryRequest(db, request.id, { status: isOpen ? 'closed' : 'open' })}
              className={`px-2 py-1 text-[10px] font-semibold rounded-lg border ${isOpen ? 'text-gray-700 bg-white border-gray-200' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>{isOpen ? '요청 마감' : '다시 열기'}</button>
            <button onClick={() => { if (confirm('이 재고 요청과 모든 입력을 삭제할까요?')) { deleteInventoryRequest(db, request.id); onBack(); } }} className="text-gray-300 hover:text-red-500 text-xs">🗑️</button>
          </div>
        )}
      </div>

      {/* 내 요청 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-800">내 요청 <span className="text-gray-400 font-normal">({userName})</span></p>
          {isOpen && <button onClick={() => { setDirty(true); setLines(ls => [...ls, newLine()]); }} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><FiPlus className="w-3 h-3" />항목 추가</button>}
        </div>
        {lines.length === 0 && <p className="text-[11px] text-gray-400">{isOpen ? '필요한 물품을 추가해주세요. 품목명을 입력하면 등록된 품목이 자동 완성됩니다.' : '입력한 항목이 없습니다.'}</p>}
        {lines.map(l => (
          <div key={l.id} className="flex gap-1.5 items-center">
            <input list="inv-item-names" value={l.name} onChange={e => onNameChange(l.id, e.target.value)} disabled={!isOpen} placeholder="품목명 (예: 밴드)" className={`${inputCls} flex-1 min-w-0`} />
            <input type="number" min={1} value={l.quantity} onChange={e => update(l.id, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })} disabled={!isOpen} className={`${inputCls} w-14 text-center`} />
            <input list="inv-req-units" value={l.unit} onChange={e => update(l.id, { unit: e.target.value })} disabled={!isOpen} className={`${inputCls} w-14`} />
            <input value={l.memo ?? ''} onChange={e => update(l.id, { memo: e.target.value || undefined })} disabled={!isOpen} placeholder="메모" className={`${inputCls} w-24`} />
            {isOpen && <button onClick={() => { setDirty(true); setLines(ls => ls.filter(x => x.id !== l.id)); }} className="text-gray-300 hover:text-red-500 text-xs">🗑️</button>}
          </div>
        ))}
        <datalist id="inv-item-names">{items.filter(i => i.isActive !== false).map(i => <option key={i.id} value={i.name} />)}</datalist>
        <datalist id="inv-req-units">{['개', '박스', '통', '팩', '병', '정', '세트', '묶음'].map(u => <option key={u} value={u} />)}</datalist>
        {isOpen && (
          <div className="flex items-center justify-end gap-2 pt-1">
            {savedAt && !dirty && <span className="text-[10px] text-emerald-600">저장됨</span>}
            <button onClick={save} disabled={!dirty || saving} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">{saving ? '저장 중...' : '내 요청 저장'}</button>
          </div>
        )}
      </div>

      {/* 취합 (관리자) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-800">취합 결과 <span className="text-gray-400 font-normal">(같은 품목·단위 자동 합산)</span></p>
            <button onClick={addToPurchase} disabled={checked.size === 0 || adding} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-amber-500 rounded-lg disabled:opacity-40"><FiShoppingCart className="w-3 h-3" />선택 {checked.size}개 구매 목록에 추가</button>
          </div>
          {summary.length === 0 ? <p className="text-[11px] text-gray-400">아직 입력된 요청이 없습니다.</p> : (
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-100">
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-gray-400 bg-gray-50">
                <input type="checkbox" checked={checked.size === summary.length} onChange={e => setChecked(e.target.checked ? new Set(summary.map(s => s.key)) : new Set())} className="w-3 h-3" />
                <span className="flex-1">품목</span><span className="w-16 text-right">합계</span>
              </div>
              {summary.map(s => (
                <label key={s.key} className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={checked.has(s.key)} onChange={e => setChecked(prev => { const n = new Set(prev); if (e.target.checked) n.add(s.key); else n.delete(s.key); return n; })} className="w-3 h-3 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-900">{s.name} {!s.itemId && <span className="text-[9px] text-gray-400 font-normal">(직접 입력)</span>}</p>
                    <p className="text-[10px] text-gray-500">{s.requesters.map(r => `${r.userName} ${r.quantity}${s.unit}${r.memo ? `(${r.memo})` : ''}`).join(' · ')}</p>
                  </div>
                  <span className="w-16 text-right text-[12px] font-bold text-amber-700">총 {s.total}{s.unit}</span>
                </label>
              ))}
            </div>
          )}
          <details className="group">
            <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 list-none flex items-center gap-1"><span className="group-open:rotate-90 transition-transform inline-block">▶</span>선생님별 원본 ({entries.length}명)</summary>
            <div className="mt-1.5 space-y-1.5">
              {entries.map(e => (
                <div key={e.id} className="text-[11px] bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <p className="font-semibold text-gray-800">{e.userName}</p>
                  {e.items.length === 0 ? <p className="text-gray-400">(없음)</p> : e.items.map(l => <p key={l.id} className="text-gray-600">· {l.name} {l.quantity}{l.unit}{l.memo ? ` — ${l.memo}` : ''}</p>)}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ==================== ⚙️ 관리 (관리자) ====================

function ManageTab({ campCode, items, views, groups, packages, userName, onSelect }: {
  campCode: string;
  items: InventoryItem[];
  views: InventoryItemView[];
  groups: InventoryGroup[];
  packages: InventoryPackage[];
  userName: string;
  onSelect: (id: string) => void;
}) {
  const [section, setSection] = useState<'items' | 'groups'>('groups');
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-1.5">
        {([['groups', '그룹 · 패키지'], ['items', '품목 관리']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${section === id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
        ))}
      </div>
      {section === 'groups'
        ? <GroupManager campCode={campCode} groups={groups} packages={packages} userName={userName} />
        : <ItemManager items={items} views={views} userName={userName} onSelect={onSelect} />}
    </div>
  );
}

function GroupManager({ campCode, groups, packages, userName }: {
  campCode: string; groups: InventoryGroup[]; packages: InventoryPackage[]; userName: string;
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
    if (!confirm(`"${g.name}" 그룹을 삭제할까요?\n이 그룹에 남아 있는 수량은 총 재고 계산에서 빠집니다.`)) return;
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
        {groups.map(g => <GroupRow key={g.id} group={g} onDelete={() => remove(g)} />)}
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

function GroupRow({ group, onDelete }: { group: InventoryGroup; onDelete: () => void }) {
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
        <button onClick={importDefaults} disabled={busy} className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg disabled:opacity-40" title="시트 기준 기본 품목 93개">기본 세트 불러오기</button>
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
              <span className="text-gray-400 ml-1">· {v.unit} · 최소 {v.minStockDefault ?? 0}</span>
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
