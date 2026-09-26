'use client';
import { logger, fmtDate } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  createPersonalTask,
  updatePersonalTaskGroup,
  getPersonalTasksByGroupId,
} from '@/lib/personalTaskService';
import { isKoreanHoliday } from '@smis-mentor/shared';
import type { PersonalTask, TaskCategory } from '@smis-mentor/shared';
import { L, isEnglishUI } from '@smis-mentor/shared';

const DAYS_OF_WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_OF_WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PersonalTaskFormModalProps {
  ownerId: string;
  campCode: string;
  selectedDate: Date;
  task?: PersonalTask | null;
  categories?: TaskCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function PersonalTaskFormModal({
  ownerId,
  campCode,
  selectedDate,
  task,
  categories = [],
  onClose,
  onSuccess,
}: PersonalTaskFormModalProps) {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const DAYS_OF_WEEK = isEnglishUI() ? DAYS_OF_WEEK_EN : DAYS_OF_WEEK_KO;
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');

  // 복수 날짜 선택
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => {
    if (task?.date) return [task.date.toDate()];
    return [selectedDate];
  });

  // 달력 탐색 월/연
  const firstDate = selectedDates[0] || new Date();
  const [calMonth, setCalMonth] = useState(firstDate.getMonth());
  const [calYear, setCalYear] = useState(firstDate.getFullYear());

  // 드래그 선택
  const [isDragging, setIsDragging] = useState(false);

  const [hasTime, setHasTime] = useState(!!task?.time);
  const [time, setTime] = useState(task?.time ?? '');

  // 소요시간 — 분 단위 고정
  const [durationMinutes, setDurationMinutes] = useState(
    task?.estimatedDuration ? String(task.estimatedDuration.value) : ''
  );

  // 카테고리
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(task?.categoryId ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingGroupDates, setLoadingGroupDates] = useState(false);

  // 수정 모드이고 groupId가 있으면 그룹의 모든 날짜 로드
  useEffect(() => {
    if (isEdit && task?.groupId) {
      setLoadingGroupDates(true);
      getPersonalTasksByGroupId(task.groupId)
        .then(groupTasks => {
          if (groupTasks.length > 0) {
            const groupDates = groupTasks.map(t => t.date.toDate());
            setSelectedDates(groupDates);
            setCalMonth(groupDates[0].getMonth());
            setCalYear(groupDates[0].getFullYear());
          }
        })
        .catch(err => logger.error('그룹 날짜 로드 오류:', err))
        .finally(() => setLoadingGroupDates(false));
    }
  // task.id로 의존성 최소화 (열릴 때 한 번만 실행)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // ESC 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 전역 마우스 업 (드래그 종료)
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 날짜 선택/해제 토글
  const toggleDate = (date: Date) => {
    // 그룹 날짜 로드 중에는 날짜 선택 불가 (로드 완료 후 덮어씌워짐 방지)
    if (loadingGroupDates) return;
    const idx = selectedDates.findIndex(
      d =>
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
    );
    if (idx >= 0) {
      if (selectedDates.length > 1) setSelectedDates(prev => prev.filter((_, i) => i !== idx));
    } else {
      setSelectedDates(prev => [...prev, date]);
    }
  };

  const handleMouseDown = (date: Date) => {
    if (loadingGroupDates) return;
    setIsDragging(true);
    toggleDate(date);
  };

  const handleMouseEnter = (date: Date) => {
    if (!isDragging || loadingGroupDates) return;
    const alreadySelected = selectedDates.some(
      d =>
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
    );
    if (!alreadySelected) setSelectedDates(prev => [...prev, date]);
  };

  // 달력 렌더링
  const renderCalendar = () => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div key={`empty-${i}`} style={{ width: `${100 / 7}%`, height: '32px' }} />
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(calYear, calMonth, day);
      const isSelected = selectedDates.some(
        d =>
          d.getFullYear() === date.getFullYear() &&
          d.getMonth() === date.getMonth() &&
          d.getDate() === date.getDate()
      );
      const isToday =
        today.getDate() === day &&
        today.getMonth() === calMonth &&
        today.getFullYear() === calYear;
      const dayOfWeek = date.getDay();
      const isHoliday = isKoreanHoliday(date);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      days.push(
        <div
          key={day}
          style={{ width: `${100 / 7}%`, height: '32px' }}
          className={`flex items-center justify-center ${loadingGroupDates ? 'pointer-events-none' : ''}`}
          onMouseDown={() => handleMouseDown(date)}
          onMouseEnter={() => handleMouseEnter(date)}
          onMouseUp={() => setIsDragging(false)}
        >
          <div
            className={`w-8 h-8 flex items-center justify-center text-xs rounded-lg transition-colors select-none font-medium ${
              loadingGroupDates
                ? 'text-gray-300 cursor-not-allowed'
                : isSelected
                ? 'bg-purple-600 text-white font-semibold cursor-pointer'
                : isToday
                ? 'bg-purple-50 text-purple-600 font-semibold ring-1 ring-purple-300 cursor-pointer'
                : isHoliday || dayOfWeek === 0
                ? 'text-red-500 hover:bg-red-50 cursor-pointer'
                : isWeekend
                ? 'text-blue-500 hover:bg-blue-50 cursor-pointer'
                : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
            }`}
          >
            {day}
          </div>
        </div>
      );
    }

    return days;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(L('task.pleaseEnterATaskTitle'));
      return;
    }
    if (selectedDates.length === 0) {
      toast.error(L('task.pleaseSelectADate'));
      return;
    }

    const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    if (hasTime && time && !timePattern.test(time)) {
      toast.error(L('task.pleaseEnterTimeIn24'));
      return;
    }

    const parsedDuration =
      durationMinutes && !isNaN(Number(durationMinutes)) && Number(durationMinutes) > 0
        ? { value: Number(durationMinutes), unit: 'minutes' as const }
        : undefined;

    setIsSubmitting(true);
    try {
      if (isEdit && task) {
        // 모든 업무는 groupId를 가지므로 항상 그룹 수정 API 사용
        const originalDates = await getPersonalTasksByGroupId(task.groupId!)
          .then(tasks => tasks.map(t => t.date.toDate()));
        const datesChanged =
          originalDates.length !== selectedDates.length ||
          !originalDates.every(od =>
            selectedDates.some(
              nd =>
                nd.getFullYear() === od.getFullYear() &&
                nd.getMonth() === od.getMonth() &&
                nd.getDate() === od.getDate()
            )
          );
        await updatePersonalTaskGroup(
          task.groupId!,
          ownerId,
          campCode,
          {
            title: title.trim(),
            description: description.trim(),
            time: hasTime && time ? time : null,
            estimatedDuration: parsedDuration ?? null,
            categoryId: selectedCategoryId || null,
          },
          datesChanged ? selectedDates : undefined
        );
        toast.success(L('task.personalTaskUpdated'));
      } else {
        await createPersonalTask(ownerId, campCode, {
          title: title.trim(),
          description: description.trim(),
          dates: selectedDates,
          time: hasTime && time ? time : undefined,
          estimatedDuration: parsedDuration,
          categoryId: selectedCategoryId || undefined,
        });
        toast.success(
          selectedDates.length > 1
            ? (L('task.personalTaskAddedToV0', { v0: selectedDates.length }))
            : (L('task.personalTaskAdded'))
        );
      }
      onSuccess();
    } catch (error) {
      logger.error('개인 업무 저장 오류:', error);
      toast.error(L('task.failedToSaveTask2'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-20 sm:pb-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {isEdit ? L('task.editPersonalTask') : L('task.addPersonalTask')}
            </h3>
            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">{L('task.onlyYou')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 폼 본문 */}
        <div className="p-4 space-y-3 max-h-[calc(100vh-240px)] sm:max-h-[70vh] overflow-y-auto">

          {/* 1. 날짜 및 시간 — 달력 항상 펼쳐서 표시 */}
          <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1">
              📅 {L('task.dateTime')} <span className="text-red-500">*</span>
            </h4>

            {/* 월/년 네비게이션 */}
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                  else setCalMonth(m => m - 1);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {L('task.v0V12', { v0: new Date(calYear, calMonth).toLocaleString('en-US', { month: 'long' }), v1: calYear, v2: calMonth + 1 })}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                  else setCalMonth(m => m + 1);
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
              {DAYS_OF_WEEK.map((d, i) => (
                <div
                  key={d}
                  style={{ width: `${100 / 7}%` }}
                  className={`text-xs text-center font-medium ${
                    i === 0 || i === 6 ? 'text-red-500' : 'text-gray-600'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className="flex flex-wrap">
              {renderCalendar()}
            </div>

            {loadingGroupDates ? (
              <p className="text-[10px] text-gray-400 text-center">{L('task.loadingDates')}</p>
            ) : (
              <p className="text-[10px] text-gray-400 text-center">{L('task.clickOrDragToSelect')}</p>
            )}

            {/* 선택된 날짜 태그 목록 */}
            {selectedDates.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {[...selectedDates]
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full"
                    >
                      {fmtDate(d, 'mdw')}
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
                        className="ml-0.5 text-purple-500 hover:text-purple-800 leading-none"
                        aria-label={L('task.removeV0', { v0: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), v1: d.getMonth() + 1, v2: d.getDate() })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            )}

            {/* 시간 지정 */}
            <div>
              <label className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={e => { setHasTime(e.target.checked); if (!e.target.checked) setTime(''); }}
                  className="w-3 h-3"
                />
                <span className="text-xs font-medium text-gray-700">{L('task.setTime')}</span>
              </label>
              {hasTime && (
                <input
                  type="text"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  placeholder={L('task.n24hFormatEG14')}
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
              )}
            </div>
          </div>

          {/* 2. 카테고리 (선택) — 날짜 및 시간 바로 아래 */}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🏷️ {L('task.categoryOptional')}</label>
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
                  {L('task.none')}
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-2.5 py-1.5 border rounded-lg transition-all text-xs font-medium ${
                      selectedCategoryId === cat.id ? 'text-white' : ''
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

          {/* 3. 예상 소요시간 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">⏱️ {L('task.estimatedDurationOptional')}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                min="0"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
                placeholder="0"
                className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
              <span className="text-xs text-gray-600">{L('task.min')}</span>
            </div>
          </div>

          {/* 4. 업무 제목 */}
          <div>
            <label htmlFor="personal-task-title" className="block text-xs font-medium text-gray-700 mb-1">
              ✏️ {L('task.taskTitle2')} <span className="text-red-500">*</span>
            </label>
            <input
              id="personal-task-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={L('task.eGStudentFeedbackReview')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* 5. 업무 설명 */}
          <div>
            <label htmlFor="personal-task-desc" className="block text-xs font-medium text-gray-700 mb-1">
              📝 {L('task.description')}
            </label>
            <textarea
              id="personal-task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={L('task.detailedDescriptionOfTheTask')}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {L('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {L('task.saving')}
              </>
            ) : (
              isEnglishUI() ? (isEdit ? 'Save' : 'Add') : (isEdit ? L('task.save') : L('task.add2'))
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
