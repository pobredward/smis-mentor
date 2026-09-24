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
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch,
  runTransaction,
  increment,
  deleteField,
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
  SupplyRequest,
  SupplyRequestStatus,
  SupplyComment,
  SupplySettings,
  SupplyLineDone,
  SupplyGuide,
  ItemMedia,
  PurchaseNeed,
  PurchaseItem,
  LostItem,
  LostItemMedia,
  LostItemStatus,
} from '../../types/inventory';
import { stockDocId, sortInventoryItems } from '../../types/inventory';
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

/**
 * 캠프 전체 입출고 기록 구독 (입출고 기록 탭).
 * 필터·검색은 화면에서 하고 여기서는 최신순으로 limitTo 건만 가져온다.
 */
export const subscribeCampMovements = (
  db: Firestore,
  campCode: string,
  onData: (movements: InventoryMovement[]) => void,
  limitTo = 400,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, MOVEMENTS), where('campCode', '==', campCode)),
    (snap) => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as InventoryMovement)
        .sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0))
        .slice(0, limitTo)
    ),
    (error) => { logger.error('캠프 입출고 기록 구독 오류:', error); onError?.(error); }
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

/** 품목 사진·영상 추가 (스태프 누구나) */
export const addInventoryItemMedia = async (db: Firestore, itemId: string, media: ItemMedia[]): Promise<void> => {
  if (media.length === 0) return;
  await updateDoc(doc(db, ITEMS, itemId), { media: arrayUnion(...media.map(m => stripUndefined({ ...m }))), updatedAt: Timestamp.now() });
};
/** 품목 사진·영상 삭제 (관리자) — Storage 파일은 호출한 쪽에서 지움 */
export const removeInventoryItemMedia = async (db: Firestore, itemId: string, current: ItemMedia[], path: string): Promise<void> => {
  await updateDoc(doc(db, ITEMS, itemId), { media: current.filter(m => m.path !== path), updatedAt: Timestamp.now() });
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
    ...(g.campGroupName ? { campGroupName: g.campGroupName } : {}),
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
      campCode, name: slot.label, location: slot.location, campGroupName: slot.campGroupName, order: order++, slotKey: slot.key, createdAt: now, updatedAt: now,
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

/**
 * 그룹별 유효기간 · 세부 위치 설정. null/빈 값이면 지움.
 * 유효기간은 관리자, 세부 위치는 스태프 누구나 (보안 규칙).
 */
export const setStockMeta = async (
  db: Firestore,
  campCode: string,
  itemId: string,
  groupId: string,
  meta: { expiry?: string | null; location?: string | null }
): Promise<void> => {
  const ref = doc(db, STOCKS, stockDocId(campCode, itemId));
  const data: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (meta.expiry !== undefined) data[`expiries.${groupId}`] = meta.expiry ? meta.expiry : deleteField();
  if (meta.location !== undefined) data[`locations.${groupId}`] = meta.location?.trim() ? meta.location.trim() : deleteField();
  try { await updateDoc(ref, data); }
  catch {
    // 문서가 없으면 (관리자) 새로 만든다
    await setDoc(ref, {
      campCode, itemId, stocks: {}, updatedAt: Timestamp.now(),
      ...(meta.expiry ? { expiries: { [groupId]: meta.expiry } } : {}),
      ...(meta.location?.trim() ? { locations: { [groupId]: meta.location.trim() } } : {}),
    }, { merge: true });
  }
};

/**
 * 사용 기록 (스태프 누구나) — 그룹 재고에서 quantity만큼 빼고 이력에 '사용'으로 남김.
 * 보안 규칙이 lastUse 값으로 "한 그룹에서 정확히 그만큼만 뺐는지" 검사한다.
 */
export const recordStockUse = async (
  db: Firestore,
  campCode: string,
  change: { itemId: string; itemName: string; groupId: string; groupName: string; quantity: number; memo?: string },
  by: { uid: string; name: string }
): Promise<void> => {
  const q = Math.round(change.quantity);
  if (!(q > 0)) return;
  await runTransaction(db, async tx => {
    const ref = doc(db, STOCKS, stockDocId(campCode, change.itemId));
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('이 캠프에 둔 재고가 없는 품목입니다.');
    const cur = Number((snap.data().stocks ?? {})[change.groupId]) || 0;
    const now = Timestamp.now();
    tx.update(ref, {
      [`stocks.${change.groupId}`]: cur - q,
      lastUse: { groupId: change.groupId, qty: q, byId: by.uid, at: now },
      updatedAt: now,
    });
    tx.set(doc(collection(db, MOVEMENTS)), stripUndefined({
      campCode, itemId: change.itemId, itemName: change.itemName, groupId: change.groupId, groupName: change.groupName,
      delta: -q, reason: 'use', refLabel: '사용', memo: change.memo?.trim() || undefined, at: now, by: by.name, byId: by.uid,
    }));
  });
};

/**
 * 그룹 간 재고 이동 — 보내는 그룹에서 빼고 받는 그룹에 그대로 더한다.
 *
 * 수량은 (캠프, 품목) 문서 하나의 stocks 맵 안에 그룹별로 들어 있으므로
 * **한 문서 · 한 트랜잭션**으로 처리된다. 따라서 한쪽만 바뀌는 일이 없다.
 * - 트랜잭션 안에서 현재 수량을 다시 읽어 검사하므로, 이동 버튼을 연달아 눌러도
 *   보유 수량을 넘겨 빠지지 않는다 (부족하면 에러).
 * - 받는 그룹에 이 품목 칸이 없으면 0에서 시작해 새로 만든다 (품목 자체는 회사 공통이라 중복 등록 없음).
 * - 출고(−)·입고(+) 이력 2건을 같은 transferId 로 남긴다.
 *
 * @returns 이동 후 { from, to } 수량
 */
export const transferStock = async (
  db: Firestore,
  campCode: string,
  move: {
    itemId: string;
    itemName: string;
    fromGroupId: string;
    fromGroupName: string;
    toGroupId: string;
    toGroupName: string;
    quantity: number;
    memo?: string;
  },
  by: { uid: string; name: string }
): Promise<{ from: number; to: number }> => {
  const q = Math.round(move.quantity);
  if (!(q > 0)) throw new Error('이동 수량을 1 이상 입력해주세요.');
  if (move.fromGroupId === move.toGroupId) throw new Error('같은 그룹으로는 이동할 수 없습니다.');

  return runTransaction(db, async tx => {
    const ref = doc(db, STOCKS, stockDocId(campCode, move.itemId));
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('이 캠프에 둔 재고가 없는 품목입니다.');
    const stocks = (snap.data().stocks ?? {}) as Record<string, number>;
    const fromCur = Number(stocks[move.fromGroupId]) || 0;
    const toCur = Number(stocks[move.toGroupId]) || 0;
    if (fromCur < q) throw new Error(`${move.fromGroupName} 보유 수량(${fromCur})보다 많이 보낼 수 없습니다.`);

    const now = Timestamp.now();
    const transferId = doc(collection(db, MOVEMENTS)).id;
    tx.update(ref, {
      [`stocks.${move.fromGroupId}`]: fromCur - q,
      [`stocks.${move.toGroupId}`]: toCur + q,
      updatedAt: now,
    });
    const base = {
      campCode, itemId: move.itemId, itemName: move.itemName,
      reason: 'transfer' as InventoryMovementReason, transferId,
      memo: move.memo?.trim() || undefined, at: now, by: by.name, byId: by.uid,
    };
    // 보내는 그룹: 출고
    tx.set(doc(collection(db, MOVEMENTS)), stripUndefined({
      ...base, groupId: move.fromGroupId, groupName: move.fromGroupName,
      counterGroupId: move.toGroupId, counterGroupName: move.toGroupName,
      delta: -q, refLabel: `${move.toGroupName}(으)로 보냄`,
    }));
    // 받는 그룹: 입고
    tx.set(doc(collection(db, MOVEMENTS)), stripUndefined({
      ...base, groupId: move.toGroupId, groupName: move.toGroupName,
      counterGroupId: move.fromGroupId, counterGroupName: move.fromGroupName,
      delta: q, refLabel: `${move.fromGroupName}에서 받음`,
    }));
    return { from: fromCur - q, to: toCur + q };
  });
};

export interface StockLevelEntry {
  itemId: string;
  itemName: string;
  groupId: string;
  groupName: string;
  /** 설정할 최종 수량 */
  target: number;
}

/**
 * 그룹별 수량을 "최종 값"으로 설정 (관리자: 일괄 입력·실사·수량 조정).
 * 품목마다 트랜잭션으로 **현재 값을 다시 읽어** 차이만 기록하므로,
 * 입력하는 동안 약 복용으로 수량이 바뀌어도 그 차감이 덮어써지지 않는다.
 * @returns 실제로 바뀐 칸 수
 */
export const setStockLevels = async (
  db: Firestore,
  campCode: string,
  entries: StockLevelEntry[],
  opts: { reason: 'restock' | 'adjust'; refLabel: string; memo?: string },
  by: string
): Promise<number> => {
  const byItem = new Map<string, StockLevelEntry[]>();
  entries.forEach(e => {
    if (!byItem.has(e.itemId)) byItem.set(e.itemId, []);
    byItem.get(e.itemId)!.push(e);
  });
  let changed = 0;
  for (const [itemId, list] of byItem) {
    changed += await runTransaction(db, async tx => {
      const ref = doc(db, STOCKS, stockDocId(campCode, itemId));
      const snap = await tx.get(ref);
      const current = (snap.exists() ? (snap.data().stocks ?? {}) : {}) as Record<string, number>;
      const now = Timestamp.now();
      const nextStocks: Record<string, number> = { ...current };
      let n = 0;
      list.forEach(e => {
        const target = Math.round(Number(e.target));
        if (isNaN(target)) return;
        const delta = target - (Number(current[e.groupId]) || 0);
        if (delta === 0) return;
        nextStocks[e.groupId] = target;
        n++;
        tx.set(doc(collection(db, MOVEMENTS)), stripUndefined({
          campCode, itemId, itemName: e.itemName, groupId: e.groupId, groupName: e.groupName,
          delta, reason: opts.reason, refLabel: opts.refLabel, memo: opts.memo, at: now, by,
        }));
      });
      if (n > 0) tx.set(ref, { campCode, itemId, stocks: nextStocks, updatedAt: now }, { merge: true });
      return n;
    });
  }
  logger.info(`재고 수량 설정 ${changed}칸 (${campCode}, ${opts.refLabel})`);
  return changed;
};

/** 수량 직접 조정 (관리자) — 조정 후 수량으로 설정, 사유 기록. current는 참고용(트랜잭션이 다시 읽음) */
export const adjustStockTo = async (
  db: Firestore,
  campCode: string,
  change: Omit<StockChange, 'reason' | 'delta' | 'memo'> & { current?: number; target: number; reason: string },
  by: string
): Promise<void> => {
  await setStockLevels(db, campCode, [{
    itemId: change.itemId, itemName: change.itemName, groupId: change.groupId, groupName: change.groupName, target: change.target,
  }], { reason: 'adjust', refLabel: '수량 조정', memo: change.reason }, by);
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

// ==================== 구매 요청 (멘토) · 구매 목록 ====================

const SUPPLY_REQUESTS = 'supplyRequests';
const PURCHASES = 'purchaseItems';

/** 캠프 구매 요청 구독 (요청 → 완료/반려, 최신순) */
export const subscribeSupplyRequests = (
  db: Firestore,
  campCode: string,
  onData: (requests: SupplyRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, SUPPLY_REQUESTS), where('campCode', '==', campCode)),
    (snap) => {
      const rank: Record<string, number> = { requested: 0, onhold: 1, purchased: 2, rejected: 3 };
      onData(
        snap.docs
          .map(d => {
            const x = d.data();
            return { id: d.id, ...x, items: Array.isArray(x.items) ? x.items : [], comments: Array.isArray(x.comments) ? x.comments : [] } as SupplyRequest;
          })
          .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      );
    },
    (error) => { logger.error('구매 요청 구독 오류:', error); onError?.(error); }
  );

function cleanLines(items: SupplyRequest['items']) {
  return items
    .filter(l => l.name?.trim() && l.quantity > 0)
    .map(l => stripUndefined({ ...l, name: l.name.trim(), unit: (l.unit || '개').trim(), memo: l.memo?.trim() || undefined }));
}

/** 구매 요청 올리기 (멘토·외국인 선생님·관리자 모두) */
export const addSupplyRequest = async (
  db: Firestore,
  data: Pick<SupplyRequest, 'campCode' | 'forType' | 'studentId' | 'studentName' | 'studentClass' | 'studentClassCode' | 'classMentor' | 'store' | 'storeEtc' | 'items' | 'note' | 'requesterId' | 'requesterName' | 'requesterGroup'>
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, SUPPLY_REQUESTS), stripUndefined({
    ...data, items: cleanLines(data.items), note: data.note?.trim() || undefined,
    status: 'requested', createdAt: now, updatedAt: now,
  }));
  logger.info('구매 요청 등록:', ref.id);
  return ref.id;
};

