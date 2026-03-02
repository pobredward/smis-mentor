'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getUserByPhone, getUserJobCodesInfo } from '@/lib/firebaseService';
import { JobCode } from '@/types';

export default function SignUpVerify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [userJobCodes, setUserJobCodes] = useState<JobCode[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showRejection, setShowRejection] = useState(false);

  const name = searchParams.get('name');
  const inputName = searchParams.get('inputName');
  const phoneNumber = searchParams.get('phone');

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (phoneNumber) {
        try {
          const user = await getUserByPhone(phoneNumber);
          if (user) {
            // jobExperiences 정보를 가져옴
            if (user.jobExperiences && user.jobExperiences.length > 0) {
              const jobCodesInfo = await getUserJobCodesInfo(user.jobExperiences);
              setUserJobCodes(jobCodesInfo);
            }
          }
        } catch (error) {
          console.error('사용자 정보 조회 오류:', error);
        }
      }
    };

    fetchUserInfo();
  }, [phoneNumber]);

  if (!name || !phoneNumber || !inputName) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">오류</h1>
          <p className="text-gray-600 mb-4">필수 정보가 누락되었습니다.</p>
          <Button
            variant="primary"
            onClick={() => router.push('/sign-up')}
          >
            회원가입으로 돌아가기
          </Button>
        </div>
      </Layout>
    );
  }

  const handleConfirm = () => {
    setIsLoading(true);
    setShowConfirmation(true);
    setTimeout(() => {
      router.push(`/sign-up/account?name=${name}&phone=${phoneNumber}`);
    }, 3000);
  };

  const handleDeny = () => {
    setIsLoading(true);
    setShowRejection(true);
    setTimeout(() => {
      router.push(`/sign-up/account?name=${inputName}&phone=${phoneNumber}`);
    }, 5000);
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <h1 className="text-xl font-bold mb-4 text-center">사용자 확인</h1>
          
          {!showConfirmation && !showRejection && (
            <div className="mb-6">
              <p className="text-gray-700 mb-2">
                환영합니다. 입력하신 휴대폰 번호({phoneNumber})는 이미 임시 사용자로 등록되어 있습니다.
              </p>
              
              {userJobCodes.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-md mb-4">
                  {userJobCodes.map((jobCode, index) => (
                    <p key={index} className="text-blue-700 mb-1">
                      {jobCode.generation} {jobCode.name}
                    </p>
                  ))}
                  <p className="text-gray-700 mt-3 font-medium">
                    위 업무에 참여하신 <span className="font-bold">{name}</span> 멘토가 맞습니까?
                  </p>
                </div>
              )}
              
              {userJobCodes.length === 0 && (
                <div className="mb-4">
                  <p className="text-gray-700 mb-2">
                    <span className="font-semibold">입력하신 이름:</span> {inputName}
                  </p>
                  <p className="text-gray-700 mb-2">
                    <span className="font-semibold">등록된 이름:</span> {name}
                  </p>
                  <p className="text-gray-700 bg-yellow-50 p-3 rounded-md">
                    등록된 <span className="font-bold">{name}</span>님이 맞습니까?
                  </p>
                </div>
              )}
            </div>
          )}

          {showConfirmation && (
            <div className="mb-6 bg-green-50 p-4 rounded-md">
              <p className="text-green-700 font-semibold">다시 돌아온 것을 환영합니다!</p>
              <p className="text-green-700 mt-2">회원가입을 이어서 진행해 주세요.</p>
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-700"></div>
              </div>
            </div>
          )}

          {showRejection && (
            <div className="mb-6 bg-yellow-50 p-4 rounded-md">
              <p className="text-yellow-700 font-semibold">관리자가 정보를 잘못 입력했네요.</p>
              <p className="text-yellow-700 mt-2">
                일단 회원가입을 이어서 진행하시고, 잘못된 정보는 관리자에게 카톡이나 문자 주시면 바로 수정하겠습니다.
              </p>
              <p className="text-yellow-700 mt-2 font-medium">
                관리자 번호: 010-7656-7933 신선웅
              </p>
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-700"></div>
              </div>
            </div>
          )}
          
          {!showConfirmation && !showRejection && (
            <div className="flex justify-between space-x-4">
              <Button
                variant="outline"
                fullWidth
                onClick={handleDeny}
                isLoading={isLoading}
              >
                아니오
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleConfirm}
                isLoading={isLoading}
              >
                예
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
} 