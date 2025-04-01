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
  const { userData } = useAuth();
  const router = useRouter();
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    const fetchJobCodes = async () => {
      if (userData?.jobExperiences && userData.jobExperiences.length > 0) {
        try {
          const jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
          setJobCodes(jobCodesInfo);
        } catch (error) {
          console.error('업무 정보 불러오기 오류:', error);
        }
      }
      setLoading(false);
    };

    fetchJobCodes();
  }, [userData]);

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

  if (!userData) {
    return (
      <Layout requireAuth>
        <div className="max-w-2xl mx-auto text-center py-8">
          <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
          <p className="text-gray-600 mb-6">프로필 정보를 보려면 로그인해 주세요.</p>
          <Button
            variant="primary"
            onClick={() => router.push('/sign-in')}
          >
            로그인
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">내 프로필</h1>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">

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
                <div className="w-20 h-20 bg-gray-300 rounded-md flex items-center justify-center mb-4 sm:mb-0 sm:mr-4 mx-auto sm:mx-0">
                  <span className="text-gray-600 text-xl font-bold">{userData.name.charAt(0)}</span>
                </div>
              )}
              <div className="text-center sm:text-left">
                <h2 className="text-xl font-bold mb-1">{userData.name}</h2>
                <p className="text-gray-600 mb-1">{userData.email}</p>
                <p className="text-gray-600">{userData.phoneNumber}</p>
              </div>
            </div>
          </div>
        </div>

          <div className="px-6 py-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">상세 정보</h3>
              <Button
                variant="outline"
                onClick={() => router.push('/profile/edit?section=personal')}
                className="text-sm px-3 py-1.5"
              >
                수정
              </Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">이름</p>
                  <p>{userData.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">나이</p>
                  <p>{userData.age}세</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">이메일</p>
                  <p>{userData.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">성별</p>
                  <p>{userData.gender === 'M' ? '남성' : userData.gender === 'F' ? '여성' : '미지정'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">주소</p>
                  <p>{userData.address} {userData.addressDetail}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">주민등록번호</p>
                  <p>{userData.rrnFront}-*******</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">지원 경로</p>
                  <p>{userData.referralPath || '정보 없음'}</p>
                </div>
                {userData.referrerName && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">추천인</p>
                    <p>{userData.referrerName}</p>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">자기소개</p>
                <p className="p-3 bg-gray-50 rounded min-h-[100px]">
                  {userData.selfIntroduction || '자기소개서를 작성해주세요'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">지원 동기</p>
                <p className="p-3 bg-gray-50 rounded min-h-[100px]">
                  {userData.jobMotivation || '지원 동기를 작성해주세요'}
                </p>
              </div>
            </div>
          </div>
        </div>
        

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">SMIS 캠프 참여 이력</h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : jobCodes.length === 0 ? (
              <p className="text-gray-500 text-center py-4">등록된 참여 이력이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {jobCodes.map((job) => (
                  <div key={job.id as string} className="">
                    <div className="flex flex-col flex-row justify-between mb-2">
                      <div className="flex text-sm items-center">
                        <h3 className="text-gray-900">{job.name}</h3>
                        
                      </div>
                      {job.group && (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                            job.group === 'junior' ? 'bg-green-100 text-green-800' :
                            job.group === 'middle' ? 'bg-yellow-100 text-yellow-800' :
                            job.group === 'senior' ? 'bg-red-100 text-red-800' :
                            job.group === 'spring' ? 'bg-blue-100 text-blue-800' :
                            job.group === 'summer' ? 'bg-purple-100 text-purple-800' :
                            job.group === 'autumn' ? 'bg-orange-100 text-orange-800' :
                            job.group === 'winter' ? 'bg-pink-100 text-pink-800' :
                            job.group === 'common' ? 'bg-gray-100 text-gray-800' :
                            job.group === 'manager' ? 'bg-gray-100 text-black-800' :
                            'bg-gray-100 text-black-800'
                          }`}>
                            {job.group === 'junior' ? '주니어' :
                             job.group === 'middle' ? '미들' : 
                             job.group === 'senior' ? '시니어' :
                             job.group === 'spring' ? '스프링' :
                             job.group === 'summer' ? '서머' :
                             job.group === 'autumn' ? '어텀' :
                             job.group === 'winter' ? '윈터' :
                             job.group === 'common' ? '공통' :
                             '매니저'}
                          </span>
                        )}
                      {/* <span className="text-sm text-gray-500">{job.code}</span> */}
                    </div>
                    {/* <p className="text-sm text-gray-600">{job.generation}</p> */}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* 학교 정보 섹션 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3 flex justify-between items-center">
            <h2 className="text-lg font-semibold">학교 정보</h2>
            <Button
              variant="outline"
              onClick={() => router.push('/profile/edit?section=education')}
              className="text-sm px-3 py-1.5"
            >
              수정
            </Button>
          </div>
          <div className="px-6 py-4">
            {!userData.university ? (
              <p className="text-gray-500 text-center py-4">학교 정보를 추가해주세요</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">학교</p>
                    <p>{userData.university}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">학년</p>
                    <p>{userData.grade}학년 {userData.isOnLeave ? '(휴학중)' : ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">전공 (1전공)</p>
                    <p>{userData.major1 || '정보 없음'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">전공 (2전공/부전공)</p>
                    <p>{userData.major2 || '없음'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 알바 & 멘토링 경력 섹션 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3 flex justify-between items-center">
            <h2 className="text-lg font-semibold">알바 & 멘토링 경력</h2>
            <Button
              variant="outline"
              onClick={() => router.push('/profile/edit?section=experience')}
              className="text-sm px-3 py-1.5"
            >
              수정
            </Button>
          </div>
          <div className="px-6 py-4">
            {!userData.partTimeJobs || userData.partTimeJobs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">경력을 추가해주세요</p>
            ) : (
              <div className="space-y-4">
                {userData.partTimeJobs.map((job, index) => (
                  <div key={index} className="border rounded-md p-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{job.companyName}</h3>
                        <p className="text-sm text-gray-600">{job.position}</p>
                      </div>
                      <div className="text-sm text-gray-500 mt-1 sm:mt-0">{job.period}</div>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-gray-700">{job.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        
        
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
      
      {/* 회원 탈퇴 확인 모달 */}
      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">회원 탈퇴 확인</h3>
            <p className="text-gray-700 mb-6">
              정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴 후에도 가입 정보는 관리자가 확인할 수 있으며, 원하시면 추후 계정 복구가 가능합니다.
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
    </Layout>
  );
} 