/** 요청 수정 (본인, '요청' 상태일 때) */
export const updateSupplyRequest = async (
  db: Firestore,
  requestId: string,
  updates: Partial<Pick<SupplyRequest, 'forType' | 'studentId' | 'studentName' | 'studentClass' | 'studentClassCode' | 'classMentor' | 'store' | 'storeEtc' | 'items' | 'note'>>
): Promise<void> => {
  const data: Record<string, unknown> = { ...updates, updatedAt: Timestamp.now() };
  if (updates.items) data.items = cleanLines(updates.items);
  // 학생 → 멘토·캠프 공용으로 바꾸면 학생 정보 제거
  if (updates.forType && updates.forType !== 'student') { data.studentId = null; data.studentName = null; data.studentClass = null; data.studentClassCode = null; data.classMentor = null; }
  if (updates.store && updates.store !== '기타') data.storeEtc = null;
  await updateDoc(doc(db, SUPPLY_REQUESTS, requestId), stripUndefined(data));
};

/**
 * 상태 변경: 구매 완료 / 보류 / 반려 / 다시 요청으로
 * - 관리자: 모두
 * - 사오기로 한 사람(buyer): 자기 요청을 구매 완료로 (보안 규칙에서 검사)
 */
export const setSupplyRequestStatus = async (
  db: Firestore,
  requestIds: string[],
  status: SupplyRequestStatus,
  handledBy: string,
  opts?: { note?: string; holdUntil?: string }
): Promise<void> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  requestIds.forEach(id => batch.update(doc(db, SUPPLY_REQUESTS, id), {
    status,
    handledBy: status === 'requested' ? null : handledBy,
    handledAt: status === 'requested' ? null : now,
    statusNote: status === 'rejected' || status === 'onhold' ? (opts?.note?.trim() || null) : null,
    holdUntil: status === 'onhold' ? (opts?.holdUntil || null) : null,
    updatedAt: now,
  }));
  await batch.commit();
};

