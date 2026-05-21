'use client';

import { useEffect } from 'react';
import type { PersonalTask, TaskCategory } from '@smis-mentor/shared';
import { formatTime, formatDuration } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';

interface PersonalTaskDetailModalProps {
  task: PersonalTask;
  category?: TaskCategory;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export default function PersonalTaskDetailModal({
  task,
  category,
  onClose,
  onEdit,
  onDelete,
}: PersonalTaskDetailModalProps) {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const taskDate = task.date.toDate();
  const dateStr = taskDate.toLocaleDateString(isForeign ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  const accentColor = category?.color ?? '#7c3aed';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900">{isForeign ? 'Personal Task Detail' : '개인 업무 상세'}</span>
            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
              {isForeign ? 'Only you' : '나만 보임'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={isForeign ? 'Close' : '닫기'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 제목 + 완료 상태 */}
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex-shrink-0 w-5 h-5"
              aria-label={isForeign ? (task.isCompleted ? 'Completed' : 'Not completed') : (task.isCompleted ? '완료됨' : '미완료')}
            >
              {task.isCompleted ? (
                <svg className="w-5 h-5" style={{ color: accentColor }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.232l-4.243-4.243 1.414-1.414 2.829 2.829 5.656-5.657 1.414 1.415-7.07 7.07z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                </svg>
              )}
            </div>
            <div>
              {category && (
                <span
                  className="inline-block text-[11px] px-2 py-0.5 rounded font-semibold mb-1.5"
                  style={{ backgroundColor: `${category.color}22`, color: category.color }}
                >
                  {category.name}
                </span>
              )}
              <h4
                className={`text-base font-bold leading-snug ${
                  task.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
                }`}
              >
                {task.title}
              </h4>
            </div>
          </div>

          {/* 날짜 & 시간 */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{dateStr}</span>
            </div>
            {timeStr && (
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium" style={{ color: accentColor }}>{timeStr}</span>
                {durationStr && (
                  <span className="text-gray-500 text-xs">({durationStr})</span>
                )}
              </div>
            )}
            {!timeStr && durationStr && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{isForeign ? `Est. duration: ${durationStr}` : `예상 소요시간: ${durationStr}`}</span>
              </div>
            )}
          </div>

          {/* 메모 */}
          {task.description && (
            <div>
              <h5 className="text-xs font-semibold text-gray-500 mb-1.5">{isForeign ? 'Note' : '메모'}</h5>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">
                {task.description}
              </p>
            </div>
          )}

          {/* 완료 상태 배지 */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              task.isCompleted
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {task.isCompleted ? (
              <>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {isForeign ? 'Completed' : '완료됨'}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                </svg>
                {isForeign ? 'Not completed' : '미완료'}
              </>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            {isForeign ? 'Edit' : '수정'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            {isForeign ? 'Delete' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
