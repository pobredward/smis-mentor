'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getReviewById, updateReview } from '@/lib/firebaseService';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Review } from '@/types';
import Header from '@/components/common/Header';

// 리치 텍스트 에디터 동적 임포트 (SSR 방지)
const RichTextEditor = dynamic(() => import('@/components/common/RichTextEditor'), {
  ssr: false,
});

interface EditReviewFormProps {
  reviewId: string;
}

export default function EditReviewForm({ reviewId }: EditReviewFormProps) {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [generation, setGeneration] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 로그인 및 관리자 권한 확인
    if (!currentUser) {
      router.push('/sign-in?redirect=/reviews/edit/' + reviewId);
    } else if (userData && userData.role !== 'admin') {
      router.push('/reviews');
    } else {
      fetchReview();
    }
  }, [currentUser, userData, router, reviewId]);

  const fetchReview = async () => {
    try {
      setIsLoading(true);
      const reviewData = await getReviewById(reviewId) as Review;
      
      if (!reviewData) {
        setError('후기를 찾을 수 없습니다.');
        return;
      }
      
      setTitle(reviewData.title || '');
      
      // 수정 모드에서도 줄바꿈이 동일하게 보이도록 처리
      const processedContent = (reviewData.content || '')
        .replace(/<p><br><\/p>\s*<p><br><\/p>/g, '<p><br></p><p><br></p>');
      setContent(processedContent);
      
      setGeneration(reviewData.generation || '');
    } catch (err) {
      console.error('후기를 불러오는 중 오류가 발생했습니다:', err);
      setError('후기를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim() || !generation.trim()) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    if (!currentUser || !userData || userData.role !== 'admin') {
      setError('관리자만 후기를 수정할 수 있습니다.');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // content에서 줄바꿈이 유지되도록 처리
      // 단일 빈 줄(<p></p>)은 <p><br></p>로 변환하되, 연속된 여러 개는 그대로 유지
      const processedContent = content
        .replace(/<p><\/p>/g, '<p><br></p>')
        .replace(/<p><br><\/p>\s*<p><br><\/p>/g, '<p><br></p><p><br></p>');
      
      await updateReview(reviewId, {
        title,
        content: processedContent,
        generation,
      });
      
      router.push('/reviews');
    } catch (err) {
      console.error('후기 수정 중 오류가 발생했습니다:', err);
      setError('후기 수정 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-8">후기 수정</h1>
          <div className="animate-pulse">
            <div className="h-12 bg-gray-200 rounded-md mb-4"></div>
            <div className="h-8 bg-gray-200 rounded-md mb-4"></div>
            <div className="h-64 bg-gray-200 rounded-md mb-4"></div>
          </div>
        </div>
      </>
    );
  }

  if (!currentUser || !userData) {
    return (
      <>
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-8">후기 수정</h1>
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-yellow-800">
            로그인 후 이용해주세요.
          </div>
        </div>
      </>
    );
  }

  if (userData.role !== 'admin') {
    return (
      <>
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-8">후기 수정</h1>
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-yellow-800">
            관리자만 후기를 수정할 수 있습니다.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">후기 수정</h1>
          <Link
            href="/reviews"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
          >
            취소
          </Link>
        </div>

        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              제목
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="후기 제목을 입력하세요"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="generation" className="block text-sm font-medium text-gray-700 mb-1">
              기수
            </label>
            <input
              type="text"
              id="generation"
              value={generation}
              onChange={(e) => setGeneration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="기수를 입력하세요 (예: 25기)"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
              내용
            </label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="후기 내용을 작성하세요"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={isSubmitting}
            >
              {isSubmitting ? '수정 중...' : '후기 수정'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
} 