/**
 * 캠프 공용 요청 → 재고 입고 (관리자). 한 트랜잭션:
 * 이미 입고했으면 중단 → 두 명이 동시에 눌러도 한 번만 반영. 아직 구매 완료 전이면 구매 완료로 함께 바꾼다.
 */
export const receiveSupplyRequest = async (
  db: Firestore,
  campCode: string,
  requestId: string,
  lines: Array<{ itemId: string; itemName: string; groupId: string; groupName: string; quantity: number }>,
  by: string
): Promise<void> => {
  await runTransaction(db, async tx => {
    const rRef = doc(db, SUPPLY_REQUESTS, requestId);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists()) throw new Error('요청이 삭제되었습니다.');
    const r = rSnap.data() as SupplyRequest;
    if (r.stockApplied) throw new Error('이미 재고에 입고된 요청입니다.');
    const now = Timestamp.now();
    // 같은 품목은 재고 문서 한 번에 쓰기
    const perItem = new Map<string, Record<string, number>>();
    lines.filter(l => l.quantity > 0).forEach(l => {
      const acc = perItem.get(l.itemId) ?? {};
      acc[l.groupId] = (acc[l.groupId] ?? 0) + l.quantity;
      perItem.set(l.itemId, acc);
    });
    perItem.forEach((groups, itemId) => {
      const stocks: Record<string, ReturnType<typeof increment>> = {};
      Object.entries(groups).forEach(([g, n]) => { stocks[g] = increment(n); });
      tx.set(doc(db, STOCKS, stockDocId(campCode, itemId)), { campCode, itemId, stocks, updatedAt: now }, { merge: true });
    });
    lines.filter(l => l.quantity > 0).forEach(l => {
      tx.set(doc(collection(db, MOVEMENTS)), {
        campCode, itemId: l.itemId, itemName: l.itemName, groupId: l.groupId, groupName: l.groupName,
        delta: l.quantity, reason: 'restock', refLabel: `구매 요청 입고${r.forType === 'camp' ? ' (캠프 공용)' : ''}`, at: now, by,
      });
    });
    tx.update(rRef, stripUndefined({
      stockApplied: true, stockAppliedAt: now, stockAppliedBy: by, updatedAt: now,
      ...(r.status !== 'purchased' ? { status: 'purchased', handledBy: by, handledAt: now, statusNote: null, holdUntil: null } : {}),
    }));
  });
};

