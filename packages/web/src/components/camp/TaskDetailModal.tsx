'use client';

import { useState } from 'react';
import type { Task, User } from '@smis-mentor/shared';
import { getTaskTargetUsers, getTaskCompletionStatus, sortUsersByName } from '@smis-mentor/shared';
import { formatTime, formatDuration } from '@/lib/taskService';
import toast from 'react-hot-toast';

interface TaskDetailModalProps {
  task: Task;
  isAdmin: boolean;
  campUsers: User[];
  campCode: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onShare?: () => void;
}

export default function TaskDetailModal({
  task,
  isAdmin,
  campUsers,
  campCode,
  onClose,
  onEdit,
  onDelete,
  onCopy,
  onShare,
}: TaskDetailModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  // 링크와 이미지 분리
  const linkAttachments = task.attachments?.filter((a: { type: string }) => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter((a: { type: string }) => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter((a: { type: string }) => a.type !== 'link' && a.type !== 'image') || [];

  // 실제 완료 현황 계산
  const targetUsers = isAdmin ? getTaskTargetUsers(task, campUsers, campCode) : [];
  const { completedUsers, incompleteUsers, totalCount, completionRate } = isAdmin 
    ? getTaskCompletionStatus(task, targetUsers)
    : { completedUsers: [], incompleteUsers: [], totalCount: 0, completionRate: 0 };
  
  const sortedCompletedUsers = sortUsersByName(completedUsers);
  const sortedIncompleteUsers = sortUsersByName(incompleteUsers);

  // 미완료자에게 알림 보내기
  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const sendTaskReminder = httpsCallable(functions, 'sendTaskReminderToUsers');
      
      const result = await sendTaskReminder({ taskId: task.id });
      const data = result.data as { success: boolean; message: string; sentCount: number };
      
      toast.success(data.message);
    } catch (error: any) {
      console.error('푸시 알림 전송 실패:', error);
      toast.error(error.message || '알림 전송에 실패했습니다.');
    } finally {
      setIsSendingReminder(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
          {/* 헤더 - 더 작게 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">업무 상세</h3>
            <div className="flex items-center gap-2">
              {onShare && (
                <button
                  onClick={onShare}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="링크 복사"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* 내용 - 간격 줄이기 */}
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* 제목 */}
            <div>
              <h4 className="text-lg font-bold text-gray-900">{task.title}</h4>
            </div>

            {/* 날짜 및 시간 - 더 작게 */}
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">{dateStr}</span>
              </div>

              {timeStr && (
                <div className="flex items-center gap-2 text-gray-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">{timeStr}</span>
                  {durationStr && (
                    <span className="text-gray-500">({durationStr})</span>
                  )}
                </div>
              )}
            </div>

            {/* 대상 역할 */}
            <div>
              <h5 className="text-xs font-semibold text-gray-600 mb-1.5">대상 역할</h5>
              <div className="flex flex-wrap gap-1.5">
                {task.targetRoles.map((role: string) => (
                  <span
                    key={role}
                    className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>

            {/* 대상 그룹 */}
            {/* 대상 그룹 */}
            {task.targetGroups && task.targetGroups.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">대상 그룹</h5>
                <div className="flex flex-wrap gap-1.5">
                  {task.targetGroups.map(group => (
                    <span
                      key={group}
                      className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"
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
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">상세 설명</h5>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.description}</p>
              </div>
            )}

            {/* 링크 (최우선) */}
            {linkAttachments.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">링크</h5>
                <div className="space-y-1.5">
                  {linkAttachments.map((attachment, idx) => (
                    <a
                      key={idx}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🔗</span>
                          <span className="text-xs font-medium text-gray-700 truncate">
                            {attachment.label}
                          </span>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">이미지</h5>
                <div className="space-y-2">
                  {imageAttachments.map((attachment, idx) => (
                    <div key={idx}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedImage(attachment.url);
                        }}
                        className="block w-full text-left"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.label}
                          loading="lazy"
                          className="w-full rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                          style={{ maxHeight: '400px', objectFit: 'cover' }}
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
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">첨부파일</h5>
                <div className="space-y-1.5">
                  {otherAttachments.map((attachment, idx) => (
                    <a
                      key={idx}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">
                            {attachment.type === 'video' && '🎥'}
                            {attachment.type === 'file' && '📎'}
                          </span>
                          <span className="text-xs font-medium text-gray-700 truncate">
                            {attachment.label}
                          </span>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 완료 현황 (Admin) - 한 번에 보기 */}
            {isAdmin && totalCount > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-gray-900">완료 현황</h5>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-blue-600">
                      {sortedCompletedUsers.length}/{totalCount}명
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      ({completionRate}%)
                    </span>
                  </div>
                </div>

                {/* 진행률 바 */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      completionRate === 100 ? 'bg-green-500' : 
                      completionRate >= 70 ? 'bg-blue-500' : 
                      completionRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${completionRate}%` }}
                  />
                </div>

                {/* 완료한 사람 (15명) */}
                {sortedCompletedUsers.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h6 className="text-sm font-semibold text-green-700">✓ 완료 ({sortedCompletedUsers.length}명)</h6>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-60 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {sortedCompletedUsers.map((user) => {
                          const userExp = user.jobExperiences?.find(exp => exp.id === campCode);
                          return (
                            <div
                              key={user.userId}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-100 border border-green-300 rounded-md"
                            >
                              <span className="text-sm font-medium text-green-900">{user.name}</span>
                              {userExp && (
                                <span className="text-xs text-green-600">({userExp.groupRole})</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 미완료한 사람 (10명) */}
                {sortedIncompleteUsers.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h6 className="text-sm font-semibold text-red-700">✗ 미완료 ({sortedIncompleteUsers.length}명)</h6>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-60 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {sortedIncompleteUsers.map((user) => {
                          const userExp = user.jobExperiences?.find(exp => exp.id === campCode);
                          return (
                            <div
                              key={user.userId}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-100 border border-red-300 rounded-md"
                            >
                              <span className="text-sm font-medium text-red-900">{user.name}</span>
                              {userExp && (
                                <span className="text-xs text-red-600">({userExp.groupRole})</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 미완료자에게 알림 보내기 */}
                {sortedIncompleteUsers.length > 0 && (
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start gap-2 text-xs text-blue-800">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <p className="font-medium mb-0.5">미완료자에게 푸시 알림을 보낼 수 있습니다</p>
                          <p className="text-blue-600">업무 리마인더가 모바일 앱으로 전송됩니다</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSendReminder}
                      disabled={isSendingReminder}
                      className="w-full px-4 py-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSendingReminder ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          <span>전송 중...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <span>미완료자 {sortedIncompleteUsers.length}명에게 알림 보내기</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 완료 상태일 때 축하 메시지 */}
                {completionRate === 100 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <span className="text-2xl">🎉</span>
                    <div className="text-sm">
                      <p className="font-semibold text-green-900">모든 대상자가 완료했습니다!</p>
                      <p className="text-green-700 text-xs">수고하셨습니다</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 푸터 - 더 작게 */}
          <div className="flex gap-2 p-4 border-t border-gray-200">
            {isAdmin ? (
              <>
                <button
                  onClick={onCopy}
                  className="flex-1 px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium"
                >
                  복사
                </button>
                <button
                  onClick={onEdit}
                  className="flex-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                >
                  수정
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                >
                  삭제
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl leading-none w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all z-10"
            aria-label="닫기"
          >
            ×
          </button>
          <div className="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center">
            <img
              src={selectedImage}
              alt="확대 이미지"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              loading="eager"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/60 text-sm">
            클릭하여 닫기
          </div>
        </div>
      )}
    </>
  );
}
