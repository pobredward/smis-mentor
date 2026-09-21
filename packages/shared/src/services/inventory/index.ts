import {
  collection,
  doc,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  increment,
  Timestamp,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import type {
  InventoryItem,
  InventoryGroup,
  InventoryPackage,
  InventoryPackageSlot,
  InventoryStock,
  InventoryMovement,
  InventoryMovementReason,
  InventoryRequest,
  InventoryRequestEntry,
  PurchaseItem,
} from '../../types/inventory';
import { stockDocId, sortInventoryItems, requestEntryDocId } from '../../types/inventory';
import type { MedicationDose } from '../../types/camp';
import { logger } from '../../utils/logger';

const ITEMS = 'inventoryItems';
const GROUPS = 'inventoryGroups';
const PACKAGES = 'inventoryPackages';
const STOCKS = 'inventoryStocks';
const MOVEMENTS = 'inventoryMovements';

// ── 구독 ───────────────────────────────────────────────────────

/** 품목 마스터 구독 (회사 공통, 분류→이름 정렬) */
export const subscribeInventoryItems = (
  db: Firestore,
  onData: (items: InventoryItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    collection(db, ITEMS),
    (snap) => onData(sortInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as InventoryItem))),
    (error) => { logger.error('재고 품목 구독 오류:', error); onError?.(error); }
  );

/** 캠프 재고 그룹 구독 (order순) */
export const subscribeInventoryGroups = (
  db: Firestore,
  campCode: string,
  onData: (groups: InventoryGroup[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, GROUPS), where('campCode', '==', campCode)),
    (snap) => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as InventoryGroup)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ko'))
    ),
    (error) => { logger.error('재고 그룹 구독 오류:', error); onError?.(error); }
  );

/** 캠프별 수량 구독 → { [itemId]: InventoryStock } */
export const subscribeInventoryStocks = (
  db: Firestore,
  campCode: string,
  onData: (stocks: Record<string, InventoryStock>) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, STOCKS), where('campCode', '==', campCode)),
    (snap) => {
      const map: Record<string, InventoryStock> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const s = { id: d.id, ...data, stocks: (data.stocks ?? {}) as Record<string, number> } as InventoryStock;
        map[s.itemId] = s;
      });
      onData(map);
    },
    (error) => { logger.error('재고 수량 구독 오류:', error); onError?.(error); }
  );

/** 그룹 패키지 구독 (회사 공통) */
export const subscribeInventoryPackages = (
  db: Firestore,
  onData: (packages: InventoryPackage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    collection(db, PACKAGES),
    (snap) => onData(
      snap.docs.map(d => ({ id: d.id, ...d.data() }) as InventoryPackage).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    ),
    (error) => { logger.error('재고 패키지 구독 오류:', error); onError?.(error); }
  );

/** 특정 품목의 캠프 내 변동 이력 구독 (최신순) */
export const subscribeInventoryMovements = (
  db: Firestore,
  campCode: string,
  itemId: string,
  onData: (movements: InventoryMovement[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, MOVEMENTS), where('campCode', '==', campCode), where('itemId', '==', itemId)),
    (snap) => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as InventoryMovement)
        .sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0))
    ),
    (error) => { logger.error('재고 이력 구독 오류:', error); onError?.(error); }
  );

// ── 품목 CRUD (관리자, 회사 공통) ──────────────────────────────

export const addInventoryItem = async (
  db: Firestore,
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, ITEMS), stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  logger.info('재고 품목 추가:', ref.id);
  return ref.id;
};

export const updateInventoryItem = async (
  db: Firestore,
  itemId: string,
  updates: Partial<Omit<InventoryItem, 'id' | 'createdAt'>>
): Promise<void> => {
  await updateDoc(doc(db, ITEMS, itemId), stripUndefined({ ...updates, updatedAt: Timestamp.now() }));
};

/** 비활성화(사용 안 함) — 기존 환자 기록의 복용 내역은 그대로 유지됨 */
export const setInventoryItemActive = async (db: Firestore, itemId: string, isActive: boolean): Promise<void> =>
  updateInventoryItem(db, itemId, { isActive });

export const deleteInventoryItem = async (db: Firestore, itemId: string): Promise<void> => {
  await deleteDoc(doc(db, ITEMS, itemId));
  logger.info('재고 품목 삭제:', itemId);
};

/**
 * 기본 품목 세트 일괄 등록 (이미 같은 분류+이름이 있으면 건너뜀)
 * @returns 추가된 개수
 */
