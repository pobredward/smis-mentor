'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { createTask, updateTask, uploadTaskImage, uploadTaskFile } from '@/lib/taskService';
import type { Task, TaskAttachment, JobExperienceGroupRole } from '@smis-mentor/shared/types/camp';

interface TaskFormProps {
  campCode: string;
  createdBy: string;
  task?: Task | null;
  selectedDate: Date;
  onClose: () => void;
  onSuccess: () => void;
}

const roleOptions: JobExperienceGroupRole[] = ['수업', '담임', '부매니저', '매니저', '서포트', '리더'];

export default function TaskFormModal({ campCode, createdBy, task, selectedDate, onClose, onSuccess }: TaskFormProps) {
  const isEdit = !!task;

  // 날짜 및 시간 (최상단)
  const [date, setDate] = useState(() => {
    if (task?.date) {
      return task.date.toDate();
    }
    return selectedDate;
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [time, setTime] = useState(task?.time || '');
  const [hasTime, setHasTime] = useState(!!(task?.time));

  // 대상 역할
  const [selectedRoles, setSelectedRoles] = useState<JobExperienceGroupRole[]>(task?.targetRoles || []);

  // 우선순위
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(task?.priority || 'medium');

  // 업무 제목 & 설명
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');

  // 소요 시간 (분 단위만, 옵션)
  const [durationMinutes, setDurationMinutes] = useState(
    task?.estimatedDuration 
      ? (task.estimatedDuration.unit === 'hours' 
          ? task.estimatedDuration.value * 60 
          : task.estimatedDuration.value).toString()
      : ''
  );

  // 첨부파일
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task?.attachments || []);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // 링크 추가 모달
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // 달력 관련 state
  const [currentMonth, setCurrentMonth] = useState(date.getMonth());
  const [currentYear, setCurrentYear] = useState(date.getFullYear());

  // 달력 렌더링
  const renderCalendar = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const days = [];

    // 빈 칸
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8"></div>);
    }

    // 날짜
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(currentYear, currentMonth, day);
      const isSelected = 
        date.getDate() === day && 
        date.getMonth() === currentMonth && 
        date.getFullYear() === currentYear;
      const isToday = 
        new Date().getDate() === day && 
        new Date().getMonth() === currentMonth && 
        new Date().getFullYear() === currentYear;

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => {
            setDate(currentDate);
            setShowCalendar(false);
          }}
          className={`h-8 flex items-center justify-center text-sm rounded-lg transition-colors ${
            isSelected
              ? 'bg-blue-600 text-white font-semibold'
              : isToday
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  // 역할 토글
  const handleRoleToggle = (role: JobExperienceGroupRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // 파일 업로드
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    try {
      const uploadPromises = Array.from(files).map(async file => {
        if (file.type.startsWith('image/')) {
          return await uploadTaskImage('temp', file);
        } else {
          return await uploadTaskFile('temp', file);
        }
      });

      const uploadedAttachments = await Promise.all(uploadPromises);
      setAttachments(prev => [...prev, ...uploadedAttachments]);
      toast.success('파일이 업로드되었습니다.');
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      toast.error('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingFiles(false);
    }
  };

  // 링크 추가
  const handleAddLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) {
      toast.error('라벨과 URL을 모두 입력해주세요.');
      return;
    }

    setAttachments(prev => [
      ...prev,
      {
        type: 'link',
        url: linkUrl.trim(),
        label: linkLabel.trim(),
      },
    ]);

    setLinkLabel('');
    setLinkUrl('');
    setShowLinkModal(false);
    toast.success('링크가 추가되었습니다.');
  };

  // 첨부파일 제거
  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date) {
      toast.error('날짜를 선택해주세요.');
      return;
    }

    // 시간 형식 검증 (24시간 형식: HH:mm)
    if (hasTime && time) {
      const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timePattern.test(time)) {
        toast.error('시간을 24시간 형식으로 입력해주세요 (예: 14:30)');
        return;
      }
    }

    if (selectedRoles.length === 0) {
      toast.error('대상 역할을 최소 1개 선택해주세요.');
      return;
    }

    if (!title.trim()) {
      toast.error('업무 제목을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      // 로컬 타임존으로 날짜 생성
      const localDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0, 0, 0, 0
      );
      
      const taskData = {
        campCode,
        title: title.trim(),
        description: description.trim(),
        targetRoles: selectedRoles,
        date: Timestamp.fromDate(localDate),
        time: hasTime && time ? time : undefined,
        estimatedDuration: durationMinutes && parseFloat(durationMinutes) > 0
          ? {
              value: parseFloat(durationMinutes),
              unit: 'minutes' as const,
            }
          : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        priority,
        createdBy,
      };

      if (isEdit && task) {
        await updateTask(task.id, taskData);
        toast.success('업무가 수정되었습니다.');
      } else {
        await createTask(campCode, taskData);
        toast.success('업무가 생성되었습니다.');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('업무 저장 오류:', error);
      toast.error('업무 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-20 sm:pb-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? '업무 수정' : '새 업무 추가'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[calc(100vh-240px)] sm:max-h-[70vh] overflow-y-auto">
          {/* 1. 날짜 및 시간 */}
          <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1">
              📅 날짜 및 시간 <span className="text-red-500">*</span>
            </h4>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCalendar(!showCalendar)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
              >
                <span className="text-gray-900">
                  {date.getFullYear()}년 {date.getMonth() + 1}월 {date.getDate()}일
                </span>
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 달력 드롭다운 */}
              {showCalendar && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 p-3">
                  {/* 월/년 네비게이션 */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 0) {
                          setCurrentMonth(11);
                          setCurrentYear(currentYear - 1);
                        } else {
                          setCurrentMonth(currentMonth - 1);
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm font-semibold">
                      {currentYear}년 {monthNames[currentMonth]}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 11) {
                          setCurrentMonth(0);
                          setCurrentYear(currentYear + 1);
                        } else {
                          setCurrentMonth(currentMonth + 1);
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {weekDays.map(day => (
                      <div key={day} className="text-xs text-center font-medium text-gray-600">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* 날짜 그리드 */}
                  <div className="grid grid-cols-7 gap-1">
                    {renderCalendar()}
                  </div>
                </div>
              )}
            </div>

            {/* 시간 입력 */}
            <div>
              <label className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={e => setHasTime(e.target.checked)}
                  className="w-3 h-3"
                />
                <span className="text-xs font-medium text-gray-700">시간 지정</span>
              </label>

              {hasTime && (
                <input
                  type="text"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  placeholder="24시간 형식 (예: 14:30)"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
            </div>
          </div>

          {/* 2. 대상 역할 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              👥 대상 역할 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {roleOptions.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleToggle(role)}
                  className={`px-2.5 py-1.5 border rounded-lg transition-all text-xs ${
                    selectedRoles.includes(role)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* 3. 우선순위 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">⭐ 우선순위</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('high')}
                className={`flex-1 px-3 py-2 border rounded-lg transition-all text-xs flex items-center justify-center gap-1.5 ${
                  priority === 'high'
                    ? 'bg-red-100 border-red-500 text-red-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                🔴 <span className="font-medium">중요</span>
              </button>
              <button
                type="button"
                onClick={() => setPriority('medium')}
                className={`flex-1 px-3 py-2 border rounded-lg transition-all text-xs flex items-center justify-center gap-1.5 ${
                  priority === 'medium'
                    ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                🟡 <span className="font-medium">보통</span>
              </button>
              <button
                type="button"
                onClick={() => setPriority('low')}
                className={`flex-1 px-3 py-2 border rounded-lg transition-all text-xs flex items-center justify-center gap-1.5 ${
                  priority === 'low'
                    ? 'bg-gray-100 border-gray-500 text-gray-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                ⚪ <span className="font-medium">낮음</span>
              </button>
            </div>
          </div>

          {/* 4. 업무 제목 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ✏️ 업무 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: 학생 명단 확인"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* 5. 업무 설명 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">📝 업무 설명</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="업무에 대한 상세 설명"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* 소요 시간 (옵션) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">⏱️ 예상 소요시간 (선택)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                min="0"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
                placeholder="0"
                className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-xs text-gray-600">분</span>
            </div>
          </div>

          {/* 6. 첨부파일 및 링크 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">📎 첨부파일 및 링크</label>
            <div className="space-y-2">
              {/* 업로드 버튼 */}
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700">파일</span>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={e => handleFileUpload(e.target.files)}
                    className="hidden"
                    disabled={uploadingFiles}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowLinkModal(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-xs bg-blue-100 border border-blue-300 rounded-lg hover:bg-blue-200 transition-all"
                >
                  <span className="text-blue-700">링크</span>
                </button>
              </div>

              {uploadingFiles && (
                <div className="text-xs text-gray-600 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
                  업로드 중...
                </div>
              )}

              {/* 첨부파일 리스트 */}
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span>
                          {att.type === 'image' && '🖼️'}
                          {att.type === 'video' && '🎥'}
                          {att.type === 'link' && '🔗'}
                          {att.type === 'file' && '📎'}
                        </span>
                        <span className="text-gray-700 truncate">{att.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* 푸터 */}
        <div className="flex gap-2 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || uploadingFiles}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '저장 중...' : isEdit ? '수정하기' : '추가하기'}
          </button>
        </div>
      </div>

      {/* 링크 추가 모달 */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full m-4 p-4">
            <h4 className="text-base font-semibold text-gray-900 mb-3">링크 추가</h4>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">라벨</label>
                <input
                  type="text"
                  value={linkLabel}
                  onChange={e => setLinkLabel(e.target.value)}
                  placeholder="예: 구글 드라이브"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowLinkModal(false)}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddLink}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
