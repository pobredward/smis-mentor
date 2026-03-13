'use client';

import { useState } from 'react';
import type { Task } from '@smis-mentor/shared/types/camp';
import { formatTime, formatDuration } from '@/lib/taskService';

interface TaskDetailModalProps {
  task: Task;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

export default function TaskDetailModal({
  task,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
  onCopy,
}: TaskDetailModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  // 링크와 이미지 분리
  const linkAttachments = task.attachments?.filter(a => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter(a => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter(a => a.type !== 'link' && a.type !== 'image') || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
          {/* 헤더 - 더 작게 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">업무 상세</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
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
                {task.targetRoles.map(role => (
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

            {/* 완료 현황 (Admin) */}
            {isAdmin && task.completions.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-gray-600 mb-1.5">
                  완료 현황 ({task.completions.length}명)
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  {task.completions.map((completion, idx) => (
                    <div
                      key={idx}
                      className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                    >
                      {completion.userName} ({completion.userRole})
                    </div>
                  ))}
                </div>
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