/** 재고 부족분 → 캠프 공용 요청 1건으로 */
export const addCampRequestsFromNeeds = async (
  db: Firestore,
  campCode: string,
  needs: PurchaseNeed[],
  _items: InventoryItem[],
  requester: { uid: string; name: string }
): Promise<number> => {
  if (needs.length === 0) return 0;
  const lines: SupplyRequest['items'] = needs.map((n, i) => ({
    id: `${Date.now().toString(36)}-${i}`, itemId: n.itemId, name: n.itemName, quantity: n.shortage, unit: n.unit,
    groupId: n.groupId, groupName: n.groupName, memo: `최소 ${n.min} · 현재 ${n.current}`,
  }));
  await addSupplyRequest(db, {
    campCode, forType: 'camp', items: lines, note: '재고 부족 자동 계산',
    requesterId: requester.uid, requesterName: requester.name,
  });
  return 1;
};

// ---------- 구매 담당 ----------

const SUPPLY_SETTINGS = 'supplySettings';

/** 캠프 구매 설정 (기본 구매 담당) 구독 */
export const subscribeSupplySettings = (
  db: Firestore,
  campCode: string,
  onData: (s: SupplySettings | null) => void
): Unsubscribe =>
  onSnapshot(doc(db, SUPPLY_SETTINGS, campCode),
    snap => onData(snap.exists() ? ({ campCode, ...snap.data() } as SupplySettings) : null),
    error => { logger.error('구매 설정 구독 오류:', error); onData(null); });

