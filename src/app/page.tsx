import React from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import JobBoardSection from '@/components/home/JobBoardSection';
import ApplicationSection from '@/components/home/ApplicationSection';
import AdminDashboardButton from '@/components/home/AdminDashboardButton';
import { getBestReviews } from '@/lib/firebaseService';
import { Review } from '@/types';

// getBestReviews API 호출로 반환되는 확장된 Review 타입
interface ExtendedReview extends Review {
  reviewId: string;
  rating: number;
  writer: string;
}

async function ReviewsSection() {
  // 서버 컴포넌트에서 데이터 가져오기
  const allReviews = await getBestReviews(6) as ExtendedReview[];
  
  // "Best 후기" 기수만 필터링
  const reviews = allReviews.filter(review => review.generation === 'Best 후기');

  return (
    <div className="bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 mt-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((review) => (
              <Link
                href="/reviews"
                key={review.reviewId}
                className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow duration-200"
              >
                <div className="flex items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-2">{review.title}</h3>
                  </div>
                  
                </div>

                <p className="text-gray-700 mb-4 line-clamp-3">{review.content.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')}</p>
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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://www.smis-mentor.com" }
            ]
          },
          // 최신 공고 3개 JobPosting schema
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "E.G.G 영어캠프",
            "url": "https://www.smis-mentor.com/job-board/6XxTH28Nu6qi0hPoNaNV",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "SMIS 멘토 채용 플랫폼",
              "sameAs": "https://www.smis-mentor.com"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "발상 영어캠프",
            "url": "https://www.smis-mentor.com/job-board/NcwLxGHoLRX34uScQ9er",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "SMIS 멘토 채용 플랫폼",
              "sameAs": "https://www.smis-mentor.com"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "싱가포르&말레이시아 영어캠프",
            "url": "https://www.smis-mentor.com/job-board/7MQ6awgoebb5KQ4IpCgk",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "SMIS 멘토 채용 플랫폼",
              "sameAs": "https://www.smis-mentor.com"
            }
          }
        ])
      }} />
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
    </>
  );
}
