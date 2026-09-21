import { Metadata } from 'next';
import CampClient from '../CampClient';

export const metadata: Metadata = {
  title: '재고 | SMIS Mentor',
  description: '캠프 재고 — 추후 구현 예정',
};

export default function InventoryPage() {
  return <CampClient initialTab="inventory" />;
}
