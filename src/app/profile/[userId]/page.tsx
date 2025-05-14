'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getUserById, getUserJobCodesInfo } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { User, JobCode, JobCodeWithId } from '@/types';

export default function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const router = useRouter();
  const { userId } = use(params);
  const [user, setUser] = useState<User | null>(null);
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await getUserById(userId);
        if (!userData) {
          setError('사용자를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        setUser(userData as unknown as User);

        if (userData.jobExperiences && userData.jobExperiences.length > 0) {
          const jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
          setJobCodes(jobCodesInfo);
        }
      } catch (error) {
        console.error('사용자 정보 불러오기 오류:', error);
        setError('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-8">
          <h1 className="text-2xl font-bold mb-4">로딩 중...</h1>
          <p className="text-gray-600">사용자 정보를 불러오는 중입니다.</p>
        </div>
      </Layout>
    );
  }

  if (error || !user) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-8">
          <h1 className="text-2xl font-bold mb-4">오류</h1>
          <p className="text-gray-600 mb-6">{error || '사용자를 찾을 수 없습니다.'}</p>
          <Button
            variant="primary"
            onClick={() => router.push('/')}
          >
            홈으로 돌아가기
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{user.name}님의 프로필</h1>
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            뒤로 가기
          </Button>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4">
            <div className="flex items-center">
              {user.profileImage ? (
                <img
                  src={user.profileImage}
                  alt={user.name}
                  className="w-20 h-20 object-cover object-center rounded-md border border-gray-300 mr-4"
                  style={{ aspectRatio: '1 / 1' }}
                />
              ) : (
                <div className="w-20 h-20 bg-gray-300 rounded-md flex items-center justify-center mr-4">
                  <span className="text-gray-600 text-xl font-bold">{user.name.charAt(0)}</span>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-gray-600">{user.email}</p>
                <p className="text-gray-600">{user.phoneNumber}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4">
            <h3 className="text-lg font-bold mb-4">참여 업무 내역</h3>
            {jobCodes.length > 0 ? (
              <div className="space-y-2">
                {jobCodes.map((jobCode) => {
                  const jobId = (jobCode as JobCodeWithId).id || jobCode.code;
                  const exp = user?.jobExperiences?.find(exp => exp.id === jobId);
                  const groupRole = exp?.groupRole;
                  const classCode = exp?.classCode;
                  return (
                    <div key={jobId} className="p-3 border rounded-md">
                      <div className="flex items-center mb-1">
                        <p className="font-semibold">{jobCode.name}</p>
                        {jobCode.group && (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                            jobCode.group === 'junior' ? 'bg-green-100 text-green-800' :
                            jobCode.group === 'middle' ? 'bg-yellow-100 text-yellow-800' :
                            jobCode.group === 'senior' ? 'bg-red-100 text-red-800' :
                            jobCode.group === 'spring' ? 'bg-blue-100 text-blue-800' :
                            jobCode.group === 'summer' ? 'bg-purple-100 text-purple-800' :
                            jobCode.group === 'autumn' ? 'bg-orange-100 text-orange-800' :
                            jobCode.group === 'winter' ? 'bg-pink-100 text-pink-800' :
                            jobCode.group === 'common' ? 'bg-gray-100 text-gray-800' :
                            jobCode.group === 'manager' ? 'bg-gray-100 text-black-800' :
                            'bg-black-100 text-black-800'
                          }`}>
                            {jobCode.group === 'junior' ? '주니어' :
                             jobCode.group === 'middle' ? '미들' :
                             jobCode.group === 'senior' ? '시니어' :
                             jobCode.group === 'spring' ? '스프링' :
                             jobCode.group === 'summer' ? '서머' :
                             jobCode.group === 'autumn' ? '어텀' :
                             jobCode.group === 'winter' ? '윈터' :
                             jobCode.group === 'common' ? '공통' :
                             '매니저'}
                          </span>
                        )}
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">{groupRole || '미지정'}</span>
                        {classCode && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{classCode}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{jobCode.generation}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(jobCode.startDate.seconds * 1000).toLocaleDateString()} ~ 
                        {new Date(jobCode.endDate.seconds * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-600">참여한 업무 내역이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
} 