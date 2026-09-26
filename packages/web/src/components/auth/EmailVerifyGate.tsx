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
import { L } from '@smis-mentor/shared';

const EXEMPT = ['/sign-in', '/sign-up', '/privacy-policy', '/terms-of-service'];

export default function EmailVerifyGate() {
  const { userData, refreshUserData } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editing, setEditing] = useState(false);
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
        toast.success(L('profile.yourEmailHasBeenVerified'));
      } else if (!silent) {
        toast.error(L('profile.notVerifiedYetPleaseClick'));
      }
    } catch {
      if (!silent) toast.error(L('profile.couldNotCheckPleaseTry'));
    } finally {
      setChecking(false);
    }
  }, [refreshUserData]);

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
      toast.success(L('profile.verificationEmailSent'));
    } catch (e) {
      toast.error((e as Error)?.message || (L('profile.failedToSend')));
    } finally {
      setSending(false);
    }
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) { toast.error(L('profile.pleaseEnterAValidEmail')); return; }
    setSending(true);
    try {
      await authenticatedPost('/api/user/change-email', { email: newEmail.trim() });
      await auth.currentUser?.reload();
      await refreshUserData();
      setEditing(false);
      toast.success(L('profile.emailChangedWeSentA'));
    } catch (e) {
      toast.error((e as Error)?.message || (L('profile.couldNotChangeTheEmail')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 my-4 shadow-xl">
        <div className="text-3xl mb-2">📧</div>
        <h2 className="text-lg font-bold text-gray-900">{L('profile.verifyYourEmail')}</h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          {L('profile.weSentAVerificationLink')}
          <br /><b className="text-gray-900 break-all">{userData?.email}</b><br />
          {L('profile.clickTheLinkInThe')}
        </p>

        <div className="mt-5 space-y-2">
          <button type="button" onClick={() => check(false)} disabled={checking}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
            {checking ? (L('profile.checking')) : (L('profile.iHaveVerified'))}
          </button>
          <button type="button" onClick={resend} disabled={sending}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-50">
            {L('profile.resendEmail')}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          {editing ? (
            <div className="space-y-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={L('profile.correctEmailAddress')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2 text-xs rounded-md border border-gray-300">{L('common.cancel')}</button>
                <button type="button" onClick={changeEmail} disabled={sending} className="flex-1 py-2 text-xs rounded-md bg-gray-800 text-white disabled:opacity-50">{L('profile.changeResend')}</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => { setNewEmail(userData?.email || ''); setEditing(true); }} className="text-gray-500 underline">
                {L('profile.wrongEmailAddress')}
              </button>
              <button type="button" onClick={() => signOut(auth).then(() => { window.location.href = '/sign-in'; })} className="text-gray-400 underline">
                {L('profile.logOut2')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
