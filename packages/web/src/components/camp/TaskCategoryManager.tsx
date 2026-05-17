'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  createTaskCategory,
  updateTaskCategory,
  deleteTaskCategory,
  getTaskCategories,
} from '@/lib/taskCategoryService';
import type { TaskCategory } from '@smis-mentor/shared';

// 관리자가 선택할 수 있는 프리셋 색상
// 각 계열 5단계 (연→진): 300 / 400 / 500 / 600 / 700
const PRESET_COLORS = [
  // 빨강 (red)
  '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c',
  // 주황 (orange)
  '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c',
  // 노랑 (yellow / amber)
  '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309',
  // 초록 (green)
  '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d',
  // 청록 (teal)
  '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e',
  // 파랑 (blue)
  '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
  // 보라 (violet / purple)
  '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9',
  // 분홍 (pink)
  '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d',
];

interface TaskCategoryManagerProps {
  campCode: string;
  adminUserId: string;
  onCategoriesChange: () => void;
  onClose: () => void;
}

export default function TaskCategoryManager({
  campCode,
  adminUserId,
  onCategoriesChange,
  onClose,
}: TaskCategoryManagerProps) {
  // 내부에서 직접 카테고리 상태 관리 (prop으로 받으면 추가/수정/삭제 후 갱신 안 됨)
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[27]);
  const [isAdding, setIsAdding] = useState(false);

  // 모달 마운트 시 카테고리 로드
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingCategories(true);
        const list = await getTaskCategories(campCode);
        setCategories(list);
      } catch (error) {
        logger.error('카테고리 로드 오류:', error);
        toast.error('카테고리를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoadingCategories(false);
      }
    };
    load();
  }, [campCode]);

  // CRUD 후 내부 목록 갱신 + 부모에도 알림
  const refreshCategories = async () => {
    try {
      const list = await getTaskCategories(campCode);
      setCategories(list);
      onCategoriesChange();
    } catch (error) {
      logger.error('카테고리 갱신 오류:', error);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error('카테고리 이름을 입력해주세요.');
      return;
    }
    setIsAdding(true);
    try {
      await createTaskCategory(campCode, { name: newName, color: newColor, createdBy: adminUserId });
      toast.success(`"${newName}" 카테고리가 추가되었습니다.`);
      setNewName('');
      setNewColor(PRESET_COLORS[27]);
      await refreshCategories();
    } catch (error) {
      logger.error('카테고리 추가 오류:', error);
      toast.error('카테고리 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const startEdit = (cat: TaskCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) {
      toast.error('카테고리 이름을 입력해주세요.');
      return;
    }
    setIsSaving(true);
    try {
      await updateTaskCategory(editingId, { name: editName, color: editColor });
      toast.success('카테고리가 수정되었습니다.');
      setEditingId(null);
      await refreshCategories();
    } catch (error) {
      logger.error('카테고리 수정 오류:', error);
      toast.error('카테고리 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cat: TaskCategory) => {
    if (!confirm(`"${cat.name}" 카테고리를 삭제할까요?\n해당 카테고리가 지정된 기존 업무는 카테고리 없음으로 표시됩니다.`)) return;
    try {
      await deleteTaskCategory(cat.id);
      toast.success(`"${cat.name}" 카테고리가 삭제되었습니다.`);
      await refreshCategories();
    } catch (error) {
      logger.error('카테고리 삭제 오류:', error);
      toast.error('카테고리 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">카테고리 관리</h2>
            <p className="text-xs text-gray-400 mt-0.5">공통/개인 업무 모두 적용됩니다</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 카테고리 목록 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {loadingCategories ? (
            <p className="text-center text-sm text-gray-400 py-6">불러오는 중...</p>
          ) : categories.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">등록된 카테고리가 없습니다.</p>
          ) : null}

          {categories.map(cat => (
            <div key={cat.id}>
              {editingId === cat.id ? (
                // 수정 폼
                <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          editColor === c ? 'ring-2 ring-offset-1 ring-gray-700 scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="flex-1 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                // 카테고리 행
                <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">{cat.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      aria-label="수정"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="삭제"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 신규 카테고리 추가 */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-500">새 카테고리 추가</p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="카테고리 이름 (예: 수업 준비)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {/* 색상 선택 */}
          <div className="grid grid-cols-5 gap-1.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  newColor === c ? 'ring-2 ring-offset-1 ring-gray-700 scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
          {/* 미리보기 */}
          {newName.trim() && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${newColor}18` }}>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: newColor }} />
              <span className="text-xs font-medium" style={{ color: newColor }}>{newName}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || !newName.trim()}
            className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isAdding ? '추가 중...' : '카테고리 추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
