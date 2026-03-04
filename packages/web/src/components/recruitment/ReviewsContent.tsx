'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Review } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { deleteReview, addReview, updateReview } from '@/lib/firebaseService';
import Button from '@/components/common/Button';

interface ReviewWithId extends Review {
  isOpen?: boolean;
}

// HTML을 일반 텍스트로 변환하는 함수
const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<p><br><\/p>/g, '\n')
    .replace(/<p>/g, '')
    .replace(/<\/p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
};

interface ReviewFormModalProps {
  review: ReviewWithId | null;
  onClose: () => void;
  onSave: () => void;
}

function ReviewFormModal({ review, onClose, onSave }: ReviewFormModalProps) {
  const { userData } = useAuth();
  const [title, setTitle] = useState(review?.title || '');
  const [generation, setGeneration] = useState(review?.generation || '');
  const [content, setContent] = useState(review?.content ? htmlToPlainText(review.content) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !generation.trim() || !content.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    if (!userData) {
      alert('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    try {
      setIsSubmitting(true);

      const processedContent = content
        .split('\n')
        .map(line => {
          const trimmedLine = line.trim();
          if (trimmedLine === '') {
            return '<p><br></p>';
          }
          return `<p>${trimmedLine}</p>`;
        })
        .join('');

      if (review) {
        await updateReview(review.id, {
          title,
          generation,
          content: processedContent,
        });
        alert('후기가 수정되었습니다.');
      } else {
        await addReview({
          title,
          generation,
          content: processedContent,
          author: {
            id: userData.userId,
            name: userData.name,
            profileImage: userData.profileImage || '',
          },
          jobCode: '',
        });
        alert('후기가 등록되었습니다.');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('후기 저장 오류:', error);
      alert('후기 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {review ? '후기 수정' : '후기 작성'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                제목 *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="후기 제목을 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                기수 *
              </label>
              <input
                type="text"
                value={generation}
                onChange={(e) => setGeneration(e.target.value)}
                placeholder="기수를 입력하세요 (예: 25기)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                내용 *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="후기 내용을 작성하세요&#10;&#10;• 줄바꿈은 자동으로 적용됩니다"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[300px] resize-none"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? '저장 중...' : review ? '수정' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReviewsContent() {
  const [reviews, setReviews] = useState<ReviewWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewWithId | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const { currentUser, userData } = useAuth();

  const isAdmin = userData?.role === 'admin';

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

  const handleAdd = () => {
    setEditingReview(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (review: ReviewWithId) => {
    setEditingReview(review);
    setIsFormModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('정말로 이 후기를 삭제하시겠습니까?')) {
      try {
        setIsDeleting(true);
        await deleteReview(id);
        await fetchReviews();
        alert('후기가 삭제되었습니다.');
      } catch (err) {
        console.error('후기 삭제 중 오류가 발생했습니다:', err);
        alert('후기 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleFormClose = () => {
    setIsFormModalOpen(false);
    setEditingReview(null);
  };

  const handleFormSave = () => {
    fetchReviews();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      </div>
    );
  }

  const reviewsByGeneration: { [key: string]: ReviewWithId[] } = {};
  reviews.forEach((review) => {
    if (!reviewsByGeneration[review.generation]) {
      reviewsByGeneration[review.generation] = [];
    }
    reviewsByGeneration[review.generation].push(review);
  });

  const sortedGenerations = Object.keys(reviewsByGeneration).sort((a, b) => {
    const numA = a.replace(/[^0-9]/g, '');
    const numB = b.replace(/[^0-9]/g, '');
    if (numA && numB) {
      return parseInt(numB, 10) - parseInt(numA, 10);
    }
    if (numA && !numB) return 1;
    if (!numA && numB) return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isAdmin && (
          <div className="mb-6">
            <Button variant="primary" onClick={handleAdd}>
              후기 작성
            </Button>
          </div>
        )}

        {sortedGenerations.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500">아직 등록된 후기가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedGenerations.map((generation) => (
              <div key={generation}>
                <h2 className="text-2xl font-semibold mb-4 text-gray-800">{generation}</h2>
                <div className="space-y-4">
                  {reviewsByGeneration[generation].map((review) => (
                    <div key={review.id} className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                      <div className="w-full px-6 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <button
                            onClick={() => toggleReview(review.id)}
                            className="flex-1 text-left"
                          >
                            <h3 className="text-base font-semibold text-gray-900 mb-1">{review.title}</h3>
                            {review.writer && (
                              <p className="text-sm text-gray-600">작성자: {review.writer}</p>
                            )}
                          </button>
                          <div className="flex items-center gap-2 ml-4">
                            {isAdmin && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEdit(review)}
                                  className="text-sm px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDelete(review.id)}
                                  className="text-sm px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                                  disabled={isDeleting}
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => toggleReview(review.id)}
                              className="p-1"
                            >
                              <svg
                                className={`w-5 h-5 text-gray-500 transition-transform ${
                                  review.isOpen ? 'transform rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {review.isOpen && (
                        <div className="px-6 pb-4 border-t border-gray-200">
                          <div 
                            className="mt-4 text-gray-700 [&_blockquote]:border-0 [&_blockquote]:pl-0 [&_blockquote]:italic-0 [&_blockquote]:font-normal [&_blockquote]:text-gray-700 [&_p]:mb-2 [&_p]:leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: review.content }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isFormModalOpen && (
        <ReviewFormModal
          review={editingReview}
          onClose={handleFormClose}
          onSave={handleFormSave}
        />
      )}
    </>
  );
}
