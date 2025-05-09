'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/common/Button';
import toast from 'react-hot-toast';
import {
  getLessonMaterials,
  addLessonMaterial,
  updateLessonMaterial,
  deleteLessonMaterial,
  reorderLessonMaterials,
  getSections,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  LessonMaterialData,
  SectionData,
  getLessonMaterialTemplates,
  LessonMaterialTemplate,
} from '@/lib/lessonMaterialService';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

// SectionData 타입 확장 (관리자 links 지원)
type SectionDataWithLinks = SectionData & { links?: { label: string; url: string }[] };

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      className="cursor-move"
    >
      {children}
    </div>
  );
}

function SectionForm({
  onSave,
  onCancel,
  initial,
}: {
  onSave: (data: Omit<SectionData, 'id'>) => void;
  onCancel: () => void;
  initial?: Partial<SectionData>;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [viewUrl, setViewUrl] = useState(initial?.viewUrl || '');
  const [templateUrl, setTemplateUrl] = useState(initial?.templateUrl || '');
  const [originalUrl, setOriginalUrl] = useState(initial?.originalUrl || '');
  return (
    <form
      className="space-y-2 bg-gray-50 border border-blue-200 rounded-lg p-4"
      onSubmit={event => {
        event.preventDefault();
        onSave({
          title,
          viewUrl,
          templateUrl,
          originalUrl,
          order: initial?.order ?? 0,
        });
      }}
    >
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        placeholder="소제목"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
        aria-label="소제목"
      />
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        placeholder="보기 링크"
        value={viewUrl}
        onChange={e => setViewUrl(e.target.value)}
        aria-label="보기 링크"
      />
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        placeholder="템플릿 링크"
        value={templateUrl}
        onChange={e => setTemplateUrl(e.target.value)}
        aria-label="템플릿 링크"
      />
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        placeholder="원본 링크"
        value={originalUrl}
        onChange={e => setOriginalUrl(e.target.value)}
        aria-label="원본 링크"
      />
      <div className="flex gap-2 justify-end mt-2">
        <Button type="button" onClick={onCancel} color="secondary">취소</Button>
        <Button type="submit">저장</Button>
      </div>
    </form>
  );
}

function LessonMaterialForm({
  onSave,
  onCancel,
  initial,
}: {
  onSave: (title: string) => void;
  onCancel: () => void;
  initial?: string;
}) {
  const [title, setTitle] = useState(initial || '');
  return (
    <form
      className="flex gap-2 bg-gray-50 border border-blue-200 rounded-lg p-4"
      onSubmit={event => {
        event.preventDefault();
        onSave(title);
      }}
    >
      <input
        className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        placeholder="대제목 (예: 드림멘토링)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
        aria-label="대제목"
      />
      <Button type="button" onClick={onCancel} color="secondary">취소</Button>
      <Button type="submit">저장</Button>
    </form>
  );
}

export default function UploadPage() {
  const { userData } = useAuth();
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingMaterial, setEditingMaterial] = useState<LessonMaterialData | null>(null);
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<{ materialId: string; section: SectionDataWithLinks } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedMaterialGeneration, setSelectedMaterialGeneration] = useState<string>('전체');
  const [selectedTemplateGeneration, setSelectedTemplateGeneration] = useState<string>('');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 대제목별 generation 매핑
  const materialGenerationMap: Record<string, string> = {};
  materials.forEach(m => {
    if (m.templateId) {
      const tpl = templates.find(t => t.id === m.templateId);
      materialGenerationMap[m.id] = tpl?.generation || '미지정';
    } else {
      materialGenerationMap[m.id] = '미지정';
    }
  });
  const allMaterialGenerations = Array.from(new Set(Object.values(materialGenerationMap)));
  const sortedMaterialGenerations = allMaterialGenerations.sort((a, b) => {
    if (a === '미지정') return 1;
    if (b === '미지정') return -1;
    const numA = parseInt(a.replace(/[^0-9]/g, ''));
    const numB = parseInt(b.replace(/[^0-9]/g, ''));
    return numB - numA;
  });
  const filteredMaterials = selectedMaterialGeneration === '전체'
    ? materials
    : materials.filter(m => materialGenerationMap[m.id] === selectedMaterialGeneration);

  // 대제목/소제목 fetch
  const fetchAll = async () => {
    if (!userData) return;
    setLoading(true);
    try {
      const mats = await getLessonMaterials(userData.userId);
      setMaterials(mats);
      // 템플릿 미리 fetch (중복 방지)
      const templateIds = Array.from(new Set(mats.map(m => m.templateId).filter(Boolean)));
      let templateMap: Record<string, LessonMaterialTemplate> = {};
      if (templateIds.length > 0) {
        // 이미 불러온 templates state 활용 (최신성 보장 위해 getLessonMaterialTemplates로 fetch한 후 filter)
        const allTemplates = templates.length > 0 ? templates : await getLessonMaterialTemplates();
        templateMap = Object.fromEntries(allTemplates.filter(t => templateIds.includes(t.id)).map(t => [t.id, t]));
      }
      const sectionMap: Record<string, SectionDataWithLinks[]> = {};
      for (const m of mats) {
        const userSections = await getSections(m.id);
        if (m.templateId && templateMap[m.templateId]) {
          const tplSections = templateMap[m.templateId].sections;
          sectionMap[m.id] = userSections.map((userSec, idx) => {
            // 템플릿 section과 title로 우선 매칭, 없으면 order로 매칭
            const tplSec = tplSections.find(ts => ts.title === userSec.title) || tplSections.find(ts => ts.order === userSec.order) || tplSections[idx];
            return {
              ...userSec,
              links: tplSec?.links || [],
            };
          });
        } else {
          sectionMap[m.id] = userSections.map(s => ({ ...s, links: (s as SectionDataWithLinks).links || [] }));
        }
      }
      setSections(sectionMap);
    } catch {
      setError('수업 자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    setTemplatesLoading(true);
    getLessonMaterialTemplates().then(tpls => {
      setTemplates(tpls);
      setTemplatesLoading(false);
    });
    if (sortedMaterialGenerations.length > 0) setSelectedMaterialGeneration(sortedMaterialGenerations[0]);
    if (templates.length > 0) {
      const allGenerations = Array.from(new Set(templates.map(t => t.generation || '미지정')));
      const sortedGenerations = allGenerations.sort((a, b) => {
        if (a === '미지정') return 1;
        if (b === '미지정') return -1;
        const numA = parseInt(a.replace(/[^0-9]/g, ''));
        const numB = parseInt(b.replace(/[^0-9]/g, ''));
        return numB - numA;
      });
      setSelectedTemplateGeneration(sortedGenerations[0] || '');
    }
    // eslint-disable-next-line
  }, [userData]);

  // 대제목 수정
  const handleEditMaterial = async (id: string, title: string) => {
    await updateLessonMaterial(id, { title });
    setEditingMaterial(null);
    toast.success('대제목이 수정되었습니다.');
    fetchAll();
  };

  // 대제목 삭제
  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteLessonMaterial(id);
    toast.success('대제목이 삭제되었습니다.');
    fetchAll();
  };

  // 대제목 순서변경
  const handleMaterialDragEnd = async (event: import('@dnd-kit/core').DragEndEvent) => {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;
    const oldIndex = materials.findIndex((m: LessonMaterialData) => m.id === String(active.id));
    const newIndex = materials.findIndex((m: LessonMaterialData) => m.id === String(over.id));
    const newMaterials = arrayMove(materials, oldIndex, newIndex);
    setMaterials(newMaterials);
    await reorderLessonMaterials(userData!.userId, newMaterials.map(m => m.id));
    toast.success('대제목 순서가 변경되었습니다.');
    fetchAll();
  };

  // 소제목 추가
  const handleAddSection = async (materialId: string, data: Omit<SectionData, 'id'> & { links?: { label: string; url: string }[] }) => {
    const order = sections[materialId]?.length || 0;
    await addSection(materialId, { ...data, order } as Omit<SectionData, 'id'>);
    setAddingSectionFor(null);
    toast.success('소제목이 추가되었습니다.');
    fetchAll();
  };

  // 소제목 수정
  const handleEditSection = async (materialId: string, sectionId: string, data: Omit<SectionData, 'id'> & { links?: { label: string; url: string }[] }) => {
    await updateSection(materialId, sectionId, data as Omit<SectionData, 'id'>);
    setEditingSection(null);
    toast.success('소제목이 수정되었습니다.');
    fetchAll();
  };

  // 소제목 삭제
  const handleDeleteSection = async (materialId: string, sectionId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteSection(materialId, sectionId);
    toast.success('소제목이 삭제되었습니다.');
    fetchAll();
  };

  // 소제목 순서변경
  const handleSectionDragEnd = async (materialId: string, event: import('@dnd-kit/core').DragEndEvent) => {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;
    const oldIndex = sections[materialId].findIndex((s: SectionDataWithLinks) => s.id === String(active.id));
    const newIndex = sections[materialId].findIndex((s: SectionDataWithLinks) => s.id === String(over.id));
    const newSections = arrayMove(sections[materialId], oldIndex, newIndex);
    setSections(prev => ({ ...prev, [materialId]: newSections }));
    await reorderSections(materialId, newSections.map(s => s.id));
    toast.success('소제목 순서가 변경되었습니다.');
    fetchAll();
  };

  // 템플릿 기반 대제목 추가
  const handleAddMaterialFromTemplate = async (tpl: LessonMaterialTemplate) => {
    if (!userData) return;
    if (materials.some(m => m.title === tpl.title)) return;
    const order = materials.length;
    const materialId = await addLessonMaterial(userData.userId, tpl.title, order, tpl.id);
    for (const section of tpl.sections.sort((a, b) => a.order - b.order)) {
      await addSection(materialId, { ...section, viewUrl: '', templateUrl: '', originalUrl: '', order: section.order } as Omit<SectionData, 'id'>);
    }
    setShowTemplateSelect(false);
    toast.success('템플릿이 추가되었습니다.');
    fetchAll();
  };

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        로그인 후 이용 가능합니다.
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
        <h1 className="text-2xl font-bold mb-2">수업 자료</h1>
        <p className="text-gray-600 mb-6 text-sm">본인이 만든 수업자료 링크를 업로드하고 관리할 수 있습니다</p>
        {/* 기수별 토글 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            className={`px-3 py-1.5 text-sm rounded-full border ${selectedMaterialGeneration === '전체' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setSelectedMaterialGeneration('전체')}
          >전체</button>
          {sortedMaterialGenerations.map(gen => (
            <button
              key={gen}
              className={`px-3 py-1.5 text-sm rounded-full border ${selectedMaterialGeneration === gen ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setSelectedMaterialGeneration(gen)}
            >{gen}</button>
          ))}
        </div>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {loading ? (
          <div className="text-center text-gray-400 py-12 border rounded-lg">로딩 중...</div>
        ) : (
          <div className="space-y-6">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMaterialDragEnd}>
              <SortableContext items={filteredMaterials.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {filteredMaterials.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 border rounded-lg">해당 기수에 등록된 수업 자료가 없습니다.</div>
                ) : (
                  <div className="space-y-6">
                    {filteredMaterials.map((m) => (
                      <SortableItem key={m.id} id={m.id}>
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 relative group transition-all">
                          <div className="flex items-center justify-between mb-4">
                            {editingMaterial?.id === m.id ? (
                              <LessonMaterialForm
                                initial={editingMaterial.title}
                                onSave={title => handleEditMaterial(editingMaterial.id, title)}
                                onCancel={() => setEditingMaterial(null)}
                              />
                            ) : (
                              <>
                                <span className="text-xl font-bold">{m.title}</span>
                                <div className="flex gap-2 items-center">
                                  <Button size="sm" color="secondary" onClick={() => setEditingMaterial(m)}>수정</Button>
                                  <Button size="sm" color="danger" onClick={() => handleDeleteMaterial(m.id)}>삭제</Button>
                                  <span className="cursor-move text-gray-300 hover:text-blue-400 ml-2">
                                    <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="13" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/></svg>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          {/* 소제목 카드들 */}
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={event => handleSectionDragEnd(m.id, event)}
                          >
                            <SortableContext items={sections[m.id]?.map(s => s.id) || []} strategy={verticalListSortingStrategy}>
                              <div className="space-y-3">
                                {sections[m.id]?.length === 0 ? (
                                  <div className="text-gray-400">소제목이 없습니다.</div>
                                ) : (
                                  sections[m.id]?.map((s) => (
                                    <SortableItem key={s.id} id={s.id}>
                                      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm relative group">
                                        {editingSection?.materialId === m.id && editingSection?.section.id === s.id ? (
                                          <SectionForm
                                            initial={editingSection.section}
                                            onSave={data => handleEditSection(m.id, s.id, data)}
                                            onCancel={() => setEditingSection(null)}
                                          />
                                        ) : (
                                          <>
                                            {/* 소제목 제목 + 버튼들 한 줄에 우측 정렬 */}
                                            <div className="flex items-center justify-between mb-1">
                                              <div className="font-medium text-base">{s.title}</div>
                                              <div className="flex gap-2 items-center ml-2">
                                                <Button size="sm" color="secondary" onClick={() => setEditingSection({ materialId: m.id, section: s })}>수정</Button>
                                                <Button size="sm" color="danger" onClick={() => handleDeleteSection(m.id, s.id)}>삭제</Button>
                                                <span className="cursor-move text-gray-300 hover:text-blue-400 ml-2">
                                                  <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="13" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/></svg>
                                                </span>
                                              </div>
                                            </div>
                                            {/* 링크 코드 버튼들 (아래 줄, 작게) */}
                                            {s.links && Array.isArray(s.links) && s.links.length > 0 && (
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
                                            <div className="flex gap-2 mb-1">
                                              <a
                                                href={s.viewUrl || undefined}
                                                target="_blank"
                                                rel="noopener"
                                                className={`inline-block px-3 py-1 rounded-full text-sm font-medium transition
                                                  ${s.viewUrl
                                                    ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-400'
                                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60 pointer-events-none'}
                                                `}
                                              >
                                                보기
                                              </a>
                                              <a
                                                href={s.templateUrl || undefined}
                                                target="_blank"
                                                rel="noopener"
                                                className={`inline-block px-3 py-1 rounded-full text-sm font-medium transition
                                                  ${s.templateUrl
                                                    ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-400'
                                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60 pointer-events-none'}
                                                `}
                                              >
                                                템플릿
                                              </a>
                                              <a
                                                href={s.originalUrl || undefined}
                                                target="_blank"
                                                rel="noopener"
                                                className={`inline-block px-3 py-1 rounded-full text-sm font-medium transition
                                                  ${s.originalUrl
                                                    ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-400'
                                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60 pointer-events-none'}
                                                `}
                                              >
                                                원본
                                              </a>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </SortableItem>
                                  ))
                                )}
                              </div>
                            </SortableContext>
                          </DndContext>
                          {/* 소제목 추가 폼 */}
                          {addingSectionFor === m.id ? (
                            <SectionForm
                              onSave={data => handleAddSection(m.id, data)}
                              onCancel={() => setAddingSectionFor(null)}
                            />
                          ) : (
                            <div className="mt-3">
                              <Button size="sm" className="w-full" onClick={() => setAddingSectionFor(m.id)}>+ 소제목 추가</Button>
                            </div>
                          )}
                        </div>
                      </SortableItem>
                    ))}
                  </div>
                )}
              </SortableContext>
            </DndContext>
            {/* 대제목 추가 버튼 및 템플릿 선택 모달 */}
            <div className="flex justify-center mt-8">
              <Button size="lg" className="px-8 py-3 text-base font-semibold rounded-xl shadow" onClick={() => setShowTemplateSelect(true)}>+ 대제목 추가</Button>
            </div>
            {showTemplateSelect && (
              <TemplateSelectModal
                templates={templates}
                loading={templatesLoading}
                selectedGeneration={selectedTemplateGeneration}
                setSelectedGeneration={setSelectedTemplateGeneration}
                onSelect={handleAddMaterialFromTemplate}
                onClose={() => setShowTemplateSelect(false)}
                materials={materials}
              />
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function TemplateSelectModal({
  templates,
  loading,
  selectedGeneration,
  setSelectedGeneration,
  onSelect,
  onClose,
  materials,
}: {
  templates: LessonMaterialTemplate[];
  loading: boolean;
  selectedGeneration: string;
  setSelectedGeneration: (gen: string) => void;
  onSelect: (tpl: LessonMaterialTemplate) => void;
  onClose: () => void;
  materials: LessonMaterialData[];
}) {
  const allGenerations = Array.from(new Set(templates.map(t => t.generation || '미지정')));
  const sortedGenerations = allGenerations.sort((a, b) => {
    if (a === '미지정') return 1;
    if (b === '미지정') return -1;
    const numA = parseInt(a.replace(/[^0-9]/g, ''));
    const numB = parseInt(b.replace(/[^0-9]/g, ''));
    return numB - numA;
  });
  const filteredTemplates = templates.filter(t => (t.generation || '미지정') === selectedGeneration);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">템플릿 선택</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {sortedGenerations.map(gen => (
            <button
              key={gen}
              className={`px-3 py-1.5 text-sm rounded-full border ${selectedGeneration === gen ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setSelectedGeneration(gen)}
            >{gen}</button>
          ))}
        </div>
        {loading ? (
          <div className="text-center text-gray-400 py-8">로딩 중...</div>
        ) : (
          <ul className="space-y-2">
            {filteredTemplates.map(tpl => {
              const alreadyAdded = materials.some(m => m.title === tpl.title);
              return (
                <li key={tpl.id}>
                  <Button
                    onClick={() => onSelect(tpl)}
                    disabled={alreadyAdded}
                    className={`w-full ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {tpl.title} {alreadyAdded && '(이미 추가됨)'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end mt-4">
          <Button color="secondary" onClick={onClose}>취소</Button>
        </div>
      </div>
    </div>
  );
} 