import { Timestamp } from 'firebase/firestore';

// ==================== 캠프 재고 (의약품·문구류·전자제품·위생도구·기타) ====================
// 설계 원칙
// - 품목(inventoryItems)은 회사 공통 마스터 — 어느 캠프든 비슷하므로 한 번 등록해 모든 캠프가 공유
// - 수량(inventoryStocks)은 캠프별 · 그룹별 — 문서 1개 = (캠프, 품목), stocks[groupId] = 낱개 수량
// - 그룹(inventoryGroups)은 캠프별 보관 장소/키트. 패키지(inventoryPackages)로 저장해 두고
//   다음 기수에는 적용 후 그룹명·호실만 바꾸면 됨
// - 모든 수량 변동은 inventoryMovements 에 남김 (약 복용 차감/복구, 입고, 수기 조정)

export const INVENTORY_CATEGORIES = ['의약품', '문구류', '전자제품', '위생도구', '기타'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

/** 분류별 세부 분류 (시트 기준). 자유 입력도 허용 */
export const INVENTORY_SUBCATEGORIES: Record<InventoryCategory, readonly string[]> = {
  의약품: ['복통', '내상', '상처', '근육', '기타'],
  문구류: ['필기', '커팅'],
  전자제품: [],
  위생도구: [],
  기타: [],
};

/** 낱개 단위 후보 (수량은 항상 낱개 기준) */
export const INVENTORY_UNITS = ['개', '정', '포', '병', '통', '장', '매', '팩', '세트', 'ml'] as const;

/**
 * 품목 유형 — 어디에 표시되고 어떻게 줄어드는지 결정
 * - oral       먹는 약: 환자 탭 "약·처치 물품 사용"에 표시, 복용 간격·1일 최대 경고 대상
 * - topical    바르는·붙이는·넣는 약 (연고, 파스, 안약)
 * - supply     처치 소모품 (밴드, 면봉, 알콜솜, 해열시트)
 * - equipment  비품 (체온계, 가위, 멀티탭) — 차감 없이 위치·수량만
 * - operational 운영 소모품 (보드마카, A4, 물티슈) — 실사·요청으로 관리
 */
export const INVENTORY_USAGES = ['oral', 'topical', 'supply', 'equipment', 'operational'] as const;
export type InventoryUsage = (typeof INVENTORY_USAGES)[number];
export const INVENTORY_USAGE_LABELS: Record<InventoryUsage, string> = {
  oral: '먹는 약',
  topical: '바르는·붙이는 약',
  supply: '처치 소모품',
  equipment: '비품',
  operational: '운영 소모품',
};
/** 환자 처치에 쓰이는 유형 (환자 탭 사용 기록 대상) */
export const TREATMENT_USAGES: readonly InventoryUsage[] = ['oral', 'topical', 'supply'];

/** usage가 없는 옛 품목은 분류로 추정 */
export function getItemUsage(item: Pick<InventoryItem, 'usage' | 'category'>): InventoryUsage {
  if (item.usage) return item.usage;
  return item.category === '의약품' ? 'oral' : 'operational';
}

/** 같은 이름 품목 구분용 표시명: "모드코프 (종합감기약)" */
export function itemLabel(item: Pick<InventoryItem, 'name' | 'kind' | 'spec'>): string {
  const extra = [item.kind, item.spec].filter(Boolean).join(' · ');
  return extra ? `${item.name} (${extra})` : item.name;
}

/** 품목 마스터 (회사 공통) */
export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  /** 세부 분류 (복통, 내상, 필기 …) */
  subCategory?: string;
  /** 종류 (소화제, 진통제(아세트) …) */
  kind?: string;
  /** 제품명 (다제스, 타이레놀 …) */
  name: string;
  /** 규격·비고 (알약 500mg, 액상 …) */
  spec?: string;
  /** 품목 유형 (없으면 분류로 추정 — getItemUsage) */
  usage?: InventoryUsage;
  /** 주성분 (같은 성분 중복 복용 경고용, 예: 아세트아미노펜) */
  ingredient?: string;
  /** 관리자 입력: 같은 성분 최소 복용 간격(시간) */
  intervalHours?: number;
  /** 관리자 입력: 같은 성분 1일 최대 복용 횟수 */
  maxPerDay?: number;
  /** 관리자 입력: 복용 안내 (연령별 용량 등) — 약 선택 시 그대로 표시 */
  dosageNote?: string;
  /** 낱개 단위 (개, 정, 병 …) */
  unit: string;
  /** 포장 단위당 낱개 수 (예: 1박스 = 4정). 요청서의 '박스' 환산용 */
  packSize?: number;
  /** 관리자가 작성한 설명·안내 (약 선택 시 그대로 표시) */
  description?: string;
  /** false = 사용 안 함 (새 보고 선택 목록에서 숨김, 기존 기록은 유지) */
  isActive: boolean;
  /** 그룹별 최소 보유 수량 기본값 (그룹별 예외는 InventoryStock.minStocks) */
  minStockDefault?: number;
  /** 정렬 순서 (없으면 분류→세부분류→종류→이름) */
  order?: number;
  createdBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 재고 그룹 (캠프별 보관 장소 / 키트) */
export interface InventoryGroup {
  id: string;
  campCode: string;
  /** 예: Spring, 공통, 남기숙사 */
  name: string;
  /** 보관 장소 (예: 2층 교무실 301호) */
  location?: string;
  order: number;
  /** 패키지 슬롯 키 (패키지에서 적용된 그룹인 경우) */
  slotKey?: string;
  /** 연결된 캠프 그룹 이름 (campSettings 그룹, 예: Spring) — 학생 반 → 이 그룹 키트 자동 선택 */
  campGroupName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 그룹 패키지 (회사 공통 템플릿) — 다음 기수에 적용 후 이름·호실만 부여 */
export interface InventoryPackageSlot {
  key: string;
  /** 기본 그룹명 (적용 시 그대로 들어가며 관리자가 변경) */
  label: string;
  location?: string;
  campGroupName?: string;
}
export interface InventoryPackage {
  id: string;
  name: string;
  slots: InventoryPackageSlot[];
  createdBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 캠프별 품목 재고 — 문서 ID = `${campCode}__${itemId}` */
export interface InventoryStock {
  id: string;
  campCode: string;
  itemId: string;
  /** 그룹별 낱개 수량 { [groupId]: n } */
  stocks: Record<string, number>;
  /** 그룹별 최소 보유 수량 예외 { [groupId]: n } (없으면 품목 minStockDefault) */
  minStocks?: Record<string, number>;
  updatedAt: Timestamp;
}

export function stockDocId(campCode: string, itemId: string): string {
  return `${campCode}__${itemId}`;
}

export const INVENTORY_MOVEMENT_REASONS = [
  'dose',        // 약 복용 차감
  'dose_adjust', // 복용 수량 수정 (차이만 반영)
  'dose_revert', // 복용 기록 삭제 → 복구
  'restock',     // 입고
  'adjust',      // 수기 조정
] as const;
export type InventoryMovementReason = (typeof INVENTORY_MOVEMENT_REASONS)[number];

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementReason, string> = {
  dose: '약 복용',
  dose_adjust: '복용 수량 수정',
  dose_revert: '복용 기록 삭제(복구)',
  restock: '입고',
  adjust: '수기 조정',
};

/** 입출고 이력 1건 (delta > 0 입고/복구, delta < 0 출고/차감) */
export interface InventoryMovement {
  id: string;
  campCode: string;
  itemId: string;
  itemName: string;
  groupId: string;
  groupName: string;
  delta: number;
  reason: InventoryMovementReason;
  /** 연결된 환자 기록 / 복용 기록 */
  refPatientId?: string;
  refDoseId?: string;
  /** 표시용 스냅샷 (예: "김윤아 최초보고", "실사 차이") */
  refLabel?: string;
  memo?: string;
  at: Timestamp;
  by: string;
}

/** 품목 + 현재 캠프 수량을 합친 화면용 뷰 */
export interface InventoryItemView extends InventoryItem {
  stocks: Record<string, number>;
  minStocks: Record<string, number>;
  total: number;
}

/** 전체 재고 = 그룹별 수량 합 */
export function getTotalStock(item: { stocks?: Record<string, number> } | undefined): number {
  return Object.values(item?.stocks ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** 특정 그룹 재고 */
export function getGroupStock(item: { stocks?: Record<string, number> } | undefined, groupId: string): number {
  return Number(item?.stocks?.[groupId] ?? 0) || 0;
}

/**
 * 특정 그룹의 최소 보유 수량
 * 그룹 예외 → (그 그룹에 둔 적 있는 품목이면) 품목 기본값 → 0
 * 기숙사·공통처럼 약을 두지 않는 그룹까지 "구매 필요"로 뜨지 않게, 기본값은 재고 칸이 있는 그룹에만 적용
 */
export function getMinStock(item: Pick<InventoryItemView, 'minStocks' | 'minStockDefault' | 'stocks'>, groupId: string): number {
  const override = item.minStocks?.[groupId];
  if (override != null && !isNaN(Number(override))) return Number(override);
  if (!(groupId in (item.stocks ?? {}))) return 0;
  return Number(item.minStockDefault ?? 0) || 0;
}

/**
 * 품목 마스터 + 캠프 재고 → 화면용 뷰.
 * groups를 주면 총량은 **현재 존재하는 그룹만** 합산 (삭제된 그룹에 남은 숫자는 제외)
 */
export function buildInventoryViews(
  items: InventoryItem[],
  stocksByItem: Record<string, InventoryStock | undefined>,
  groups?: Pick<InventoryGroup, 'id'>[]
): InventoryItemView[] {
  const ids = groups ? new Set(groups.map(g => g.id)) : null;
  return items.map(item => {
    const s = stocksByItem[item.id];
    const raw = s?.stocks ?? {};
    const stocks = ids ? Object.fromEntries(Object.entries(raw).filter(([k]) => ids.has(k))) : raw;
    return { ...item, stocks, minStocks: s?.minStocks ?? {}, total: getTotalStock({ stocks }) };
  });
}

/** 수량이 음수인 그룹이 있는지 (약은 먹였는데 재고 기록이 부족 → 실사 필요) */
export function needsStocktake(item: { stocks?: Record<string, number> }): boolean {
  return Object.values(item.stocks ?? {}).some(n => Number(n) < 0);
}

// ── 복용 경고 (관리자가 입력한 간격·최대 횟수만 사용, 같은 성분 기준) ──

export interface DoseWarning {
  level: 'warn' | 'info';
  message: string;
}

/**
 * 약 선택 시 경고 계산
 * @param item    선택한 품목
 * @param history 이 학생의 기존 복용 기록 (최근 24시간 이상 포함 가능)
 * @param pendingCount 지금 폼에서 같은 성분으로 추가 중인 건수 (이 건 포함)
 */
export function getDoseWarnings(
  item: Pick<InventoryItem, 'id' | 'name' | 'ingredient' | 'intervalHours' | 'maxPerDay'>,
  history: Array<Pick<import('./camp').MedicationDose, 'itemId' | 'ingredient' | 'givenAt' | 'itemName'>>,
  pendingCount = 1,
  now: Date = new Date()
): DoseWarning[] {
  const key = item.ingredient?.trim();
  const same = history.filter(d => (key ? d.ingredient?.trim() === key : d.itemId === item.id));
  const dayAgo = now.getTime() - 24 * 3600 * 1000;
  const last24 = same.filter(d => (d.givenAt?.toMillis?.() ?? 0) >= dayAgo);
  const out: DoseWarning[] = [];
  const latest = last24.reduce<number>((m, d) => Math.max(m, d.givenAt?.toMillis?.() ?? 0), 0);
  const label = key || item.name;
  if (latest > 0) {
    const mins = Math.max(0, Math.round((now.getTime() - latest) / 60000));
    const ago = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
    if (item.intervalHours && mins < item.intervalHours * 60) {
      out.push({ level: 'warn', message: `${label} ${ago} 전 복용 — 최소 간격 ${item.intervalHours}시간` });
    } else {
      out.push({ level: 'info', message: `${label} ${ago} 전 복용` });
    }
  }
  const count = last24.length + pendingCount;
  if (item.maxPerDay && count > item.maxPerDay) {
    out.push({ level: 'warn', message: `24시간 내 ${label} ${count}회째 — 1일 최대 ${item.maxPerDay}회` });
  } else if (last24.length > 0) {
    out.push({ level: 'info', message: `24시간 내 ${count}회째${item.maxPerDay ? ` / 최대 ${item.maxPerDay}회` : ''}` });
  }
  return out;
}

/** 구매 필요 항목 (그룹별 현재 < 최소) */
export interface PurchaseNeed {
  itemId: string;
  itemName: string;
  unit: string;
  groupId: string;
  groupName: string;
  current: number;
  min: number;
  shortage: number;
}

/** 전체가 충분해도 특정 그룹이 최소 미만이면 해당 그룹을 구매 필요로 표시 */
export function computePurchaseNeeds(views: InventoryItemView[], groups: InventoryGroup[]): PurchaseNeed[] {
  const needs: PurchaseNeed[] = [];
  views.forEach(v => {
    if (v.isActive === false) return;
    groups.forEach(g => {
      const min = getMinStock(v, g.id);
      if (min <= 0) return;
      const current = getGroupStock(v, g.id);
      if (current < min) {
        needs.push({ itemId: v.id, itemName: v.name, unit: v.unit, groupId: g.id, groupName: g.name, current, min, shortage: min - current });
      }
    });
  });
  return needs;
}

/** 정렬: 분류 → 세부분류 → 종류 → 이름 (order가 있으면 우선) */
export function sortInventoryItems<T extends InventoryItem>(items: T[]): T[] {
  const catIdx = (c: string) => { const i = (INVENTORY_CATEGORIES as readonly string[]).indexOf(c); return i < 0 ? 99 : i; };
  return [...items].sort((a, b) =>
    catIdx(a.category) - catIdx(b.category) ||
    (a.subCategory ?? '').localeCompare(b.subCategory ?? '', 'ko') ||
    (a.order ?? 0) - (b.order ?? 0) ||
    (a.kind ?? '').localeCompare(b.kind ?? '', 'ko') ||
    a.name.localeCompare(b.name, 'ko')
  );
}

// ==================== 구매 요청 (멘토가 올림) ====================
// 멘토가 "누가(학생/멘토) · 어디서(다이소/약국/마트/기타) · 무엇이" 필요한지 올리면
// 관리자(구매 담당)가 구매처별로 모아 보고 구매 완료/반려 처리한다.

export const SUPPLY_STORES = ['다이소', '약국', '마트', '기타'] as const;
export type SupplyStore = (typeof SUPPLY_STORES)[number];

export const SUPPLY_REQUEST_STATUSES = ['requested', 'onhold', 'purchased', 'rejected'] as const;
export type SupplyRequestStatus = (typeof SUPPLY_REQUEST_STATUSES)[number];
export const SUPPLY_REQUEST_STATUS_LABELS: Record<SupplyRequestStatus, string> = {
  requested: '요청',
  onhold: '보류',
  purchased: '구매 완료',
  rejected: '반려',
};
/** 누구를 위한 요청인가: 학생 / 멘토 / 캠프 공용 재고(구매 후 재고에 입고) */
export type SupplyForType = 'student' | 'mentor' | 'camp';

/** 캠프 공용 요청인데 구매 완료 후 아직 재고 입고를 안 한 상태 */
export const needsStockIntake = (r: Pick<SupplyRequest, 'forType' | 'status' | 'stockApplied' | 'items'>): boolean =>
  r.forType === 'camp' && r.status === 'purchased' && !r.stockApplied && r.items.some(l => l.itemId && l.groupId);

/** 품목 → 기본 구매처 (의약품은 약국, 그 외 다이소) */
export function defaultStoreForItem(item: Pick<InventoryItem, 'usage' | 'category'>): SupplyStore {
  const u = getItemUsage(item);
  return u === 'oral' || u === 'topical' ? '약국' : '다이소';
}

/** 재고 부족분 중 아직 진행 중인 캠프 공용 요청에 들어가 있지 않은 것 */
export function uncoveredPurchaseNeeds(needs: PurchaseNeed[], requests: SupplyRequest[]): PurchaseNeed[] {
  const covered = new Set<string>();
  requests.forEach(r => {
    if (r.forType !== 'camp' || !isSupplyOpen(r.status)) return;
    r.items.forEach(l => { if (l.itemId) covered.add(`${l.itemId}|${l.groupId ?? ''}`); });
  });
  return needs.filter(n => !covered.has(`${n.itemId}|${n.groupId}`));
}

/** 아직 끝나지 않은 요청 (요청 · 보류) */
export const isSupplyOpen = (s: SupplyRequestStatus): boolean => s === 'requested' || s === 'onhold';

/** 요청에 달리는 메모·댓글 — 누구나 ("나도 필요해요", "캠프 재고로 대체", "다음 주에 살게요") */
export interface SupplyComment {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: Timestamp;
  /** 관리자 메모 여부 (강조 표시) */
  admin?: boolean;
}

/** 요청 물품 1줄 */
export interface SupplyRequestLine {
  id: string;
  /** 재고 품목과 연결된 경우 (직접 입력이면 없음) */
  itemId?: string;
  name: string;
  quantity: number;
  /** 요청 단위는 자유 (개, 박스, 통 …) */
  unit: string;
  memo?: string;
  /** 캠프 공용 요청: 입고할 재고 그룹 */
  groupId?: string;
  groupName?: string;
}

/** 멘토 구매 요청 1건 — 캠프별 */
export interface SupplyRequest {
  id: string;
  campCode: string;
  /** 누구를 위한 것인지: 학생 / 멘토(선생님) */
  forType: SupplyForType;
  studentId?: string;
  studentName?: string;
  studentClass?: string;
  /** 어디서 */
  store: SupplyStore;
  /** 기타 구매처 이름 */
  storeEtc?: string;
  items: SupplyRequestLine[];
  note?: string;
  status: SupplyRequestStatus;
  requesterId: string;
  requesterName: string;
  handledBy?: string;
  handledAt?: Timestamp;
  /** 반려·보류 사유 */
  statusNote?: string;
  /** 보류 시 구매 예정일 (YYYY-MM-DD) */
  holdUntil?: string;
  /** "제가 사올게요" — 사오기로 한 사람 */
  buyerId?: string;
  buyerName?: string;
  buyerAt?: Timestamp;
  comments?: SupplyComment[];
  /** 캠프 공용: 구매 후 재고에 입고 반영했는지 */
  stockApplied?: boolean;
  stockAppliedAt?: Timestamp;
  stockAppliedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function supplyStoreLabel(r: Pick<SupplyRequest, 'store' | 'storeEtc'>): string {
  return r.store === '기타' && r.storeEtc?.trim() ? r.storeEtc.trim() : r.store;
}

/** "누구" 표시: 학생이면 이름(반), 멘토면 요청자(멘토) */
export function supplyForLabel(r: Pick<SupplyRequest, 'forType' | 'studentName' | 'studentClass' | 'requesterName'>): string {
  if (r.forType === 'camp') return '캠프 공용';
  if (r.forType === 'student') return `${r.studentName ?? '학생'}${r.studentClass ? `(${r.studentClass})` : ''}`;
  return `${r.requesterName} 쌤`;
}

/** 구매처별 · 품목(연결된 품목 ID 또는 이름)+단위별 합산 — 장보기 목록용 */
export interface SupplyStoreSummary {
  store: string;
  requestIds: string[];
  lines: Array<{ key: string; itemId?: string; name: string; unit: string; total: number; who: string[] }>;
}
export function summarizeSupplyRequests(requests: SupplyRequest[]): SupplyStoreSummary[] {
  const byStore = new Map<string, SupplyStoreSummary>();
  requests.forEach(r => {
    const store = supplyStoreLabel(r);
    if (!byStore.has(store)) byStore.set(store, { store, requestIds: [], lines: [] });
    const g = byStore.get(store)!;
    g.requestIds.push(r.id);
    (r.items ?? []).forEach(l => {
      if (!l.name?.trim() || !(l.quantity > 0)) return;
      const unit = (l.unit || '개').trim();
      const key = `${l.itemId ?? `name:${l.name.trim()}`}|${unit}`;
      let line = g.lines.find(x => x.key === key);
      if (!line) { line = { key, itemId: l.itemId, name: l.name.trim(), unit, total: 0, who: [] }; g.lines.push(line); }
      line.total += l.quantity;
      line.who.push(r.forType === 'camp' ? `공용${l.groupName ? `(${l.groupName})` : ''} ${l.quantity}` : `${supplyForLabel(r)} ${l.quantity}`);
    });
  });
  const order = (s: string) => { const i = (SUPPLY_STORES as readonly string[]).indexOf(s); return i < 0 ? 3.5 : i; };
  return [...byStore.values()]
    .map(g => ({ ...g, lines: g.lines.sort((a, b) => a.name.localeCompare(b.name, 'ko')) }))
    .sort((a, b) => order(a.store) - order(b.store) || a.store.localeCompare(b.store, 'ko'));
}

export const PURCHASE_STATUSES = ['needed', 'ordered', 'received'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  needed: '구매 필요',
  ordered: '주문함',
  received: '입고 완료',
};

/** 구매 목록 항목 (요청 취합분 또는 수동 추가) — 캠프별 */
export interface PurchaseItem {
  id: string;
  campCode: string;
  itemId?: string;
  name: string;
  /** 입고할 그룹 (정해진 경우) */
  groupId?: string;
  groupName?: string;
  quantity: number;
  unit: string;
  source: 'request' | 'manual';
  requestId?: string;
  requestTitle?: string;
  status: PurchaseStatus;
  memo?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  receivedAt?: Timestamp;
}

// ==================== 분실물 ====================

export const LOST_ITEM_STATUSES = ['found', 'claimed', 'discarded'] as const;
export type LostItemStatus = (typeof LOST_ITEM_STATUSES)[number];
export const LOST_ITEM_STATUS_LABELS: Record<LostItemStatus, string> = {
  found: '보관 중',
  claimed: '주인 찾음',
  discarded: '폐기',
};

/** 첨부 사진/영상 (Firebase Storage) */
export interface LostItemMedia {
  url: string;
  /** Storage 경로 (삭제용) */
  path: string;
  type: 'image' | 'video';
  name?: string;
  size?: number;
}

/** 분실물 1건 — 캠프별, 모든 스태프가 등록·조회·상태 변경 */
export interface LostItem {
  id: string;
  campCode: string;
  name: string;
  description?: string;
  /** 발견 장소 */
  foundPlace?: string;
  /** 발견일 "YYYY-MM-DD" */
  foundDate: string;
  /** 현재 보관 장소 (예: 2층 교무실) */
  keptAt?: string;
  status: LostItemStatus;
  media: LostItemMedia[];
  reportedBy: string;
  reportedById: string;
  /** 알림 대상 조회용 캠프 jobCode 문서 ID */
  jobCodeId?: string;
  /** false면 등록 시 푸시 알림을 보내지 않음 (중요하지 않은 물품) */
  notify?: boolean;
  /** 이름표 등으로 주인을 아는 경우 — 담임·방 담당·그룹 매니저에게 알림 */
  ownerStudentId?: string;
  ownerName?: string;
  ownerClassCode?: string;
  ownerClassMentor?: string;
  ownerUnitMentor?: string;
  /** 캠프 그룹 키 (users.jobExperiences[].group 과 같은 값, 예: spring) */
  ownerGroup?: string;
  /** 주인 찾음 처리: 학생(또는 사람) 이름 · 처리자 · 시각 */
  claimedBy?: string;
  claimedHandler?: string;
  claimedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Storage 업로드 경로: lostItems/{campCode}/{lostItemId}/{timestamp}_{name} */
export function lostItemMediaPath(campCode: string, lostItemId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-가-힣]/g, '_').slice(-80);
  return `lostItems/${campCode}/${lostItemId}/${Date.now()}_${safe}`;
}
