'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { createTask, updateTask, deleteTask, uploadTaskImage, uploadTaskFile, getTasksByGroupId, updateTaskGroup } from '@/lib/taskService';
import type { 
  Task, 
  TaskAttachment, 
  JobExperienceGroupRole,
  JobExperienceGroup,
  TaskCategory,
} from '@smis-mentor/shared';
import {
  JOB_EXPERIENCE_GROUP_ROLES,
  MENTOR_GROUP_ROLES,
  FOREIGN_GROUP_ROLES,
  JOB_EXPERIENCE_GROUPS 
} from '@smis-mentor/shared';

type TargetRoleType = 'mentor' | 'foreign';

const getMentorRoles = (): JobExperienceGroupRole[] => Array.from(MENTOR_GROUP_ROLES);
const getForeignRoles = (): JobExperienceGroupRole[] => Array.from(FOREIGN_GROUP_ROLES);

interface TaskFormProps {
  campCode: string;
  createdBy: string;
  task?: Task | null;
  isCopyMode?: boolean;
  selectedDate: Date;
  categories?: TaskCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

const groupOptions: JobExperienceGroup[] = [...JOB_EXPERIENCE_GROUPS];

export default function TaskFormModal({ campCode, createdBy, task, isCopyMode = false, selectedDate, categories = [], onClose, onSuccess }: TaskFormProps) {
  const isEdit = !!task && !isCopyMode;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 타겟 role 타입 (멘토용/원어민용) - default는 mentor
  const [targetRoleType, setTargetRoleType] = useState<TargetRoleType>('mentor');
  
  // roleOptions는 targetRoleType에 따라 동적으로 변경
  const roleOptions = targetRoleType === 'mentor' ? getMentorRoles() : getForeignRoles();

  // 날짜 및 시간 (최상단)
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => {
    if (task?.date) {
      return [task.date.toDate()];
    }
    return [selectedDate];
  });
  // 수정 모드에서 그룹 날짜 로딩 중 여부
  const [loadingGroupDates, setLoadingGroupDates] = useState(false);
  const [time, setTime] = useState(task?.time || '');
  const [hasTime, setHasTime] = useState(!!(task?.time));

  // 대상 역할
  const [selectedRoles, setSelectedRoles] = useState<JobExperienceGroupRole[]>(task?.targetRoles || []);

  // 대상 그룹 (새로 추가)
  const [selectedGroups, setSelectedGroups] = useState<JobExperienceGroup[]>(task?.targetGroups || []);

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

  // 카테고리
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(task?.categoryId ?? '');