export const importInventoryItems = async (
  db: Firestore,
  items: Array<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean }>,
  existing: InventoryItem[],
  by: string
): Promise<number> => {
  const keyOf = (i: { category: string; kind?: string; name: string }) => `${i.category}|${i.kind ?? ''}|${i.name}`;
  const keys = new Set(existing.map(keyOf));
  const now = Timestamp.now();
  let added = 0;
  let batch = writeBatch(db);
  let ops = 0;
  for (const it of items) {
    const key = keyOf(it);
    if (keys.has(key)) continue;
    keys.add(key);
    batch.set(doc(collection(db, ITEMS)), stripUndefined({ ...it, isActive: it.isActive ?? true, createdBy: by, createdAt: now, updatedAt: now }));
    added++; ops++;
    if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  logger.info(`기본 품목 ${added}개 등록`);
  return added;
};

// ── 그룹 CRUD (관리자, 캠프별) ─────────────────────────────────

export const addInventoryGroup = async (
  db: Firestore,
  data: Omit<InventoryGroup, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, GROUPS), stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  logger.info('재고 그룹 추가:', ref.id);
  return ref.id;
};

export const updateInventoryGroup = async (
  db: Firestore,
  groupId: string,
  updates: Partial<Omit<InventoryGroup, 'id' | 'campCode' | 'createdAt'>>
): Promise<void> => {
  await updateDoc(doc(db, GROUPS, groupId), stripUndefined({ ...updates, updatedAt: Timestamp.now() }));
};

export const deleteInventoryGroup = async (db: Firestore, groupId: string): Promise<void> => {
  await deleteDoc(doc(db, GROUPS, groupId));
  logger.info('재고 그룹 삭제:', groupId);
};

// ── 그룹 패키지 (관리자, 회사 공통) ────────────────────────────

export const addInventoryPackage = async (
  db: Firestore,
  data: Omit<InventoryPackage, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, PACKAGES), stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return ref.id;
};

export const updateInventoryPackage = async (
  db: Firestore,
  packageId: string,
  updates: Partial<Omit<InventoryPackage, 'id' | 'createdAt'>>
): Promise<void> => {
  await updateDoc(doc(db, PACKAGES, packageId), stripUndefined({ ...updates, updatedAt: Timestamp.now() }));
};

export const deleteInventoryPackage = async (db: Firestore, packageId: string): Promise<void> => {
  await deleteDoc(doc(db, PACKAGES, packageId));
};

/** 현재 캠프 그룹 구성을 패키지로 저장 */
export const savePackageFromGroups = async (
  db: Firestore,
  name: string,
  groups: InventoryGroup[],
  by: string
): Promise<string> => {
  const slots: InventoryPackageSlot[] = groups.map((g, i) => ({
    key: g.slotKey || `slot${i + 1}`,
    label: g.name,
    ...(g.location ? { location: g.location } : {}),
  }));
  return addInventoryPackage(db, { name, slots, createdBy: by });
};

/** 패키지를 캠프에 적용 — 슬롯마다 그룹 생성 (이미 같은 slotKey가 있으면 건너뜀). @returns 생성 수 */
export const applyPackageToCamp = async (
  db: Firestore,
  campCode: string,
  pkg: InventoryPackage,
  existingGroups: InventoryGroup[]
): Promise<number> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  const usedKeys = new Set(existingGroups.map(g => g.slotKey).filter(Boolean));
  let order = existingGroups.length;
  let created = 0;
  pkg.slots.forEach(slot => {
    if (usedKeys.has(slot.key)) return;
    batch.set(doc(collection(db, GROUPS)), stripUndefined({
      campCode, name: slot.label, location: slot.location, order: order++, slotKey: slot.key, createdAt: now, updatedAt: now,
    }));
    created++;
  });
  if (created > 0) await batch.commit();
  logger.info(`패키지 적용: ${pkg.name} → ${campCode} (${created}개 그룹)`);
  return created;
};

// ── 최소 수량 ─────────────────────────────────────────────────

/** 그룹별 최소 보유 수량 예외 설정 (null이면 예외 제거 → 품목 기본값 사용) */
export const setGroupMinStock = async (
  db: Firestore,
  campCode: string,
  itemId: string,
  groupId: string,
  min: number | null
): Promise<void> => {
  const ref = doc(db, STOCKS, stockDocId(campCode, itemId));
  await setDoc(ref, {
    campCode, itemId,
    minStocks: { [groupId]: min == null ? null : Math.max(0, min) },
    updatedAt: Timestamp.now(),
  }, { merge: true });
};