/** 기본 구매 담당 지정 (관리자) — 담당이 따로 지정되지 않은 모든 요청을 이 사람이 처리 */
export const setSupplyDefaultBuyer = async (
  db: Firestore,
  campCode: string,
  buyer: { uid: string; name: string } | null,
  by: string
): Promise<void> => {
  await setDoc(doc(db, SUPPLY_SETTINGS, campCode), {
    campCode, defaultBuyerId: buyer?.uid ?? null, defaultBuyerName: buyer?.name ?? null, updatedBy: by, updatedAt: Timestamp.now(),
  }, { merge: true });
};

/** 요청별 구매 담당 지정 / 해제(null → 기본 담당) (관리자) — 여러 건 한 번에 */
export const setSupplyBuyer = async (
  db: Firestore,
  requestIds: string[],
  buyer: { uid: string; name: string } | null,
  assignedBy: string
): Promise<void> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  requestIds.forEach(id => batch.update(doc(db, SUPPLY_REQUESTS, id), {
    buyerId: buyer?.uid ?? null,
    buyerName: buyer?.name ?? null,
    buyerAt: buyer ? now : null,
    buyerAssignedBy: buyer ? assignedBy : null,
    updatedAt: now,
  }));
  await batch.commit();
};

// ---------- 품목별 구매 완료 · 정산 ----------

