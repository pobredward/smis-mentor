'use client';

import { useEffect } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 오류를 콘솔에 로깅합니다
    console.error('관리자 페이지 오류:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                관리자 페이지 오류 발생
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                <p>페이지를 로드하는 중 오류가 발생했습니다.</p>
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-md overflow-auto">
                    <pre className="text-xs">{error.message}</pre>
                    {error.stack && <pre className="mt-2 text-xs">{error.stack}</pre>}
                  </div>
                )}
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
} 