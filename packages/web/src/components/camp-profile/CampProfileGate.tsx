'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedGet } from '@/lib/apiClient';
import type { CampProfileStatus } from '@smis-mentor/shared';
import CampProfileForm from './CampProfileForm';

/**
 * 진행 중·예정 캠프 코드가 있는 멘토·원어민이 캠프 참가 정보를 다 입력하지 않았으면 화면 전체를 막고 입력 폼을 띄운다.
 * 로그인 후 한 번 확인 (세션 동안 캐시). 법률 문서·로그인 화면에서는 띄우지 않는다.
 */
const EXEMPT = ['/sign-in', '/sign-up', '/privacy-policy', '/terms-of-service'];
let checkedFor: string | null = null;

export default function CampProfileGate() {
  const { userData } = useAuth();
  const [missing, setMissing] = useState(false);
  const uid = userData?.userId;
  const role = userData?.role;

  useEffect(() => {
    if (!uid || (role !== 'mentor' && role !== 'foreign')) { setMissing(false); return; }
    if (typeof window !== 'undefined' && EXEMPT.some((p) => window.location.pathname.startsWith(p))) return;
    if (checkedFor === uid) return;
    authenticatedGet<CampProfileStatus & { applies: boolean }>('/api/user/camp-profile')
      .then((s) => {
        checkedFor = uid;
        setMissing(s.applies && !!s.active && !!s.tier && s.missing.length > 0);
      })
      .catch(() => undefined);
  }, [uid, role]);

  if (!missing) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 my-4 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{role === 'foreign' ? 'Camp Information' : '캠프 참가 정보 입력'}</h2>
        <p className="text-sm text-gray-500 mb-4">{role === 'foreign' ? 'Please enter the information below to prepare for your camp.' : '배정된 캠프 준비를 위해 아래 정보를 입력해주세요.'}</p>
        <CampProfileForm mode="required" onDone={(s) => { if (s.missing.length === 0) setMissing(false); }} />
      </div>
    </div>
  );
}