// ── 재고 증감 ──────────────────────────────────────────────────

export interface StockChange {
  itemId: string;
  itemName: string;
  groupId: string;
  groupName: string;
  /** +입고/복구, -출고/차감 */
  delta: number;
  reason: InventoryMovementReason;
  refPatientId?: string;
  refDoseId?: string;
  refLabel?: string;
  memo?: string;
}

/**
 * 여러 재고 변동을 한 번의 batch로 반영 (캠프별 stocks.{groupId} 원자적 증감 + 이력 기록).
 * 문서가 없으면 merge로 생성. delta가 0인 항목은 건너뜀.
 */
export const applyStockChanges = async (
  db: Firestore,
  campCode: string,
  changes: StockChange[],
  by: string
): Promise<void> => {
  const effective = changes.filter(c => c.delta !== 0 && c.itemId && c.groupId);
  if (effective.length === 0) return;
  const batch = writeBatch(db);
  const now = Timestamp.now();
  // 같은 품목은 한 번의 set(merge)로 합쳐서 반영 (그룹별 delta 합산)
  const perItem = new Map<string, Record<string, number>>();
  effective.forEach(c => {
    const acc = perItem.get(c.itemId) ?? {};
    acc[c.groupId] = (acc[c.groupId] ?? 0) + c.delta;
    perItem.set(c.itemId, acc);
  });
  perItem.forEach((groupDeltas, itemId) => {
    const stocks: Record<string, unknown> = {};
    Object.entries(groupDeltas).forEach(([groupId, delta]) => {
      if (delta !== 0) stocks[groupId] = increment(delta);
    });
    if (Object.keys(stocks).length === 0) return;
    batch.set(doc(db, STOCKS, stockDocId(campCode, itemId)), { campCode, itemId, stocks, updatedAt: now }, { merge: true });
  });
  effective.forEach(c => {
    const movement: Omit<InventoryMovement, 'id'> = stripUndefined({
      campCode,
      itemId: c.itemId,
      itemName: c.itemName,
      groupId: c.groupId,
      groupName: c.groupName,
      delta: c.delta,
      reason: c.reason,
      refPatientId: c.refPatientId,
      refDoseId: c.refDoseId,
      refLabel: c.refLabel,
      memo: c.memo,
      at: now,
      by,
    }) as Omit<InventoryMovement, 'id'>;
    batch.set(doc(collection(db, MOVEMENTS)), movement);
  });
  await batch.commit();
  logger.info(`재고 변동 ${effective.length}건 반영 (${campCode})`);
};

/** 입고 (관리자) */
export const restock = async (
  db: Firestore,
  campCode: string,
  change: Omit<StockChange, 'reason' | 'delta'> & { quantity: number },
  by: string
): Promise<void> =>
  applyStockChanges(db, campCode, [{ ...change, delta: Math.abs(change.quantity), reason: 'restock', refLabel: change.refLabel ?? '재고 입고' }], by);

/** 수량 직접 조정 (관리자) — 조정 후 수량을 받아 차이만 반영, 사유 기록 */
export const adjustStockTo = async (
  db: Firestore,
  campCode: string,
  change: Omit<StockChange, 'reason' | 'delta' | 'memo'> & { current: number; target: number; reason: string },
  by: string
): Promise<void> => {
  const delta = Math.max(0, change.target) - change.current;
  if (delta === 0) return;
  await applyStockChanges(db, campCode, [{
    itemId: change.itemId, itemName: change.itemName, groupId: change.groupId, groupName: change.groupName,
    delta, reason: 'adjust', refLabel: '수량 조정', memo: change.reason,
  }], by);
};

/**
 * 약 복용 기록 변경 전/후를 비교해 "차이만큼만" 재고에 반영한다.
 * - 새 기록: quantity만큼 차감
 * - 수량만 바뀜: 차이만 반영 (1→2: 1 추가 차감, 2→1: 1 복구)
 * - 약품/그룹이 바뀜: 이전 것 전량 복구 + 새 것 전량 차감
 * - 삭제된 기록: 전량 복구
 * - 그대로인 기록: 아무 것도 하지 않음 (보고서를 다시 열거나 다른 내용을 수정해도 재차감 없음)
 */
