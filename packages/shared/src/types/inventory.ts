import { localizeLabels, L } from '../i18n';
import { sameCampGroup } from '../utils/campAccess';
import { Timestamp } from 'firebase/firestore';

// ==================== 캠프 재고 (의약품·문구류·전자제품·위생도구·기타) ====================
// 설계 원칙
// - 품목(inventoryItems)은 회사 공통 마스터 — 어느 캠프든 비슷하므로 한 번 등록해 모든 캠프가 공유
// - 수량(inventoryStocks)은 캠프별 · 그룹별 — 문서 1개 = (캠프, 품목), stocks[groupId] = 낱개 수량
// - 그룹(inventoryGroups)은 캠프별 보관 장소/키트. 패키지(inventoryPackages)로 저장해 두고
//   다음 기수에는 적용 후 그룹명·호실만 바꾸면 됨
// - 모든 수량 변동은 inventoryMovements 에 남김 (약 복용 차감/복구, 입고, 수기 조정)

export const INVENTORY_CATEGORIES = ['의약품', '문구류', '전자제품', '위생도구', '생활용품', '서류', '교구', '기타'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

/** 분류별 세부 분류 (시트 기준). 자유 입력도 허용 */
export const INVENTORY_SUBCATEGORIES: Record<InventoryCategory, readonly string[]> = {
  의약품: ['복통', '내상', '상처', '근육', '기타'],
  문구류: ['필기', '커팅'],
  전자제품: [],
  위생도구: [],
  생활용품: ['세탁', '식기', '포장'],
  서류: ['테스트', '생활지도', '게시물'],
  교구: ['STEAM', '체육'],
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
export const INVENTORY_USAGE_LABELS: Record<InventoryUsage, string> = localizeLabels({
  oral: '먹는 약',
  topical: '바르는·붙이는 약',
  supply: '처치 소모품',
  equipment: '비품',
  operational: '일반 소모품',
});
/** 품목 추가 화면에서 보여줄 순서 (먹는 약 → 바르는 약 → 처치 소모품 → 일반 소모품 → 비품) */
export const INVENTORY_USAGE_ORDER: readonly InventoryUsage[] = ['oral', 'topical', 'supply', 'operational', 'equipment'];
/** 분류별로 먼저 보여줄 유형 (나머지는 '기타 유형'으로 접어둠) */
export function suggestedUsages(category: InventoryCategory): readonly InventoryUsage[] {
  if (category === '의약품') return ['oral', 'topical', 'supply'];
  if (category === '전자제품' || category === '교구') return ['equipment', 'operational'];
  if (category === '위생도구') return ['supply', 'operational', 'equipment'];
  return ['operational', 'equipment'];
}
/** 환자 처치에 쓰이는 유형 (환자 탭 사용 기록 대상) */
export const TREATMENT_USAGES: readonly InventoryUsage[] = ['oral', 'topical', 'supply'];

/** usage가 없는 옛 품목은 분류로 추정 */
/** 의약품(먹는 약·바르는 약) — 재고 화면에서 바로 쓰지 않고 환자 탭에서만 사용 기록 */
export const isMedicineItem = (item: Pick<InventoryItem, 'usage' | 'category'>): boolean => {
  const u = getItemUsage(item);
  return u === 'oral' || u === 'topical';
};
export function getItemUsage(item: Pick<InventoryItem, 'usage' | 'category'>): InventoryUsage {
  if (item.usage) return item.usage;
  return item.category === '의약품' ? 'oral' : 'operational';
}

/** 같은 이름 품목 구분용 표시명: "모드코프 (종합감기약)" */
export function itemLabel(item: Pick<InventoryItem, 'name' | 'kind' | 'spec'>): string {
  const extra = [item.kind, item.spec].filter(Boolean).join(' · ');
  return extra ? `${item.name} (${extra})` : item.name;
}

export type InventoryConsumption = 'single' | 'multi';
export const isMultiUse = (i: Pick<InventoryItem, 'consumption'> | undefined | null): boolean => i?.consumption === 'multi';

/** 품목 마스터 (회사 공통) */
export interface InventoryItem {
  id: string;
  /** 품목 사진·영상 — 어떻게 생겼는지 (회사 공통, 스태프 누구나 추가) */
  media?: ItemMedia[];
  /** 대표 사진(media.path) — 없거나 지워졌으면 첫 사진 */
  coverMediaPath?: string;
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
  /**
   * 사용 방식 — 'single'(기본): 쓸 때마다 수량만큼 차감
   * 'multi': 한 번 개봉해 여러 번 쓰는 약(맨소래담·버물리 등). 사용 기록만 남고, '다 씀' 처리할 때 1개 차감
   */
  consumption?: InventoryConsumption;
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
  /** 그룹별 유효기간 (가장 빠른 것, YYYY-MM-DD) */
  expiries?: Record<string, string>;
  /** 그룹 안 세부 위치 (예: 약통 2번 칸, 교무실 선반 위) */
  locations?: Record<string, string>;
  /** 다회용: 그룹별 개봉해 쓰는 중인 개수 (stocks 에 포함 — 다 쓰면 그때 차감) */
  opened?: Record<string, number>;
  /** 다회용: 사용 중인 것 중 '거의 다 씀' 표시 개수 — 부족 판단에서 뺀다 */
  nearlyEmpty?: Record<string, number>;
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
  'use',         // 사용 (스태프 누구나)
  'transfer',    // 그룹 간 이동 (보내는 그룹 −, 받는 그룹 + 두 건이 같은 transferId로 묶임)
  'open',        // 다회용 개봉 (수량 변화 없음)
  'nearly',      // 다회용 '거의 다 씀' 표시 (수량 변화 없음)
  'finish',      // 다회용 다 씀 → 1개 차감
] as const;
export type InventoryMovementReason = (typeof INVENTORY_MOVEMENT_REASONS)[number];

/** 수량 조정 사유 — 버튼으로 빠르게 고르기 (직접 입력도 가능) */
export const ADJUST_REASONS = ['실사 차이', '사용 후 기록 누락', '파손·폐기', '유효기간 만료', '분실', '다른 그룹으로 옮김', '입력 실수 정정'] as const;
/** 사용 메모 — 버튼으로 빠르게 (선택) */
export const USE_REASONS = ['수업', '생활', '학생 지급', '기타'] as const;
/** '기타'를 고르면 내용을 직접 적는다 (저장은 적은 내용만) */
export const USE_REASON_OTHER = '기타';
/** 일괄 실사 사유 */
export const STOCKTAKE_REASONS = ['기수 시작 실사', '중간 점검', '기수 종료 실사', '입력 실수 정정'] as const;

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementReason, string> = localizeLabels({
  dose: '약 복용',
  dose_adjust: '복용 수량 수정',
  dose_revert: '복용 기록 삭제(복구)',
  restock: '입고',
  adjust: '수기 조정',
  use: '사용',
  transfer: '그룹 간 이동',
  open: '개봉',
  nearly: '거의 다 씀',
  finish: '다 씀',
});

/** 그룹 간 이동 사유 — 버튼으로 빠르게 (선택) */
export const TRANSFER_REASONS = ['재고 나눠주기', '부족한 그룹 지원', '보관 장소 정리', '행사·수업 준비', '반납'] as const;

/** 입출고 기록 화면의 묶음 필터 */
export const MOVEMENT_FILTERS = localizeLabels([
  { key: 'all', label: '전체', reasons: [] as InventoryMovementReason[] },
  { key: 'in', label: '입고', reasons: ['restock'] as InventoryMovementReason[] },
  { key: 'use', label: '사용', reasons: ['use'] as InventoryMovementReason[] },
  { key: 'dose', label: '환자 투약', reasons: ['dose', 'dose_adjust', 'dose_revert'] as InventoryMovementReason[] },
  { key: 'transfer', label: '그룹 간 이동', reasons: ['transfer'] as InventoryMovementReason[] },
  { key: 'adjust', label: '수기 조정', reasons: ['adjust'] as InventoryMovementReason[] },
] as const);
export type MovementFilterKey = (typeof MOVEMENT_FILTERS)[number]['key'];

/** 한 줄 설명 — 그룹 간 이동은 보낸/받은 방향과 상대 그룹까지 */
export function movementLabel(m: Pick<InventoryMovement, 'reason' | 'delta' | 'refLabel' | 'counterGroupName'>): string {
  if (m.reason === 'transfer') {
    const other = m.counterGroupName ?? L('inventory.otherGroup');
    return m.delta < 0 ? L('inventory.sentToN', { v0: other }) : L('inventory.receivedFromN', { v0: other });
  }
  return m.refLabel || INVENTORY_MOVEMENT_LABELS[m.reason];
}

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
  /** 그룹 간 이동: 출고·입고 두 건을 묶는 ID */
  transferId?: string;
  /** 그룹 간 이동: 상대 그룹 (보낸 기록이면 받는 그룹, 받은 기록이면 보낸 그룹) */
  counterGroupId?: string;
  counterGroupName?: string;
  memo?: string;
  at: Timestamp;
  by: string;
  byId?: string;
}

/** 품목 + 현재 캠프 수량을 합친 화면용 뷰 */
export interface InventoryItemView extends InventoryItem {
  stocks: Record<string, number>;
  minStocks: Record<string, number>;
  expiries: Record<string, string>;
  locations: Record<string, string>;
  opened: Record<string, number>;
  nearlyEmpty: Record<string, number>;
  total: number;
}

/** 유효기간 상태 — 지남 / 30일 이내 임박 / 여유 */
export type ExpiryState = 'expired' | 'soon' | 'ok';
export function expiryState(date?: string, today = new Date()): ExpiryState | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  if (isNaN(d.getTime())) return null;
  const days = (d.getTime() - today.getTime()) / 86400000;
  return days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';
}
export function fmtExpiry(date?: string): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${y.slice(2)}.${m}${d ? `.${d}` : ''}`;
}
/** 재고가 있는 그룹 중 가장 빠른 유효기간 */
export function earliestExpiry(v: Pick<InventoryItemView, 'expiries' | 'stocks'>, groupId?: string): string | undefined {
  const list = Object.entries(v.expiries ?? {})
    .filter(([g, d]) => d && (groupId ? g === groupId : true) && (Number(v.stocks?.[g]) || 0) > 0)
    .map(([, d]) => d).sort();
  return list[0];
}

/** 전체 재고 = 그룹별 수량 합 */
export function getTotalStock(item: { stocks?: Record<string, number> } | undefined): number {
  return Object.values(item?.stocks ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** 특정 그룹 재고 */
export function getGroupStock(item: { stocks?: Record<string, number> } | undefined, groupId: string): number {
  return Number(item?.stocks?.[groupId] ?? 0) || 0;
}

/** 다회용: 그룹에서 개봉해 쓰는 중인 개수 (재고 수를 넘지 않게) */
export function getOpenedCount(v: Pick<InventoryItemView, 'consumption' | 'opened' | 'stocks'>, groupId: string): number {
  if (!isMultiUse(v)) return 0;
  return Math.max(0, Math.min(Number(v.opened?.[groupId]) || 0, getGroupStock(v, groupId)));
}
/** 다회용: '거의 다 씀' 표시 개수 (개봉한 수를 넘지 않게) */
export function getNearlyEmptyCount(v: Pick<InventoryItemView, 'consumption' | 'opened' | 'nearlyEmpty' | 'stocks'>, groupId: string): number {
  if (!isMultiUse(v)) return 0;
  return Math.max(0, Math.min(Number(v.nearlyEmpty?.[groupId]) || 0, getOpenedCount(v, groupId)));
}
/** 부족 판단용 수량 — 다회용은 '거의 다 씀'을 빼고 센다 (미리 사 오도록) */
export function getAvailableStock(v: Pick<InventoryItemView, 'consumption' | 'opened' | 'nearlyEmpty' | 'stocks'>, groupId: string): number {
  return getGroupStock(v, groupId) - getNearlyEmptyCount(v, groupId);
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
    return {
      ...item, stocks, minStocks: s?.minStocks ?? {}, expiries: s?.expiries ?? {}, locations: s?.locations ?? {},
      opened: s?.opened ?? {}, nearlyEmpty: s?.nearlyEmpty ?? {}, total: getTotalStock({ stocks }),
    };
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
      const current = getAvailableStock(v, g.id);
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

// ==================== 재고 화면 권한 ====================
// 기존 권한 체계를 그대로 쓴다. 바꾸지 않는다.
//  - role === 'admin'                     → 기존 관리자 권한 (품목·그룹·수량·이미지·관리 탭)
//  - jobExperiences[활성 캠프].groupRole  → 그룹 안 역할. '부매니저'(원어민 'Sub Manager')는
//                                           재고 운영 정보를 **볼** 수 있다 (부족 현황·미처리 요청·취합).
//    ※ 쓰기 권한(입고·조정·최소 재고·그룹 간 이동)은 예전처럼 관리자만. 보안 규칙도 그대로 관리자만 허용.
//    ※ '매니저'(Manager)에게도 같은 화면을 주려면 아래 배열에 '매니저', 'Manager'만 추가하면 된다.
export const STOCK_MANAGER_GROUP_ROLES: readonly string[] = ['부매니저', 'Sub Manager'];

export interface InventoryPerm {
  /** 시스템 role === 'admin' */
  isAdmin: boolean;
  /** 이 캠프에서 부매니저인가 (관리자 포함) — 재고 운영 정보를 본다 */
  isStockManager: boolean;
  /** 모든 그룹 재고 입고·조정·최소 재고·그룹 간 이동 (관리자) */
  canManageStock: boolean;
  /** 이 캠프의 부매니저 (관리자 아님) — 자기 그룹 재고 입고 · 조정 · 이동 가능 */
  isSubManager: boolean;
  /** 품목 이미지 등록·변경·삭제 (관리자만) */
  canEditItemMedia: boolean;
  /** 품목 추가·수정 (기존과 동일: 관리자만) */
  canEditItem: boolean;
}

/** 현재 로그인 유저 + 활성 캠프 jobCode 로 재고 화면 권한 계산 */
export function inventoryPerm(
  user: { role?: string; jobExperiences?: Array<{ id: string; groupRole?: string }> } | null | undefined,
  activeJobCodeId?: string
): InventoryPerm {
  const isAdmin = user?.role === 'admin';
  const groupRole = user?.jobExperiences?.find(e => e.id === activeJobCodeId)?.groupRole;
  const isSub = !!groupRole && STOCK_MANAGER_GROUP_ROLES.includes(groupRole);
  return {
    isAdmin,
    isStockManager: isAdmin || isSub,
    canManageStock: isAdmin,
    isSubManager: !isAdmin && isSub,
    canEditItemMedia: isAdmin,
    canEditItem: isAdmin,
  };
}

/** 재고 그룹(교무실)이 이 캠프 그룹과 연결된 그룹인가 — 연결이 없으면 그룹 이름으로 비교 */
export function isStockGroupOf(g: Pick<InventoryGroup, 'campGroupName' | 'name'>, campGroup?: string): boolean {
  return sameCampGroup(g.campGroupName || g.name, campGroup);
}

/**
 * 재고를 입고 · 조정할 수 있는 그룹 id
 * - 관리자: 전체
 * - 부매니저: 자기 캠프 그룹과 연결된 재고 그룹만
 */
export function managedStockGroupIds(
  perm: Pick<InventoryPerm, 'canManageStock' | 'isSubManager'>,
  groups: Array<Pick<InventoryGroup, 'id' | 'campGroupName' | 'name'>>,
  myCampGroupName?: string
): Set<string> {
  if (perm.canManageStock) return new Set(groups.map(g => g.id));
  if (!perm.isSubManager || !myCampGroupName) return new Set();
  return new Set(groups.filter(g => isStockGroupOf(g, myCampGroupName)).map(g => g.id));
}

/** 그룹 간 이동 가능 여부 — 보내거나 받는 쪽 중 하나가 내가 관리하는 그룹 (양방향) */
export const canTransferBetween = (managed: Set<string>, fromId: string, toId: string): boolean =>
  fromId !== toId && (managed.has(fromId) || managed.has(toId));

// ==================== 구매 요청 (멘토가 올림) ====================
// 멘토가 "누가(학생/멘토/캠프 공용) · 무엇이" 필요한지 올리면
// 구매 담당(관리자가 지정 — 캠프 기본 담당 또는 요청별 담당)이 사 와서 **품목별로** 완료(금액·송금 계좌)를 누른다.
// 이후 정산: 학생 물품은 담임이 용돈봉투에서 빼서 구매자에게, 선생님 물품은 본인이 구매자에게 송금.

/** (구) 구매처 — 이제 요청 시 고르지 않음. 예전 데이터 표시용 */
export const SUPPLY_STORES = ['다이소', '약국', '마트', '기타'] as const;
export type SupplyStore = (typeof SUPPLY_STORES)[number];

export const SUPPLY_REQUEST_STATUSES = ['requested', 'onhold', 'purchased', 'rejected'] as const;
export type SupplyRequestStatus = (typeof SUPPLY_REQUEST_STATUSES)[number];
export const SUPPLY_REQUEST_STATUS_LABELS: Record<SupplyRequestStatus, string> = localizeLabels({
  requested: '요청',
  onhold: '보류',
  purchased: '구매 완료',
  rejected: '반려',
});
/** 누구를 위한 요청인가: 학생 / 멘토 / 캠프 공용 재고(구매 후 재고에 입고) */
export type SupplyForType = 'student' | 'mentor' | 'camp';

/** 아직 끝나지 않은 요청 (요청 · 보류) */
export const isSupplyOpen = (s: SupplyRequestStatus): boolean => s === 'requested' || s === 'onhold';
/** 관리자 처리 — 승인 / 미정(검토 중) / 반려 / 보류. 구매 완료된 요청은 null */
export type SupplyDecision = 'approved' | 'pending' | 'rejected' | 'onhold';
export const supplyDecisionOf = (r: Pick<SupplyRequest, 'status' | 'approvedAt'>): SupplyDecision | null =>
  r.status === 'purchased' ? null : r.status === 'rejected' ? 'rejected' : r.status === 'onhold' ? 'onhold' : r.approvedAt ? 'approved' : 'pending';
/** 관리자가 승인했는가 */
export const supplyApproved = (r: Pick<SupplyRequest, 'approvedAt'>): boolean => !!r.approvedAt;

/** (구) 요청 댓글 — 화면에서 뺐음. 예전 데이터 호환용 타입 */
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
  /** 관리자 지정 품목(쿠팡 등)에서 담은 줄 */
  guideId?: string;
  /** 구매 경로 (예: 쿠팡) */
  channel?: string;
  /** 학부모님께 따로 청구 — 용돈봉투·송금 정산 대신 관리자가 청구 */
  parentBill?: boolean;
}

/**
 * 관리자 지정 품목 가이드 (회사 공통) — 예: 책가방·슬리퍼·손목시계는 쿠팡에서 사고 학부모님께 청구.
 * 요청 작성 중 검색하면 맨 위에 가이드와 함께 뜬다.
 */
export interface SupplyGuide {
  id: string;
  name: string;
  /** 검색어 (예: 가방, 백팩) */
  keywords?: string[];
  /** 구매 경로 (기본 '쿠팡') */
  channel: string;
  /** 학부모님께 따로 청구 */
  parentBill: boolean;
  /** 멘토에게 보여줄 안내 */
  guide: string;
  isActive?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
/** 검색어에 맞는 가이드 */
export function matchSupplyGuides(guides: SupplyGuide[], q: string): SupplyGuide[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return guides.filter(g => g.isActive !== false && [g.name, ...(g.keywords ?? [])].some(k => {
    const s = k.trim().toLowerCase();
    return !!s && (s.includes(t) || (t.length >= 2 && t.includes(s)));
  }));
}

/** 품목 1줄 구매 완료 기록 — 구매한 사람이 직접 */
export interface SupplyLineDone {
  at: Timestamp;
  by: string;
  byId: string;
  /** 실제 금액 (원) — 수량 × 단가 */
  amount?: number;
  /** 실제로 산 수량 (요청 단위). 요청보다 적게 사면 남은 수량은 새 줄로 요청에 남는다 */
  quantity?: number;
  /** 단가 (원) */
  unitPrice?: number;
  /** 선생님 물품: 송금받을 곳 (예: "카카오뱅크 3333-01-1234567 신선웅") */
  payTo?: string;
}
/** 품목 1줄 정산 완료 — 학생: 담임이 봉투에서 빼서 전달 / 선생님: 본인이 송금 */
export interface SupplyLineSettle {
  at: Timestamp;
  by: string;
  byId: string;
}

/** 멘토 구매 요청 1건 — 캠프별 */
export interface SupplyRequest {
  id: string;
  campCode: string;
  forType: SupplyForType;
  studentId?: string;
  studentName?: string;
  studentClass?: string;
  /** 학생 요청: 요청 당시 담임(반멘토) 이름 — 용돈봉투 정산 담당 */
  classMentor?: string;
  /** 학생 반코드 (예: J05) — 그룹 분류용 */
  studentClassCode?: string;
  /** (구) 구매처 */
  store?: SupplyStore;
  storeEtc?: string;
  items: SupplyRequestLine[];
  note?: string;
  status: SupplyRequestStatus;
  requesterId: string;
  requesterName: string;
  /** 요청한 멘토의 그룹 (그룹별 분류용, 요청 당시) */
  requesterGroup?: string;
  handledBy?: string;
  handledAt?: Timestamp;
  /** 반려·보류 사유 */
  statusNote?: string;
  /** 보류 시 구매 예정일 (YYYY-MM-DD) */
  holdUntil?: string;
  /** 요청별 구매 담당 (없으면 캠프 기본 담당) */
  buyerId?: string;
  buyerName?: string;
  buyerAt?: Timestamp;
  buyerAssignedBy?: string;
  /** 품목(줄 ID)별 구매 완료 */
  done?: Record<string, SupplyLineDone>;
  /** 품목(줄 ID)별 정산 완료 */
  settlements?: Record<string, SupplyLineSettle>;
  /** 구매 금액 합계 (품목 금액 합) */
  amount?: number;
  /** 관리자 승인 — 없으면 '검토 중'. 승인 전에는 구매 담당 목록에 오르지 않는다 */
  approvedAt?: Timestamp;
  approvedBy?: string;
  approvedById?: string;
  /** (구) 댓글 — 더 이상 쓰지 않음 */
  comments?: SupplyComment[];
  /** 캠프 공용: 품목(줄)별 재고 입고 기록 — 구매 완료와 동시에 입고 (다시 입고되지 않게) */
  stocked?: Record<string, { quantity: number; groupId: string; groupName: string; at: Timestamp; by: string }>;
  /** 캠프 공용: 구매 후 재고에 입고 반영했는지 (재고 품목 줄이 모두 입고되면 true) */
  stockApplied?: boolean;
  stockAppliedAt?: Timestamp;
  stockAppliedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 요청서 단위 버튼 — 순서 고정 */
export const SUPPLY_UNITS = ['개', '박스', '통', '팩', '병', '세트'] as const;
/** 단위 버튼 목록: 순서는 항상 고정, 품목 고유 단위(정·포 …)는 맨 뒤에 한 칸 */
export const supplyUnitChoices = (current?: string): string[] =>
  current && !(SUPPLY_UNITS as readonly string[]).includes(current) ? [...SUPPLY_UNITS, current] : [...SUPPLY_UNITS];

/** 캠프별 구매 설정 — 기본 구매 담당 (요청마다 지정하지 않아도 되게) */
export interface SupplySettings {
  campCode: string;
  defaultBuyerId?: string;
  defaultBuyerName?: string;
  updatedBy?: string;
  updatedAt?: Timestamp;
}

export const fmtWon = (n?: number): string => L('inventory.wonN', { v0: (n ?? 0).toLocaleString('ko-KR') });

export function supplyStoreLabel(r: Pick<SupplyRequest, 'store' | 'storeEtc'>): string {
  if (!r.store) return '';
  return r.store === '기타' && r.storeEtc?.trim() ? r.storeEtc.trim() : r.store;
}

/** "누구" 표시: 학생이면 이름(반), 멘토면 요청자(멘토) */
export function supplyForLabel(r: Pick<SupplyRequest, 'forType' | 'studentName' | 'studentClass' | 'requesterName'>): string {
  if (r.forType === 'camp') return L('inventory.forCamp');
  if (r.forType === 'student') return `${r.studentName ?? L('inventory.forStudentFallback')}${r.studentClass ? `(${r.studentClass})` : ''}`;
  return L('inventory.forTeacherN', { v0: r.requesterName });
}

/** 실제 구매 담당: 요청별 지정 → 없으면 캠프 기본 담당 */
export function supplyBuyerOf(r: Pick<SupplyRequest, 'buyerId' | 'buyerName'>, settings?: SupplySettings | null): { uid: string; name: string; isDefault: boolean } | null {
  if (r.buyerId) return { uid: r.buyerId, name: r.buyerName ?? '', isDefault: false };
  if (settings?.defaultBuyerId) return { uid: settings.defaultBuyerId, name: settings.defaultBuyerName ?? '', isDefault: true };
  return null;
}

export const supplyLineDone = (r: Pick<SupplyRequest, 'done'>, lineId: string): SupplyLineDone | undefined => r.done?.[lineId];
export const supplyDoneCount = (r: Pick<SupplyRequest, 'done' | 'items'>): number => r.items.filter(l => r.done?.[l.id]).length;
export const supplyAllDone = (r: Pick<SupplyRequest, 'done' | 'items'>): boolean => r.items.length > 0 && r.items.every(l => r.done?.[l.id]);
export const supplyDoneTotal = (r: Pick<SupplyRequest, 'done'>): number => Object.values(r.done ?? {}).reduce((a, d) => a + (d.amount ?? 0), 0);

/** 정산 방식: 학생 = 담임이 용돈봉투에서 / 선생님 = 본인 송금 / 캠프 공용 = 없음 */
export type SupplySettleKind = 'envelope' | 'transfer' | null;
export const supplySettleKind = (r: Pick<SupplyRequest, 'forType'>): SupplySettleKind =>
  r.forType === 'student' ? 'envelope' : r.forType === 'mentor' ? 'transfer' : null;
/** 품목별 정산 방식 — 학부모 청구 품목은 'parent' (관리자가 청구) */
export type SupplyLineSettleKind = 'envelope' | 'transfer' | 'parent';
export const supplyLineSettleKind = (r: Pick<SupplyRequest, 'forType'>, line: Pick<SupplyRequestLine, 'parentBill'>): SupplyLineSettleKind | null =>
  line.parentBill ? 'parent' : supplySettleKind(r);
export const SUPPLY_SETTLE_LABELS: Record<SupplyLineSettleKind, { title: string; verb: string; icon: string }> = localizeLabels({
  envelope: { title: '용돈봉투', verb: '봉투에서 빼서 전달', icon: '📒' },
  transfer: { title: '본인 송금', verb: '송금', icon: '💸' },
  parent: { title: '학부모 청구', verb: '학부모님께 청구', icon: '🧾' },
});

/** 정산할 품목 1줄 (구매 완료 + 금액 있음) */
export interface SupplySettleLine {
  req: SupplyRequest;
  line: SupplyRequestLine;
  done: SupplyLineDone;
  kind: SupplyLineSettleKind;
  settled?: SupplyLineSettle;
}
export function supplySettleLines(requests: SupplyRequest[]): SupplySettleLine[] {
  const out: SupplySettleLine[] = [];
  requests.forEach(r => {
    if (r.status === 'rejected') return;
    r.items.forEach(line => {
      const kind = supplyLineSettleKind(r, line);
      const done = r.done?.[line.id];
      if (!kind || !done || !(done.amount && done.amount > 0)) return;
      out.push({ req: r, line, done, kind, settled: r.settlements?.[line.id] });
    });
  });
  return out;
}

/**
 * 그룹 순서대로 분류 — 학생은 반 → 캠프 그룹, 멘토는 요청 당시 그룹, 캠프 공용은 맨 끝.
 * campGroups 순서(캠프 설정 순서)를 따른다.
 */
export interface SupplyGroupSection<T> { key: string; label: string; items: T[] }
export function groupSupplyByCampGroup<T>(
  list: T[],
  reqOf: (t: T) => SupplyRequest,
  campGroups: Array<{ name: string; classCodes: string[] }>,
  students: Array<{ studentId: string; classNumber?: string }>
): SupplyGroupSection<T>[] {
  const order = campGroups.map(g => g.name);
  const byLower = new Map(order.map(n => [n.toLowerCase(), n]));
  const groupOf = (r: SupplyRequest): string => {
    if (r.forType === 'camp') return '__camp';
    if (r.forType === 'student') {
      // 반코드(J01 …)는 반번호 앞 3자리 — campSettings.groups[].classCodes 와 매칭
      const code = r.studentClassCode || studentClassCode(students.find(s => s.studentId === r.studentId)?.classNumber);
      const g = code ? campGroups.find(cg => cg.classCodes.includes(code)) : undefined;
      return g?.name ?? '__etc';
    }
    return (r.requesterGroup && byLower.get(r.requesterGroup.toLowerCase())) || '__etc';
  };
  const map = new Map<string, T[]>();
  list.forEach(t => { const k = groupOf(reqOf(t)); if (!map.has(k)) map.set(k, []); map.get(k)!.push(t); });
  const keys = [...order.filter(n => map.has(n)), ...(map.has('__etc') ? ['__etc'] : []), ...(map.has('__camp') ? ['__camp'] : [])];
  return keys.map(k => ({ key: k, label: k === '__camp' ? '캠프 공용' : k === '__etc' ? '그 외 (그룹 설정에 없는 반)' : k, items: map.get(k)! }));
}

/** 학생 반번호(예: "J05-12") → 반코드("J05"). campSettings 그룹의 classCodes 와 같은 형식 */
export function studentClassCode(classNumber?: string): string {
  return (classNumber ?? '').trim().slice(0, 3).toUpperCase();
}

/** 캠프 공용 요청인데 구매 완료 후 아직 재고 입고를 안 한 상태 */
export const needsStockIntake = (r: Pick<SupplyRequest, 'forType' | 'status' | 'stockApplied' | 'items' | 'stocked'>): boolean =>
  r.forType === 'camp' && r.status === 'purchased' && !r.stockApplied && r.items.some(l => l.itemId && l.groupId && !r.stocked?.[l.id]);

/**
 * 구매 완료 시 재고에 넣을 기본 수량 — 요청 단위가 품목 단위와 다르고 포장당 낱개 수가 있으면 환산
 * (예: 요청 2박스, 품목 단위 '정', 포장당 10정 → 20)
 */
export function supplyLineStockQty(line: Pick<SupplyRequestLine, 'quantity' | 'unit'>, item?: Pick<InventoryItem, 'unit' | 'packSize'> | null): number {
  const q = Math.max(0, Math.round(Number(line.quantity) || 0));
  if (!item) return q;
  if (line.unit && item.unit && line.unit !== item.unit && (item.packSize ?? 0) > 1) return q * (item.packSize as number);
  return q;
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

/** 구매 담당 후보: 관리자 → 그룹매니저 → 그 외 캠프 인원 */
export interface SupplyBuyerCandidate { uid: string; name: string; tag: string; rank: number }
const MANAGER_ROLES = ['매니저', '부매니저', 'Manager', 'Sub Manager'];
export function supplyBuyerCandidates(
  users: Array<{ userId?: string; id?: string; name?: string; role?: string; jobExperiences?: Array<{ id: string; group?: string; groupRole?: string }> }>,
  jobCodeId: string
): SupplyBuyerCandidate[] {
  return users
    .filter(u => (u.userId || u.id) && u.name)
    .map(u => {
      const exp = u.jobExperiences?.find(e => e.id === jobCodeId);
      const isMgr = !!exp?.groupRole && MANAGER_ROLES.includes(exp.groupRole);
      const tag = u.role === 'admin' ? '관리자' : isMgr ? `${exp?.group ? `${exp.group} ` : ''}${exp?.groupRole}` : (exp?.groupRole ?? '');
      return { uid: (u.userId || u.id)!, name: u.name!, tag, rank: u.role === 'admin' ? 0 : isMgr ? 1 : 2 };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ko'));
}

/** 장보기 목록 — 아직 안 산 품목을 품목(연결 ID 또는 이름)+단위로 합산 */
export interface SupplyShoppingLine { key: string; itemId?: string; name: string; unit: string; total: number; who: string[] }
export function supplyShoppingList(requests: SupplyRequest[]): SupplyShoppingLine[] {
  const map = new Map<string, SupplyShoppingLine>();
  requests.forEach(r => (r.items ?? []).forEach(l => {
    if (r.done?.[l.id] || !l.name?.trim() || !(l.quantity > 0)) return;
    const unit = (l.unit || '개').trim();
    const key = `${l.itemId ?? `name:${l.name.trim()}`}|${unit}`;
    let line = map.get(key);
    if (!line) { line = { key, itemId: l.itemId, name: l.name.trim(), unit, total: 0, who: [] }; map.set(key, line); }
    line.total += l.quantity;
    line.who.push(r.forType === 'camp' ? `공용${l.groupName ? `(${l.groupName})` : ''} ${l.quantity}` : `${supplyForLabel(r)} ${l.quantity}`);
  }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * 요청 진행 상태 표시 — 기존 status 필드(requested/onhold/purchased/rejected)와
 * 관리자 승인·품목별 완료·입고 반영 여부를 합쳐 "검토 중 → 승인 → 구매 중 → 입고 완료" 로 보여준다.
 * (기존 데이터를 바꾸지 않기 위해 status 값 자체는 그대로 둔다)
 */
export type SupplyProgressKey = 'waiting' | 'approved' | 'buying' | 'bought' | 'received' | 'onhold' | 'rejected';
export const SUPPLY_PROGRESS: Record<SupplyProgressKey, { label: string; step: number }> = localizeLabels({
  waiting:  { label: '검토 중', step: 1 },
  approved: { label: '승인', step: 2 },
  buying:   { label: '구매 중', step: 3 },
  bought:   { label: '구매 완료', step: 3 },
  received: { label: '입고 완료', step: 4 },
  onhold:   { label: '보류', step: 0 },
  rejected: { label: '반려', step: 0 },
});
export function supplyProgress(
  r: Pick<SupplyRequest, 'status' | 'forType' | 'items' | 'done' | 'buyerId' | 'stockApplied' | 'approvedAt'>,
  _hasBuyer?: boolean
): { key: SupplyProgressKey; label: string; step: number } {
  let key: SupplyProgressKey;
  if (r.status === 'rejected') key = 'rejected';
  else if (r.status === 'onhold') key = 'onhold';
  else if (r.status === 'purchased') {
    // 캠프 공용은 실제 입고까지 해야 완료
    key = r.forType === 'camp' ? (r.stockApplied ? 'received' : 'bought') : 'received';
  } else if (supplyDoneCount(r) > 0) key = 'buying';
  else if (supplyApproved(r)) key = 'approved';
  else key = 'waiting';
  return { key, ...SUPPLY_PROGRESS[key] };
}

export const PURCHASE_STATUSES = ['needed', 'ordered', 'received'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = localizeLabels({
  needed: '구매 필요',
  ordered: '주문함',
  received: '입고 완료',
});

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
export const LOST_ITEM_STATUS_LABELS: Record<LostItemStatus, string> = localizeLabels({
  found: '보관 중',
  claimed: '주인 찾음',
  discarded: '폐기',
});

/**
 * 분실물 종류
 *  'found' 주웠어요 — 물건을 보관 중 (기본값, 기존 문서 전부)
 *  'lost'  잃어버렸어요 — 찾고 있는 물건
 * 상태(status) 값은 공유하고 라벨만 다르게 쓴다 (기존 데이터·보안 규칙 그대로).
 */
export const LOST_ITEM_KINDS = ['found', 'lost'] as const;
export type LostItemKind = (typeof LOST_ITEM_KINDS)[number];
export const lostItemKind = (l: Pick<LostItem, 'kind'>): LostItemKind => l.kind ?? 'found';
export const LOST_KIND_LABELS: Record<LostItemKind, { tab: string; action: string; en: string }> = localizeLabels({
  found: { tab: '주운 물건', action: '주웠어요', en: 'Found' },
  lost:  { tab: '찾는 물건', action: '잃어버렸어요', en: 'Lost' },
});
/** 같은 status 라도 종류에 따라 다르게 읽힌다 */
export const LOST_STATUS_LABELS_BY_KIND: Record<LostItemKind, Record<LostItemStatus, string>> = localizeLabels({
  found: { found: '보관 중', claimed: '주인 찾음', discarded: '폐기' },
  lost:  { found: '찾는 중', claimed: '찾음',      discarded: '못 찾음' },
});
export const lostStatusLabel = (l: Pick<LostItem, 'kind' | 'status'>): string =>
  LOST_STATUS_LABELS_BY_KIND[lostItemKind(l)][l.status];
/** 아직 진행 중인 건 (보관 중 · 찾는 중) */
export const isLostOpen = (l: Pick<LostItem, 'status'>): boolean => l.status === 'found';

/**
 * 주운 물건 ↔ 찾는 물건 짝 찾기.
 * 이름·설명을 두 글자씩 끊어 겹치는 정도로 본다 (짧은 한국어 물건명에 잘 맞는다).
 */
function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  if (t.length === 1) out.add(t);
  return out;
}
function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach(g => { if (B.has(g)) hit++; });
  return hit / Math.min(A.size, B.size);
}

export interface LostMatch<T> { item: T; score: number }
/**
 * 이 건과 짝이 될 만한 반대쪽 건들 (점수 높은 순).
 * @param me 지금 보고 있는(또는 올리려는) 건
 * @param all 같은 캠프의 분실물 전체
 */
export function suggestLostMatches<T extends Pick<LostItem, 'id' | 'kind' | 'status' | 'name' | 'description' | 'ownerStudentId' | 'ownerName'>>(
  me: Pick<LostItem, 'kind' | 'name' | 'description' | 'ownerStudentId'>,
  all: T[],
  limit = 3
): Array<LostMatch<T>> {
  const wantKind: LostItemKind = lostItemKind(me) === 'found' ? 'lost' : 'found';
  const text = `${me.name ?? ''} ${me.description ?? ''}`.trim();
  if (!text) return [];
  return all
    .filter(l => lostItemKind(l) === wantKind && isLostOpen(l))
    .map(l => {
      let score = similarity(text, `${l.name ?? ''} ${l.description ?? ''}`);
      // 주인이 같으면 확실한 짝
      if (me.ownerStudentId && l.ownerStudentId && me.ownerStudentId === l.ownerStudentId) score = Math.max(score, 0.9);
      return { item: l, score };
    })
    .filter(m => m.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 첨부 사진/영상 (Firebase Storage) */
export interface LostItemMedia {
  url: string;
  /** Storage 경로 (삭제용) */
  path: string;
  type: 'image' | 'video';
  name?: string;
  size?: number;
}

/** 이름표가 있는 분실물의 알림 대상 */
export const LOST_NOTIFY_TARGETS = ['classMentor', 'unitMentor', 'groupManager'] as const;
export type LostNotifyTarget = (typeof LOST_NOTIFY_TARGETS)[number];
export const LOST_NOTIFY_TARGET_LABELS: Record<LostNotifyTarget, { ko: string; en: string }> = {
  classMentor:  { ko: '반담당', en: 'Class teacher' },
  unitMentor:   { ko: '방담당', en: 'Room teacher' },
  groupManager: { ko: '부매니저', en: 'Sub manager' },
};
/** 저장된 값이 없으면 셋 다 */
export const lostNotifyTargets = (l: Pick<LostItem, 'notifyTargets'>): LostNotifyTarget[] =>
  l.notifyTargets?.length ? l.notifyTargets : [...LOST_NOTIFY_TARGETS];

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
  /**
   * 알림 범위 — 이름표로 주인을 아는 경우에만 의미가 있다.
   *  'owner' (기본) 아래 notifyTargets 에 고른 담당 선생님에게만
   *  'all'          캠프 선생님 전체
   * 없으면 'owner'로 본다 (기존 문서 호환).
   */
  notifyScope?: 'owner' | 'all';
  /**
   * 'owner' 일 때 누구에게 보낼지 — 등록할 때 따로따로 고른다.
   * 없으면 셋 다 보낸 것으로 본다 (기존 문서 호환).
   */
  notifyTargets?: LostNotifyTarget[];
  /** 이름표 등으로 주인을 아는 경우 — 담임·방 담당·그룹 매니저에게 알림 */
  ownerStudentId?: string;
  ownerName?: string;
  ownerClassCode?: string;
  ownerClassMentor?: string;
  ownerUnitMentor?: string;
  /** 캠프 그룹 키 (users.jobExperiences[].group 과 같은 값, 예: spring) */
  ownerGroup?: string;
  /** 종류 — 없으면 'found'(주웠어요) */
  kind?: LostItemKind;
  /** 짝이 맞춰진 반대쪽 건 (주운 물건 ↔ 찾는 물건) */
  matchedId?: string;
  matchedAt?: Timestamp;
  matchedBy?: string;
  /** 주인 찾음 처리: 학생(또는 사람) 이름 · 처리자 · 시각 */
  claimedBy?: string;
  claimedHandler?: string;
  claimedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Storage 업로드 경로: lostItems/{campCode}/{lostItemId}/{timestamp}_{name} */
/** 품목 사진·영상 1개 */
export interface ItemMedia {
  url: string;
  path: string;
  type: 'image' | 'video';
  name?: string;
  size?: number;
  by?: string;
}
/** 품목 사진·영상 Storage 경로 */
export function inventoryItemMediaPath(itemId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-가-힣]/g, '_').slice(-80);
  return `inventoryItems/${itemId}/${Date.now()}_${safe}`;
}
/** 목록 썸네일용 첫 사진 */
/** 대표 사진 — 지정한 사진, 없으면 첫 사진 */
export const itemCoverMedia = (i: Pick<InventoryItem, 'media' | 'coverMediaPath'>): ItemMedia | undefined => {
  const imgs = (i.media ?? []).filter(m => m.type === 'image');
  return imgs.find(m => m.path === i.coverMediaPath) ?? imgs[0];
};
export const itemThumb = (i: Pick<InventoryItem, 'media' | 'coverMediaPath'>): string | undefined => itemCoverMedia(i)?.url;
/** 상세 화면 넘겨보기 순서 — 대표 사진을 맨 앞에, 나머지는 등록 순서 */
export const orderedItemMedia = (i: Pick<InventoryItem, 'media' | 'coverMediaPath'>): ItemMedia[] => {
  const cover = itemCoverMedia(i);
  const rest = (i.media ?? []).filter(m => m !== cover);
  return cover ? [cover, ...rest] : rest;
};

export function lostItemMediaPath(campCode: string, lostItemId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-가-힣]/g, '_').slice(-80);
  return `lostItems/${campCode}/${lostItemId}/${Date.now()}_${safe}`;
}

/** 'YYYY-MM-DD' → 'M/D' (보류 예정일 표시) */
export function fmtHoldDate(s?: string): string {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** 구매 요청 목록·상세의 상태 한 줄 설명 (web·mobile 공용) */
export function supplyStatusLine(r: SupplyRequest, buyer: { name: string; isDefault?: boolean } | null | undefined): string {
  if (r.status === 'onhold') return `⏸ ${L('inventory.slHold')}${r.holdUntil ? ` · ${L('inventory.slBuyOn', { v0: fmtHoldDate(r.holdUntil) })}` : ''}${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'rejected') return `${L('inventory.slRejected')}${r.statusNote ? ` · ${r.statusNote}` : ''}`;
  if (r.status === 'purchased') {
    const base = `${L('inventory.slPurchased')}${r.amount ? ` · ${fmtWon(r.amount)}` : ''}`;
    if (r.forType === 'camp') return base + (r.stockApplied ? ` · ${L('inventory.slRestocked')}` : needsStockIntake(r) ? ` · 📥 ${L('inventory.slAwaitRestock')}` : '');
    const lines = supplySettleLines([r]);
    return lines.length ? `${base} · ${L('inventory.slSettled', { v0: lines.filter(l => l.settled).length, v1: lines.length })}` : base;
  }
  if (!supplyApproved(r)) return `🔎 ${L('inventory.slReviewing')}`;
  const done = supplyDoneCount(r);
  return `${buyer ? `🛒 ${buyer.name}${buyer.isDefault ? L('inventory.slDefaultMark') : ''}` : `🛒 ${L('inventory.slNoBuyer')}`}${done ? ` · ${L('inventory.slBoughtN', { v0: done, v1: r.items.length })}` : ''}`;
}
