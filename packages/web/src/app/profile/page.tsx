'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserJobCodesInfo, deactivateUser } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { JobCodeWithId } from '@/types';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function ProfilePage() {
  const { userData, currentUser, waitForAuthReady, refreshUserData, updateActiveJobCode } = useAuth();
  const router = useRouter();
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [jobCodesExpanded, setJobCodesExpanded] = useState(true);
  const [changingJobCode, setChangingJobCode] = useState(false);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        setAuthChecking(true);
        await waitForAuthReady();
        
        if (currentUser && !userData) {
          await refreshUserData();
        }

        setAuthChecking(false);
      } catch (error) {
        console.error('인증 상태 확인 오류:', error);
        setAuthChecking(false);
      }
    };

    checkAuthAndLoadData();
  }, [waitForAuthReady, currentUser, userData, refreshUserData]);

  useEffect(() => {
    const fetchJobCodes = async () => {
      if (userData?.jobExperiences && userData.jobExperiences.length > 0) {
        try {
          const jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
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

  return (
    <>
      <Layout requireAuth>
      <div className="max-w-2xl mx-auto lg:px-4 px-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">내 프로필</h1>
          <Button
            variant="primary"
            onClick={() => router.push('/profile/edit')}
            className="text-sm px-4 py-2"
          >
            수정
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
                {userData.phoneNumber && <p className="text-gray-600">{userData.phoneNumber}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* SMIS 캠프 참여 이력 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <button
            onClick={() => setJobCodesExpanded(!jobCodesExpanded)}
            className="w-full border-b px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold">SMIS 캠프 참여 이력</h2>
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

        {/* 개인 정보 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">개인 정보</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userData.age && (
                <div>
                  <p className="text-sm text-gray-500">나이</p>
                  <p>{userData.age}세</p>
                </div>
              )}
              {userData.gender && (
                <div>
                  <p className="text-sm text-gray-500">성별</p>
                  <p>{userData.gender === 'M' ? '남성' : '여성'}</p>
                </div>
              )}
              {userData.phoneNumber && (
                <div>
                  <p className="text-sm text-gray-500">연락처</p>
                  <p>{userData.phoneNumber}</p>
                </div>
              )}
              {userData.address && (
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">주소</p>
                  <p>{userData.address} {userData.addressDetail}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 학교 정보 섹션 */}
        {userData.university && (
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

        {/* 알바 & 멘토링 경력 섹션 */}
        {userData.partTimeJobs && userData.partTimeJobs.length > 0 && (
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

        {/* 자기소개 & 지원동기 */}
        {(userData.selfIntroduction || userData.jobMotivation) && (
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
        
        {/* 회원 탈퇴 섹션 */}
        <div className="mt-8 mb-12 text-center">
          <button
            onClick={() => setShowDeactivateModal(true)}
            className="text-red-500 text-sm underline hover:text-red-700"
          >
            회원 탈퇴
          </button>
        </div>
        </div>
      </Layout>
      
      {/* 회원 탈퇴 확인 모달 */}
      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">회원 탈퇴 확인</h3>
            <p className="text-gray-700 mb-4">
              정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴 후에는 동일한 이메일로 다시 로그인할 수 없으며, 모든 계정 정보가 비활성화됩니다.
            </p>
            <p className="text-gray-700 mb-6 text-sm">
              필요한 경우 관리자를 통해 계정을 복구할 수 있습니다.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeactivateModal(false)}
                disabled={deactivating}
              >
                취소
              </Button>
              <Button
                variant="danger"
                onClick={handleDeactivateAccount}
                isLoading={deactivating}
              >
                탈퇴하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
