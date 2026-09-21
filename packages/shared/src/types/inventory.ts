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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 그룹 패키지 (회사 공통 템플릿) — 다음 기수에 적용 후 이름·호실만 부여 */
export interface InventoryPackageSlot {
  key: string;
  /** 기본 그룹명 (적용 시 그대로 들어가며 관리자가 변경) */
  label: string;
  location?: string;
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

/** 특정 그룹의 최소 보유 수량 (그룹 예외 → 품목 기본값 → 0) */
export function getMinStock(item: Pick<InventoryItemView, 'minStocks' | 'minStockDefault'>, groupId: string): number {
  const override = item.minStocks?.[groupId];
  if (override != null && !isNaN(Number(override))) return Number(override);
  return Number(item.minStockDefault ?? 0) || 0;
}

/** 품목 마스터 + 캠프 재고 → 화면용 뷰 */
export function buildInventoryViews(
  items: InventoryItem[],
  stocksByItem: Record<string, InventoryStock | undefined>
): InventoryItemView[] {
  return items.map(item => {
    const s = stocksByItem[item.id];
    const stocks = s?.stocks ?? {};
    return { ...item, stocks, minStocks: s?.minStocks ?? {}, total: getTotalStock({ stocks }) };
  });
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

// ==================== 재고 요청 취합 · 구매 목록 ====================

export const INVENTORY_REQUEST_STATUSES = ['open', 'closed'] as const;
export type InventoryRequestStatus = (typeof INVENTORY_REQUEST_STATUSES)[number];

/** 관리자가 만든 재고 요청 (예: "9월 재고 요청") — 캠프별 */
export interface InventoryRequest {
  id: string;
  campCode: string;
  title: string;
  status: InventoryRequestStatus;
  /** 마감일 "YYYY-MM-DD" (선택) */
  dueDate?: string;
  note?: string;
  createdBy: string;
  createdById: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  closedAt?: Timestamp;
}

/** 요청 항목 1줄 */
export interface InventoryRequestLine {
  id: string;
  /** 재고 품목과 연결된 경우 (직접 입력이면 없음) */
  itemId?: string;
  name: string;
  quantity: number;
  /** 요청 단위는 자유 (개, 박스, 통 …) — 입고 시 낱개로 환산 */
  unit: string;
  memo?: string;
}

/** 선생님 1명의 요청 — 문서 ID = `${requestId}__${userId}` */
export interface InventoryRequestEntry {
  id: string;
  requestId: string;
  campCode: string;
  userId: string;
  userName: string;
  items: InventoryRequestLine[];
  updatedAt: Timestamp;
}

export function requestEntryDocId(requestId: string, userId: string): string {
  return `${requestId}__${userId}`;
}

/** 품목·단위별 합산 결과 */
export interface InventoryRequestSummary {
  key: string;
  itemId?: string;
  name: string;
  unit: string;
  total: number;
  /** 누가 얼마나 요청했는지 */
  requesters: Array<{ userName: string; quantity: number; memo?: string }>;
}

/** 여러 선생님의 요청을 같은 품목(연결된 품목 ID 또는 이름)+단위로 자동 합산 */
export function summarizeRequestEntries(entries: InventoryRequestEntry[]): InventoryRequestSummary[] {
  const map = new Map<string, InventoryRequestSummary>();
  entries.forEach(e => {
    (e.items ?? []).forEach(line => {
      if (!line.name?.trim() || !(line.quantity > 0)) return;
      const unit = (line.unit || '개').trim();
      const key = `${line.itemId ?? `name:${line.name.trim()}`}|${unit}`;
      if (!map.has(key)) map.set(key, { key, itemId: line.itemId, name: line.name.trim(), unit, total: 0, requesters: [] });
      const s = map.get(key)!;
      s.total += line.quantity;
      s.requesters.push({ userName: e.userName, quantity: line.quantity, ...(line.memo ? { memo: line.memo } : {}) });
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.unit.localeCompare(b.unit, 'ko'));
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
