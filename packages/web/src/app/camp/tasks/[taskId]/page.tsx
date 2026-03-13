'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getTaskById, toggleTaskCompletion, deleteTask } from '@/lib/taskService';
import type { Task, JobExperienceGroupRole } from '@smis-mentor/shared/types/camp';
import { formatTime, formatDuration } from '@/lib/taskService';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params?.taskId as string;
  const { userData } = useAuth();
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    if (taskId) {
      loadTask();
    }
  }, [taskId]);

  useEffect(() => {
    if (userData?.activeJobExperienceId) {
      const activeExp = userData.jobExperiences?.find(
        exp => exp.id === userData.activeJobExperienceId
      );
      if (activeExp?.groupRole) {
        setCurrentGroupRole(activeExp.groupRole as JobExperienceGroupRole);
      }
    }
  }, [userData]);

  const loadTask = async () => {
    try {
      const taskData = await getTaskById(taskId);
      if (!taskData) {
        toast.error('업무를 찾을 수 없습니다.');
        router.push('/camp');
        return;
      }
      setTask(taskData);
    } catch (error) {
      console.error('업무 로드 오류:', error);
      toast.error('업무를 불러오는 중 오류가 발생했습니다.');
      router.push('/camp');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!task || !userData) return;

    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    try {
      await toggleTaskCompletion(task.id, userData.userId, userData.name, role);
      await loadTask();
      toast.success('업무 상태가 변경되었습니다.');
    } catch (error) {
      console.error('업무 완료 토글 오류:', error);
      toast.error('업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    
    if (confirm('정말 이 업무를 삭제하시겠습니까?')) {
      try {
        await deleteTask(task.id);
        toast.success('업무가 삭제되었습니다.');
        handleBack();
      } catch (error) {
        console.error('업무 삭제 오류:', error);
        toast.error('업무 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const handleBack = () => {
    // 업무의 날짜로 캠프 페이지로 이동
    if (task) {
      const date = task.date.toDate();
      const dateStr = date.toISOString().split('T')[0];
      router.push(`/camp?date=${dateStr}`);
    } else {
      router.push('/camp');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  const isCompleted = task.completions.some(c => c.userId === userData?.userId);
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  const linkAttachments = task.attachments?.filter(a => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter(a => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter(a => a.type !== 'link' && a.type !== 'image') || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">뒤로</span>
          </button>

          <div className="flex items-center gap-2">
            {/* 체크박스 */}
            <button
              onClick={handleToggleComplete}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isCompleted
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isCompleted ? '✓ 완료됨' : '완료 표시'}
            </button>

            {/* 관리자 메뉴 */}
            {isAdmin && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-8 space-y-6">
          {/* 제목 */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{task.title}</h1>
          </div>

          {/* 날짜 및 시간 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-lg">{dateStr}</span>
            </div>

            {timeStr && (
              <div className="flex items-center gap-3 text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-lg">{timeStr}</span>
                {durationStr && (
                  <span className="text-gray-500">({durationStr})</span>
                )}
              </div>
            )}
          </div>

          {/* 대상 역할 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-600 mb-3">대상 역할</h2>
            <div className="flex flex-wrap gap-2">
              {task.targetRoles.map(role => (
                <span
                  key={role}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>

          {/* 대상 그룹 */}
          {task.targetGroups && task.targetGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">대상 그룹</h2>
              <div className="flex flex-wrap gap-2">
                {task.targetGroups.map(group => (
                  <span
                    key={group}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                  >
                    {group}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 설명 */}
          {task.description && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">상세 설명</h2>
              <p className="text-base text-gray-700 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* 링크 */}
          {linkAttachments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">링크</h2>
              <div className="space-y-2">
                {linkAttachments.map((attachment, idx) => (
                  <a
                    key={idx}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <span className="text-xl">🔗</span>
                    <span className="flex-1 font-medium text-gray-700">
                      {attachment.label}
                    </span>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 이미지 */}
          {imageAttachments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">이미지</h2>
              <div className="space-y-4">
                {imageAttachments.map((attachment, idx) => (
                  <div key={idx}>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(attachment.url)}
                      className="block w-full"
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.label}
                        loading="lazy"
                        className="w-full rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                        style={{ maxHeight: '600px', objectFit: 'contain' }}
                      />
                    </button>
                    <p className="text-sm text-gray-500 mt-2">{attachment.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 기타 파일 */}
          {otherAttachments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">첨부파일</h2>
              <div className="space-y-2">
                {otherAttachments.map((attachment, idx) => (
                  <a
                    key={idx}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <span className="text-xl">
                      {attachment.type === 'video' && '🎥'}
                      {attachment.type === 'file' && '📎'}
                    </span>
                    <span className="flex-1 font-medium text-gray-700">
                      {attachment.label}
                    </span>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 완료 현황 (관리자) */}
          {isAdmin && task.completions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">
                완료 현황 ({task.completions.length}명)
              </h2>
              <div className="flex flex-wrap gap-2">
                {task.completions.map((completion, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                  >
                    {completion.userName} ({completion.userRole})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
          >
            ×
          </button>
          <img
            src={selectedImage}
            alt="확대 이미지"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
