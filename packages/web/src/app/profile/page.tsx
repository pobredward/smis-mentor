'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserJobCodesInfo, deactivateUser, getUserById, getUserByEmail, updateUser } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import LinkedAccountsDisplay from '@/components/settings/LinkedAccountsDisplay';
import { JobCodeWithId } from '@/types';
import { SocialProvider } from '@smis-mentor/shared';
import { unlinkSocialProvider, getSocialProviderName } from '@smis-mentor/shared';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { formatPhoneNumber } from '@/utils/phoneUtils';

export default function ProfilePage() {
  const { userData, waitForAuthReady, refreshUserData, updateActiveJobCode } = useAuth();
  const router = useRouter();
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [jobCodesExpanded, setJobCodesExpanded] = useState(true);
  const [changingJobCode, setChangingJobCode] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        setAuthChecking(true);
        await waitForAuthReady();
        
        // userData가 없으면 새로고침 시도 (네이버/카카오 포함)
        if (!userData) {
          await refreshUserData();
        }

        setAuthChecking(false);
        
        // ✅ URL 파라미터로 refresh=true가 있으면 즉시 새로고침
        const params = new URLSearchParams(window.location.search);
        if (params.get('refresh') === 'true') {
          console.log('🔄 계정 연동 완료 - 사용자 데이터 새로고침');
          await refreshUserData();
          // URL에서 refresh 파라미터 제거
          window.history.replaceState({}, '', '/profile');
        }
      } catch (error) {
        console.error('인증 상태 확인 오류:', error);
        setAuthChecking(false);
      }
    };

    checkAuthAndLoadData();
  }, [waitForAuthReady, userData, refreshUserData]);

  useEffect(() => {
    const fetchJobCodes = async () => {
      if (userData) {
        try {
          let jobCodesInfo: any[] = [];
          
          // 관리자는 모든 캠프 코드 조회
          if (userData.role === 'admin') {
            const { getAllJobCodes } = await import('@/lib/firebaseService');
            jobCodesInfo = await getAllJobCodes();
          } 
          // 일반 사용자는 자신의 캠프 코드만 조회
          else if (userData.jobExperiences && userData.jobExperiences.length > 0) {
            jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
          }
          
          // generation 기준으로 정렬 (generation은 문자열이므로 숫자로 변환하여 정렬)
          const sortedJobCodes = [...jobCodesInfo].sort((a, b) => {
            // generation에서 숫자만 추출 (예: "1기" -> 1, "10기" -> 10)
            const genA = parseInt(a.generation.replace(/[^0-9]/g, ''));
            const genB = parseInt(b.generation.replace(/[^0-9]/g, ''));
            return genB - genA; // 내림차순 정렬 (최신 기수가 위로)
          });
          setJobCodes(sortedJobCodes);
        } catch (error) {
          console.error('업무 정보 불러오기 오류:', error);
        }
      }
      setLoading(false);
    };

    if (!authChecking && userData) {
      fetchJobCodes();
    }
  }, [userData, authChecking]);

  const handleJobCodeSelect = async (jobCodeId: string) => {
    if (userData?.activeJobExperienceId === jobCodeId) {
      return;
    }

    try {
      setChangingJobCode(true);
      await updateActiveJobCode(jobCodeId);
      toast.success('기수가 변경되었습니다.\n캠프 탭에서 해당 기수의 자료를 확인하세요.');
    } catch (error) {
      console.error('기수 변경 실패:', error);
      toast.error('기수 변경에 실패했습니다.');
    } finally {
      setChangingJobCode(false);
    }
  };

  const handleDeactivateAccount = async () => {
    if (!userData) return;
    
    try {
      setDeactivating(true);
      await deactivateUser(userData.userId);
      toast.success('회원 탈퇴가 완료되었습니다.');
      
      // 로그아웃 처리
      await signOut(auth);
      
      // 로그인 페이지로 이동
      router.push('/sign-in');
    } catch (error) {
      console.error('회원 탈퇴 오류:', error);
      let errorMessage = '회원 탈퇴 중 오류가 발생했습니다.';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setDeactivating(false);
      setShowDeactivateModal(false);
    }
  };

  // 소셜 계정 연동 핸들러
  const handleLink = async (providerId: SocialProvider) => {
    if (!userData?.userId) {
      toast.error('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    // 현재 로그인된 Firebase Auth 사용자 확인
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // ✅ 세션 만료 - 명확한 안내 및 리다이렉트
      toast.error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.', { duration: 4000 });
      setTimeout(() => {
        router.push('/sign-in?redirect=/profile');
      }, 2000);
      return;
    }

    setIsLinking(true);
    try {
      let socialData;
      let credential;
      
      // 1. 소셜 로그인 팝업 열기
      if (providerId === 'google.com') {
        const { signInWithGoogle } = await import('@/lib/googleAuthService');
        const { GoogleAuthProvider } = await import('firebase/auth');
        
        socialData = await signInWithGoogle();
        
        // Google credential 생성
        credential = GoogleAuthProvider.credential(
          socialData.idToken,
          socialData.accessToken
        );
      } else if (providerId === 'naver') {
        // 네이버는 Firebase Auth 연동 불가 (커스텀 OAuth)
        const { signInWithNaver } = await import('@/lib/naverAuthService');
        socialData = await signInWithNaver();
        
        // 네이버는 Firestore에만 저장 (arrayUnion 사용)
        const { linkSocialProvider } = await import('@smis-mentor/shared');
        const { arrayUnion } = await import('firebase/firestore');
        
        await linkSocialProvider(
          userData.userId,
          socialData,
          getUserById,
          updateUser,
          arrayUnion // ✅ 동시성 안전
        );

        toast.success('네이버 계정이 성공적으로 연동되었습니다.');
        await refreshUserData();
        return;
      } else if (providerId === 'kakao') {
        toast.error('카카오 연동은 준비 중입니다.');
        return;
      } else if (providerId === 'apple.com') {
        toast.error('애플 연동은 준비 중입니다.');
        return;
      } else {
        toast.error('지원하지 않는 소셜 제공자입니다.');
        return;
      }

      // 2. Firebase Auth에 소셜 계정 연동 (Google만)
      if (credential) {
        const { linkWithCredential } = await import('firebase/auth');
        
        try {
          await linkWithCredential(currentUser, credential);
          console.log('✅ Firebase Auth 소셜 계정 연동 완료');
        } catch (authError: any) {
          console.error('❌ Firebase Auth 연동 실패:', authError);
          
          if (authError.code === 'auth/credential-already-in-use') {
            throw new Error('이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.');
          } else if (authError.code === 'auth/provider-already-linked') {
            throw new Error('이미 이 제공자가 연결되어 있습니다.');
          } else if (authError.code === 'auth/email-already-in-use') {
            throw new Error('이 이메일은 이미 다른 계정에서 사용 중입니다.');
          }
          
          throw authError;
        }
      }

      // 3. Firestore에 연동 정보 추가 (arrayUnion 사용)
      const { linkSocialProvider } = await import('@smis-mentor/shared');
      const { arrayUnion } = await import('firebase/firestore');
      
      await linkSocialProvider(
        userData.userId,
        socialData,
        getUserById,
        updateUser,
        arrayUnion // ✅ Firestore arrayUnion 전달 (동시성 안전)
      );

      toast.success('소셜 계정이 성공적으로 연동되었습니다.', { duration: 3000 });
      
      // 4. 사용자 데이터 새로고침
      await refreshUserData();
    } catch (error: any) {
      console.error('소셜 계정 연동 오류:', error);
      
      let errorMessage = '소셜 계정 연동 중 오류가 발생했습니다. 다시 시도해주세요.';
      
      if (error.message === 'POPUP_BLOCKED') {
        errorMessage = '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용한 후 다시 시도해주세요.';
      } else if (error.message === 'POPUP_CLOSED') {
        errorMessage = '로그인 창이 닫혔습니다. 다시 시도해주세요.';
      } else if (error.message?.includes('이미')) {
        errorMessage = error.message;
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = '보안을 위해 다시 로그인한 후 연동을 시도해주세요.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setIsLinking(false);
    }
  };

  // 소셜 계정 연동 해제 핸들러
  const handleUnlink = async (providerId: SocialProvider) => {
    console.log('🔓 연동 해제 시작:', {
      providerId,
      userData: userData ? {
        userId: userData.userId,
        email: userData.email,
        authProviders: userData.authProviders?.map(p => p.providerId),
      } : null,
    });

    if (!userData?.userId || !userData?.email) {
      toast.error('사용자 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.');
      return;
    }

    const providerName = getSocialProviderName(providerId);
    
    if (!confirm(`${providerName} 계정 연동을 해제하시겠습니까?`)) {
      return;
    }

    setIsUnlinking(true);
    try {
      // 이메일로 사용자 재조회
      console.log('📧 이메일로 사용자 재조회:', userData.email);
      const userByEmail = await getUserByEmail(userData.email);
      
      if (!userByEmail) {
        throw new Error('사용자 정보를 찾을 수 없습니다.');
      }
      
      console.log('✅ 이메일로 사용자 발견:', {
        userId: userByEmail.userId,
        authProviders: userByEmail.authProviders?.map((p: any) => p.providerId),
      });

      // 실제 Firestore 문서 ID 사용
      const actualUserId = userByEmail.userId || userByEmail.id;
      
      console.log('📤 unlinkSocialProvider 호출:', {
        actualUserId,
        providerId,
      });

      // ✅ Transaction 함수 생성
      const { doc, runTransaction } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const runTransactionWrapper = async (updateFn: (user: any) => any) => {
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', actualUserId);
          const userDoc = await transaction.get(userRef);
          
          if (!userDoc.exists()) {
            throw new Error('사용자 문서를 찾을 수 없습니다.');
          }
          
          const latestUserData = userDoc.data();
          const updates = await updateFn(latestUserData);
          
          transaction.update(userRef, updates);
        });
      };

      await unlinkSocialProvider(
        auth,
        providerId,
        actualUserId, // 실제 Firestore 문서 ID 전달
        getUserById,
        updateUser,
        runTransactionWrapper // ✅ Transaction 함수 전달 (동시성 안전)
      );
      
      toast.success(`${providerName} 계정 연동이 해제되었습니다.`, { duration: 3000 });
      
      // 사용자 데이터 새로고침
      await refreshUserData();
    } catch (error: any) {
      console.error('연동 해제 오류:', error);
      toast.error(error.message || '연동 해제 중 오류가 발생했습니다. 다시 시도해주세요.', { duration: 5000 });
    } finally {
      setIsUnlinking(false);
    }
  };

  // 인증 상태 확인 중이면 로딩 표시
  if (authChecking || !userData) {
    return (
      <Layout requireAuth>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }

  const isForeign = userData.role === 'foreign' || userData.role === 'foreign_temp';

  return (
    <>
      <Layout requireAuth>
      <div className="max-w-2xl mx-auto lg:px-4 px-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">{isForeign ? 'My Profile' : '내 프로필'}</h1>
          <Button
            variant="primary"
            onClick={() => router.push('/profile/edit')}
            className="text-sm px-4 py-2"
          >
            {isForeign ? 'Edit' : '수정'}
          </Button>
        </div>

        {/* 프로필 카드 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center">
              {userData.profileImage ? (
                <img
                  src={userData.profileImage}
                  alt={userData.name}
                  className="w-20 h-20 object-cover object-center rounded-md border border-gray-300 mb-4 sm:mb-0 sm:mr-4 mx-auto sm:mx-0"
                  style={{ aspectRatio: '1 / 1' }}
                />
              ) : (
                <div className="w-20 h-20 bg-blue-500 rounded-md flex items-center justify-center mb-4 sm:mb-0 sm:mr-4 mx-auto sm:mx-0">
                  <span className="text-white text-2xl font-bold">{userData.name.charAt(0)}</span>
                </div>
              )}
              <div className="text-center sm:text-left">
                <h2 className="text-xl font-bold mb-1">{userData.name}</h2>
                <p className="text-gray-600 mb-1">{userData.email}</p>
                {userData.phoneNumber && <p className="text-gray-600">{formatPhoneNumber(userData.phoneNumber)}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* 원어민 교사 정보 및 제출 서류 */}
        {isForeign && userData.foreignTeacher && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b px-4 sm:px-6 py-3">
              <h2 className="text-lg font-semibold">Teacher Information & Submitted Documents</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">First Name</p>
                  <p>{userData.foreignTeacher.firstName}</p>
                </div>
                {userData.foreignTeacher.middleName && (
                  <div>
                    <p className="text-sm text-gray-500">Middle Name</p>
                    <p>{userData.foreignTeacher.middleName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Last Name</p>
                  <p>{userData.foreignTeacher.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Country Code</p>
                  <p>{userData.foreignTeacher.countryCode}</p>
                </div>
                {userData.foreignTeacher.applicationDate && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Application Date</p>
                    <p>
                      {userData.foreignTeacher.applicationDate.toDate
                        ? userData.foreignTeacher.applicationDate.toDate().toLocaleDateString('en-US')
                        : new Date((userData.foreignTeacher.applicationDate as any).seconds * 1000).toLocaleDateString('en-US')}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3 text-gray-700">Submitted Documents</h3>
                <div className="space-y-2">
                  {userData.foreignTeacher.cvUrl && (
                    <a
                      href={userData.foreignTeacher.cvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                    >
                      <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-medium text-indigo-900">CV (Curriculum Vitae)</p>
                        <p className="text-xs text-indigo-600">Click to view</p>
                      </div>
                      <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {userData.foreignTeacher.passportPhotoUrl && (
                    <a
                      href={userData.foreignTeacher.passportPhotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors border border-green-200"
                    >
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-medium text-green-900">Passport Photo</p>
                        <p className="text-xs text-green-600">Click to view</p>
                      </div>
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {userData.foreignTeacher.foreignIdCardUrl && (
                    <a
                      href={userData.foreignTeacher.foreignIdCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                    >
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                      </svg>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-medium text-amber-900">Foreign Resident ID Card</p>
                        <p className="text-xs text-amber-600">Click to view</p>
                      </div>
                      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {!userData.foreignTeacher.cvUrl && !userData.foreignTeacher.passportPhotoUrl && !userData.foreignTeacher.foreignIdCardUrl && (
                    <p className="text-sm text-gray-500 py-2">No documents submitted.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SMIS 캠프 참여 이력 - 원어민은 숨기기 */}
        {!isForeign && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <button
            onClick={() => setJobCodesExpanded(!jobCodesExpanded)}
            className="w-full border-b px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold">
                {userData.role === 'admin' ? '전체 캠프 코드' : 'SMIS 캠프 참여 이력'}
              </h2>
              {jobCodes.length > 0 && (
                <span className="text-gray-500 text-sm font-semibold flex-shrink-0 ml-2">
                  {jobCodesExpanded ? '▼' : '▶'}
                </span>
              )}
            </div>
            {!jobCodesExpanded && jobCodes.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {jobCodes.slice(0, 10).map((job) => (
                  <span
                    key={job.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold whitespace-nowrap"
                  >
                    {job.code}
                  </span>
                ))}
                {jobCodes.length > 10 && (
                  <span className="text-xs px-2 py-0.5 text-gray-500">
                    +{jobCodes.length - 10}
                  </span>
                )}
              </div>
            )}
          </button>
          
          {jobCodesExpanded && (
            <div className="px-4 sm:px-6 py-4">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : jobCodes.length === 0 ? (
                <p className="text-gray-500 text-center py-4">등록된 참여 이력이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {jobCodes.map((job) => {
                    const exp = userData?.jobExperiences?.find(exp => exp.id === job.id);
                    const isActive = userData?.activeJobExperienceId === job.id;
                    return (
                      <button
                        key={job.id as string}
                        onClick={() => handleJobCodeSelect(job.id as string)}
                        disabled={changingJobCode || isActive}
                        className={`w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-1.5 px-2.5 rounded-lg transition-all ${
                          isActive 
                            ? 'bg-blue-50 border-2 border-blue-200 cursor-default' 
                            : 'border border-gray-200 hover:bg-gray-50 hover:border-gray-300 cursor-pointer'
                        } ${changingJobCode && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="hidden sm:block flex-shrink-0 min-w-0 font-medium text-gray-900 text-sm">
                          {job.generation} {job.name}
                        </div>
                        {/* 모바일: 양쪽 정렬로 활성 뱃지 오른쪽 */}
                        <div className="flex justify-between sm:hidden items-center gap-x-1.5 flex-wrap">
                          <div className="flex gap-x-1.5 flex-wrap">
                            {job.code && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold">
                                {job.code}
                              </span>
                            )}
                            {exp?.groupRole && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                                {exp.groupRole}
                              </span>
                            )}
                            {exp?.classCode && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                                {exp.classCode}
                              </span>
                            )}
                          </div>
                          {isActive && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold flex-shrink-0">
                              활성
                            </span>
                          )}
                        </div>
                        {/* 데스크탑: 활성 뱃지 맨 앞 */}
                        <div className="hidden sm:flex items-center gap-x-1.5 flex-wrap">
                          {isActive && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold flex-shrink-0">
                              활성
                            </span>
                          )}
                          {job.code && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold">
                              {job.code}
                            </span>
                          )}
                          {exp?.groupRole && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                              {exp.groupRole}
                            </span>
                          )}
                          {exp?.classCode && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                              {exp.classCode}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* 개인 정보 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">{isForeign ? 'Personal Information' : '개인 정보'}</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userData.age && (
                <div>
                  <p className="text-sm text-gray-500">{isForeign ? 'Age' : '나이'}</p>
                  <p>{userData.age}{isForeign ? ' years old' : '세'}</p>
                </div>
              )}
              {userData.gender && (
                <div>
                  <p className="text-sm text-gray-500">{isForeign ? 'Gender' : '성별'}</p>
                  <p>{isForeign ? (userData.gender === 'M' ? 'Male' : 'Female') : (userData.gender === 'M' ? '남성' : '여성')}</p>
                </div>
              )}
              {userData.phoneNumber && (
                <div>
                  <p className="text-sm text-gray-500">{isForeign ? 'Phone Number' : '연락처'}</p>
                  <p>{formatPhoneNumber(userData.phoneNumber)}</p>
                </div>
              )}
              {userData.address && (
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">{isForeign ? 'Address' : '주소'}</p>
                  <p>{userData.address} {userData.addressDetail}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 학교 정보 섹션 - 원어민은 숨기기 */}
        {!isForeign && userData.university && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b px-4 sm:px-6 py-3">
              <h2 className="text-lg font-semibold">학교 정보</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">학교</p>
                  <p>{userData.university}</p>
                </div>
                {userData.grade && (
                  <div>
                    <p className="text-sm text-gray-500">학년</p>
                    <p>
                      {userData.grade === 6 ? '졸업생' : `${userData.grade}학년`}
                      {userData.isOnLeave ? ' (휴학 중)' : ''}
                    </p>
                  </div>
                )}
                {userData.major1 && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">전공</p>
                    <p>
                      {userData.major1}
                      {userData.major2 ? ` / ${userData.major2}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 알바 & 멘토링 경력 섹션 - 원어민은 숨기기 */}
        {!isForeign && userData.partTimeJobs && userData.partTimeJobs.length > 0 && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b px-4 sm:px-6 py-3">
              <h2 className="text-lg font-semibold">알바 & 멘토링 경력</h2>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                {userData.partTimeJobs.map((job, index) => (
                  <div key={index} className="border rounded-md p-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{job.companyName}</h3>
                        <p className="text-sm text-blue-600">{job.position}</p>
                      </div>
                      <div className="text-sm text-gray-500 mt-1 sm:mt-0">{job.period}</div>
                    </div>
                    {job.description && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-700">{job.description}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 자기소개 & 지원동기 - 원어민은 숨기기 */}
        {!isForeign && (userData.selfIntroduction || userData.jobMotivation) && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b px-4 sm:px-6 py-3">
              <h2 className="text-lg font-semibold">자기소개 & 지원동기</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              {userData.selfIntroduction && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">자기소개</p>
                  <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                    {userData.selfIntroduction}
                  </p>
                </div>
              )}
              {userData.jobMotivation && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">지원동기</p>
                  <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                    {userData.jobMotivation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 소셜 계정 연동 관리 */}
        {userData.authProviders && userData.authProviders.length > 0 ? (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="px-4 sm:px-6 py-4">
              <LinkedAccountsDisplay
                authProviders={userData.authProviders}
                onUnlink={handleUnlink}
                onLink={handleLink}
                isUnlinking={isUnlinking}
                isLinking={isLinking}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="px-4 sm:px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">현재 연동된 계정</h3>
              <p className="text-sm text-gray-500">연동된 소셜 계정이 없습니다.</p>
            </div>
          </div>
        )}
        
        {/* 회원 탈퇴 섹션 */}
        <div className="mt-8 mb-12 text-center">
          <button
            onClick={() => setShowDeactivateModal(true)}
            className="text-red-500 text-sm underline hover:text-red-700"
          >
            {isForeign ? 'Delete Account' : '회원 탈퇴'}
          </button>
        </div>
        </div>
      </Layout>
      
      {/* 회원 탈퇴 확인 모달 */}
      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {isForeign ? 'Confirm Account Deletion' : '회원 탈퇴 확인'}
            </h3>
            <p className="text-gray-700 mb-4">
              {isForeign
                ? 'Are you sure you want to delete your account? After deletion, you will not be able to log in with the same email, and all account information will be deactivated.'
                : '정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴 후에는 동일한 이메일로 다시 로그인할 수 없으며, 모든 계정 정보가 비활성화됩니다.'}
            </p>
            <p className="text-gray-700 mb-6 text-sm">
              {isForeign
                ? 'If necessary, you can recover your account through the administrator.'
                : '필요한 경우 관리자를 통해 계정을 복구할 수 있습니다.'}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeactivateModal(false)}
                disabled={deactivating}
              >
                {isForeign ? 'Cancel' : '취소'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeactivateAccount}
                isLoading={deactivating}
              >
                {isForeign ? 'Delete' : '탈퇴하기'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