export function diffDoseStockChanges(
  prevDoses: MedicationDose[] | undefined,
  nextDoses: MedicationDose[] | undefined,
  refPatientId?: string,
  refLabel?: string
): StockChange[] {
  const prev = new Map((prevDoses ?? []).map(d => [d.id, d]));
  const next = new Map((nextDoses ?? []).map(d => [d.id, d]));
  const changes: StockChange[] = [];
  const label = (d: MedicationDose) => refLabel ? `${refLabel} ${d.source === 'initial' ? '최초보고' : '경과보고'}` : undefined;

  next.forEach((n, id) => {
    const p = prev.get(id);
    if (!p) {
      changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -n.quantity, reason: 'dose', refPatientId, refDoseId: id, refLabel: label(n) });
      return;
    }
    if (p.itemId === n.itemId && p.groupId === n.groupId) {
      const diff = n.quantity - p.quantity;
      if (diff !== 0) {
        changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -diff, reason: 'dose_adjust', refPatientId, refDoseId: id, refLabel: label(n) });
      }
      return;
    }
    // 약품 또는 그룹이 바뀐 경우: 이전 복구 + 새로 차감
    changes.push({ itemId: p.itemId, itemName: p.itemName, groupId: p.groupId, groupName: p.groupName, delta: p.quantity, reason: 'dose_revert', refPatientId, refDoseId: id, refLabel: label(p) });
    changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -n.quantity, reason: 'dose', refPatientId, refDoseId: id, refLabel: label(n) });
  });

  prev.forEach((p, id) => {
    if (next.has(id)) return;
    changes.push({ itemId: p.itemId, itemName: p.itemName, groupId: p.groupId, groupName: p.groupName, delta: p.quantity, reason: 'dose_revert', refPatientId, refDoseId: id, refLabel: label(p) });
  });

  return changes;
}

/** diffDoseStockChanges 결과를 바로 반영 */
export const applyDoseStockChanges = async (
  db: Firestore,
  campCode: string,
  prevDoses: MedicationDose[] | undefined,
  nextDoses: MedicationDose[] | undefined,
  by: string,
  refPatientId?: string,
  refLabel?: string
): Promise<void> =>
  applyStockChanges(db, campCode, diffDoseStockChanges(prevDoses, nextDoses, refPatientId, refLabel), by);

/** 복용 기록 ID 생성 */
export function newDoseId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 품목 마스터 1회 조회 (스크립트/서버용) */
export const getInventoryItemsOnce = async (db: Firestore): Promise<InventoryItem[]> => {
  const snap = await getDocs(collection(db, ITEMS));
  return sortInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as InventoryItem));
};

/** Firestore는 undefined 값을 거부하므로 제거 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out as T;
}

// ==================== 재고 요청 취합 · 구매 목록 ====================

const REQUESTS = 'inventoryRequests';
const REQUEST_ENTRIES = 'inventoryRequestEntries';
const PURCHASES = 'purchaseItems';

/** 캠프의 재고 요청 목록 구독 (진행 중 먼저, 최신순) */
export const subscribeInventoryRequests = (
  db: Firestore,
  campCode: string,
  onData: (requests: InventoryRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, REQUESTS), where('campCode', '==', campCode)),
    (snap) => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as InventoryRequest)
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    ),
    (error) => { logger.error('재고 요청 구독 오류:', error); onError?.(error); }
  );

/** 특정 요청의 선생님별 입력 구독 */
export const subscribeInventoryRequestEntries = (
  db: Firestore,
  requestId: string,
  onData: (entries: InventoryRequestEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, REQUEST_ENTRIES), where('requestId', '==', requestId)),
    (snap) => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data(), items: Array.isArray(d.data().items) ? d.data().items : [] }) as InventoryRequestEntry)
        .sort((a, b) => a.userName.localeCompare(b.userName, 'ko'))
    ),
    (error) => { logger.error('재고 요청 입력 구독 오류:', error); onError?.(error); }
  );

/** 캠프 구매 목록 구독 (필요 → 주문 → 입고 순, 최신순) */
export const subscribePurchaseItems = (
  db: Firestore,
  campCode: string,
  onData: (items: PurchaseItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, PURCHASES), where('campCode', '==', campCode)),
    (snap) => {
      const rank: Record<string, number> = { needed: 0, ordered: 1, received: 2 };
      onData(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as PurchaseItem)
          .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      );
    },
    (error) => { logger.error('구매 목록 구독 오류:', error); onError?.(error); }
  );

/** 재고 요청 만들기 (관리자) */
export const createInventoryRequest = async (
  db: Firestore,
  data: Omit<InventoryRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'closedAt'>
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, REQUESTS), stripUndefined({ ...data, status: 'open', createdAt: now, updatedAt: now }));
  logger.info('재고 요청 생성:', ref.id);
  return ref.id;
};

