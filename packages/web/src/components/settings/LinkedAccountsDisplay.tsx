'use client';

import { AuthProvider, SocialProvider } from '@smis-mentor/shared';
import { getSocialProviderName, getSocialProviderIcon } from '@smis-mentor/shared';

interface LinkedAccount {
  providerId: SocialProvider | 'password';
  email?: string;
  linkedAt: Date;
  displayName?: string;
  photoURL?: string;
}

interface LinkedAccountsDisplayProps {
  authProviders: AuthProvider[];
  onUnlink: (providerId: SocialProvider) => void;
  onLink?: (providerId: SocialProvider) => void; // 추가
  isUnlinking?: boolean;
  isLinking?: boolean; // 추가
}

export default function LinkedAccountsDisplay({
  authProviders,
  onUnlink,
  onLink,
  isUnlinking = false,
  isLinking = false,
}: LinkedAccountsDisplayProps) {
  // authProviders null/undefined 체크
  if (!authProviders || !Array.isArray(authProviders)) {
    console.error('❌ authProviders가 유효하지 않습니다:', authProviders);
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          계정 정보를 불러올 수 없습니다. 페이지를 새로고침해주세요.
        </p>
      </div>
    );
  }

  // authProviders를 LinkedAccount 형식으로 변환
  const accounts: LinkedAccount[] = authProviders.map((provider) => ({
    providerId: provider.providerId,
    email: provider.email,
    linkedAt: provider.linkedAt?.toDate ? provider.linkedAt.toDate() : new Date(),
    displayName: provider.displayName,
    photoURL: provider.photoURL,
  }));

  // 날짜 포맷팅
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  // 연동 해제 가능 여부
  const canUnlink = accounts.length > 1;

  // 모든 소셜 제공자 목록
  const allProviders: Array<{ id: SocialProvider; name: string; icon: string }> = [
    { id: 'google.com', name: 'Google', icon: '🔵' },
    { id: 'apple.com', name: 'Apple', icon: '🍎' },
    { id: 'kakao', name: '카카오', icon: '💬' },
    { id: 'naver', name: '네이버', icon: '🟢' },
  ];

  // 연동된 제공자 ID 목록 (naver.com도 naver로 정규화)
  const linkedProviderIds = accounts
    .filter((acc) => acc.providerId !== 'password')
    .map((acc) => {
      // naver.com -> naver로 정규화
      if (acc.providerId === 'naver.com') return 'naver';
      return acc.providerId;
    });

  return (
    <div className="space-y-6">
      {/* 연동된 계정 목록 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">현재 연동된 계정</h3>
        <div className="space-y-2">
          {accounts.map((account) => {
            const isPassword = account.providerId === 'password';
            const canUnlinkThis = canUnlink && !isPassword;

            return (
              <div
                key={account.providerId}
                className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{getSocialProviderIcon(account.providerId)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {getSocialProviderName(account.providerId)}
                      </p>
                      {!canUnlinkThis && (
                        <span className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-full">
                          기본
                        </span>
                      )}
                    </div>
                    {account.email && (
                      <p className="text-sm text-gray-600 truncate">{account.email}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      연결됨: {formatDate(account.linkedAt)}
                    </p>
                  </div>
                </div>

                {canUnlinkThis ? (
                  <button
                    onClick={() => onUnlink(account.providerId as SocialProvider)}
                    disabled={isUnlinking}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isUnlinking ? '해제 중...' : '연동 해제'}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">
                    {isPassword ? '필수' : '해제 불가'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 추가 연동 가능한 계정 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">추가 연동 가능</h3>
        <div className="space-y-2">
          {allProviders.map((provider) => {
            const isLinked = linkedProviderIds.includes(provider.id);

            return (
              <div
                key={provider.id}
                className={`flex items-center justify-between py-3 px-4 rounded-lg ${
                  isLinked ? 'bg-gray-100 opacity-50' : 'bg-white border border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{provider.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{provider.name}</p>
                    {isLinked ? (
                      <p className="text-xs text-gray-500">이미 연동됨</p>
                    ) : (
                      <p className="text-xs text-gray-500">구현 전</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onLink?.(provider.id)}
                  disabled={isLinked || !onLink || isLinking}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 whitespace-nowrap"
                >
                  {isLinked ? '연동됨' : isLinking ? '연동 중...' : '연동하기'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 안내 메시지 */}
      {!canUnlink && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex gap-2">
            <span className="text-amber-600 text-sm flex-shrink-0">⚠️</span>
            <p className="text-sm text-amber-800">
              최소 1개의 로그인 방법을 유지해야 합니다. 마지막 방법은 해제할 수 없습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
