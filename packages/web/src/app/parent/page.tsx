'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { getMyParentLinks, logger, type ParentChildLink } from '@smis-mentor/shared';

/**
 * 학부모 홈 — 1.0 은 연결된 아이만 보여 준다 (캠프 소식 · 일정은 다음 업데이트).
 * 아이 연결은 관리자가 한다 (관리자 › 사용자 관리 › 학부모 › 아이 연결).
 */
export default function ParentHomePage() {
  const { userData, loading } = useAuth() as { userData: any; loading?: boolean };
  const router = useRouter();
  const [children, setChildren] = useState<ParentChildLink[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userData) { router.replace('/sign-in?redirect=/parent'); return; }
    if (userData.role !== 'parent') { router.replace('/'); return; }
    getMyParentLinks(db, userData.userId || userData.id)
      .then(setChildren)
      .catch((e) => { logger.error('연결된 아이 불러오기 실패:', e); setChildren([]); });
  }, [userData, loading, router]);

  return (
    <Layout>
      <div className="max-w-xl mx-auto py-6">
        <h1 className="text-2xl font-bold text-gray-900">학부모 홈</h1>
        {userData?.name && <p className="mt-1 text-gray-600">{userData.name}님, 반갑습니다.</p>}

        <section className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800">우리 아이</h2>
          {children === null ? (
            <p className="mt-3 text-sm text-gray-500">불러오는 중…</p>
          ) : children.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">
              아직 연결된 아이가 없습니다. 캠프 운영진이 확인한 뒤 연결해 드립니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {children.map((c) => (
                <li key={`${c.campCode}_${c.studentId}`} className="py-3 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{c.studentName}</span>
                  <span className="text-sm text-gray-500">{c.campCode}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-sm text-gray-500 leading-relaxed">
          캠프 일정 · 소식은 곧 이곳에서 볼 수 있습니다.
        </p>
      </div>
    </Layout>
  );
}
