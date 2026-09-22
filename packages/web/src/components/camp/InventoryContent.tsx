'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiBox, FiSearch, FiPlus, FiSettings, FiPackage, FiX, FiCopy, FiClipboard, FiCamera, FiImage, FiVideo } from 'react-icons/fi';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
  INVENTORY_USAGES,
  INVENTORY_USAGE_LABELS,
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
  생활용품: 'bg-amber-50 text-amber-700 border-amber-100',
  서류: 'bg-slate-50 text-slate-700 border-slate-200',
  교구: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  기타: 'bg-gray-50 text-gray-600 border-gray-200',
};

/** 푸시 알림 요청 — 실패해도 화면 동작은 그대로 (받는 사람은 서버가 정한다) */
function notifySupply(body: Record<string, unknown>) {
  authenticatedPost('/api/inventory/notify', body).catch(e => console.warn('알림 요청 실패:', e));
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
            <StockTab views={views} groups={groups} needs={needs} isAdmin={isAdmin} userName={userName} myGroupId={myInvGroupId}
              onSelect={id => { setQuickUseGroupId(undefined); setSelectedId(id); }}
              onQuickUse={(id, gid) => { setQuickUseGroupId(gid); setSelectedId(id); }} />
          </>
        )}
        {subTab === 'request' && (
          <SupplyRequestTab campCode={campCode} jobCodeId={activeJobCodeId ?? ''} requests={requests} settings={supplySettings} guides={supplyGuides} campGroups={campGroups}
            userGroup={userData?.jobExperiences?.find(e => e.id === activeJobCodeId)?.group} items={items} views={views} groups={groups} needs={needs} students={students} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
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
          userId={userData?.userId ?? ''}
          userName={userName}
          initialUseGroupId={quickUseGroupId}
          onClose={() => { setSelectedId(null); setQuickUseGroupId(undefined); }}
        />
      )}
    </div>
  );
}

// ==================== 📦 재고 현황 ====================

