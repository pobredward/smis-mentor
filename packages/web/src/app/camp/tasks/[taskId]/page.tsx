'use client';
import { logger, resolveActiveJobCodeId, taskViewerOf, canEditTask } from '@smis-mentor/shared';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getTaskById, toggleTaskCompletion } from '@/lib/taskService';
import { deleteTaskViaApi } from '@/lib/taskApi';
import type { Task, JobExperienceGroupRole } from '@smis-mentor/shared';
import { formatTime, formatDuration } from '@/lib/taskService';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { currentIntlLocale } from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const isAndroid = () => {
  if (typeof window === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
};

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params?.taskId as string;
  const { userData } = useAuth();
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);
  const [showAppBanner, setShowAppBanner] = useState(false);

  // 삭제: 관리자, 또는 본인이 만든 업무의 부매니저
  const viewer = taskViewerOf(userData, resolveActiveJobCodeId(userData));
  const isAdmin = !!task && canEditTask(task, viewer, userData?.userId);

  useEffect(() => {
    // 모바일 브라우저에서만 앱 배너 표시 (앱에서 열리지 않은 경우)
    if ((isIOS() || isAndroid()) && !window.matchMedia('(display-mode: standalone)').matches) {
      setShowAppBanner(true);
    }
  }, []);

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
        toast.error(L('common.taskNotFound'));
        router.push('/camp');
        return;
      }
      setTask(taskData);
    } catch (error) {
      logger.error('업무 로드 오류:', error);
      toast.error(L('common.anErrorOccurredWhileLoading'));
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
      toast.success(L('task.taskStatusUpdated'));
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      toast.error(L('common.anErrorOccurredWhileChanging'));
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    
    if (confirm(task.groupId ? L('misc.deleteTheTaskForThis') : L('task.areYouSureYouWant'))) {
      try {
        await deleteTaskViaApi(task.id, 'one');
        toast.success(L('task.taskDeleted'));
        handleBack();
      } catch (error) {
        logger.error('업무 삭제 오류:', error);
        toast.error(error instanceof Error && error.message ? error.message : L('common.anErrorOccurredWhileDeleting'));
      }
    }
  };

  const handleBack = () => {
    // 업무의 날짜로 캠프 페이지로 이동 (로컬 타임존)
    if (task) {
      const date = task.date.toDate();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      router.push(`/camp/tasks?date=${dateStr}`);
    } else {
      router.push('/camp/tasks');
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: task?.title || L('misc.shareTask'),
          text: task?.description || L('task.pleaseCheckThisTask'),
          url: url,
        });
        toast.success(L('misc.shared'));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.error('공유 오류:', error);
        }
      }
    } else {
      // 공유 API를 지원하지 않으면 클립보드에 복사
      try {
        await navigator.clipboard.writeText(url);
        toast.success(L('task.linkCopiedToClipboard'));
      } catch (error) {
        logger.error('클립보드 복사 오류:', error);
        toast.error(L('common.failedToCopyTheLink'));
      }
    }
  };

  const handleOpenInApp = () => {
    const appUrl = `smismentor://camp/tasks/${taskId}`;
    const fallbackUrl = window.location.href;
    
    // 앱 열기 시도
    window.location.href = appUrl;
    
    // 1.5초 후에도 페이지가 보이면 앱이 설치되지 않은 것으로 간주
    setTimeout(() => {
      setShowAppBanner(false);
      toast.error(L('misc.theAppIsNotInstalled'));
    }, 1500);
  };

  if (loading) {
    return (
      <Layout noPadding>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{L('task.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!task) {
    return null;
  }

  const isCompleted = task.completions.some((c: { userId: string }) => c.userId === userData?.userId);
  const dateStr = task.date.toDate().toLocaleDateString(currentIntlLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  const linkAttachments = task.attachments?.filter((a: { type: string }) => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter((a: { type: string }) => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter((a: { type: string }) => a.type !== 'link' && a.type !== 'image') || [];

  const handleLoginPrompt = () => {
    toast.error(L('misc.thisFeatureRequiresLogin'));
    router.push('/sign-in?redirect=' + encodeURIComponent(window.location.pathname));
  };

  return (
    <Layout noPadding>
      <div className="min-h-screen bg-gray-50">
        {/* 로그인 유도 배너 (로그인하지 않은 경우) */}
        {!userData && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 sticky top-16 z-20">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{L('misc.logInToMarkTasks')}</p>
                </div>
              </div>
              <button
                onClick={() => router.push('/sign-in?redirect=' + encodeURIComponent(window.location.pathname))}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap ml-3"
              >
                {L('misc.logIn')}
              </button>
            </div>
          </div>
        )}

        {/* 앱 배너 */}
        {showAppBanner && (
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between sticky top-16 z-20">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{L('misc.useItMoreEasilyIn')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={handleOpenInApp}
                className="px-3 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                {L('content.openInApp')}
              </button>
              <button
                onClick={() => setShowAppBanner(false)}
                className="p-1 hover:bg-blue-700 rounded transition-colors"
                aria-label={L('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 페이지 내부 헤더 */}
        <div className="bg-white border-b sticky top-16 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">{L('common.back')}</span>
            </button>

            <div className="flex items-center gap-2">
              {/* 공유 버튼 */}
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
                title={L('misc.share')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden sm:inline">{L('common.share')}</span>
              </button>
              
              {/* 체크박스 - 로그인 필요 */}
              {userData ? (
                <button
                  onClick={handleToggleComplete}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isCompleted
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isCompleted ? L('common.completed') : L('misc.markComplete')}
                </button>
              ) : (
                <button
                  onClick={handleLoginPrompt}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  title={L('common.loginRequired2')}
                >
                  {L('misc.markComplete')}
                </button>
              )}

              {/* 관리자 메뉴 */}
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
                >
                  {L('common.delete')}
                </button>
              )}
            </div>
          </div>
        </div>

      {/* 본문 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-5">
          {/* 제목 */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
          </div>

          {/* 날짜 및 시간 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-sm">{dateStr}</span>
            </div>

            {timeStr && (
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-sm">{timeStr}</span>
                {durationStr && (
                  <span className="text-gray-500 text-sm">({durationStr})</span>
                )}
              </div>
            )}
          </div>

          {/* 대상 역할 */}
          <div>
            <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.targetRoles')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {task.targetRoles.map((role: JobExperienceGroupRole) => (
                <span
                  key={role}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>

          {/* 대상 그룹 */}
          {task.targetGroups && task.targetGroups.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.targetGroups')}</h2>
              <div className="flex flex-wrap gap-1.5">
                {task.targetGroups.map((group: string, idx: number) => (
                  <span
                    key={group}
                    className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"
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
              <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.description')}</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* 링크 */}
          {linkAttachments.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.links')}</h2>
              <div className="space-y-1.5">
                {linkAttachments.map((attachment: { url: string; label: string }, idx: number) => (
                  <a
                    key={idx}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <span className="text-base">🔗</span>
                    <span className="flex-1 font-medium text-gray-700 text-sm">
                      {attachment.label}
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.images')}</h2>
              <div className="space-y-3">
                {imageAttachments.map((attachment: { url: string; label: string; thumbnail?: string }, idx: number) => (
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
                        style={{ maxHeight: '400px', objectFit: 'contain' }}
                      />
                    </button>
                    <p className="text-xs text-gray-500 mt-1.5">{attachment.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 기타 파일 */}
          {otherAttachments.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-600 mb-2">{L('common.attachments')}</h2>
              <div className="space-y-1.5">
                {otherAttachments.map((attachment, idx) => (
                  <a
                    key={idx}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <span className="text-base">
                      {attachment.type === 'video' && '🎥'}
                      {attachment.type === 'file' && '📎'}
                    </span>
                    <span className="flex-1 font-medium text-gray-700 text-sm">
                      {attachment.label}
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <h2 className="text-xs font-semibold text-gray-600 mb-2">
                {L('misc.completion')}{task.completions.length}{L('common.people')}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {task.completions.map((completion, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"
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
            alt={L('common.enlargedImage')}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
    </Layout>
  );
}
