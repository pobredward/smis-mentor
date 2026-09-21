'use client';

import { FiBox } from 'react-icons/fi';
import { useAuth } from '@/contexts/AuthContext';

/** 캠프 › 재고 — 아직 자리만 잡아 둔 탭 */
export default function InventoryContent() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <FiBox className="h-10 w-10 text-gray-300" aria-hidden />
      <h2 className="text-base font-semibold text-gray-700">{isForeign ? 'Coming soon' : '추후 구현 예정'}</h2>
      <p className="text-sm text-gray-400">
        {isForeign ? 'Inventory will be available here.' : '캠프 재고 관리 기능이 이곳에 들어올 예정입니다.'}
      </p>
    </div>
  );
}
