'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Review } from '@/types';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/common/Header';
import { deleteReview } from '@/lib/firebaseService';
import { useRouter } from 'next/navigation';

interface ReviewWithId extends Review {
  isOpen?: boolean;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { currentUser, userData } = useAuth();
  const router = useRouter();

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const reviewsQuery = query(
        collection(db, 'reviews'),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(reviewsQuery);
      const reviewsData = querySnapshot.docs.map((doc) => ({
        ...(doc.data() as Review),
        id: doc.id,
        isOpen: false,
      }));
      setReviews(reviewsData);
    } catch (err) {
      console.error('후기를 불러오는 중 오류가 발생했습니다:', err);
      setError('후기를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const toggleReview = (id: string) => {
    setReviews(reviews.map(review => 
      review.id === id 
        ? { ...review, isOpen: !review.isOpen } 
        : review
    ));
  };

  const handleEdit = (id: string) => {
    router.push(`/reviews/edit/${id}`);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('정말로 이 후기를 삭제하시겠습니까?')) {
      try {
        setIsDeleting(true);
        await deleteReview(id);
        await fetchReviews();
      } catch (err) {
        console.error('후기 삭제 중 오류가 발생했습니다:', err);
        alert('후기 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-8">멘토 참여 후기</h1>
          <div className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded-md mb-4"></div>
            <div className="h-16 bg-gray-200 rounded-md mb-4"></div>
            <div className="h-16 bg-gray-200 rounded-md mb-4"></div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-8">멘토 참여 후기</h1>
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            {error}
          </div>
        </div>
      </>
    );
  }

  // 기수별로 그룹화
  const reviewsByGeneration: { [key: string]: ReviewWithId[] } = {};
  reviews.forEach((review) => {
    if (!reviewsByGeneration[review.generation]) {
      reviewsByGeneration[review.generation] = [];
    }
    reviewsByGeneration[review.generation].push(review);
  });

  // 기수 내림차순으로 정렬 (26기, 25기, 24기 순)
  const sortedGenerations = Object.keys(reviewsByGeneration).sort((a, b) => {
    // 기수 번호만 추출 (예: "25기" -> 25)
    const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
    const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
    return numB - numA; // 내림차순 정렬
  });

  return (
    <>
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">멘토 참여 후기</h1>
          {currentUser && userData?.role === 'admin' && (
            <Link
              href="/reviews/add"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              후기 작성
            </Link>
          )}
        </div>
        
        {Object.keys(reviewsByGeneration).length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500">아직 등록된 후기가 없습니다.</p>
          </div>
        ) : (
          sortedGenerations.map((generation) => (
            <div key={generation} className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">{generation}</h2>
              <div className="space-y-4">
                {reviewsByGeneration[generation].map((review) => (
                  <div key={review.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div 
                      className="flex justify-between items-center px-6 py-4 bg-gray-50 cursor-pointer"
                    >
                      <div 
                        className="flex-1"
                        onClick={() => toggleReview(review.id)}
                      >
                        <h3 className="text-lg font-medium text-gray-900">
                          {review.title}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        {currentUser && userData?.role === 'admin' && (
                          <>
                            <button
                              onClick={() => handleEdit(review.id)}
                              className="p-1 text-blue-600 hover:text-blue-800"
                              disabled={isDeleting}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.486 8.486-2.828-2.828 8.486-8.486z" />
                                <path fillRule="evenodd" d="M2 16.5V14l2-2h2.5L2 16.5z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(review.id)}
                              className="p-1 text-red-600 hover:text-red-800"
                              disabled={isDeleting}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => toggleReview(review.id)}
                          className="p-1"
                        >
                          <svg 
                            className={`h-5 w-5 text-gray-500 transform transition-transform ${review.isOpen ? 'rotate-180' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {review.isOpen && (
                      <div className="px-6 py-4 bg-white">
                        <div className="prose max-w-none whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: review.content }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
} 