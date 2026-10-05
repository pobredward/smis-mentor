'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/** 학부모 계정은 채용 홈 대신 학부모 홈으로 */
export default function ParentRedirect() {
  const { userData } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (userData?.role === 'parent') router.replace('/parent');
  }, [userData?.role, router]);
  return null;
}
