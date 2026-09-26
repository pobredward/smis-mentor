import { describe, expect, it } from './_expect';
import {
  supplyUnitChoices, SUPPLY_UNITS, supplyProgress, supplyApproved,
  getOpenedCount, getNearlyEmptyCount, getAvailableStock, computePurchaseNeeds, isMedicineItem,
  itemCoverMedia, orderedItemMedia, USE_REASONS,
} from '../src/types/inventory';
import { setCurrentLocale, dataLabel } from '../src/i18n';

const ts = { toMillis: () => 1 } as never;

describe('요청서 단위 버튼', () => {
  it('순서가 고정되고, 고른 단위가 앞으로 오지 않는다', () => {
    expect(supplyUnitChoices('박스')).toEqual([...SUPPLY_UNITS]);
    expect(supplyUnitChoices('팩')).toEqual([...SUPPLY_UNITS]);
  });
  it('품목 고유 단위는 맨 뒤에 한 칸', () => {
    expect(supplyUnitChoices('정')).toEqual([...SUPPLY_UNITS, '정']);
  });
});

describe('요청 진행 상태 — 승인 전에는 검토 중', () => {
  const base = { status: 'requested' as const, forType: 'student' as const, items: [{ id: 'a', name: 'x', quantity: 1, unit: '개' }], done: {}, buyerId: 'u1' };
  it('구매 담당이 있어도 승인 전이면 waiting', () => {
    setCurrentLocale('ko');
    const p = supplyProgress(base);
    expect(p.key).toBe('waiting');
    expect(p.label).toBe('검토 중');
    expect(supplyApproved(base)).toBe(false);
  });
  it('승인하면 approved, 한 줄 사면 buying', () => {
    expect(supplyProgress({ ...base, approvedAt: ts }).key).toBe('approved');
    expect(supplyProgress({ ...base, approvedAt: ts, done: { a: { at: ts, by: 'b', byId: 'u1' } } }).key).toBe('buying');
  });
  it('영어 화면이면 라벨도 영어', () => {
    setCurrentLocale('en');
    expect(supplyProgress(base).label).toBe('Under review');
    setCurrentLocale('ko');
  });
});

describe('다회용 약 재고', () => {
  const view = { consumption: 'multi' as const, stocks: { g: 3 }, opened: { g: 1 }, nearlyEmpty: { g: 1 } };
  it('미개봉·사용 중·거의 다 씀', () => {
    expect(getOpenedCount(view, 'g')).toBe(1);
    expect(getNearlyEmptyCount(view, 'g')).toBe(1);
    expect(getAvailableStock(view, 'g')).toBe(2);
  });
  it('일회용은 개봉 개념 없음', () => {
    expect(getAvailableStock({ ...view, consumption: 'single' as const }, 'g')).toBe(3);
  });
  it('거의 다 쓴 1개뿐이면 부족으로 뜬다 (미리 사 오도록)', () => {
    const v = { id: 'i', name: '맨소래담', unit: '개', isActive: true, category: '의약품', consumption: 'multi', stocks: { g: 1 }, opened: { g: 1 }, nearlyEmpty: { g: 1 }, minStocks: {}, minStockDefault: 1 } as never;
    const needs = computePurchaseNeeds([v], [{ id: 'g', name: 'Spring' } as never]);
    expect(needs.length).toBe(1);
    expect(needs[0].current).toBe(0);
  });
});

