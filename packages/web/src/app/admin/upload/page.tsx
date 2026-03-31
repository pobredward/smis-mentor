'use client';
import { logger } from '@smis-mentor/shared';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';
import {
  getLessonMaterialTemplates,
  addLessonMaterialTemplate,
  updateLessonMaterialTemplate,
  deleteLessonMaterialTemplate,
  LessonMaterialTemplate,
  LessonMaterialTemplateSection,
} from '@/lib/lessonMaterialService';
import { getAllJobCodes } from '@/lib/firebaseService';
import { JobCodeWithId } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="cursor-move"
    >
      {children}
    </div>
  );
}

// 소제목 인라인 에디터 컴포넌트
function SectionEditor({
  sections: initialSections,
  onSectionsChange,
}: {
  sections: LessonMaterialTemplateSection[];
  onSectionsChange: (sections: LessonMaterialTemplateSection[]) => void | Promise<void>;
}) {
  const safeSections = Array.isArray(initialSections) ? initialSections : [];
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([...safeSections].sort((a, b) => a.order - b.order));
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingLinks, setEditingLinks] = useState<{ label: string; url: string }[]>([]);
  const [newLinks, setNewLinks] = useState<{ label: string; url: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const safeSections = Array.isArray(initialSections) ? initialSections : [];
    setSections([...safeSections].sort((a, b) => a.order - b.order));
  }, [initialSections]);

  // Firestore 반영
  const saveToFirestore = async (newSections: LessonMaterialTemplateSection[]) => {
    setIsLoading(true);
    try {
      await onSectionsChange(newSections);
    } catch (error) {
      logger.error('섹션 저장 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 소제목 추가
  const handleAdd = async () => {
    if (!input.trim()) return;
    const newSection: LessonMaterialTemplateSection = {
      id: uuidv4(),
      title: input.trim(),
      order: sections.length,
      links: newLinks.filter(l => l.label && l.url),
    };
    const newSections = [...sections, newSection];
    setSections(newSections);
    setInput('');
    setNewLinks([]);
    inputRef.current?.focus();
    await saveToFirestore(newSections);
  };

  // 소제목 인라인 수정 시작
  const handleEdit = (id: string, title: string, links: { label: string; url: string }[] = []) => {
    setEditingId(id);
    setEditingValue(title);
    setEditingLinks(links.length ? links : []);
  };

  // 소제목 인라인 수정 완료
  const handleEditComplete = async () => {
    if (editingId && editingValue.trim()) {
      const newSections = sections.map(s =>
        s.id === editingId ? { ...s, title: editingValue.trim(), links: editingLinks.filter(l => l.label && l.url) } : s
      );
      setSections(newSections);
      setEditingId(null);
      setEditingValue('');
      setEditingLinks([]);
      await saveToFirestore(newSections);
    }
  };

  // 소제목 인라인 수정 취소
  const handleEditCancel = () => {
    setEditingId(null);
    setEditingValue('');
    setEditingLinks([]);
  };

  // 소제목 삭제
  const handleDelete = async (id: string) => {
    const newSections = sections.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx }));
    setSections(newSections);
    await saveToFirestore(newSections);
  };

  // 드래그
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    const newSections = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({ ...s, order: idx }));
    setSections(newSections);
    await saveToFirestore(newSections);
  };

  // 링크 추가/수정/삭제 핸들러
  const handleLinkChange = (links: { label: string; url: string }[], setLinks: (l: { label: string; url: string }[]) => void, idx: number, field: 'label' | 'url', value: string) => {
    const updated = links.map((l, i) => i === idx ? { ...l, [field]: value } : l);
    setLinks(updated);
  };
  const handleLinkAdd = (links: { label: string; url: string }[], setLinks: (l: { label: string; url: string }[]) => void) => {
    setLinks([...links, { label: '', url: '' }]);
  };
  const handleLinkRemove = (links: { label: string; url: string }[], setLinks: (l: { label: string; url: string }[]) => void, idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {sections.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">소제목이 없습니다</p>
              <p className="text-xs mt-1">아래에서 소제목을 추가해보세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sections.map(s => (
                <SortableItem key={s.id} id={s.id}>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 hover:shadow-sm transition-all group">
                    {editingId === s.id ? (
                      <div className="space-y-3">
                        <div>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            placeholder="소제목명"
                            aria-label="소제목명"
                            autoFocus
                          />
                        </div>
                        {/* 링크들 수정 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">소제목 링크들 (선택)</label>
                          <div className="space-y-2">
                            {editingLinks.map((l, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                                <div className="flex gap-2 flex-1">
                                  <input
                                    className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="링크 제목"
                                    value={l.label}
                                    onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'label', e.target.value)}
                                  />
                                  <input
                                    className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="URL"
                                    value={l.url}
                                    onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'url', e.target.value)}
                                  />
                                </div>
                                <button
                                  onClick={() => handleLinkRemove(editingLinks, setEditingLinks, idx)}
                                  className="self-start px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                                >
                                  삭제
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => handleLinkAdd(editingLinks, setEditingLinks)}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-all"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              링크 추가
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-3 border-t border-gray-200">
                          <button
                            onClick={handleEditCancel}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleEditComplete}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          >
                            완료
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 소제목 헤더 */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                              <span className="text-blue-700 font-medium text-xs">
                                {sections.findIndex(sec => sec.id === s.id) + 1}
                              </span>
                            </div>
                            <h5 className="font-medium text-gray-900 text-sm">{s.title}</h5>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(s.id, s.title, s.links)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                              title="수정"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              title="삭제"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            <div className="cursor-move text-gray-300 hover:text-emerald-500 p-1.5 rounded hover:bg-emerald-50 transition-all" style={{ touchAction: 'none' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 14 14">
                                <circle cx="3.5" cy="5" r="0.5" fill="currentColor"/>
                                <circle cx="3.5" cy="9" r="0.5" fill="currentColor"/>
                                <circle cx="7" cy="5" r="0.5" fill="currentColor"/>
                                <circle cx="7" cy="9" r="0.5" fill="currentColor"/>
                                <circle cx="10.5" cy="5" r="0.5" fill="currentColor"/>
                                <circle cx="10.5" cy="9" r="0.5" fill="currentColor"/>
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* 소제목 링크들 */}
                        {s.links && Array.isArray(s.links) && s.links.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {s.links.map((l, idx) => (
                              <a
                                key={idx}
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all border border-emerald-200"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                {l.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </SortableItem>
              ))}
            </div>
          )}
        </SortableContext>
      </DndContext>
      
      {/* 소제목 추가 폼 */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-blue-800">새 소제목 추가</h5>
        </div>
        <div className="space-y-3">
          <div>
            <input
              ref={inputRef}
              className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              placeholder="소제목 (예: 오리엔테이션)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              aria-label="소제목 입력"
            />
          </div>
          {/* 링크들 추가 */}
          <div>
            <label className="block text-sm font-medium text-blue-800 mb-2">소제목 링크들 (선택)</label>
            <div className="space-y-2">
              {newLinks.map((l, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-white rounded-lg p-2 border border-blue-100">
                  <div className="flex gap-2 flex-1">
                    <input
                      className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="링크 제목"
                      value={l.label}
                      onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'label', e.target.value)}
                    />
                    <input
                      className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="URL"
                      value={l.url}
                      onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'url', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => handleLinkRemove(newLinks, setNewLinks, idx)}
                    className="self-start px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div className="flex gap-2 justify-between items-center">
                <button
                  onClick={() => handleLinkAdd(newLinks, setNewLinks)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  링크 추가
                </button>
                <button
                  onClick={handleAdd}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                      저장 중...
                    </div>
                  ) : (
                    '소제목 추가'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminUploadTemplatePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LessonMaterialTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState('');
  const [selectedCodeFilter, setSelectedCodeFilter] = useState('');
  const [showAllGenerations, setShowAllGenerations] = useState(false);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [jobCodesLoading, setJobCodesLoading] = useState(false);
  const [referenceTemplateId, setReferenceTemplateId] = useState<string>('');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await getLessonMaterialTemplates();
      setTemplates(data);
    } catch {
      setError('템플릿을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobCodes = async () => {
    setJobCodesLoading(true);
    try {
      const codes = await getAllJobCodes();
      setJobCodes(codes);
    } catch {
      setError('직무 코드를 불러오지 못했습니다.');
    } finally {
      setJobCodesLoading(false);
    }
  };

  useEffect(() => { 
    fetchTemplates(); 
    fetchJobCodes();
  }, []);

  // 첫 로드 시 기본 기수 선택 (jobCodes가 로드된 후)
  useEffect(() => {
    if (jobCodes.length > 0 && !selectedGeneration) {
      const generations = Array.from(new Set(jobCodes.map(jc => jc.generation)))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
          const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
          return numB - numA; // 내림차순
        });
      
      if (generations.length > 0) {
        setSelectedGeneration(generations[0]);
      }
    }
  }, [jobCodes, selectedGeneration]);

  // 기수 선택 시 첫 번째 코드 자동 선택
  useEffect(() => {
    if (selectedGeneration && jobCodes.length > 0) {
      const codesForGen = Array.from(new Set(jobCodes.filter(jc => jc.generation === selectedGeneration).map(jc => jc.code)));
      if (codesForGen.length > 0 && !selectedCodeFilter) {
        setSelectedCodeFilter(codesForGen[0]);
      }
    }
  }, [selectedGeneration, jobCodes, selectedCodeFilter]);

  // 템플릿 복사
  const handleCopyTemplate = (template: LessonMaterialTemplate) => {
    setShowForm(true);
    setEditing(null);
    setTitle(template.title);
    setSections(template.sections || []);
    setSelectedCode(selectedCodeFilter); // 현재 선택된 코드 필터로 자동 설정
    setLinks(template.links || []);
    setReferenceTemplateId(template.id);
  };

  // 템플릿 추가/수정
  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }
    if (!selectedCode) {
      alert('코드를 선택해주세요.');
      return;
    }
    
    // 동일 제목 체크 (같은 코드 내에서)
    const duplicateTitle = templates.find(t => 
      t.title.trim() === title.trim() && 
      t.code === selectedCode &&
      t.id !== editing?.id // 수정 중인 경우 자기 자신은 제외
    );
    if (duplicateTitle) {
      alert(`"${title}" 템플릿이 이미 ${selectedCode}에 존재합니다.\n다른 이름을 사용해주세요.`);
      return;
    }
    
    // 링크 validation: label과 url 둘 다 있거나 둘 다 없어야 함
    const invalidLinks = links.filter(l => (l.label && !l.url) || (!l.label && l.url));
    if (invalidLinks.length > 0) {
      alert('링크 제목과 URL을 모두 입력하거나, 둘 다 비워주세요.');
      return;
    }
    
    if (editing) {
      await updateLessonMaterialTemplate(editing.id, { title, sections, code: selectedCode, links });
      setEditing(null);
    } else {
      const newId = await addLessonMaterialTemplate(title, sections, selectedCode, links);
      setTemplates(prev => [{ id: newId, title, sections, code: selectedCode, links }, ...prev]);
      setShowForm(false);
    }
    setTitle('');
    setSections([]);
    setSelectedCode('');
    setLinks([]);
    setReferenceTemplateId('');
    fetchTemplates();
  };

  // 템플릿 삭제
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 템플릿을 삭제하시겠습니까?\n\n⚠️ 사용자가 입력한 URL은 유지되지만, 이 템플릿은 더 이상 표시되지 않습니다.`)) return;
    await deleteLessonMaterialTemplate(id);
    fetchTemplates();
  };

  // 사용 가능한 기수 목록 (중복 제거 및 정렬)
  const availableGenerations = Array.from(new Set(jobCodes.map(jc => jc.generation)))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numB - numA; // 내림차순
    });

  // 선택된 기수에 해당하는 코드 목록
  const codesForSelectedGeneration = selectedGeneration
    ? Array.from(new Set(jobCodes.filter(jc => jc.generation === selectedGeneration).map(jc => jc.code)))
    : [];

  // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
  const availableCodes = (() => {
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    return codesForSelectedGeneration.sort((a, b) => {
      const aFirstChar = a.charAt(0).toUpperCase();
      const bFirstChar = b.charAt(0).toUpperCase();
      
      const aPriority = priorityOrder.indexOf(aFirstChar);
      const bPriority = priorityOrder.indexOf(bFirstChar);
      
      // 둘 다 우선순위에 있는 경우
      if (aPriority !== -1 && bPriority !== -1) {
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.localeCompare(b);
      }
      
      // a만 우선순위에 있는 경우
      if (aPriority !== -1) return -1;
      
      // b만 우선순위에 있는 경우
      if (bPriority !== -1) return 1;
      
      // 둘 다 우선순위에 없는 경우 알파벳 순서
      return a.localeCompare(b);
    });
  })();
  
  // 필터링된 템플릿 목록
  const filteredTemplates = templates.filter(t => {
    const templateCode = t.code || '미지정';
    
    // 기수 필터 적용
    if (selectedGeneration) {
      const jobCode = jobCodes.find(jc => jc.code === templateCode);
      if (!jobCode || jobCode.generation !== selectedGeneration) {
        return false;
      }
    }
    
    // 코드 필터 적용
    if (selectedCodeFilter && templateCode !== selectedCodeFilter) {
      return false;
    }
    
    return true;
  });

  // 편집 모드 진입
  const handleEdit = (template: LessonMaterialTemplate) => {
    setEditing(template);
    setTitle(template.title);
    setSections(template.sections || []);
    setSelectedCode(template.code || '');
    setLinks(template.links || []);
  };

  // 뒤로가기 (관리자 페이지로)
  const handleGoBack = () => {
    router.back();
  };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 w-full min-h-[70vh]">
        {/* 헤더 섹션 */}
        <div className="mb-6">
          <div className="flex items-center">
            <Button
              variant="secondary"
              size="sm"
              className="mr-3 text-blue-600 hover:text-blue-800 border-none shadow-none"
              onClick={handleGoBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">수업자료 템플릿 관리</h1>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed mt-1">
            캠프별 수업자료 업로드 템플릿 제작 페이지
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* 로딩 상태 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
            <p className="mt-3 text-gray-500 text-sm">템플릿을 불러오는 중...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 필터 영역 - 하나의 박스에 기수와 코드 함께 */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <div className="space-y-4">
                {/* 기수별 필터 버튼 */}
                <div>
                  <div className="flex flex-wrap gap-2">
                    {/* 처음 3개 기수만 표시 */}
                    {availableGenerations.slice(0, 3).map(gen => (
                      <button
                        key={gen}
                        className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                          selectedGeneration === gen
                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          setSelectedGeneration(gen);
                        }}
                      >
                        {gen}
                      </button>
                    ))}
                    
                    {/* 숨기기/더보기 버튼 - 3개 초과시에만 표시 */}
                    {availableGenerations.length > 3 && (
                      <button
                        className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                          showAllGenerations
                            ? 'bg-gray-400 border-gray-400 text-white'
                            : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200'
                        }`}
                        onClick={() => setShowAllGenerations(!showAllGenerations)}
                      >
                        {showAllGenerations ? '숨기기' : `더보기 (${availableGenerations.length - 3})`}
                      </button>
                    )}
                    
                    {/* 나머지 기수 표시 - 토글 시에만 표시 */}
                    {showAllGenerations && availableGenerations.slice(3).map(gen => (
                      <button
                        key={gen}
                        className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                          selectedGeneration === gen
                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          setSelectedGeneration(gen);
                        }}
                      >
                        {gen}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 캠프 코드별 필터 */}
                <div>
                  <div className="flex flex-wrap gap-2">
                    {availableCodes.map(code => {
                      const jobCode = jobCodes.find(jc => jc.code === code);
                      const templateCount = templates.filter(t => {
                        const templateCode = t.code || '미지정';
                        if (selectedGeneration) {
                          const jc = jobCodes.find(j => j.code === templateCode);
                          return templateCode === code && jc?.generation === selectedGeneration;
                        }
                        return templateCode === code;
                      }).length;
                  
                  return (
                    <button
                      key={code}
                      className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                        selectedCodeFilter === code 
                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedCodeFilter(code)}
                      title={jobCode?.name || code}
                    >
                      {code}
                      {templateCount > 0 && (
                        <span className="ml-1.5 text-xs opacity-75">
                          ({templateCount})
                        </span>
                      )}
                    </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 상단 액션 바 */}
            <div className="flex justify-end">
              {/* 템플릿 추가 버튼 */}
              <button
                onClick={() => { 
                  setShowForm(true); 
                  setEditing(null); 
                  setTitle(''); 
                  setSections([]); 
                  setSelectedCode(selectedCodeFilter); // 현재 선택된 코드 필터로 자동 설정
                  setLinks([]); 
                  setReferenceTemplateId('');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                템플릿 추가
              </button>
            </div>

            {/* 템플릿 추가/수정 폼 - 최상단에 위치 */}
            {showForm && (
              <div className="bg-white rounded-lg shadow-md p-4">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900">
                    {referenceTemplateId ? '📋 템플릿 복사' : '➕ 새 템플릿 추가'}
                  </h3>
                  <button
                    onClick={() => { 
                      setShowForm(false); 
                      setEditing(null); 
                      setTitle(''); 
                      setSections([]); 
                      setSelectedCode(''); 
                      setLinks([]); 
                      setReferenceTemplateId('');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3">
                  {/* 참조 템플릿 선택 */}
                  {!referenceTemplateId && (
                    <div>
                      <select
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        value=""
                        onChange={e => {
                          if (e.target.value) {
                            const refTemplate = templates.find(t => t.id === e.target.value);
                            if (refTemplate) {
                              setTitle(refTemplate.title);
                              setSections(refTemplate.sections || []);
                              setLinks(refTemplate.links || []);
                              setSelectedCode(selectedCodeFilter); // 현재 선택된 코드 필터로 자동 설정
                              setReferenceTemplateId(e.target.value);
                            }
                          }
                        }}
                      >
                        <option value="">💡 기존 템플릿 복사하기 (선택)</option>
                        {templates
                          .sort((a, b) => {
                            // createdAt 기준 오름차순 (추가한 순서대로)
                            const timeA = a.createdAt?.toMillis?.() || 0;
                            const timeB = b.createdAt?.toMillis?.() || 0;
                            return timeA - timeB;
                          })
                          .map(tpl => (
                            <option key={tpl.id} value={tpl.id}>
                              [{tpl.code || '미지정'}] {tpl.title}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* 템플릿명과 코드 - 그리드 레이아웃 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="템플릿명 (예: 드림멘토링)"
                      />
                    </div>
                    <div>
                      {jobCodesLoading ? (
                        <div className="text-gray-400 text-sm py-1.5">로딩 중...</div>
                      ) : (
                        <select
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          value={selectedCode}
                          onChange={e => setSelectedCode(e.target.value)}
                        >
                          <option value="">코드 선택</option>
                          {availableCodes.map(code => {
                            const jobCode = jobCodes.find(jc => jc.code === code);
                            return (
                              <option key={code} value={code}>
                                {code} - {jobCode?.name || ''}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* 대주제 링크 - 컴팩트 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-600">대주제 링크</span>
                      {links.length === 0 && (
                        <button
                          onClick={() => setLinks([{ label: '', url: '' }])}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                    {links.length > 0 && (
                      <div className="space-y-2">
                        {links.map((l, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-1.5">
                            <div className="flex gap-1.5 flex-1">
                              <input
                                className="w-24 sm:w-28 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="제목"
                                value={l.label}
                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                              />
                              <input
                                className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="URL"
                                value={l.url}
                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                              />
                            </div>
                            <button
                              onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                              className="self-start p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setLinks([...links, { label: '', url: '' }])}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          + 링크 추가
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 소제목 에디터 - 접을 수 있게 */}
                  <details open>
                    <summary className="text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-800 mb-2">
                      소제목 구성 ({sections.length}개)
                    </summary>
                    <div className="pl-2">
                      <SectionEditor sections={sections} onSectionsChange={setSections} />
                    </div>
                  </details>

                  {/* 버튼 */}
                  <div className="flex gap-2 justify-end pt-2 border-t border-gray-200">
                    <button
                      onClick={() => { 
                        setShowForm(false); 
                        setEditing(null); 
                        setTitle(''); 
                        setSections([]); 
                        setSelectedCode(''); 
                        setLinks([]); 
                        setReferenceTemplateId('');
                      }}
                      className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-all"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-all"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 템플릿 리스트 */}
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">해당 코드에 등록된 템플릿이 없습니다</p>
                <p className="text-gray-400 text-sm mt-1">새 템플릿을 추가해보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map(tpl => {
                  const sectionCount = tpl.sections?.length || 0;
                  
                  return (
                    <div key={tpl.id} className="bg-white rounded-lg shadow-md">
                      {/* 카드 헤더 */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <h3 className="font-medium text-gray-900">{tpl.title}</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                  {tpl.code || '미지정'}
                                </span>
                                <span className="text-xs text-gray-500">{sectionCount}개 소제목</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* 대주제 링크 버튼들 */}
                            {tpl.links && tpl.links.length > 0 && (
                              <div className="flex gap-1 mr-2">
                                {tpl.links.slice(0, 2).map((l, idx) => (
                                  l.label && l.url ? (
                                    <a
                                      key={idx}
                                      href={l.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                                      aria-label={l.label}
                                    >
                                      {l.label}
                                    </a>
                                  ) : null
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => handleEdit(tpl)}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                              title="템플릿 수정"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(tpl.id, tpl.title)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              title="삭제"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 카드 본문 - 항상 표시 */}
                      <div className="px-4 pb-4 border-t border-gray-100">
                        {/* 템플릿 수정 폼 - 통합 */}
                        {editing === tpl ? (
                            <div className="bg-gray-50 rounded-lg p-3 mt-3">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-900">✏️ 템플릿 수정</h4>
                                <button
                                  onClick={() => {
                                    setEditing(null);
                                    setTitle('');
                                    setSections([]);
                                    setSelectedCode('');
                                    setLinks([]);
                                  }}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              
                              <div className="space-y-3">
                                {/* 대주제 섹션 */}
                                <div className="space-y-2">
                                  <h5 className="text-xs font-semibold text-gray-700">대주제</h5>
                                  {/* 템플릿명과 코드 - 그리드 */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                      value={title}
                                      onChange={e => setTitle(e.target.value)}
                                      placeholder="템플릿명"
                                    />
                                    <select
                                      className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                        editing ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                      }`}
                                      value={selectedCode}
                                      onChange={e => setSelectedCode(e.target.value)}
                                      disabled={!!editing}
                                    >
                                      <option value="">코드 선택</option>
                                      {availableCodes.map(code => (
                                        <option key={code} value={code}>{code}</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  {/* 코드 변경 불가 안내 */}
                                  {editing && (
                                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                                      ⚠️ 템플릿 코드는 생성 후 변경할 수 없습니다. (사용자 데이터 보호)
                                    </p>
                                  )}

                                  {/* 대주제 링크들 */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-xs font-medium text-gray-600">대주제 링크</span>
                                      <button
                                        onClick={() => setLinks([...links, { label: '', url: '' }])}
                                        className="text-xs text-blue-600 hover:text-blue-700"
                                      >
                                        + 추가
                                      </button>
                                    </div>
                                    {links.length > 0 && (
                                      <div className="space-y-2">
                                        {links.map((l, idx) => (
                                          <div key={idx} className="flex flex-col sm:flex-row gap-1.5 bg-white rounded p-1.5 border border-gray-200">
                                            <div className="flex gap-1.5 flex-1">
                                              <input
                                                className="w-24 sm:w-28 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="제목"
                                                value={l.label}
                                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                                              />
                                              <input
                                                className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="URL"
                                                value={l.url}
                                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                                              />
                                            </div>
                                            <button
                                              onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                                              className="self-start p-1 text-red-500 hover:bg-red-50 rounded"
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* 소제목 섹션 */}
                                <div className="space-y-2">
                                  <h5 className="text-xs font-semibold text-gray-700">소제목</h5>
                                  <SectionEditor
                                    sections={sections}
                                    onSectionsChange={setSections}
                                  />
                                </div>

                                {/* 통합 버튼 */}
                                <div className="flex gap-2 justify-end pt-3 border-t border-gray-200">
                                  <button
                                    onClick={() => {
                                      setEditing(null);
                                      setTitle('');
                                      setSections([]);
                                      setSelectedCode('');
                                      setLinks([]);
                                    }}
                                    className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                                  >
                                    취소
                                  </button>
                                  <button
                                    onClick={handleSave}
                                    className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                                  >
                                    수정 완료
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* 읽기 전용 모드 - 소제목 표시 */
                            <div className="mt-4">
                              {tpl.sections && tpl.sections.length > 0 ? (
                                <div className="space-y-2">
                                  {tpl.sections.sort((a, b) => a.order - b.order).map((section, idx) => (
                                    <div key={section.id} className="bg-white border border-gray-200 rounded-lg p-2 text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center text-blue-700 font-medium text-xs">
                                          {idx + 1}
                                        </span>
                                        <span className="font-medium text-gray-900">{section.title}</span>
                                      </div>
                                      {section.links && section.links.length > 0 && (
                                        <div className="flex gap-1.5 flex-wrap mt-1.5 ml-7">
                                          {section.links.map((l, linkIdx) => (
                                            <a
                                              key={linkIdx}
                                              href={l.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all border border-blue-200"
                                            >
                                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                              {l.label}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400 py-4 text-center">소제목이 없습니다</p>
                              )}
                            </div>
                          )}
                        </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}