'use client';

/**
 * OAuth 동의 화면 — MCP 클라이언트(Claude.ai, ChatGPT 등)가 사용자를 이곳으로 보낸다.
 *
 * 1. 로그인 상태 확인 (미로그인 → /sign-in?redirect=현재URL)
 * 2. /api/oauth/authorize GET 으로 파라미터 검증 + 클라이언트 이름 표시
 * 3. 허용 → Firebase ID 토큰과 함께 POST → 인가 코드가 담긴 redirect URL 로 이동
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface ClientInfo {
  id: string;
  name: string;
  uri: string | null;
  logo: string | null;
  source: 'dcr' | 'cimd';
}

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  mentor: '멘토',
  mentor_temp: '멘토(임시)',
  foreign: '원어민 선생님',
  foreign_temp: '원어민(임시)',
};

export default function AuthorizeClient() {
  const searchParams = useSearchParams();
  const { currentUser, userData, loading } = useAuth();

  const params = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [scope, setScope] = useState('read');
  const [redirectHost, setRedirectHost] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [returnTo, setReturnTo] = useState('/oauth/authorize');
  useEffect(() => {
    setReturnTo(`${window.location.pathname}${window.location.search}`);
  }, []);

  // 파라미터 검증
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/oauth/authorize?${searchParams.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.valid) {
          if (data.redirectTo) {
            window.location.replace(data.redirectTo);
            return;
          }
          setValidationError(data.error_description ?? '요청이 올바르지 않습니다.');
          return;
        }
        setClient(data.client);
        setScope(data.scope);
        setRedirectHost(data.redirectHost);
      } catch {
        if (!cancelled) setValidationError('서버와 통신하지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const decide = useCallback(
    async (decision: 'allow' | 'deny') => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const idToken = decision === 'allow' ? await currentUser?.getIdToken(true) : undefined;
        if (decision === 'allow' && !idToken) {
          setSubmitError('로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.');
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/oauth/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, decision, idToken }),
        });
        const data = await res.json();
        if (data.redirectTo) {
          window.location.assign(data.redirectTo);
          return;
        }
        setSubmitError(data.error_description ?? '처리에 실패했습니다.');
      } catch {
        setSubmitError('서버와 통신하지 못했습니다.');
      }
      setSubmitting(false);
    },
    [currentUser, params]
  );

  const signInHref = `/sign-in?redirect=${encodeURIComponent(returnTo)}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-6 text-white">
          <p className="text-sm text-blue-100">SMIS Mentor</p>
          <h1 className="text-xl font-bold mt-1">AI 연결 허용</h1>
        </div>

        <div className="px-6 py-6 space-y-5">
          {validationError ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <p className="font-semibold mb-1">요청을 처리할 수 없습니다</p>
              <p>{validationError}</p>
            </div>
          ) : !client ? (
            <p className="text-sm text-gray-500">요청 정보를 확인하는 중…</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {client.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={client.logo} alt="" className="h-10 w-10 rounded-lg border border-gray-200 object-contain" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">AI</div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{client.name}</p>
                  <p className="text-xs text-gray-500">{client.uri ?? redirectHost}</p>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
                <p>
                  <span className="font-semibold">{client.name}</span> 이(가) 회원님의 계정으로 SMIS Mentor 페이지를 <span className="font-semibold">읽기 전용</span>으로 접근하려 합니다.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>공개 페이지(채용 공고, 후기, 약관)</li>
                  <li>내 프로필과 지원 이력</li>
                  <li>내 역할로 볼 수 있는 캠프 운영 자료(교육, 시간표, 업무, 명단)</li>
                  {userData?.role === 'admin' && <li>관리자 페이지(사용자·지원자·공고 관리)</li>}
                </ul>
                <p className="text-xs text-gray-500">권한 범위: {scope} · 데이터를 수정하거나 삭제할 수 없습니다. 환자 기록과 연락처·주민번호 등 개인정보는 제공되지 않습니다.</p>
              </div>

              {loading ? (
                <p className="text-sm text-gray-500">로그인 상태 확인 중…</p>
              ) : !currentUser ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">계속하려면 SMIS Mentor 계정으로 로그인하세요.</p>
                  <Link href={signInHref} className="block w-full text-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                    로그인하고 계속
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    계정: <span className="font-semibold">{userData?.name ?? currentUser.email}</span>
                    {userData?.role ? <span className="ml-1 text-gray-500">({ROLE_LABEL[userData.role] ?? userData.role})</span> : null}
                  </p>
                  {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => decide('deny')}
                      disabled={submitting}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      거부
                    </button>
                    <button
                      type="button"
                      onClick={() => decide('allow')}
                      disabled={submitting}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? '처리 중…' : '허용'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
