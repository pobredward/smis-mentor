'use client';

/**
 * 이메일 인증 안내 — 비밀번호로 가입했고 아직 이메일을 인증하지 않은 사용자는 앱을 쓸 수 없다.
 * (기존 가입자는 모두 인증된 것으로 표시했고, 구글·애플·네이버·카카오 가입은 제공자가 확인한 이메일이라 대상 아님)
 * 서버 API 도 같은 기준으로 막는다 (authMiddleware).
 */
import { useCallback, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedPost } from '@/lib/apiClient';

const EXEMPT = ['/sign-in', '/sign-up', '/privacy-policy', '/terms-of-service'];

export default function EmailVerifyGate() {
  const { userData, refreshUserData } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const en = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const needs = !!userData && (userData as { isEmailVerified?: boolean }).isEmailVerified !== true && !!auth.currentUser && !auth.currentUser.emailVerified;

  /** 메일의 링크를 누르고 돌아왔는지 확인 → 문서 반영 → 사용자 정보 새로고침 */
  const check = useCallback(async (silent = false) => {
    const u = auth.currentUser;
    if (!u) return;
    setChecking(true);
    try {
      await u.reload();
      if (auth.currentUser?.emailVerified) {
        await auth.currentUser.getIdToken(true);
        await authenticatedPost('/api/auth/email-verification', { action: 'sync' });
        await refreshUserData();
        toast.success(en ? 'Your email has been verified.' : '이메일 인증이 완료되었습니다.');
      } else if (!silent) {
        toast.error(en ? 'Not verified yet. Please click the link in the email.' : '아직 인증되지 않았습니다. 메일의 링크를 눌러주세요.');
      }
    } catch {
      if (!silent) toast.error(en ? 'Could not check. Please try again.' : '확인하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setChecking(false);
    }
  }, [en, refreshUserData]);

  // 다른 탭에서 링크를 누르고 돌아오면 자동 확인
  useEffect(() => {
    if (!needs) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void check(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    void check(true);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [needs, check]);

  // Auth 는 인증됐는데 문서만 false 인 경우 조용히 맞춘다
  useEffect(() => {
    if (userData && (userData as { isEmailVerified?: boolean }).isEmailVerified !== true && auth.currentUser?.emailVerified) {
      authenticatedPost('/api/auth/email-verification', { action: 'sync' }).then(() => refreshUserData()).catch(() => undefined);
    }
  }, [userData, refreshUserData]);

  if (!needs) return null;
  if (typeof window !== 'undefined' && EXEMPT.some((p) => window.location.pathname.startsWith(p))) return null;

  const resend = async () => {
    setSending(true);
    try {
      const r = await authenticatedPost<{ verified?: boolean; sent?: boolean }>('/api/auth/email-verification', { action: 'resend' });
      if (r.verified) { await check(true); return; }
      toast.success(en ? 'Verification email sent.' : '인증 메일을 다시 보냈습니다.');
    } catch (e) {
      toast.error((e as Error)?.message || (en ? 'Failed to send.' : '보내지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) { toast.error(en ? 'Please enter a valid email.' : '올바른 이메일을 입력해주세요.'); return; }
    setSending(true);
    try {
      await authenticatedPost('/api/user/change-email', { email: newEmail.trim() });
      await auth.currentUser?.reload();
      await refreshUserData();
      setEditing(false);
      toast.success(en ? 'Email changed. We sent a verification email to the new address.' : '이메일을 바꾸고 새 주소로 인증 메일을 보냈습니다.');
    } catch (e) {
      toast.error((e as Error)?.message || (en ? 'Could not change the email.' : '이메일을 바꾸지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 my-4 shadow-xl">
        <div className="text-3xl mb-2">📧</div>
        <h2 className="text-lg font-bold text-gray-900">{en ? 'Verify your email' : '이메일 인증이 필요합니다'}</h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          {en ? 'We sent a verification link to' : '아래 주소로 인증 메일을 보냈습니다.'}
          <br /><b className="text-gray-900 break-all">{userData?.email}</b><br />
          {en
            ? 'Click the link in the email, then come back here. Check your spam folder if you cannot find it.'
            : '메일의 링크를 누른 뒤 이 화면으로 돌아오세요. 메일이 보이지 않으면 스팸함도 확인해주세요.'}
        </p>

        <div className="mt-5 space-y-2">
          <button type="button" onClick={() => check(false)} disabled={checking}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
            {checking ? (en ? 'Checking…' : '확인 중…') : (en ? 'I have verified' : '인증 완료했어요')}
          </button>
          <button type="button" onClick={resend} disabled={sending}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-50">
            {en ? 'Resend email' : '인증 메일 다시 보내기'}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          {editing ? (
            <div className="space-y-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={en ? 'Correct email address' : '올바른 이메일 주소'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2 text-xs rounded-md border border-gray-300">{en ? 'Cancel' : '취소'}</button>
                <button type="button" onClick={changeEmail} disabled={sending} className="flex-1 py-2 text-xs rounded-md bg-gray-800 text-white disabled:opacity-50">{en ? 'Change & resend' : '바꾸고 다시 보내기'}</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => { setNewEmail(userData?.email || ''); setEditing(true); }} className="text-gray-500 underline">
                {en ? 'Wrong email address?' : '이메일 주소가 틀렸나요?'}
              </button>
              <button type="button" onClick={() => signOut(auth).then(() => { window.location.href = '/sign-in'; })} className="text-gray-400 underline">
                {en ? 'Log out' : '로그아웃'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