/**
 * 품목(줄)별 구매 완료 — 구매한 사람이 직접. 금액·송금받을 곳 기록.
 * 모든 품목이 완료되면 요청 상태도 '구매 완료'로 바뀐다. (동시에 눌러도 안전하게 트랜잭션)
 */
export const completeSupplyLines = async (
  db: Firestore,
  requestId: string,
  entries: Array<{ lineId: string; amount?: number; payTo?: string }>,
  by: { uid: string; name: string }
): Promise<void> => {
  await runTransaction(db, async tx => {
    const ref = doc(db, SUPPLY_REQUESTS, requestId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('요청이 삭제되었습니다.');
    const r = { id: snap.id, ...snap.data() } as SupplyRequest;
    const now = Timestamp.now();
    const done: Record<string, SupplyLineDone> = { ...(r.done ?? {}) };
    const update: Record<string, unknown> = { updatedAt: now };
    entries.forEach(e => {
      const d: SupplyLineDone = stripUndefined({
        at: now, by: by.name, byId: by.uid,
        amount: e.amount && e.amount > 0 ? Math.round(e.amount) : undefined,
        payTo: e.payTo?.trim() || undefined,
      });
      done[e.lineId] = d;
      update[`done.${e.lineId}`] = d;
    });
    const total = Object.values(done).reduce((a, d) => a + (d.amount ?? 0), 0);
    update.amount = total > 0 ? total : null;
    const all = r.items.length > 0 && r.items.every(l => done[l.id]);
    if (all && r.status !== 'purchased') Object.assign(update, { status: 'purchased', handledBy: by.name, handledAt: now, statusNote: null, holdUntil: null });
    tx.update(ref, update);
  });
};

/** 품목 구매 완료 취소 — 요청이 '구매 완료'였다면 다시 '요청'으로 */
export const undoSupplyLine = async (
  db: Firestore,
  requestId: string,
  lineId: string
): Promise<void> => {
  await runTransaction(db, async tx => {
    const ref = doc(db, SUPPLY_REQUESTS, requestId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const r = snap.data() as SupplyRequest;
    const done = { ...(r.done ?? {}) };
    delete done[lineId];
    const total = Object.values(done).reduce((a, d) => a + (d.amount ?? 0), 0);
    const update: Record<string, unknown> = { [`done.${lineId}`]: deleteField(), amount: total > 0 ? total : null, updatedAt: Timestamp.now() };
    if (r.status === 'purchased' && !r.stockApplied) Object.assign(update, { status: 'requested', handledBy: null, handledAt: null });
    tx.update(ref, update);
  });
};

/** 정산 완료 / 취소(settler = null) — 학생: 담임이 봉투에서 빼서 전달, 선생님: 본인이 송금 */
export const settleSupplyLines = async (
  db: Firestore,
  requestId: string,
  lineIds: string[],
  settler: { uid: string; name: string } | null
): Promise<void> => {
  const now = Timestamp.now();
  const update: Record<string, unknown> = { updatedAt: now };
  lineIds.forEach(id => { update[`settlements.${id}`] = settler ? { at: now, by: settler.name, byId: settler.uid } : deleteField(); });
  await updateDoc(doc(db, SUPPLY_REQUESTS, requestId), update);
};

// ---------- 관리자 지정 품목 가이드 (쿠팡 · 학부모 청구 등) ----------

const SUPPLY_GUIDES = 'supplyGuides';

export const subscribeSupplyGuides = (db: Firestore, onData: (g: SupplyGuide[]) => void): Unsubscribe =>
  onSnapshot(collection(db, SUPPLY_GUIDES),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupplyGuide).sort((a, b) => a.name.localeCompare(b.name, 'ko'))),
    error => { logger.error('품목 가이드 구독 오류:', error); onData([]); });