describe('의약품 / 사용 사유 / 대표 사진', () => {
  it('먹는 약·바르는 약만 재고 화면 사용 불가', () => {
    expect(isMedicineItem({ usage: 'oral', category: '의약품' })).toBe(true);
    expect(isMedicineItem({ usage: 'topical', category: '의약품' })).toBe(true);
    expect(isMedicineItem({ usage: 'supply', category: '의약품' })).toBe(false);
  });
  it('사용 사유에서 레크·행사·처치를 뺐다', () => {
    expect((USE_REASONS as readonly string[]).includes('레크·행사')).toBe(false);
    expect((USE_REASONS as readonly string[]).includes('처치')).toBe(false);
    expect((USE_REASONS as readonly string[]).includes('기타')).toBe(true);
  });
  it('대표 사진 → 맨 앞, 지워졌으면 첫 사진', () => {
    const media = [{ url: 'a', path: 'a', type: 'image' as const }, { url: 'v', path: 'v', type: 'video' as const }, { url: 'b', path: 'b', type: 'image' as const }];
    expect(itemCoverMedia({ media, coverMediaPath: 'b' })?.path).toBe('b');
    expect(orderedItemMedia({ media, coverMediaPath: 'b' }).map(m => m.path)).toEqual(['b', 'a', 'v']);
    expect(itemCoverMedia({ media, coverMediaPath: 'gone' })?.path).toBe('a');
  });
  it('데이터 라벨: 단위·재고 사유', () => {
    setCurrentLocale('en');
    expect(dataLabel('박스')).toBe('box');
    expect(dataLabel('다 씀')).toBe('Used up');
    setCurrentLocale('ko');
  });
});

describe('구매 완료 입고 수량 · 환자 위치 버튼', () => {
  it('요청 단위가 박스이고 품목이 정이면 포장당 개수로 환산', async () => {
    const { supplyLineStockQty } = await import('../src/types/inventory');
    expect(supplyLineStockQty({ quantity: 2, unit: '박스' }, { unit: '정', packSize: 10 })).toBe(20);
    expect(supplyLineStockQty({ quantity: 3, unit: '정' }, { unit: '정', packSize: 10 })).toBe(3);
    expect(supplyLineStockQty({ quantity: 2, unit: '박스' }, { unit: '개' })).toBe(2);
  });
  it('숙소 탭의 환자방·교무실 → 버튼, 호수 순', async () => {
    const { patientPlaceOptions, patientPlaceKind } = await import('../src/utils/patient');
    const opts = patientPlaceOptions({ rooms: { '215': { purpose: '환자방', label: '여' }, '214': { purpose: '환자방', label: '남' }, '201': { purpose: '교무실' }, '301': { purpose: '학생방' } } });
    expect(opts).toEqual(['환자방 214호 (남)', '환자방 215호 (여)', '교무실 201호']);
    expect(patientPlaceKind('환자방 214호 (남)', opts)).toBe('option');
    expect(patientPlaceKind('330호', opts)).toBe('room');
    expect(patientPlaceKind('강당', opts)).toBe('etc');
    expect(patientPlaceOptions(null)).toEqual([]);
  });
});

describe('부분 구매 · 잔여 줄', () => {
  it('요청 3 중 2 구매 + 잔여 1 보류 → 묶음 계산, 구매 목록에서 빠짐, 부분 입고·잔여 보류', async () => {
    const m = await import('../src/types/inventory');
    const { setCurrentLocale } = await import('../src/i18n');
    setCurrentLocale('ko');
    const r = {
      status: 'requested' as const, forType: 'camp' as const, approvedAt: ts,
      items: [
        { id: 'a', name: '부루펜', quantity: 2, unit: '통' },
        { id: 'a-r1', name: '부루펜', quantity: 1, unit: '통', originId: 'a', lineStatus: 'onhold' as const },
      ],
      done: { a: { at: ts, by: 'b', byId: 'u', quantity: 2 } },
    };
    const g = m.supplyLineGroups(r)[0];
    expect([g.requested, g.received, g.held, g.remaining]).toEqual([3, 2, 1, 0]);
    expect(m.supplyOpenLines(r).length).toBe(0);
    expect(m.supplyProgress(r).key).toBe('partialHold');
    expect(m.supplyItemsSummary(r)).toBe('부루펜 요청 3통 · 입고 2통 · 보류 1통');
    expect(m.supplyAllSettledLines(r)).toBe(false);
    const canceled = { ...r, items: [r.items[0], { ...r.items[1], lineStatus: 'canceled' as const }] };
    expect(m.supplyAllSettledLines(canceled)).toBe(true);
    const cont = { ...r, items: [r.items[0], { ...r.items[1], lineStatus: undefined }] };
    expect(m.supplyOpenLines(cont).map(l => l.id)).toEqual(['a-r1']);
    expect(m.supplyShoppingList([cont]).map(s => s.total)).toEqual([1]);
    expect(m.supplyShoppingList([r]).length).toBe(0);
  });
});