  // 첨부파일
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task?.attachments || []);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // 링크 추가 모달
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // 달력 관련 state - 첫 번째 선택된 날짜를 기준으로 초기화
  const firstSelectedDate = selectedDates[0] || new Date();
  const [currentMonth, setCurrentMonth] = useState(firstSelectedDate.getMonth());
  const [currentYear, setCurrentYear] = useState(firstSelectedDate.getFullYear());

  // 수정 모드에서 groupId가 있으면 그룹의 모든 날짜를 조회해 selectedDates에 반영
  useEffect(() => {
    if (!isEdit || !task?.groupId) return;

    const loadGroupDates = async () => {
      setLoadingGroupDates(true);
      try {
        const groupTasks = await getTasksByGroupId(task.groupId!);
        if (groupTasks.length > 0) {
          const groupDates = groupTasks.map(t => t.date.toDate());
          setSelectedDates(groupDates);
          setCurrentMonth(groupDates[0].getMonth());
          setCurrentYear(groupDates[0].getFullYear());
        }
      } catch (error) {
        logger.error('그룹 날짜 로드 오류:', error);
      } finally {
        setLoadingGroupDates(false);
      }
    };

    loadGroupDates();
  // task.id가 바뀔 때만 실행 (task 객체 전체 의존성 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, isEdit]);

  // 드래그 선택을 위한 state
  const [isDragging, setIsDragging] = useState(false);

  // 마우스 다운으로 드래그 시작
  const handleMouseDown = (date: Date) => {
    setIsDragging(true);
    toggleDateSelection(date);
  };

  // 마우스 엔터로 드래그 중 날짜 선택
  const handleMouseEnter = (date: Date) => {
    if (!isDragging) return;
    
    // 로컬 날짜로 비교
    const isAlreadySelected = selectedDates.some(
      d => d.getFullYear() === date.getFullYear() && 
           d.getMonth() === date.getMonth() && 
           d.getDate() === date.getDate()
    );
    
    if (!isAlreadySelected) {
      setSelectedDates([...selectedDates, date]);
    }
  };

  // 마우스 업으로 드래그 종료
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 컴포넌트 마운트 시 전역 마우스 업 이벤트 등록
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 날짜 선택/해제 핸들러
  const toggleDateSelection = (dateToToggle: Date) => {
    // 로컬 날짜로 비교
    const existingIndex = selectedDates.findIndex(
      d => d.getFullYear() === dateToToggle.getFullYear() && 
           d.getMonth() === dateToToggle.getMonth() && 
           d.getDate() === dateToToggle.getDate()
    );

    if (existingIndex >= 0) {
      // 이미 선택된 경우 제거 (최소 1개는 유지)
      if (selectedDates.length > 1) {
        setSelectedDates(selectedDates.filter((_, i) => i !== existingIndex));
      }
    } else {
      // 선택되지 않은 경우 추가
      setSelectedDates([...selectedDates, dateToToggle]);
    }
  };

  // 달력 렌더링
  const renderCalendar = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const days = [];

    // 빈 칸
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} style={{ width: `${100 / 7}%`, height: '32px' }}></div>);
    }

    // 날짜
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(currentYear, currentMonth, day);
      // 로컬 날짜로 비교
      const isSelected = selectedDates.some(
        d => d.getFullYear() === currentDate.getFullYear() && 
             d.getMonth() === currentDate.getMonth() && 
             d.getDate() === currentDate.getDate()
      );
      const isToday = 
        today.getDate() === day && 
        today.getMonth() === currentMonth && 
        today.getFullYear() === currentYear;
      
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      days.push(
        <div
          key={day}
          style={{ width: `${100 / 7}%`, height: '32px' }}
          className="flex items-center justify-center"
          onMouseDown={() => handleMouseDown(currentDate)}
          onMouseEnter={() => handleMouseEnter(currentDate)}
          onMouseUp={handleMouseUp}
        >
          <div
            className={`w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors cursor-pointer select-none ${
              isSelected
                ? 'bg-blue-600 text-white font-semibold'
                : isToday
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : isWeekend
                ? 'text-red-500 hover:bg-gray-100'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {day}
          </div>
        </div>
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
      logger.error('파일 업로드 오류:', error);
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

    if (selectedDates.length === 0) {
      toast.error('날짜를 하나 이상 선택해주세요.');
      return;
    }

    // 시간 형식 검증 — 값이 있을 때만 (24시간 HH:mm)
    if (time) {
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

    if (selectedGroups.length === 0) {
      toast.error('대상 그룹을 최소 1개 선택해주세요.');
      return;
    }

    if (!title.trim()) {
      toast.error('업무 제목을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      const commonUpdates = {
        title: title.trim(),
        description: description.trim(),
        targetRoles: selectedRoles,
        targetGroups: selectedGroups,
        // 시간이 없는 경우 수정 모드에서 기존 값을 삭제하기 위해 null 전달
        time: time || (isEdit ? null : undefined),
        // 소요시간이 없는 경우 수정 모드에서 기존 값을 삭제하기 위해 null 전달
        estimatedDuration: durationMinutes && parseFloat(durationMinutes) > 0
          ? { value: parseFloat(durationMinutes), unit: 'minutes' as const }
          : (isEdit ? null : undefined),
        // 카테고리 (없으면 null로 필드 제거)
        categoryId: selectedCategoryId || (isEdit ? null : undefined),
        attachments: attachments.length > 0 ? attachments : undefined,
        createdBy,
      };

      if (isEdit && task) {
        if (task.groupId) {
          // 그룹 수정: 날짜가 바뀌었는지 확인
          const groupTasks = await getTasksByGroupId(task.groupId);
          const originalDateStrs = new Set(
            groupTasks.map(t => {
              const d = t.date.toDate();
              return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            })
          );
          const newDateStrs = new Set(
            selectedDates.map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
          );
          const datesChanged =
            originalDateStrs.size !== newDateStrs.size ||
            [...newDateStrs].some(s => !originalDateStrs.has(s));

          if (datesChanged) {
            // 날짜 변경: 기존 삭제 후 새 날짜로 재생성
            await updateTaskGroup(campCode, task.groupId, commonUpdates, selectedDates);
          } else {
            // 날짜 동일: 내용만 일괄 업데이트
            await updateTaskGroup(campCode, task.groupId, commonUpdates);
          }
          toast.success('그룹 업무가 수정되었습니다.');
        } else {
          // 그룹 없는 단일 Task 수정
          if (selectedDates.length >= 2) {
            // 단일 → 그룹 업그레이드: 기존 문서 삭제 후 새 groupId로 다중 생성
            await deleteTask(task.id);
            const newGroupId = crypto.randomUUID();
            for (const date of selectedDates) {
              const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
              await createTask(campCode, {
                campCode,
                ...commonUpdates,
                date: Timestamp.fromDate(localDate),
                groupId: newGroupId,
              }, newGroupId);
            }
            toast.success(`${selectedDates.length}개의 그룹 업무가 생성되었습니다.`);
          } else {
            // 날짜 1개: 기존 방식 유지
            const localDate = new Date(
              selectedDates[0].getFullYear(),
              selectedDates[0].getMonth(),
              selectedDates[0].getDate(),
              0, 0, 0, 0
            );
            await updateTask(task.id, {
              ...commonUpdates,
              campCode,
              date: Timestamp.fromDate(localDate),
            });
            toast.success('업무가 수정되었습니다.');
          }
        }
      } else {
        // 생성 모드: 날짜 2개 이상이면 공유 groupId 부여
        const newGroupId = selectedDates.length >= 2
          ? crypto.randomUUID()
          : undefined;

        for (const date of selectedDates) {
          const localDate = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            0, 0, 0, 0
          );
          const taskData = {
            campCode,
            ...commonUpdates,
            date: Timestamp.fromDate(localDate),
            ...(newGroupId ? { groupId: newGroupId } : {}),
          };
          await createTask(campCode, taskData, newGroupId);
        }

        toast.success(`${selectedDates.length}개의 업무가 생성되었습니다.`);
      }

      onSuccess();
      onClose();
    } catch (error) {
      logger.error('업무 저장 오류:', error);
      toast.error('업무 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  // 드래그 중 오버레이로 마우스가 넘어가도 모달이 닫히지 않도록
  // mousedown이 오버레이에서 시작되고 mouseup도 오버레이에서 끝난 경우에만 닫힘
  const mouseDownOnOverlay = useRef(false);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }, []);

  const handleOverlayMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-20 sm:pb-4 overflow-y-auto"
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? '업무 수정' : isCopyMode ? '업무 복사' : '새 업무 추가'}
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
          {/* 0. 타겟 역할 타입 선택 (mentor/foreign) */}
          <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              🎯 업무 대상 선택 (멘토/원어민)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetRoleType('mentor');
                  setSelectedRoles([]); // 역할 초기화
                }}
                className={`flex-1 px-3 py-2 border rounded-lg transition-all text-xs font-medium ${
                  targetRoleType === 'mentor'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                멘토용
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetRoleType('foreign');
                  setSelectedRoles([]); // 역할 초기화
                }}
                className={`flex-1 px-3 py-2 border rounded-lg transition-all text-xs font-medium ${
                  targetRoleType === 'foreign'
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                원어민용
              </button>
            </div>
          </div>

          {/* 1. 날짜 및 시간 */}
          <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1">
              📅 날짜 및 시간 <span className="text-red-500">*</span>
            </h4>
            {isEdit && task?.groupId && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                이 업무는 여러 날짜에 묶인 그룹 업무입니다. 날짜를 변경하면 그룹의 모든 날짜가 함께 변경됩니다.
              </p>
            )}

            {/* 월/년 네비게이션 */}
            <div className="flex items-center justify-between mb-1">
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
              <span className="text-sm font-semibold text-gray-800">
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
            <div className="flex mb-1">
              {weekDays.map((day, i) => (
                <div
                  key={day}
                  style={{ width: `${100 / 7}%` }}
                  className={`text-xs text-center font-medium ${
                    i === 0 || i === 6 ? 'text-red-500' : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className={`flex flex-wrap ${loadingGroupDates ? 'pointer-events-none opacity-50' : ''}`}>
              {renderCalendar()}
            </div>

            {loadingGroupDates ? (
              <p className="text-[10px] text-gray-400 text-center">날짜 불러오는 중...</p>
            ) : (
              <p className="text-[10px] text-gray-400 text-center">클릭 또는 드래그로 여러 날짜를 선택할 수 있습니다</p>
            )}

            {/* 선택된 날짜 태그 목록 */}
            {!loadingGroupDates && selectedDates.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {[...selectedDates]
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d, sortedIdx) => (
                    <span
                      key={sortedIdx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
                    >
                      {d.getMonth() + 1}/{d.getDate()}
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedDates.length > 1) {
                            setSelectedDates(prev =>
                              prev.filter(
                                existing =>
                                  !(
                                    existing.getFullYear() === d.getFullYear() &&
                                    existing.getMonth() === d.getMonth() &&
                                    existing.getDate() === d.getDate()
                                  )
                              )
                            );
                          }
                        }}
                        className="ml-0.5 text-blue-500 hover:text-blue-800 leading-none"
                        aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 제거`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            )}

            {/* 시간 지정 & 예상 소요시간 (선택) */}
            <div className="flex gap-3">
              {/* 시간 지정 */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  🕐 시간 지정 <span className="font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  value={time}
                  onChange={e => {
                    setTime(e.target.value);
                    setHasTime(e.target.value.length > 0);
                  }}
                  placeholder="예: 14:30"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {/* 예상 소요시간 */}
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  ⏱️ 소요시간 <span className="font-normal">(선택)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(e.target.value)}
                    placeholder="0"
                    className="w-16 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-xs text-gray-500 shrink-0">분</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 카테고리 (선택) — 날짜 및 시간 바로 아래 */}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🏷️ 카테고리 (선택)</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('')}
                  className={`px-2.5 py-1.5 border rounded-lg transition-all text-xs ${
                    selectedCategoryId === ''
                      ? 'bg-gray-700 border-gray-700 text-white font-medium'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  없음
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-2.5 py-1.5 border rounded-lg transition-all text-xs font-medium ${
                      selectedCategoryId === cat.id
                        ? 'text-white'
                        : 'bg-white text-gray-700 hover:opacity-80'
                    }`}
                    style={
                      selectedCategoryId === cat.id
                        ? { backgroundColor: cat.color, borderColor: cat.color }
                        : { borderColor: `${cat.color}60`, color: cat.color, backgroundColor: `${cat.color}12` }
                    }
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. 대상 역할 */}
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

          {/* 3-1. 대상 그룹 — "공통"을 맨 앞에 배치 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              🎯 대상 그룹 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['공통', ...groupOptions.filter(g => g !== '공통')].map(group => (
                <button
                  key={group}
                  type="button"
                  onClick={() => {
                    setSelectedGroups(prev =>
                      prev.includes(group as typeof groupOptions[number])
                        ? prev.filter(g => g !== group)
                        : [...prev, group as typeof groupOptions[number]]
                    );
                  }}
                  className={`px-2.5 py-1.5 border rounded-lg transition-all text-xs ${
                    selectedGroups.includes(group as typeof groupOptions[number])
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {group}
                </button>
              ))}
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
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* 6. 첨부파일 및 링크 (번호 유지) */}
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
            {submitting ? '저장 중...' : isEdit ? '수정하기' : isCopyMode ? '복사하기' : '추가하기'}
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
