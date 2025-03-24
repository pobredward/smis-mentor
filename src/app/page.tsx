"use client";

import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { currentUser } = useAuth();

  return (
    <Layout>
      <div className="relative bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
              SMIS MENTOR
            </h1> */}
            <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
              SMIS 멘토 지원 사이트입니다
            </p>
            <div className="mt-8 flex justify-center">
              {!currentUser ? (
                <div className="inline-flex rounded-md shadow">
                  <Link
                    href="/sign-in"
                    className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    지금 시작하기
                  </Link>
                </div>
              ) : (
                <div className="inline-flex rounded-md shadow">
                  <Link
                    href="/job-board"
                    className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    채용 공고 보기
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* <div className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-8">
              주요 기능
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-900 mb-3">간편한 채용 공고</h3>
                <p className="text-gray-600">
                  관리자는 손쉽게 채용 공고를 등록하고 관리할 수 있습니다.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-900 mb-3">효율적인 지원 프로세스</h3>
                <p className="text-gray-600">
                  지원자는 간편하게 지원하고 면접 일정을 선택할 수 있습니다.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-900 mb-3">통합 관리 시스템</h3>
                <p className="text-gray-600">
                  지원 상태 및 면접 결과를 실시간으로 확인하고 관리할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div> */}
      </div>
    </Layout>
  );
}
