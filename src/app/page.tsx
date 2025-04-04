import React from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import JobBoardSection from '@/components/home/JobBoardSection';
import ApplicationSection from '@/components/home/ApplicationSection';
import AdminDashboardButton from '@/components/home/AdminDashboardButton';
import { getBestReviews } from '@/lib/firebaseService';
import { Review } from '@/types';
import { formatDate } from '@/utils/dateUtils';

// getBestReviews API 호출로 반환되는 확장된 Review 타입
interface ExtendedReview extends Review {
  reviewId: string;
  rating: number;
  writer: string;
}

async function ReviewsSection() {
  // 서버 컴포넌트에서 데이터 가져오기
  const reviews = await getBestReviews(3) as ExtendedReview[];

  return (
    <div className="bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
            멘토링 참여 후기
          </h2>
          <Link
            href="/reviews"
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            더 보기
            <svg className="ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        
        {reviews.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">아직 등록된 후기가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((review) => (
              <Link
                href="/reviews"
                key={review.reviewId}
                className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow duration-200"
              >
                <div className="flex items-start mb-4">
                  {/* <div className="bg-blue-100 rounded-full p-2 mr-4">
                    <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                    </svg>
                  </div> */}
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-2">{review.title}</h3>
                  </div>
                  
                </div>

                <p className="text-gray-700 mb-4 line-clamp-3">{review.content.replace(/<[^>]*>/g, '')}</p>
                
                {/* <div className="flex items-center text-sm text-gray-500">
                  <svg className="h-4 w-4 text-yellow-400 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                  </svg>
                </div> */}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Layout>
      {/* 관리자 대시보드 바로가기 버튼 */}
      <AdminDashboardButton />
      
      {/* JobBoard 섹션 */}
      <JobBoardSection />
      
      {/* 지원 현황 섹션 */}
      <ApplicationSection />
      
      {/* 후기 섹션 */}
      <ReviewsSection />
    </Layout>
  );
}
