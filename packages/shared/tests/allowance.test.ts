import { describe, expect, it } from './_expect';
import {
  allowanceConfigFor, allowanceRows, allowanceBalance, allowancePendingItems, denomTotal, formatAllowance, ledgerInitial,
  type AllowanceTxn,
} from '../src/types/allowance';
import type { PatientRecord } from '../src/types/camp';
import type { SupplyRequest } from '../src/types/inventory';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) as unknown as AllowanceTxn['date'];
const txn = (p: Partial<AllowanceTxn>): AllowanceTxn => ({
  id: Math.random().toString(36), campCode: 'J29', studentId: 'J.001', studentName: 'A', currency: 'KRW', type: 'spend',
  amount: 1000, category: 'etc', date: ts(1), createdBy: 'x', createdById: 'x', createdAt: ts(1), ...p,
});

describe('allowance', () => {
  it('캠프 타입별 기본 구성 (DG=S, F=없음)', () => {
    expect(denomTotal(allowanceConfigFor('EJ')!.currencies[0].defaultInitial)).toBe(100000);
    const s = allowanceConfigFor('DG')!;
    expect(s.currencies.map(c => c.code).join(',')).toBe('SGD,MYR');
    expect(denomTotal(s.currencies[0].defaultInitial)).toBe(150);
    expect(denomTotal(s.currencies[1].defaultInitial)).toBe(200);
    expect(allowanceConfigFor('F')).toBe(null);
    expect(ledgerInitial({ id: 'x', campCode: 'J29', studentId: 'J.001', initial: { KRW: { 10000: 5 } } }, allowanceConfigFor('EJ')!.currencies[0])[10000]).toBe(5);
  });

  it('잔액 = 초기 + 입금 − 사용, 삭제·다른 통화 제외, 날짜순 누적', () => {
    const list = [
      txn({ amount: 9600, date: ts(3) }),
      txn({ amount: 32000, date: ts(5) }),
      txn({ type: 'deposit', amount: 20000, date: ts(4) }),
      txn({ amount: 5000, date: ts(2), deleted: { at: ts(9), by: 'x', byId: 'x' } as AllowanceTxn['deleted'] }),
      txn({ amount: 10, currency: 'SGD', date: ts(2) }),
    ];
    const rows = allowanceRows(list, 'KRW', 100000);
    expect(rows.map(r => r.balanceAfter).join(',')).toBe('90400,110400,78400');
    expect(allowanceBalance(list, 'KRW', 100000)).toBe(78400);
    expect(allowanceBalance(list, 'SGD', 150)).toBe(140);
  });

  it('정산 대기 — 용돈봉투 병원비·학생 물품, 장부에 있으면 제외', () => {
    const records = [{
      id: 'r1', studentId: 'J.001', symptom: '복통',
      hospitalVisits: [
        { visitId: 'v1', hospitalName: '제주병원', billing: { method: '용돈봉투', amount: 9600, isPaid: false } },
        { visitId: 'v2', billing: { method: '부모님청구', amount: 5000, isPaid: false } },
      ],
    }] as unknown as PatientRecord[];
    const reqs = [{
      id: 'q1', forType: 'student', studentId: 'J.001', status: 'purchased',
      items: [{ id: 'l1', name: '손목시계' }, { id: 'l2', name: '우비', parentBill: true }],
      done: { l1: { amount: 15000 }, l2: { amount: 3000 } }, settlements: { l1: { by: 'x' } },
    }] as unknown as SupplyRequest[];
    const p = allowancePendingItems('J.001', records, reqs, []);
    expect(p.length).toBe(2);
    expect(p.find(x => x.category === 'goods')!.alreadySettled).toBe(true);
    const after = allowancePendingItems('J.001', records, reqs, [txn({ sourceKey: 'patient:r1:v1' })]);
    expect(after.length).toBe(1);
  });

  it('금액 표시', () => {
    expect(formatAllowance(100000, 'KRW')).toBe('100,000원');
    expect(formatAllowance(-9600, 'KRW')).toBe('-9,600원');
    expect(formatAllowance(20, 'SGD', { signed: true })).toBe('+S$20');
    expect(formatAllowance(200, 'MYR')).toBe('RM200');
  });
});
