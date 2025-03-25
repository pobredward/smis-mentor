'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserJobCodesInfo } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { JobCode } from '@/types';

export default function ProfilePage() {
  const { userData } = useAuth();
  const router = useRouter();
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-0">내 프로필</h1>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <Button
              variant="outline"
              onClick={() => router.push('/profile/edit')}
              className="w-full sm:w-auto"
            >
              프로필 수정
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push('/profile/job-apply')}
              className="w-full sm:w-auto"
            >
              지원 내역
            </Button>
          </div>
        </div>

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

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">업무 경력</h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : jobCodes.length === 0 ? (
              <p className="text-gray-500 text-center py-4">등록된 업무 경력이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {jobCodes.map((job) => (
                  <div key={job.id} className="border rounded-md p-3">
                    <div className="flex flex-col sm:flex-row sm:justify-between mb-2">
                      <div className="flex items-center">
                        <h3 className="font-medium text-gray-900">{job.name}</h3>
                        {job.group && (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                            job.group === 'junior' ? 'bg-green-100 text-green-800' :
                            job.group === 'middle' ? 'bg-yellow-100 text-yellow-800' :
                            job.group === 'senior' ? 'bg-red-100 text-red-800' :
                            job.group === 'spring' ? 'bg-blue-100 text-blue-800' :
                            job.group === 'summer' ? 'bg-purple-100 text-purple-800' :
                            job.group === 'autumn' ? 'bg-orange-100 text-orange-800' :
                            'bg-pink-100 text-pink-800'
                          }`}>
                            {job.group === 'junior' ? '주니어' :
                             job.group === 'middle' ? '미들' : 
                             job.group === 'senior' ? '시니어' :
                             job.group === 'spring' ? '스프링' :
                             job.group === 'summer' ? '서머' :
                             job.group === 'autumn' ? '어텀' :
                             '윈터'}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">{job.code}</span>
                    </div>
                    <p className="text-sm text-gray-600">{job.generation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4">
            <h3 className="text-lg font-bold mb-4">상세 정보</h3>
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
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">자기소개</p>
                <p className="p-3 bg-gray-50 rounded min-h-[100px]">
                  {userData.selfIntroduction || '자기소개가 없습니다.'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">지원 동기</p>
                <p className="p-3 bg-gray-50 rounded min-h-[100px]">
                  {userData.jobMotivation || '지원 동기가 없습니다.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 