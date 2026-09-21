import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '재고 | SMIS Mentor',
  description: '캠프 재고 — 품목별 그룹 수량, 구매 필요, 입출고 내역',
};

export default function InventoryPage() {
  return <CampClient initialTab="inventory" />;
}
