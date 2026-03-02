import React from 'react';
import EditReviewForm from './EditReviewForm';

// 서버 컴포넌트
export default function EditReviewPage({ params }: { params: { id: string } }) {
  return <EditReviewForm reviewId={params.id} />;
} 