export const saveSupplyGuide = async (
  db: Firestore,
  data: Pick<SupplyGuide, 'name' | 'keywords' | 'channel' | 'parentBill' | 'guide' | 'isActive'>,
  id?: string
): Promise<void> => {
  const now = Timestamp.now();
  const clean = stripUndefined({
    name: data.name.trim(), keywords: (data.keywords ?? []).map(k => k.trim()).filter(Boolean),
    channel: data.channel.trim() || '쿠팡', parentBill: !!data.parentBill, guide: data.guide.trim(), isActive: data.isActive !== false, updatedAt: now,
  });
  if (id) await updateDoc(doc(db, SUPPLY_GUIDES, id), clean);
  else await addDoc(collection(db, SUPPLY_GUIDES), { ...clean, createdAt: now });
};

export const deleteSupplyGuide = async (db: Firestore, id: string): Promise<void> => {
  await deleteDoc(doc(db, SUPPLY_GUIDES, id));
};

/** 메모·댓글 달기 (누구나) */
export const addSupplyComment = async (
  db: Firestore,
  requestId: string,
  c: { uid: string; name: string; text: string; admin?: boolean }
): Promise<void> => {
  const text = c.text.trim();
  if (!text) return;
  const comment: SupplyComment = stripUndefined({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    uid: c.uid, name: c.name, text, at: Timestamp.now(), admin: c.admin || undefined,
  });
  await updateDoc(doc(db, SUPPLY_REQUESTS, requestId), { comments: arrayUnion(comment), updatedAt: Timestamp.now() });
};

/** 댓글 삭제 (관리자) */
export const deleteSupplyComment = async (db: Firestore, requestId: string, comment: SupplyComment): Promise<void> => {
  await updateDoc(doc(db, SUPPLY_REQUESTS, requestId), { comments: arrayRemove(comment), updatedAt: Timestamp.now() });
};

export const deleteSupplyRequest = async (db: Firestore, requestId: string): Promise<void> => {
  await deleteDoc(doc(db, SUPPLY_REQUESTS, requestId));
};

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

/** 구매 목록에 추가 (관리자) */
export const addPurchaseItems = async (
  db: Firestore,
  campCode: string,
  lines: Array<Pick<PurchaseItem, 'itemId' | 'name' | 'quantity' | 'unit' | 'memo' | 'groupId' | 'groupName'> & { source?: PurchaseItem['source'] }>,
  by: string,
  request?: { id: string; title: string }
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
  // 한 트랜잭션: 이미 입고 완료면 중단 → 두 명이 동시에 눌러도 한 번만 입고
  await runTransaction(db, async tx => {
    const pRef = doc(db, PURCHASES, purchase.id);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists()) throw new Error('구매 항목이 삭제되었습니다.');
    if (pSnap.data().status === 'received') throw new Error('이미 입고 처리된 항목입니다.');
    const now = Timestamp.now();
    if (target.quantity > 0) {
      tx.set(doc(db, STOCKS, stockDocId(campCode, target.itemId)), {
        campCode, itemId: target.itemId, stocks: { [target.groupId]: increment(target.quantity) }, updatedAt: now,
      }, { merge: true });
      tx.set(doc(collection(db, MOVEMENTS)), stripUndefined({
        campCode, itemId: target.itemId, itemName: target.itemName, groupId: target.groupId, groupName: target.groupName,
        delta: target.quantity, reason: 'restock', refLabel: purchase.requestTitle ? `${purchase.requestTitle} 입고` : '구매 입고',
        memo: purchase.memo, at: now, by,
      }));
    }
    tx.update(pRef, { status: 'received', groupId: target.groupId, groupName: target.groupName, receivedAt: now, updatedAt: now });
  });
};

