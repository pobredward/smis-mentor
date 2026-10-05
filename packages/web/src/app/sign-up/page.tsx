'use client';

import { useRouter } from 'next/navigation';
import Layout from '@/components/common/Layout';
import { FaGraduationCap, FaGlobe, FaUserFriends } from 'react-icons/fa';

export default function SignUpRoleSelection() {
  const router = useRouter();

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-3">회원가입</h1>
        <p className="text-gray-600 text-center mb-10">
          어떤 역할로 가입하시겠습니까?
        </p>

        <div className="flex gap-4">
          {/* 멘토 버튼 */}
          <button
            onClick={() => router.push('/sign-up/mentor')}
            className="flex-1 bg-white shadow-lg rounded-xl p-6 hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-blue-500 group"
          >
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <FaGraduationCap className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">대학생 멘토</h2>
            </div>
          </button>

          {/* 원어민 버튼 */}
          <button
            onClick={() => router.push('/sign-up/foreign')}
            className="flex-1 bg-white shadow-lg rounded-xl p-6 hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-green-500 group"
          >
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
                <FaGlobe className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Foreign Teacher</h2>
            </div>
          </button>
        </div>

        {/* 학부모 — 캠프 참가 학생의 보호자 */}
        <button
          onClick={() => router.push('/sign-up/parent')}
          className="mt-4 w-full bg-white shadow-lg rounded-xl p-5 hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-orange-400 group flex items-center justify-center gap-4"
        >
          <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center group-hover:bg-orange-100 transition-colors">
            <FaUserFriends className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">학부모</h2>
        </button>

        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/sign-in')}
            className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </Layout>
  );
}