export const updateInventoryRequest = async (
  db: Firestore,
  requestId: string,
  updates: Partial<Pick<InventoryRequest, 'title' | 'dueDate' | 'note' | 'status'>>
): Promise<void> => {
  await updateDoc(doc(db, REQUESTS, requestId), stripUndefined({
    ...updates,
    ...(updates.status === 'closed' ? { closedAt: Timestamp.now() } : {}),
    updatedAt: Timestamp.now(),
  }));
};

export const deleteInventoryRequest = async (db: Firestore, requestId: string): Promise<void> => {
  // 입력들도 함께 삭제
  const snap = await getDocs(query(collection(db, REQUEST_ENTRIES), where('requestId', '==', requestId)));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, REQUESTS, requestId));
  await batch.commit();
  logger.info('재고 요청 삭제:', requestId);
};

/** 내 요청 저장 (문서 ID = requestId__userId, 덮어쓰기) */
export const saveInventoryRequestEntry = async (
  db: Firestore,
  data: Omit<InventoryRequestEntry, 'id' | 'updatedAt'>
): Promise<void> => {
  const items = data.items
    .filter(l => l.name.trim() && l.quantity > 0)
    .map(l => stripUndefined({ ...l, name: l.name.trim(), unit: (l.unit || '개').trim(), memo: l.memo?.trim() || undefined }));
  await setDoc(doc(db, REQUEST_ENTRIES, requestEntryDocId(data.requestId, data.userId)), {
    requestId: data.requestId,
    campCode: data.campCode,
    userId: data.userId,
    userName: data.userName,
    items,
    updatedAt: Timestamp.now(),
  });
};

/** 취합 결과를 구매 목록에 추가 (관리자) */
export const addPurchaseItems = async (
  db: Firestore,
  campCode: string,
  lines: Array<Pick<PurchaseItem, 'itemId' | 'name' | 'quantity' | 'unit' | 'memo' | 'groupId' | 'groupName'> & { source?: PurchaseItem['source'] }>,
  by: string,
  request?: Pick<InventoryRequest, 'id' | 'title'>
): Promise<number> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  let n = 0;
  lines.forEach(l => {
    if (!l.name?.trim() || !(l.quantity > 0)) return;
    batch.set(doc(collection(db, PURCHASES)), stripUndefined({
      campCode,
      itemId: l.itemId,
      name: l.name.trim(),
      groupId: l.groupId,
      groupName: l.groupName,
      quantity: l.quantity,
      unit: (l.unit || '개').trim(),
      source: l.source ?? (request ? 'request' : 'manual'),
      requestId: request?.id,
      requestTitle: request?.title,
      status: 'needed',
      memo: l.memo,
      createdBy: by,
      createdAt: now,
      updatedAt: now,
    }));
    n++;
  });
  if (n > 0) await batch.commit();
  logger.info(`구매 목록 ${n}건 추가 (${campCode})`);
  return n;
};

export const updatePurchaseItem = async (
  db: Firestore,
  purchaseId: string,
  updates: Partial<Pick<PurchaseItem, 'status' | 'quantity' | 'unit' | 'memo' | 'groupId' | 'groupName'>>
): Promise<void> => {
  await updateDoc(doc(db, PURCHASES, purchaseId), stripUndefined({
    ...updates,
    ...(updates.status === 'received' ? { receivedAt: Timestamp.now() } : {}),
    updatedAt: Timestamp.now(),
  }));
};

export const deletePurchaseItem = async (db: Firestore, purchaseId: string): Promise<void> => {
  await deleteDoc(doc(db, PURCHASES, purchaseId));
};

/**
 * 구매 항목 입고 처리 (관리자): 그룹에 낱개 수량 입고(변동 내역 기록) + 상태를 '입고 완료'로
 */
export const receivePurchaseItem = async (
  db: Firestore,
  campCode: string,
  purchase: PurchaseItem,
  target: { itemId: string; itemName: string; groupId: string; groupName: string; quantity: number },
  by: string
): Promise<void> => {
  if (target.quantity > 0) {
    await restock(db, campCode, {
      itemId: target.itemId, itemName: target.itemName, groupId: target.groupId, groupName: target.groupName,
      quantity: target.quantity,
      refLabel: purchase.requestTitle ? `${purchase.requestTitle} 입고` : '구매 입고',
      memo: purchase.memo,
    }, by);
  }
  await updatePurchaseItem(db, purchase.id, { status: 'received', groupId: target.groupId, groupName: target.groupName });
};