// ==================== 분실물 ====================

const LOST_ITEMS = 'lostItems';

/** 캠프 분실물 구독 (보관 중 먼저, 최신순) */
export const subscribeLostItems = (
  db: Firestore,
  campCode: string,
  onData: (items: LostItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, LOST_ITEMS), where('campCode', '==', campCode)),
    (snap) => {
      const rank: Record<string, number> = { found: 0, claimed: 1, discarded: 2 };
      onData(
        snap.docs
          .map(d => ({ id: d.id, ...d.data(), media: Array.isArray(d.data().media) ? d.data().media : [] }) as LostItem)
          .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      );
    },
    (error) => { logger.error('분실물 구독 오류:', error); onError?.(error); }
  );

/** 분실물 등록 (미디어는 문서 생성 후 업로드해서 addLostItemMedia로 붙임) */
export const addLostItem = async (
  db: Firestore,
  data: Omit<LostItem, 'id' | 'status' | 'media' | 'createdAt' | 'updatedAt' | 'claimedBy' | 'claimedHandler' | 'claimedAt'> & { status?: LostItemStatus; media?: LostItemMedia[] }
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, LOST_ITEMS), stripUndefined({
    ...data,
    status: data.status ?? 'found',
    media: data.media ?? [],
    createdAt: now,
    updatedAt: now,
  }));
  logger.info('분실물 등록:', ref.id);
  return ref.id;
};

export const updateLostItem = async (
  db: Firestore,
  lostItemId: string,
  updates: Partial<Omit<LostItem, 'id' | 'campCode' | 'createdAt' | 'reportedById'>>
): Promise<void> => {
  await updateDoc(doc(db, LOST_ITEMS, lostItemId), stripUndefined({ ...updates, updatedAt: Timestamp.now() }));
};

/** 상태 변경 — 주인 찾음이면 누구에게 돌려줬는지 기록 */
export const setLostItemStatus = async (
  db: Firestore,
  lostItemId: string,
  status: LostItemStatus,
  handler: string,
  claimedBy?: string
): Promise<void> => {
  await updateDoc(doc(db, LOST_ITEMS, lostItemId), stripUndefined({
    status,
    claimedBy: status === 'claimed' ? (claimedBy?.trim() || undefined) : undefined,
    claimedHandler: status === 'found' ? undefined : handler,
    claimedAt: status === 'found' ? undefined : Timestamp.now(),
    updatedAt: Timestamp.now(),
  }));
};

export const addLostItemMedia = async (db: Firestore, lostItemId: string, media: LostItemMedia[]): Promise<void> => {
  if (media.length === 0) return;
  await updateDoc(doc(db, LOST_ITEMS, lostItemId), {
    media: arrayUnion(...media.map(m => stripUndefined({ ...m }))),
    updatedAt: Timestamp.now(),
  });
};

export const removeLostItemMedia = async (db: Firestore, lostItemId: string, current: LostItemMedia[], path: string): Promise<void> => {
  await updateDoc(doc(db, LOST_ITEMS, lostItemId), {
    media: current.filter(m => m.path !== path),
    updatedAt: Timestamp.now(),
  });
};

export const deleteLostItem = async (db: Firestore, lostItemId: string): Promise<void> => {
  await deleteDoc(doc(db, LOST_ITEMS, lostItemId));
  logger.info('분실물 삭제:', lostItemId);
};
