'use client';

import { useEffect, useState, useRef } from 'react';
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
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
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
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([...initialSections].sort((a, b) => a.order - b.order));
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingLinks, setEditingLinks] = useState<{ label: string; url: string }[]>([]);
  const [newLinks, setNewLinks] = useState<{ label: string; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSections([...initialSections].sort((a, b) => a.order - b.order));
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
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
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map(s => (
            <SortableItem key={s.id} id={s.id}>
              <div className="flex flex-col gap-1 mb-2 bg-white rounded px-2 py-2 border">
                {editingId === s.id ? (
                  <>
                    <div className="flex gap-2 items-center">
                      <input
                        className="flex-1 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        placeholder="소제목명"
                        aria-label="소제목명"
                        autoFocus
                      />
                      <Button size="sm" color="primary" type="button" onClick={handleEditComplete}>완료</Button>
                      <Button size="sm" color="secondary" type="button" onClick={handleEditCancel}>취소</Button>
                    </div>
                    {/* 링크들 인라인 수정 */}
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="font-medium text-sm text-gray-700">링크들 (선택)</div>
                      {editingLinks.map((l, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input
                            className="w-32 px-2 py-1 border rounded"
                            placeholder="링크 제목"
                            value={l.label}
                            onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'label', e.target.value)}
                          />
                          <input
                            className="flex-1 px-2 py-1 border rounded"
                            placeholder="URL"
                            value={l.url}
                            onChange={e => handleLinkChange(editingLinks, setEditingLinks, idx, 'url', e.target.value)}
                          />
                          <Button size="sm" color="danger" type="button" onClick={() => handleLinkRemove(editingLinks, setEditingLinks, idx)}>삭제</Button>
                        </div>
                      ))}
                      <Button size="sm" type="button" onClick={() => handleLinkAdd(editingLinks, setEditingLinks)}>+ 링크 추가</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-base">{s.title}</span>
                      <div className="flex gap-2">
                        <Button size="sm" color="secondary" type="button" onClick={() => handleEdit(s.id, s.title, s.links)}>수정</Button>
                        <Button size="sm" color="danger" type="button" onClick={() => handleDelete(s.id)}>삭제</Button>
                      </div>
                    </div>
                    {s.links && s.links.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-2">
                        {s.links.map((l, idx) => (
                          <a
                            key={idx}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 hover:bg-blue-200 transition"
                          >
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
        </SortableContext>
      </DndContext>
      {/* 소제목 추가 폼 */}
      <div className="flex flex-col gap-2 mt-2 p-3 bg-gray-50 rounded border">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-400"
            placeholder="소제목 (예: 오리엔테이션)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            aria-label="소제목 입력"
          />
          <Button type="button" onClick={handleAdd}>+ 추가</Button>
        </div>
        {/* 링크들 추가 */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="font-medium text-sm text-gray-700">링크들 (선택)</div>
          {newLinks.map((l, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                className="w-32 px-2 py-1 border rounded"
                placeholder="링크 제목"
                value={l.label}
                onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'label', e.target.value)}
              />
              <input
                className="flex-1 px-2 py-1 border rounded"
                placeholder="URL"
                value={l.url}
                onChange={e => handleLinkChange(newLinks, setNewLinks, idx, 'url', e.target.value)}
              />
              <Button size="sm" color="danger" type="button" onClick={() => handleLinkRemove(newLinks, setNewLinks, idx)}>삭제</Button>
            </div>
          ))}
          <Button size="sm" type="button" onClick={() => handleLinkAdd(newLinks, setNewLinks)}>+ 링크 추가</Button>
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [jobCodesLoading, setJobCodesLoading] = useState(false);

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
    } else {
      const newId = await addLessonMaterialTemplate(title, sections, selectedCode, links);
      setTemplates(prev => [{ id: newId, title, sections, code: selectedCode, links }, ...prev]);
    }
    setShowForm(false);
    setEditing(null);
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

  // 템플릿 소제목 변경 핸들러
  const handleSectionsChange = async (templateId: string, newSections: LessonMaterialTemplateSection[]) => {
    await updateLessonMaterialTemplate(templateId, { sections: newSections });
    // Firestore 반영 후 템플릿 목록 갱신
    fetchTemplates();
  };

  // 사용 가능한 코드 목록 (중복 제거)
  const availableCodes = Array.from(new Set(jobCodes.map(jc => jc.code))).sort();
  
  const filteredTemplates = selectedCodeFilter === '전체'
    ? templates
    : templates.filter(t => (t.code || '미지정') === selectedCodeFilter);

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
        <h1 className="text-2xl font-bold mb-4">수업자료 템플릿 관리</h1>
        <p className="text-gray-600 mb-6 text-sm">대제목(수업자료 템플릿)과 소제목(섹션) 구조를 미리 만들어두면, 유저가 업로드 시 선택해서 사용할 수 있습니다.</p>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {loading ? (
          <div className="text-center text-gray-400 py-12 border rounded-lg">로딩 중...</div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => { setShowForm(true); setEditing(null); setTitle(''); setSections([]); setSelectedCode(''); setLinks([]); }}>+ 템플릿 추가</Button>
            </div>
            {/* 코드별 필터 토글 */}
            <div className="flex flex-wrap gap-2 mb-6">
              {['전체', ...Array.from(new Set(templates.map(t => t.code || '미지정')))].map(code => (
                <button
                  key={code}
                  className={`px-3 py-1.5 text-sm rounded-full border ${selectedCodeFilter === code ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setSelectedCodeFilter(code)}
                >
                  {code}
                </button>
              ))}
            </div>
            {/* 템플릿 리스트 */}
            {filteredTemplates.length === 0 ? (
              <div className="text-center text-gray-400 py-12 border rounded-lg">해당 코드에 등록된 템플릿이 없습니다.</div>
            ) : (
              <div className="space-y-8">
                {filteredTemplates.map(tpl => (
                  <div key={tpl.id} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 relative group transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {editingTemplateId === tpl.id ? (
                          <div className="flex flex-col gap-2 w-full">
                            {/* 첫 번째 행: 템플릿명/코드/버튼 */}
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <input
                                className="font-bold text-lg border-b border-blue-400 focus:outline-none bg-transparent px-1 py-0.5"
                                value={editingTitle}
                                onChange={e => setEditingTitle(e.target.value)}
                                aria-label="템플릿명"
                                autoFocus
                              />
                              <select
                                className="text-sm border-b border-blue-200 focus:outline-none bg-transparent px-1 py-0.5"
                                value={editingCode}
                                onChange={e => setEditingCode(e.target.value)}
                                aria-label="코드"
                              >
                                <option value="">코드 선택</option>
                                {availableCodes.map(code => (
                                  <option key={code} value={code}>{code}</option>
                                ))}
                              </select>
                              <div className="flex gap-2 ml-auto">
                                <Button color="primary" onClick={async () => {
                                  await updateLessonMaterialTemplate(tpl.id, { title: editingTitle, code: editingCode, links });
                                  setEditingTemplateId(null);
                                  setLinks([]);
                                  fetchTemplates();
                                }}>완료</Button>
                                <Button color="secondary" onClick={() => {
                                  setEditingTemplateId(null);
                                  setLinks([]);
                                }}>취소</Button>
                              </div>
                            </div>
                            {/* 두 번째 행: 대주제 링크 입력 UI */}
                            <div className="bg-gray-50 border border-blue-100 rounded-lg p-4 mb-2 w-full max-w-md">
                              <div className="font-semibold mb-2">대주제 링크들 <span className="text-xs text-gray-400">(선택)</span></div>
                              {links.map((l, idx) => (
                                <div key={idx} className="flex gap-2 items-center mb-2 flex-wrap">
                                  <input
                                    className="w-40 max-w-[160px] px-2 py-1 border rounded text-sm"
                                    placeholder="링크 제목 (예: 운영방안)"
                                    value={l.label}
                                    onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                                    aria-label="링크 제목"
                                  />
                                  <input
                                    className="flex-1 min-w-0 px-2 py-1 border rounded text-sm"
                                    placeholder="URL (예: https://...)"
                                    value={l.url}
                                    onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                                    aria-label="링크 URL"
                                  />
                                  <Button size="sm" color="danger" type="button" onClick={() => setLinks(links.filter((_, i) => i !== idx))}>
                                    삭제
                                  </Button>
                                </div>
                              ))}
                              <Button
                                size="sm"
                                type="button"
                                className="mt-1"
                                onClick={() => setLinks([...links, { label: '', url: '' }])}
                              >
                                + 링크 추가
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-lg mr-2">{tpl.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-semibold">{tpl.code || '미지정'}</span>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        {editingTemplateId === tpl.id ? null : (
                          <>
                            <Button size="sm" color="secondary" onClick={() => {
                              setEditingTemplateId(tpl.id);
                              setEditingTitle(tpl.title);
                              setEditingCode(tpl.code || '');
                              setLinks(tpl.links ?? []);
                            }}>수정</Button>
                            <Button size="sm" color="danger" onClick={() => handleDelete(tpl.id)}>삭제</Button>
                            <span className="cursor-move text-gray-300 hover:text-blue-400 ml-2">
                              <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="13" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/></svg>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 대주제 links 버튼 그룹: 제목 아래에 */}
                    {editingTemplateId !== tpl.id && tpl.links && tpl.links.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {tpl.links.map((l, idx) => (
                          l.label && l.url ? (
                            <a
                              key={idx}
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium border border-blue-200 hover:bg-blue-200 transition"
                              aria-label={l.label}
                            >
                              {l.label}
                            </a>
                          ) : null
                        ))}
                      </div>
                    )}
                    {/* SectionEditor로 소제목(섹션) 리스트 및 인라인 편집 통합 */}
                    <SectionEditor
                      sections={tpl.sections}
                      onSectionsChange={newSections => handleSectionsChange(tpl.id, newSections)}
                    />
                  </div>
                ))}
              </div>
            )}
            {/* 템플릿 추가/수정 폼 */}
            {showForm && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-8">
                <div className="mb-4">
                  <label className="block font-semibold mb-1">템플릿명</label>
                  <input
                    className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-400"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="예: 드림멘토링"
                    aria-label="템플릿명"
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-semibold mb-1">코드</label>
                  {jobCodesLoading ? (
                    <div className="text-gray-400">코드 목록 로딩 중...</div>
                  ) : (
                    <select
                      className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-400"
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
                <div className="mb-4">
                  <div className="font-semibold mb-1">대주제 링크들 (선택)</div>
                  {links.length === 0 && (
                    <Button size="sm" type="button" onClick={() => setLinks([{ label: '', url: '' }])}>
                      + 링크 추가
                    </Button>
                  )}
                  {links.map((l, idx) => (
                    <div key={idx} className="flex gap-2 items-center mb-1">
                      <input
                        className="w-32 px-2 py-1 border rounded"
                        placeholder="링크 제목"
                        value={l.label}
                        onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                      />
                      <input
                        className="flex-1 px-2 py-1 border rounded"
                        placeholder="URL"
                        value={l.url}
                        onChange={e => setLinks(links.map((item, i) => i === idx ? { ...item, url: e.target.value } : item))}
                      />
                      <Button size="sm" color="danger" type="button" onClick={() => setLinks(links.filter((_, i) => i !== idx))}>
                        삭제
                      </Button>
                    </div>
                  ))}
                  {links.length > 0 && (
                    <Button size="sm" type="button" onClick={() => setLinks([...links, { label: '', url: '' }])}>
                      + 링크 추가
                    </Button>
                  )}
                </div>
                {/* 소제목(섹션) 에디터 */}
                <SectionEditor sections={sections} onSectionsChange={setSections} />
                <div className="flex gap-2 mt-6 justify-end">
                  <Button color="secondary" onClick={() => { setShowForm(false); setEditing(null); setTitle(''); setSections([]); setSelectedCode(''); setLinks([]); }}>취소</Button>
                  <Button color="primary" onClick={handleSave}>저장</Button>
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