function StockTab({ views, groups, needs, isAdmin, userName, myGroupId, onSelect, onQuickUse }: {
  views: InventoryItemView[];
  groups: InventoryGroup[];
  needs: PurchaseNeed[];
  isAdmin: boolean;
  userName: string;
  myGroupId?: string;
  onSelect: (id: string) => void;
  onQuickUse: (id: string, groupId: string) => void;
}) {
  // 관리자: 분류별 품목 추가 (추가하면 바로 상세를 열어 그룹 수량 입력)
  const [adding, setAdding] = useState<{ category?: InventoryCategory; subCategory?: string } | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  // 처음 한 번은 '내 그룹'으로 (직접 바꾸면 그대로 둠)
  const [groupTouched, setGroupTouched] = useState(false);
  useEffect(() => { if (!groupTouched && myGroupId) setGroupFilter(myGroupId); }, [myGroupId, groupTouched]);
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
      if (groupFilter !== '전체' && !(groupFilter in v.stocks)) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category, groupFilter, showInactive, placedOnly, anyPlaced]);

  // 세부 분류별로 묶어서 표시
  const sections = useMemo(() => {
    const map = new Map<string, { cat: InventoryCategory; sub?: string; list: InventoryItemView[] }>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, { cat: v.category, sub: v.subCategory, list: [] });
      map.get(key)!.list.push(v);
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
          {isAdmin && (
            <button onClick={() => setAdding({ category: category === '전체' ? undefined : category })}
              className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap text-white bg-gray-800">
              <FiPlus className="w-3 h-3" />{category === '전체' ? '품목 추가' : `${category}에 추가`}
            </button>
          )}
        </div>
        {groups.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center">
            <span className="text-[10px] text-gray-400 shrink-0">그룹</span>
            {[{ id: '전체', name: '전체' }, ...groups].map(g => (
              <button key={g.id} onClick={() => { setGroupTouched(true); setGroupFilter(g.id); }}
                className={`px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap border transition-colors ${
                  groupFilter === g.id ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold' : 'bg-white text-gray-500 border-gray-200'
                }`}>{g.id === myGroupId ? '★ ' : ''}{g.name}</button>
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
        sections.map(([title, { cat, sub, list }]) => (
          <div key={title}>
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <p className="flex-1 text-[11px] font-bold text-gray-500">{title} <span className="text-gray-300 font-normal">{list.length}</span></p>
              {isAdmin && <button onClick={() => setAdding({ category: cat, subCategory: sub })} className="text-[10px] font-semibold text-emerald-700 hover:underline">+ {sub ?? cat}에 추가</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {list.map(v => (
                <div key={v.id} className="relative">
                  <ItemCard view={v} groups={groups} isShort={shortItems.has(v.id)} onClick={() => onSelect(v.id)} />
                  {groupFilter !== '전체' && groupFilter in v.stocks && (
                    <button onClick={() => onQuickUse(v.id, groupFilter)} title="이 그룹에서 사용 기록"
                      className="absolute right-2 bottom-2 px-2 py-0.5 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm">− 사용</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {adding && <ItemFormModal preset={adding} userName={userName} onClose={() => setAdding(null)} onCreated={id => onSelect(id)} />}
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
        {itemThumb(view) && <img src={itemThumb(view)} alt="" className="w-11 h-11 rounded-lg object-cover bg-gray-100 shrink-0" loading="lazy" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-gray-900 truncate">{view.name}</span>
            {view.kind && <span className="text-[10px] text-gray-500">{view.kind}</span>}
            {view.spec && <span className="text-[10px] text-gray-400">{view.spec}</span>}
            {view.isActive === false && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500">사용 안 함</span>}
            {(() => { const ex = earliestExpiry(view); const st = expiryState(ex); return st === 'expired' || st === 'soon'
              ? <span className={`text-[9px] px-1 rounded font-bold ${st === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>⏳ {fmtExpiry(ex)} {st === 'expired' ? '지남' : '임박'}</span> : null; })()}
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

/** 품목이 어떻게 생겼는지 — 스태프 누구나 추가·삭제 (삭제는 확인 창) */
function ItemMediaSection({ item, userName }: { item: InventoryItem; isAdmin?: boolean; userName: string }) {
  const [deleting, setDeleting] = useState<ItemMedia | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const media = item.media ?? [];
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ItemMedia | null>(null);
  const add = async (files: File[]) => {
    if (!files.length) return;
    if (files.some(f => f.size > 50 * 1024 * 1024)) alert('50MB를 넘는 파일은 빼고 올립니다.');
    setBusy(true);
    try { await addInventoryItemMedia(db, item.id, await uploadItemMedia(item.id, files, userName)); }
    catch (e) { console.error('품목 사진 업로드 오류:', e); alert('사진을 올리지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = async (m: ItemMedia) => {
    setDeleteBusy(true);
    try { await removeInventoryItemMedia(db, item.id, media, m.path); await deleteObject(storageRef(storage, m.path)).catch(() => {}); setDeleting(null); }
    catch (e) { console.error(e); alert('삭제하지 못했습니다.'); }
    finally { setDeleteBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold text-gray-700">사진 · 영상 <span className="font-normal text-gray-400">{media.length || ''}</span></p>
        <label className={`flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${busy ? 'text-gray-400' : 'text-blue-700 hover:underline'}`}>
          <FiCamera className="w-3.5 h-3.5" />{busy ? '올리는 중...' : '추가'}
          <input type="file" accept="image/*,video/*" multiple disabled={busy} className="hidden" onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
      </div>
      {media.length === 0 ? (
        <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">아직 사진이 없어요. 포장·실물 사진을 올려두면 다른 선생님이 찾기 쉬워요.</p>
      ) : (
        <div className="space-y-2">
          {media.map(m => (
            <div key={m.path} className="relative w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              {m.type === 'video'
                ? <video src={m.url} className="w-full max-h-[420px] bg-black" controls playsInline preload="metadata" />
                : <img src={m.url} alt="" className="w-full max-h-[420px] object-contain bg-gray-50 cursor-zoom-in" loading="lazy" onClick={() => setViewing(m)} />}
              {m.by && <span className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white pointer-events-none">{m.by}</span>}
              <button onClick={() => setDeleting(m)} title="삭제" className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center hover:bg-red-600">✕</button>
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
              <h3 className="text-base font-bold text-gray-900">이 {deleting.type === 'video' ? '영상' : '사진'}을 삭제할까요?</h3>
              <p className="text-[12px] text-gray-600 leading-relaxed">
                <b>{item.name}</b>의 {deleting.type === 'video' ? '영상' : '사진'}이 <b className="text-red-600">모든 캠프에서 사라지고 되돌릴 수 없어요.</b>
                {deleting.by ? <> ({deleting.by} 선생님이 올림)</> : null}
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDeleting(null)} disabled={deleteBusy} className="flex-1 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl">취소</button>
                <button onClick={() => remove(deleting)} disabled={deleteBusy} className="flex-1 py-2 text-sm font-bold text-white bg-red-600 rounded-xl disabled:opacity-50">{deleteBusy ? '삭제 중...' : '삭제'}</button>
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
          {viewing.by && <p className="absolute bottom-4 inset-x-0 text-center text-[11px] text-white/70">{viewing.by} 올림</p>}
        </div>
      )}
    </div>
  );
}

// ==================== 품목 상세 (그룹별 수량 · 입고 · 조정 · 이력) ====================

function ItemDetailModal({ view, groups, campCode, isAdmin, userId, userName, initialUseGroupId, onClose }: {
  view: InventoryItemView;
  groups: InventoryGroup[];
  campCode: string;
  isAdmin: boolean;
  userId: string;
  userName: string;
  initialUseGroupId?: string;
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
    } catch (e) { console.error(e); alert('저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const [showAllMoves, setShowAllMoves] = useState(false);

  const group = groups.find(g => g.id === mode?.groupId);
  const current = mode ? getGroupStock(view, mode.groupId) : 0;

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
        await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
        if (restockExpiry) await setStockMeta(db, campCode, view.id, group.id, { expiry: restockExpiry });
        setRestockExpiry('');
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
                      <th className="px-2 py-1.5" />
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
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <button onClick={() => setMeta({ groupId: g.id, kind: 'location', value: view.locations[g.id] ?? '' })}
                                className={`text-[10px] ${view.locations[g.id] ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>📍 {view.locations[g.id] || '위치 적기'}</button>
                              {(() => {
                                const ex = view.expiries[g.id]; const st = expiryState(ex);
                                if (!ex) return isAdmin ? <button onClick={() => setMeta({ groupId: g.id, kind: 'expiry', value: '' })} className="text-[10px] text-gray-300 hover:text-gray-500">⏳ 유효기간</button> : null;
                                return <button disabled={!isAdmin} onClick={() => setMeta({ groupId: g.id, kind: 'expiry', value: ex })}
                                  className={`text-[10px] px-1 rounded ${st === 'expired' ? 'bg-red-100 text-red-700 font-bold' : st === 'soon' ? 'bg-amber-100 text-amber-800 font-bold' : 'text-gray-500'}`}>⏳ {fmtExpiry(ex)}{st === 'expired' ? ' 지남' : st === 'soon' ? ' 임박' : ''}</button>;
                              })()}
                            </div>
                          </td>
                          <td className={`text-right px-2 py-1.5 font-bold ${low ? 'text-red-600' : 'text-gray-800'}`}>{n}</td>
                          <td className="text-right px-2 py-1.5 text-gray-500">{min}{isOverride && <span className="text-[9px] text-amber-600 ml-0.5">*</span>}</td>
                          <td className="px-2 py-1.5">
                            {low ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">구매 필요 (−{min - n})</span>
                              : <span className="text-[10px] text-gray-400">충분</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {g.id in view.stocks && (
                              <button onClick={() => { setMode({ type: 'use', groupId: g.id }); setQty('1'); setMemo(''); }} className="text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded px-1.5 py-0.5 mr-2">− 사용</button>
                            )}
                            {isAdmin && (
                              <>
                                <button onClick={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }} className="text-[10px] font-semibold text-emerald-700 hover:underline mr-2">+입고</button>
                                <button onClick={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }} className="text-[10px] text-gray-500 hover:underline mr-2">조정</button>
                                <button onClick={() => { setMode({ type: 'min', groupId: g.id }); setQty(isOverride ? String(view.minStocks[g.id]) : ''); setMemo(''); }} className="text-[10px] text-gray-500 hover:underline">최소</button>
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
            {isAdmin && <p className="text-[10px] text-gray-400 mt-1">최소 수량 기본값 {view.minStockDefault ?? 0}{view.unit} (품목 수정에서 변경) · * 표시는 그룹별 예외</p>}
          </div>

          {/* 세부 위치 · 유효기간 */}
          {meta && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-bold text-gray-800">{meta.kind === 'location' ? '📍 세부 위치' : '⏳ 유효기간'} · {groups.find(g => g.id === meta.groupId)?.name}</p>
              {meta.kind === 'location' ? (
                <input value={meta.value} onChange={e => setMeta({ ...meta, value: e.target.value })} autoFocus placeholder="예: 약통 2번 칸, 교무실 캐비닛 위"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
              ) : (
                <div className="flex items-center gap-2">
                  <input type="date" value={meta.value} onChange={e => setMeta({ ...meta, value: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" />
                  <span className="text-[10px] text-gray-400">여러 개면 가장 빠른 날짜</span>
                </div>
              )}
              <div className="flex gap-2">
                {meta.value && <button onClick={() => setMeta({ ...meta, value: '' })} className="px-3 py-1.5 text-xs text-red-500 bg-white border border-red-200 rounded-lg">지우기</button>}
                <button onClick={() => setMeta(null)} className="flex-1 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg">취소</button>
                <button onClick={saveMeta} disabled={busy} className="flex-1 py-1.5 text-xs font-bold text-white bg-gray-800 rounded-lg disabled:opacity-50">저장</button>
              </div>
            </div>
          )}

          {/* 입고 / 조정 / 최소 폼 */}
          {mode && group && (
            <div className={`rounded-xl border p-3 space-y-2 ${mode.type === 'use' ? 'border-blue-200 bg-blue-50' : mode.type === 'restock' ? 'border-emerald-200 bg-emerald-50' : mode.type === 'adjust' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className="text-xs font-bold text-gray-800">
                {mode.type === 'use' ? '📤 사용' : mode.type === 'restock' ? '📥 재고 입고' : mode.type === 'adjust' ? '✏️ 수량 직접 조정' : '📏 최소 보유 수량'} · {group.name}
                <span className="font-normal text-gray-500 ml-1">현재 {current}{view.unit}</span>
              </p>
              <div className="flex gap-2 items-center">
                <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} autoFocus
                  placeholder={mode.type === 'restock' ? '입고 수량' : mode.type === 'adjust' ? '조정 후 수량' : `비우면 기본값(${view.minStockDefault ?? 0})`}
                  className="w-32 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
                <span className="text-xs text-gray-500">{view.unit}</span>
                {mode.type === 'restock' && qty && <span className="text-[11px] text-emerald-700">→ {current + (parseInt(qty, 10) || 0)}{view.unit}</span>}
                {mode.type === 'use' && qty && <span className="text-[11px] text-blue-700">→ {current - (parseInt(qty, 10) || 0)}{view.unit} 남음</span>}
                {mode.type === 'restock' && (
                  <label className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">유효기간
                    <input type="date" value={restockExpiry} onChange={e => setRestockExpiry(e.target.value)} className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
                  </label>
                )}
                {mode.type === 'adjust' && qty && <span className="text-[11px] text-amber-700">차이 {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</span>}
              </div>
              {mode.type !== 'min' && (
                <>
                {mode.type === 'use' && isMedicine && (
                  <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">💊 학생에게 먹이거나 발라 준 약은 <b>환자 탭</b>에서 복용 기록을 남기면 자동으로 빠져요. 여기서도 빼면 두 번 빠집니다.</p>
                )}
                {mode.type === 'use' && (
                  <div className="flex flex-wrap gap-1">
                    {USE_REASONS.map(r => (
                      <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${memo === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{r}</button>
                    ))}
                  </div>
                )}
                {mode.type === 'adjust' && (
                  <div className="flex flex-wrap gap-1">
                    {ADJUST_REASONS.map(r => (
                      <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${memo === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>{r}</button>
                    ))}
                  </div>
                )}
                <input value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder={mode.type === 'use' ? '어디에 썼나요? (선택, 예: 3반 미술 수업)' : mode.type === 'restock' ? '메모 (선택, 예: 이마트 구매)' : '위에서 고르거나 직접 입력 (필수)'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
                </>
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
                {(showAllMoves ? movements : movements.slice(0, 4)).map(m => (
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
                {movements.length > 4 && (
                  <button onClick={() => setShowAllMoves(v => !v)} className="w-full py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800">
                    {showAllMoves ? '접기 ▲' : `이전 내역 ${movements.length - 4}건 더 보기 ▼`}
                  </button>
                )}
              </div>
            )}
          </div>

          <ItemMediaSection item={view} isAdmin={isAdmin} userName={userName} />
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
type SupplyBuyer = ReturnType<typeof supplyBuyerOf>;
/** 목록·상세에 쓰는 상태 한 줄 설명 */
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
/** 관리자 지정 품목(쿠팡·학부모 청구) 표시 */
function GuideTag({ line }: { line: Pick<SupplyRequestLine, 'channel' | 'parentBill'> }) {
  if (!line.channel && !line.parentBill) return null;
  return <span className="ml-1 inline-block text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-800 font-bold align-middle">{[line.channel, line.parentBill ? '학부모 청구' : ''].filter(Boolean).join(' · ')}</span>;
}
function SectionHeader({ label, count }: { label: string; count: number }) {
  return <p className="px-1 pt-1 text-[11px] font-bold text-gray-500">{label === '캠프 공용' ? '🏕 ' : '👥 '}{label} <span className="font-normal text-gray-400">{count}</span></p>;
}

function readPayTo(): string { try { return localStorage.getItem(PAYTO_KEY) ?? ''; } catch { return ''; } }
function savePayTo(v: string) { try { localStorage.setItem(PAYTO_KEY, v); } catch { /* noop */ } }

type SupplyEditing = { mode: 'new'; prefill?: SupplyRequest } | { mode: 'edit'; req: SupplyRequest };
type SupplyAssigning = { mode: 'default' } | { mode: 'reqs'; reqs: SupplyRequest[] };

function SupplyRequestTab({ campCode, jobCodeId, requests, settings, guides, campGroups, items, views, groups, needs, students, isAdmin, userId, userName, userGroup }: {
  campCode: string; jobCodeId: string; requests: SupplyRequest[]; settings: SupplySettings | null; guides: SupplyGuide[]; campGroups: CampGroup[];
  items: InventoryItem[]; views: InventoryItemView[]; groups: InventoryGroup[]; needs: PurchaseNeed[]; students: STSheetStudent[];
  isAdmin: boolean; userId: string; userName: string; userGroup?: string;
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
    catch (e) { console.error(e); alert('요청을 만들지 못했습니다.'); }
    finally { setPosting(false); }
  };
  const [copied, setCopied] = useState(false);
  const copyShopping = async () => {
    const text = `[장보기 목록]\n${shopping.map(l => `• ${l.name} ${l.total}${l.unit}  (${l.who.join(', ')})`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };
  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.error(e); alert('처리하지 못했습니다. 권한을 확인해주세요.'); } };
  const defaultBuyer = settings?.defaultBuyerId ? settings.defaultBuyerName : '';

  return (
    <div className="px-4 py-3 space-y-3">
      <button onClick={() => setEditing({ mode: 'new' })} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        <FiPlus className="w-4 h-4" />필요한 물품 요청하기
      </button>
      {isAdmin && <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${defaultBuyer ? 'bg-emerald-50' : 'bg-red-50 border border-red-200'}`}>
        <span className="flex-1 text-[12px] text-gray-700">🛒 기본 구매 담당 <b className="text-gray-900">{defaultBuyer || '미지정'}</b>
          <span className="text-[10px] text-gray-400 ml-1">{defaultBuyer ? '· 따로 지정하지 않은 요청은 모두 이 사람이 사 와요' : isAdmin ? '· 지정하면 요청마다 담당을 고르지 않아도 돼요' : '· 관리자가 지정해요'}</span></span>
        <button onClick={() => setAssigning({ mode: 'default' })} className="shrink-0 px-2 py-1 text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded-lg">{defaultBuyer ? '변경' : '지정하기'}</button>
      </div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          ['open', `진행 중 ${open.length}`, true],
          ['buy', `🛒 내 구매 ${myBuyLineCount}`, myBuys.length > 0],
          ['settle', `💰 정산 ${settleBadge}`, settleVisible.length > 0],
          ['mine', `내 요청 ${mine.length}`, true],
          ['done', '완료·반려', true],
        ] as const).filter(([, , show]) => show).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${filter === id ? 'bg-gray-800 text-white' : id === 'settle' && settleBadge ? 'bg-yellow-100 text-yellow-800' : id === 'buy' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
        ))}
      </div>

      {filter === 'open' && (myBuys.length > 0 || mySettleTodo.length > 0) && (
        <div className="flex gap-2">
          {myBuys.length > 0 && <button onClick={() => setFilter('buy')} className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[12px] font-bold text-emerald-800">🛒 제가 사 올 것 {myBuyLineCount}품목 →</button>}
          {mySettleTodo.length > 0 && <button onClick={() => setFilter('settle')} className="flex-1 rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-left text-[12px] font-bold text-yellow-900">💰 정산할 것 {mySettleTodo.length}건 →</button>}
        </div>
      )}
      {isAdmin && filter === 'open' && intakeWaiting.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
          <p className="text-[12px] font-bold text-amber-900">📥 구매했지만 재고 입고 전 {intakeWaiting.length}건</p>
          {intakeWaiting.map(r => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left text-[11px] text-amber-900 hover:underline truncate">
              🏕 {r.items.map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ')} <span className="text-amber-700">→ 입고 처리</span>
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
        </div>
      )}

      {filter === 'buy' ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <p className="flex-1 text-sm font-bold text-gray-900">🧾 장보기 목록 <span className="text-[11px] font-normal text-amber-800">{shopping.length}품목</span></p>
              <button onClick={copyShopping} className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg"><FiCopy className="inline w-3 h-3 mr-0.5" />{copied ? '복사됨' : '복사'}</button>
            </div>
            {shopping.map(l => (
              <div key={l.key} className="flex items-center gap-2 px-3 py-1.5 border-t border-amber-100 bg-white text-[12px]">
                <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 truncate">{l.name}</p><p className="text-[10px] text-gray-500 truncate">{l.who.join(' · ')}</p></div>
                <span className="font-extrabold text-amber-700">{l.total}<span className="text-[10px] text-gray-400 ml-0.5">{l.unit}</span></span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">사 온 품목마다 <b>완료</b>를 눌러 금액을 적어주세요. 학생 물품은 담임쌤이 용돈봉투에서, 선생님 물품은 본인이 송금해요.</p>
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
          <p className="text-[11px] text-gray-500">학생 물품은 <b>담임쌤이 용돈봉투에서 빼서</b>, 선생님 물품은 <b>본인이 송금</b>해서 구매한 사람에게 주고 완료를 눌러주세요. 학부모 청구 품목은 관리자가 처리해요.</p>
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
                    <span className="ml-1 text-[11px] font-normal text-gray-500">{kind === 'envelope' ? `담임 ${mentorOf(r) || '미확인'} · 용돈봉투` : kind === 'transfer' ? '본인 송금' : '학부모 청구 (관리자)'}</span></p>
                </button>
                {group.map(s => (
                  <div key={s.line.id} className="flex items-center gap-2 text-[12px]">
                    <span className={`flex-1 min-w-0 truncate ${s.settled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{s.line.name} {s.line.quantity}{s.line.unit} · <b>{fmtWon(s.done.amount)}</b> → {s.done.by}</span>
                    {s.settled ? (
                      <span className="text-[10px] text-emerald-700 shrink-0">✓ {s.settled.by}{(isAdmin || s.settled.byId === userId) && <button onClick={() => run(() => settleSupplyLines(db, r.id, [s.line.id], null))} className="ml-1 text-gray-400 hover:underline">취소</button>}</span>
                    ) : mineToSettle ? (
                      <button onClick={() => run(async () => { await settleSupplyLines(db, r.id, [s.line.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [s.line.id] }); })} className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-yellow-900 bg-white border border-yellow-400 rounded">완료</button>
                    ) : <span className="text-[10px] text-yellow-800 shrink-0">대기</span>}
                  </div>
                ))}
                {[...byPayee.entries()].map(([payee, v]) => (
                  <p key={payee} className="text-[11px] text-yellow-900 bg-white/70 rounded-lg px-2 py-1">
                    {SUPPLY_SETTLE_LABELS[kind].icon} {kind === 'parent' ? <>학부모님께 <b>{fmtWon(v.amount)}</b> 청구 → <b>{payee}</b>쌤께 지급</> : <><b>{payee}</b>쌤께 <b>{fmtWon(v.amount)}</b> {settleVerb(kind)}</>}{kind === 'transfer' && v.payTo ? <> · <span className="select-all font-semibold">{v.payTo}</span></> : null}
                  </p>
                ))}
                {mineToSettle && pendingIds.length > 1 && (
                  <button onClick={() => { if (confirm(`${pendingIds.length}개 품목을 모두 ${settleVerb(kind)} 완료로 할까요?`)) run(async () => { await settleSupplyLines(db, r.id, pendingIds, { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: pendingIds }); }); }}
                    className="w-full py-1.5 text-[11px] font-bold text-white bg-yellow-500 rounded-lg">{kind === 'envelope' ? '📒 봉투 기재 · 현금 전달' : kind === 'transfer' ? '💸 송금' : '🧾 학부모 청구'} 모두 완료</button>
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
          <p className="text-sm text-gray-500">{filter === 'mine' ? '올린 요청이 없습니다.' : filter === 'open' ? '진행 중인 요청이 없습니다.' : '완료된 요청이 없습니다.'}</p>
        </div>
      ) : (
        <>
          {filter === 'open' && <p className="text-[10px] text-gray-400">다른 선생님 요청도 함께 보입니다. 같은 게 필요하면 요청을 열어 <b>나도 필요해요</b>를 눌러주세요.</p>}
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
                    <p className="text-[12px] text-gray-700 truncate">{r.items.map(l => `${r.done?.[l.id] ? '✓' : ''}${l.name} ${l.quantity}${l.unit}`).join(', ')}</p>
                    <p className={`text-[10px] truncate ${r.status === 'onhold' ? 'text-amber-700' : r.status === 'requested' ? 'text-emerald-700' : 'text-gray-500'}`}>{status}</p>
                    {last && <p className="text-[10px] text-gray-500 truncate">💬 {r.comments!.length} · <b className={last.admin ? 'text-indigo-700' : ''}>{last.name}</b> {last.text}</p>}
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${SUPPLY_STATUS_STYLE[r.status]}`}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</span>
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
        <SupplyBuyerPicker candidates={candidates} title={assigning.mode === 'default' ? '기본 구매 담당' : '이 요청의 구매 담당'}
          hint={assigning.mode === 'default' ? '담당을 따로 지정하지 않은 모든 요청을 이 사람이 사 와서 품목별로 완료합니다.' : '기본 담당 대신 이 요청만 다른 사람이 사 옵니다.'}
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
              <p className={`text-[12px] truncate ${d ? 'text-gray-400 line-through' : 'font-semibold text-gray-900'}`}>{l.name} {l.quantity}{l.unit}{l.groupName ? ` → ${l.groupName}` : ''}<GuideTag line={l} /></p>
              {l.memo && !d && <p className="text-[10px] text-gray-500 truncate">{l.memo}</p>}
              {d && <p className="text-[10px] text-emerald-700 truncate">✓ {d.amount ? fmtWon(d.amount) : '금액 없음'} · {d.by}{d.payTo ? ` · ${d.payTo}` : ''}</p>}
            </div>
            {canBuy && (d
              ? <button onClick={() => onUndo(l.id)} className="text-[10px] text-gray-400 hover:underline shrink-0">취소</button>
              : <button onClick={() => onComplete([l.id])} className="shrink-0 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">완료</button>)}
          </div>
        );
      })}
      {canBuy && undone.length > 1 && (
        <button onClick={() => onComplete(undone)} className="w-full py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border-t border-emerald-100">남은 {undone.length}개 한 번에 완료</button>
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
    if (kind && lines.some(l => !num(amounts[l.id])) && !confirm('금액이 비어 있는 품목이 있어요. 금액이 없으면 정산 요청이 가지 않습니다. 그대로 완료할까요?')) return;
    if (kind === 'transfer' && lines.some(l => !l.parentBill) && !payTo.trim() && !confirm('송금받을 계좌가 비어 있어요. 그대로 완료할까요?')) return;
    setBusy(true);
    try {
      if (kind === 'transfer' && payTo.trim()) savePayTo(payTo.trim());
      await completeSupplyLines(db, r.id, lines.map(l => ({ lineId: l.id, amount: num(amounts[l.id]), payTo: kind === 'transfer' && !l.parentBill ? payTo : undefined })), { uid: userId, name: userName });
      notifySupply({ type: 'lines_done', requestId: r.id, lineIds: lines.map(l => l.id) });
      onClose();
    } catch (e) { console.error(e); alert('완료 처리를 하지 못했습니다. 구매 담당인지 확인해주세요.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">✓ 구매 완료 <span className="text-sm font-normal text-gray-500">{FOR_ICON[r.forType]} {supplyForLabel(r)}</span></h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{kind === 'envelope' ? `담임 ${classMentor || '(미확인)'}쌤이 용돈봉투에서 빼서 나에게 전달하도록 정산 요청이 가요.` : kind === 'transfer' ? `${r.requesterName}쌤이 아래 계좌로 송금하도록 정산 요청이 가요.` : '캠프 공용 — 관리자가 재고에 입고합니다. 금액은 기록용이에요.'}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {lines.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 truncate">{l.name} <span className="font-normal text-gray-500">{l.quantity}{l.unit}</span><GuideTag line={l} /></span>
              <input inputMode="numeric" value={amounts[l.id]} onChange={e => setAmounts(a => ({ ...a, [l.id]: e.target.value.replace(/[^0-9]/g, '') }))} autoFocus={lines[0].id === l.id}
                placeholder="금액" className={`w-24 text-right text-sm border rounded-lg px-2 py-1 outline-none ${kind && !num(amounts[l.id]) ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`} />
              <span className="text-[11px] text-gray-400">원</span>
            </div>
          ))}
          {lines.some(l => l.parentBill) && <p className="text-[10px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1">🧾 '학부모 청구' 품목은 용돈봉투·송금 대신 관리자가 학부모님께 청구해요.</p>}
          {kind === 'transfer' && lines.some(l => !l.parentBill) && (
            <div className="pt-1">
              <p className="text-[11px] font-bold text-gray-700 mb-1">💸 송금받을 곳</p>
              <input value={payTo} onChange={e => setPayTo(e.target.value)} placeholder="예: 카카오뱅크 3333-01-1234567 홍길동" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400" />
              <p className="text-[10px] text-gray-400 mt-0.5">이 기기에 기억해 두고 다음에 자동으로 채워요.</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 space-y-2">
          <p className="text-right text-[12px] text-gray-600">합계 <b className="text-gray-900">{fmtWon(total)}</b></p>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 text-xs text-gray-600 bg-gray-100 rounded-xl">취소</button>
            <button onClick={submit} disabled={busy} className="flex-[2] py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{busy ? '처리 중...' : `${lines.length}개 품목 구매 완료`}</button>
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
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="이름 검색" className="mt-2 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {list.length === 0 && <p className="px-5 py-6 text-center text-xs text-gray-400">{candidates.length ? '검색 결과가 없습니다.' : '캠프 인원을 불러오는 중...'}</p>}
          {list.map(c => (
            <button key={c.uid} onClick={() => onPick(c)} className="w-full text-left flex items-center gap-2 px-5 py-2 hover:bg-emerald-50">
              <span className="flex-1 text-sm font-semibold text-gray-900">{c.name}</span>
              {c.tag && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.rank === 0 ? 'bg-indigo-100 text-indigo-700' : c.rank === 1 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{c.tag}</span>}
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          {clearLabel && <button onClick={() => onPick(null)} className="flex-1 py-2 text-xs text-red-500 border border-red-200 rounded-xl">{clearLabel}</button>}
          <button onClick={onClose} className="flex-1 py-2 text-xs text-gray-600 bg-gray-100 rounded-xl">닫기</button>
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
    if (forType === 'student' && !student) { alert('어떤 학생을 위한 물품인지 선택해주세요.'); return; }
    if (lines.length === 0) { alert('필요한 물품을 하나 이상 담아주세요.'); return; }
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
          {prefill && <p className="text-[11px] text-gray-500 bg-amber-50 rounded-xl px-3 py-2">{supplyForLabel(prefill)} 요청과 같은 물품을 담았어요. 누구 것인지와 수량만 바꿔 올리면 장보기 목록에 합쳐집니다.</p>}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-1.5">① 누가 필요한가요?</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setForType('student')} className={seg(forType === 'student')}>👧 학생</button>
              <button type="button" onClick={() => setForType('mentor')} className={seg(forType === 'mentor')}>🙋 본인</button>
              <button type="button" onClick={() => setForType('camp')} className={seg(forType === 'camp')}>🏕 캠프 공용</button>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-500">{forType === 'student' ? '학생 용돈봉투에서 담임쌤이 정산해요.' : forType === 'mentor' ? '사 온 사람에게 본인이 송금해요.' : '상비약·소모품처럼 캠프 재고로 쓰는 물건. 구매 후 관리자가 재고에 입고해요.'}</p>
            {forType === 'student' && (student ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2">
                <span className="flex-1 text-sm font-bold text-blue-900">{student.name} <span className="font-normal text-blue-500 text-xs">{student.cls}{student.mentor ? ` · 담임 ${student.mentor}` : ''}</span></span>
                <button onClick={() => setStudent(null)} className="text-xs text-gray-500">변경</button>
              </div>
            ) : (
              <div className="relative mt-2">
                <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="학생 이름 검색" className={inputCls} />
                {studentQuery.trim() && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {studentResults.map(s => (
                      <button key={s.studentId} type="button" onClick={() => { setStudent({ id: s.studentId, name: s.name, cls: s.className, mentor: s.classMentor || undefined, code: studentClassCode(s.classNumber) || undefined }); setStudentQuery(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
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
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-800">② 무엇이 필요한가요? <span className="font-normal text-gray-400">{lines.length}개 담음 · 어디서 살지는 구매 담당이 정해요</span></p>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} placeholder="물품 검색 (예: 밴드, 치약, 보드마카)" className={`${inputCls} pl-9`} />
              {q.trim() && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-emerald-200 shadow-lg divide-y divide-gray-100 overflow-hidden max-h-80 overflow-y-auto">
                  {guideResults.map(g => (
                    <div key={g.id} className="bg-orange-50">
                      <button type="button" onClick={() => setOpenGuide(v => v === g.id ? null : g.id)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-orange-100">
                        <span className="flex-1 min-w-0 text-[12px] truncate"><b>{g.name}</b> <span className="text-[10px] px-1 py-0.5 rounded bg-orange-200 text-orange-900 font-bold">{g.channel || '쿠팡'}{g.parentBill ? ' · 학부모 청구' : ''}</span></span>
                        <span className="text-[11px] font-bold text-orange-700">{openGuide === g.id ? '접기' : '안내 보기'}</span>
                      </button>
                      {openGuide === g.id && (
                        <div className="px-3 pb-2 space-y-1.5">
                          <p className="text-[11px] text-orange-900 whitespace-pre-wrap bg-white rounded-lg px-2 py-1.5 border border-orange-200">📌 {g.guide || `${g.channel || '쿠팡'}에서 구매하는 품목이에요.`}</p>
                          <button type="button" onClick={() => addGuide(g)} className="w-full py-1 text-[11px] font-bold text-white bg-orange-500 rounded-lg">안내 확인 · 요청에 담기</button>
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
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="예: 오늘 저녁까지 필요해요, 약국에 있어요" className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={submit} disabled={busy} className="w-full py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">{busy ? '저장 중...' : existing ? '수정 저장' : '요청 올리기'}</button>
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
    try { await fn(); } catch (e) { console.error(e); alert('처리하지 못했습니다. 권한을 확인해주세요.'); } finally { setBusy(false); }
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
    if (lines.some(l => !l.groupId)) { alert('입고할 그룹을 골라주세요.'); return; }
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
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${SUPPLY_STATUS_STYLE[r.status]}`}>{SUPPLY_REQUEST_STATUS_LABELS[r.status]}</span>
              <h2 className="text-base font-bold text-gray-900">{FOR_ICON[r.forType]} {supplyForLabel(r)}</h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{r.requesterName} · {fmtDateTime(r.createdAt)}{r.forType === 'student' && classMentor ? ` · 담임 ${classMentor}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 구매 담당 */}
          {isOpen && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${buyer ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <span className={`flex-1 text-[12px] font-bold ${buyer ? 'text-emerald-800' : 'text-red-700'}`}>{buyer ? `🛒 구매 담당: ${buyer.uid === userId ? '나' : buyer.name}${buyer.isDefault ? ' (기본 담당)' : ''}` : '🛒 구매 담당 없음 — 관리자가 지정해주세요'}</span>
              {isAdmin && <button onClick={onAssign} className="text-[11px] font-semibold text-emerald-700 hover:underline">이 요청만 {r.buyerId ? '변경' : '다른 사람'}</button>}
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
                    <p className={`text-[13px] font-bold truncate ${d ? 'text-gray-500' : 'text-gray-900'}`}>{d ? '✓ ' : ''}{l.name} <span className="font-extrabold text-amber-700">{l.quantity}{l.unit}</span>{isCamp && l.groupName ? <span className="text-[11px] font-normal text-emerald-700"> → {l.groupName}</span> : null}<GuideTag line={l} /></p>
                    {(l.memo || (isAdmin && stock)) && <p className="text-[10px] text-gray-500">{[l.memo, isAdmin && stock ? `캠프 재고 ${stock.total}${stock.unit}` : ''].filter(Boolean).join(' · ')}</p>}
                    {d && <p className="text-[10px] text-emerald-700">{d.amount ? fmtWon(d.amount) : '금액 없음'} · {d.by} · {fmtDateTime(d.at)}{d.payTo ? ` · 💸 ${d.payTo}` : ''}</p>}
                    {d && lk && d.amount ? <p className={`text-[10px] ${st ? 'text-gray-400' : 'text-yellow-700'}`}>{st ? `✓ 정산 완료 · ${st.by}` : `💰 ${lk === 'envelope' ? '담임 봉투 정산' : lk === 'transfer' ? '송금' : '학부모 청구'} 대기`}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {canBuy && r.status !== 'rejected' && !r.stockApplied && (d
                      ? <button onClick={() => run(() => undoSupplyLine(db, r.id, l.id))} className="text-[10px] text-gray-400 hover:underline">구매 취소</button>
                      : isOpen && <button onClick={() => onComplete([l.id])} className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg">완료</button>)}
                    {d && lk && d.amount && canSettleLine ? (st
                      ? (isAdmin || st.byId === userId) && <button onClick={() => run(() => settleSupplyLines(db, r.id, [l.id], null))} className="text-[10px] text-gray-400 hover:underline">정산 취소</button>
                      : <button onClick={() => run(async () => { await settleSupplyLines(db, r.id, [l.id], { uid: userId, name: userName }); notifySupply({ type: 'settled', requestId: r.id, lineIds: [l.id] }); })} className="px-2 py-0.5 text-[10px] font-bold text-yellow-900 bg-yellow-100 border border-yellow-300 rounded">{SUPPLY_SETTLE_LABELS[lk].icon} {lk === 'envelope' ? '정산' : lk === 'transfer' ? '송금' : '청구'} 완료</button>) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {canBuy && isOpen && r.items.filter(l => !r.done?.[l.id]).length > 1 && (
            <button onClick={() => onComplete(r.items.filter(l => !r.done?.[l.id]).map(l => l.id))} className="w-full py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">남은 품목 한 번에 구매 완료</button>
          )}
          {settleLines.length > 0 && (
            <p className="text-[11px] text-gray-600 bg-yellow-50 rounded-xl px-3 py-2">
              {kind === 'envelope' ? `📒 담임 ${classMentor || '(미확인)'}쌤이 용돈봉투에서 빼서 구매한 선생님께 전달해요.` : `💸 ${r.requesterName}쌤이 구매한 선생님께 송금해요.`}
              {' '}정산 {settleLines.filter(s => s.settled).length}/{settleLines.length} · 남은 금액 {fmtWon(settleLines.filter(s => !s.settled).reduce((a, s) => a + (s.done.amount ?? 0), 0))}
            </p>
          )}
          {r.note && <p className="text-[12px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2">📝 {r.note}</p>}
          {(!isOpen || r.status === 'onhold') && (
            <p className={`text-[11px] rounded-xl px-3 py-2 ${r.status === 'onhold' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>{status}{r.handledBy ? ` · ${r.handledBy}` : ''} · {fmtDateTime(r.handledAt)}</p>
          )}
          <div className="flex gap-2">
            {isOpen && !mine && <button onClick={onMetoo} className="flex-1 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">🙋 나도 필요해요</button>}
            {mine && isOpen && <button onClick={onEdit} className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 rounded-xl">수정</button>}
            {mine && isOpen && !supplyDoneCount(r) && <button onClick={() => { if (confirm('이 요청을 취소할까요?')) run(async () => { await deleteSupplyRequest(db, r.id); onClose(); }); }} className="flex-1 py-2 text-xs text-red-500 border border-red-200 rounded-xl">요청 취소</button>}
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
          ) : (
            <button onClick={() => setIntake(true)} className={`w-full py-2 text-xs font-bold rounded-xl ${r.status === 'purchased' ? 'text-white bg-amber-500' : 'text-emerald-700 bg-white border border-emerald-200'}`}>📥 {r.status === 'purchased' ? '재고에 입고하기' : '구매 완료 + 재고 입고'}</button>
          ))}

          {/* 관리자 처리 */}
          {isAdmin && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-2">
              <p className="text-[10px] font-bold text-indigo-700">관리자 처리</p>
              {mode === 'none' ? (
                isOpen ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => setMode('reject')} className="flex-1 py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">반려</button>
                    {r.status === 'onhold'
                      ? <button onClick={() => act('requested')} disabled={busy} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">보류 해제</button>
                      : <button onClick={() => setMode('hold')} className="flex-1 py-1.5 text-[11px] text-amber-800 bg-white border border-amber-200 rounded-lg">⏸ 보류</button>}
                  </div>
                ) : !r.stockApplied ? (
                  <button onClick={() => act('requested')} disabled={busy} className="w-full py-1.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg">다시 진행 중으로</button>
                ) : <p className="text-[10px] text-gray-400">재고에 입고된 요청이라 되돌릴 수 없어요.</p>
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
                placeholder={isAdmin ? '예: 이번엔 못 사고 다음 주에 살게요' : '예: 저희 반도 2개 필요해요'} className="flex-1 text-[12px] border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-emerald-400" />
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
      const ownerGroup = owner?.classNumber ? findGroupByClassCode(campGroups, studentClassCode(owner.classNumber))?.name.toLowerCase() : undefined;
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
          {mode === 'adjust' && STOCKTAKE_REASONS.map(r => (
            <button key={r} type="button" onClick={() => setMemo(memo === r ? '' : r)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${memo === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>{r}</button>
          ))}
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={mode === 'adjust' ? '사유 (필수 · 버튼 또는 직접 입력)' : '메모 (선택, 예: 이마트 구매분)'}
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
  const [section, setSection] = useState<'items' | 'groups' | 'bulk' | 'guides'>('groups');
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex gap-1.5">
        {([['groups', '그룹 · 패키지'], ['bulk', '일괄 입력 · 실사'], ['items', '품목 관리'], ['guides', '지정 품목 (쿠팡)']] as const).map(([id, label]) => (
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

function ItemFormModal({ item, preset, userName, onClose, onCreated }: {
  item?: InventoryItem; preset?: { category?: InventoryCategory; subCategory?: string }; userName: string; onClose: () => void; onCreated?: (id: string) => void;
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
      else {
        const id = await addInventoryItem(db, { ...data, createdBy: userName });
        onCreated?.(id);
      }
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
                <button key={c} type="button" onClick={() => { setCategory(c); setSubCategory(''); if (!item) setUsage(c === '의약품' ? 'oral' : 'operational'); }}
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

// ==================== 🛒 관리자 지정 품목 가이드 (쿠팡 · 학부모 청구) ====================

function SupplyGuideManager() {
  const [guides, setGuides] = useState<SupplyGuide[]>([]);
  useEffect(() => subscribeSupplyGuides(db, setGuides), []);
  const [editing, setEditing] = useState<SupplyGuide | 'new' | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800">관리자 지정 품목 <span className="text-gray-400 font-normal">{guides.length}</span></p>
          <p className="text-[10px] text-gray-400">책가방·슬리퍼·손목시계처럼 쿠팡 등에서 사서 학부모님께 따로 청구하는 품목. 멘토가 요청할 때 검색하면 안내와 함께 맨 위에 떠요. (전 캠프 공통)</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg"><FiPlus className="w-3 h-3" />추가</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {guides.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">지정된 품목이 없습니다.</p>}
        {guides.map(g => (
          <button key={g.id} onClick={() => setEditing(g)} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${g.isActive === false ? 'opacity-50' : ''}`}>
            <p className="text-[13px] font-bold text-gray-900">{g.name} <GuideTag line={{ channel: g.channel, parentBill: g.parentBill }} />{g.isActive === false && <span className="ml-1 text-[10px] text-gray-400">사용 안 함</span>}</p>
            {g.keywords?.length ? <p className="text-[10px] text-gray-400">검색어: {g.keywords.join(', ')}</p> : null}
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
    if (!name.trim()) { alert('품목 이름을 입력해주세요.'); return; }
    setBusy(true);
    try {
      await saveSupplyGuide(db, { name, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), channel, parentBill, guide: text, isActive: active }, guide?.id);
      onClose();
    } catch (e) { console.error(e); alert('저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{guide ? '지정 품목 수정' : '지정 품목 추가'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"><FiX /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div><p className="text-xs font-bold text-gray-700 mb-1">품목 이름</p><input value={name} onChange={e => setName(e.target.value)} placeholder="예: 책가방" className={inputCls} /></div>
          <div><p className="text-xs font-bold text-gray-700 mb-1">검색어 <span className="font-normal text-gray-400">(쉼표로 구분)</span></p><input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 가방, 백팩" className={inputCls} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><p className="text-xs font-bold text-gray-700 mb-1">구매 경로</p><input value={channel} onChange={e => setChannel(e.target.value)} placeholder="쿠팡" className={inputCls} /></div>
            <label className="flex items-end gap-1.5 pb-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={parentBill} onChange={e => setParentBill(e.target.checked)} />학부모님께 청구</label>
          </div>
          <div><p className="text-xs font-bold text-gray-700 mb-1">멘토에게 보여줄 안내</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className={`${inputCls} resize-none`}
              placeholder={'예: 쿠팡에서 주문하는 품목이에요.\n학생 사이즈·색상을 메모에 적어주세요.\n금액은 학부모님께 따로 청구합니다 (용돈봉투에서 빼지 마세요).'} /></div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />검색에 보이기</label>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          {guide && <button onClick={() => { if (confirm(`${guide.name}을(를) 삭제할까요?`)) deleteSupplyGuide(db, guide.id).then(onClose); }} className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl">삭제</button>}
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl disabled:opacity-40">{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
