'use client';

import { useEffect, useState, useRef } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
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
  onSectionsChange: (sections: LessonMaterialTemplateSection[]) => void;
}) {
  const safeSections = Array.isArray(initialSections) ? initialSections : [];
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([...safeSections].sort((a, b) => a.order - b.order));
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingLinks, setEditingLinks] = useState<{ label: string; url: string }[]>([]);
  const [newLinks, setNewLinks] = useState<{ label: string; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const safeSections = Array.isArray(initialSections) ? initialSections : [];
    setSections([...safeSections].sort((a, b) => a.order - b.order));
  }, [initialSections]);

  // Firestore 반영
  const saveToFirestore = (newSections: LessonMaterialTemplateSection[]) => {
    onSectionsChange(newSections);
  };

  // 소제목 추가
  const handleAdd = () => {
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
    saveToFirestore(newSections);
  };

  // 소제목 인라인 수정 시작
  const handleEdit = (id: string, title: string, links: { label: string; url: string }[] = []) => {
    setEditingId(id);
    setEditingValue(title);
    setEditingLinks(links.length ? links : []);
  };

  // 소제목 인라인 수정 완료
  const handleEditComplete = () => {
    if (editingId && editingValue.trim()) {
      const newSections = sections.map(s =>
        s.id === editingId ? { ...s, title: editingValue.trim(), links: editingLinks.filter(l => l.label && l.url) } : s
      );
      setSections(newSections);
      setEditingId(null);
      setEditingValue('');
      setEditingLinks([]);
      saveToFirestore(newSections);
    }
  };

  // 소제목 인라인 수정 취소
  const handleEditCancel = () => {
    setEditingId(null);
    setEditingValue('');
    setEditingLinks([]);
  };

  // 소제목 삭제
  const handleDelete = (id: string) => {
    const newSections = sections.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx }));
    setSections(newSections);
    saveToFirestore(newSections);
  };

  // 드래그
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    const newSections = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({ ...s, order: idx }));
    setSections(newSections);
    saveToFirestore(newSections);
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
                  <div className="bg-white border border-emerald-100 rounded-lg p-3 hover:border-emerald-200 hover:shadow-sm transition-all group">
                    {editingId === s.id ? (
                      <div className="space-y-3">
                        <div>
                          <input
                            className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent transition-all bg-white"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            placeholder="소제목명"
                            aria-label="소제목명"
                            autoFocus
                          />
                        </div>
                        {/* 링크들 수정 */}
                        <div>
                          <label className="block text-sm font-medium text-emerald-800 mb-2">소제목 링크들 (선택)</label>
                          <div className="space-y-2">
                            {editingLinks.map((l, idx) => (
                              <div key={idx} className="flex gap-2 items-center bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                                <input
                                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  placeholder="링크 제목"
                                  value={l.label}
                                  onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'label', e.target.value)}
                                />
                                <input
                                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  placeholder="URL"
                                  value={l.url}
                                  onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'url', e.target.value)}
                                />
                                <button
                                  onClick={() => handleLinkRemove(editingLinks, setEditingLinks, idx)}
                                  className="px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                                >
                                  삭제
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => handleLinkAdd(editingLinks, setEditingLinks)}
                              className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 transition-all"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              링크 추가
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-3 border-t border-emerald-200">
                          <button
                            onClick={handleEditCancel}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleEditComplete}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
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
                            <div className="w-6 h-6 bg-emerald-100 rounded flex items-center justify-center">
                              <span className="text-emerald-700 font-medium text-xs">
                                {sections.findIndex(sec => sec.id === s.id) + 1}
                              </span>
                            </div>
                            <h5 className="font-medium text-gray-900 text-sm">{s.title}</h5>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(s.id, s.title, s.links)}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
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
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-emerald-800">새 소제목 추가</h5>
        </div>
        <div className="space-y-3">
          <div>
            <input
              ref={inputRef}
              className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent transition-all bg-white"
              placeholder="소제목 (예: 오리엔테이션)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              aria-label="소제목 입력"
            />
          </div>
          {/* 링크들 추가 */}
          <div>
            <label className="block text-sm font-medium text-emerald-800 mb-2">소제목 링크들 (선택)</label>
            <div className="space-y-2">
              {newLinks.map((l, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-white rounded-lg p-2 border border-emerald-100">
                  <input
                    className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="링크 제목"
                    value={l.label}
                    onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'label', e.target.value)}
                  />
                  <input
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="URL"
                    value={l.url}
                    onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'url', e.target.value)}
                  />
                  <button
                    onClick={() => handleLinkRemove(newLinks, setNewLinks, idx)}
                    className="px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div className="flex gap-2 justify-between items-center">
                <button
                  onClick={() => handleLinkAdd(newLinks, setNewLinks)}
                  className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  링크 추가
                </button>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                >
                  소제목 추가
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
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LessonMaterialTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedCodeFilter, setSelectedCodeFilter] = useState('전체');
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [jobCodesLoading, setJobCodesLoading] = useState(false);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

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

  // 템플릿 추가/수정
  const handleSave = async () => {
    if (!title.trim()) return;
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
    fetchTemplates();
  };

  // 템플릿 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteLessonMaterialTemplate(id);
    fetchTemplates();
  };

  // 사용 가능한 코드 목록 (중복 제거)
  const availableCodes = Array.from(new Set(jobCodes.map(jc => jc.code))).sort((a, b) => {
    // 숫자 부분을 추출하여 비교 (예: "D26" -> 26, "F23_1" -> 23)
    const getNumericPart = (code: string) => {
      const match = code.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    
    const numA = getNumericPart(a);
    const numB = getNumericPart(b);
    
    // 숫자가 높은 것부터 (내림차순)
    if (numA !== numB) {
      return numB - numA;
    }
    
    // 숫자가 같으면 문자열로 비교 (알파벳 순)
    return a.localeCompare(b) as number;
  });
  
  const filteredTemplates = selectedCodeFilter === '전체'
    ? templates
    : templates.filter(t => (t.code || '미지정') === selectedCodeFilter);

  // 토글 함수 - 토글 시 바로 편집 모드로 진입
  const toggleTemplate = (template: LessonMaterialTemplate) => {
    setExpandedTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(template.id)) {
        newSet.delete(template.id);
        // 접을 때 편집 모드 해제
        if (editing?.id === template.id) {
          setEditing(null);
          setTitle('');
          setSections([]);
          setSelectedCode('');
          setLinks([]);
        }
      } else {
        newSet.add(template.id);
        // 펼칠 때 편집 모드로 진입
        setEditing(template);
        setTitle(template.title);
        setSections(template.sections || []);
        setSelectedCode(template.code || '');
        setLinks(template.links || []);
      }
      return newSet;
    });
  };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 w-full min-h-[70vh]">
        {/* 헤더 섹션 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">수업자료 템플릿 관리</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
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
          <div className="space-y-3">
            {/* 상단 액션 바 */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              {/* 코드별 필터 */}
              <div className="flex flex-wrap gap-2">
                {['전체', ...Array.from(new Set(templates.map(t => t.code || '미지정')))].map(code => (
                  <button
                    key={code}
                    className={`px-3 py-1.5 text-sm font-medium rounded border transition-all ${
                      selectedCodeFilter === code 
                        ? 'bg-blue-500 border-blue-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedCodeFilter(code)}
                  >
                    {code}
                  </button>
                ))}
              </div>
              
              {/* 템플릿 추가 버튼 */}
              <button
                onClick={() => { 
                  setShowForm(true); 
                  setEditing(null); 
                  setTitle(''); 
                  setSections([]); 
                  setSelectedCode(''); 
                  setLinks([]); 
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                템플릿 추가
              </button>
            </div>

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
                  const isExpanded = expandedTemplates.has(tpl.id);
                  const sectionCount = tpl.sections?.length || 0;
                  
                  return (
                    <div key={tpl.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                      {/* 카드 헤더 - 항상 표시 */}
                      <div 
                        className="p-4 cursor-pointer"
                        onClick={() => toggleTemplate(tpl)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
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
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={l.label}
                                    >
                                      {l.label}
                                    </a>
                                  ) : null
                                ))}
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(tpl.id);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              title="삭제"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            <svg 
                              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* 카드 본문 - 토글로 표시/숨김 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100">
                          {/* 템플릿 수정 폼 */}
                          {editing === tpl && (
                            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl p-4 mt-4 mb-6 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </div>
                                <h4 className="text-base font-semibold text-indigo-900">대주제 관리</h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-indigo-800 mb-1">템플릿명</label>
                                  <input
                                    className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    aria-label="템플릿명"
                                    autoFocus
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-indigo-800 mb-1">코드</label>
                                  <select
                                    className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                                    value={selectedCode}
                                    onChange={e => setSelectedCode(e.target.value)}
                                    aria-label="코드"
                                  >
                                    <option value="">코드 선택</option>
                                    {availableCodes.map(code => (
                                      <option key={code} value={code}>{code}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              {/* 대주제 링크 수정 */}
                              <div className="mt-3">
                                <label className="block text-sm font-medium text-indigo-800 mb-2">대주제 링크들 (선택)</label>
                                <div className="space-y-2">
                                  {links.map((l, idx) => (
                                    <div key={idx} className="flex gap-2 items-center bg-white rounded-lg p-2 border border-indigo-100">
                                      <input
                                        className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        placeholder="링크 제목"
                                        value={l.label}
                                        onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                                      />
                                      <input
                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        placeholder="URL"
                                        value={l.url}
                                        onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                                      />
                                      <button
                                        onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                                        className="px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => setLinks([...links, { label: '', url: '' }])}
                                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 transition-all"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    링크 추가
                                  </button>
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end pt-4 border-t border-indigo-200 mt-4">
                                <button
                                  onClick={() => {
                                    setEditing(null);
                                    setLinks([]);
                                  }}
                                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
                                >
                                  취소
                                </button>
                                <button
                                  onClick={handleSave}
                                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                >
                                  수정 완료
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* SectionEditor로 소제목 관리 - 항상 표시 */}
                          <div className="mt-6">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-5 h-5 bg-emerald-500 rounded flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                              </div>
                              <h4 className="text-base font-semibold text-emerald-800">소제목 관리</h4>
                            </div>
                            <SectionEditor
                              sections={editing === tpl ? sections : (tpl.sections || [])}
                              onSectionsChange={editing === tpl ? setSections : (newSections) => {
                                // 편집 모드가 아닐 때는 바로 저장
                                updateLessonMaterialTemplate(tpl.id, { sections: newSections });
                                fetchTemplates();
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 템플릿 추가/수정 폼 */}
            {showForm && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">새 템플릿 추가</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">템플릿명</label>
                    <input
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="예: 드림멘토링"
                      aria-label="템플릿명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">코드</label>
                    {jobCodesLoading ? (
                      <div className="text-gray-400 text-sm">코드 목록 로딩 중...</div>
                    ) : (
                      <select
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={selectedCode}
                        onChange={e => setSelectedCode(e.target.value)}
                        aria-label="코드"
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
                  {/* 대주제 링크 입력 UI */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">대주제 링크들 (선택)</label>
                    <div className="space-y-2">
                      {links.length === 0 ? (
                        <button
                          onClick={() => setLinks([{ label: '', url: '' }])}
                          className="text-sm text-blue-600 hover:text-blue-700 transition-all"
                        >
                          + 링크 추가
                        </button>
                      ) : (
                        <>
                          {links.map((l, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <input
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="링크 제목"
                                value={l.label}
                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                              />
                              <input
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="URL"
                                value={l.url}
                                onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                              />
                              <button
                                onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                                className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-all"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setLinks([...links, { label: '', url: '' }])}
                            className="text-sm text-blue-600 hover:text-blue-700 transition-all"
                          >
                            + 링크 추가
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* 소제목(섹션) 에디터 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">소제목 구성</label>
                    <SectionEditor sections={sections} onSectionsChange={setSections} />
                  </div>
                  <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={() => { 
                        setShowForm(false); 
                        setEditing(null); 
                        setTitle(''); 
                        setSections([]); 
                        setSelectedCode(''); 
                        setLinks([]); 
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
} 