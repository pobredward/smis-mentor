'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/common/Button';
import toast from 'react-hot-toast';
import {
  getLessonMaterials,
  addLessonMaterial,
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
  deleteLessonMaterial,
  updateLessonMaterial,
} from '@/lib/lessonMaterialService';
import { getUserJobCodesInfo } from '@/lib/firebaseService';
import { JobCodeWithGroup } from '@/types';
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
  const [originalUrl, setOriginalUrl] = useState(initial?.originalUrl || '');
  return (
    <form
      className="space-y-2 bg-gray-50 border border-blue-200 rounded-lg p-4"
      onSubmit={event => {
        event.preventDefault();
        onSave({
          title,
          viewUrl,
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
        placeholder="공개보기 링크"
        value={viewUrl}
        onChange={e => setViewUrl(e.target.value)}
        aria-label="공개보기 링크"
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

export default function UploadPage() {
  const { userData, loading: authLoading } = useAuth();
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [loading, setLoading] = useState(true);
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<{ materialId: string; section: SectionDataWithLinks } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('');
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [mounted, setMounted] = useState(false);

  // 클라이언트 사이드에서만 렌더링되도록 보장
  useEffect(() => {
    setMounted(true);
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 사용자 jobCodes 정보 가져오기
  const fetchUserJobCodes = async () => {
    if (!userData?.jobExperiences || userData.jobExperiences.length === 0) {
      setUserJobCodes([]);
      return [];
    }
    try {
      const jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
      setUserJobCodes(jobCodesInfo);
      return jobCodesInfo;
    } catch (error) {
      console.error('사용자 직무 코드 정보 가져오기 오류:', error);
      return [];
    }
  };

  // 사용자가 접근할 수 있는 템플릿 필터링
  const getAccessibleTemplates = (allTemplates: LessonMaterialTemplate[], userCodes: JobCodeWithGroup[]) => {
    if (!userCodes.length) return [];
    
    const codes = userCodes.map(jc => jc.code);
    return allTemplates.filter(template => 
      template.code && codes.includes(template.code)
    );
  };

  // 대제목/소제목 fetch 및 자동 템플릿 추가
  const fetchAll = async () => {
    if (!userData) return;
    setLoading(true);
    try {
      // 1. 먼저 사용자 직무 코드 정보 가져오기
      const userCodes = await fetchUserJobCodes();
      console.log('사용자 직무 코드:', userCodes.map(uc => uc.code));
      
      // 2. 모든 템플릿 가져오기
      const allTemplates = await getLessonMaterialTemplates();
      setTemplates(allTemplates);
      console.log('모든 템플릿:', allTemplates.map(t => ({ title: t.title, code: t.code })));
      
      // 3. 사용자가 접근할 수 있는 템플릿 필터링
      const accessibleTemplates = getAccessibleTemplates(allTemplates, userCodes);
      console.log('접근 가능한 템플릿:', accessibleTemplates.map(t => ({ title: t.title, code: t.code })));
      
      // 4. 기존 수업 자료 가져오기
      const mats = await getLessonMaterials(userData.userId);
      console.log('기존 수업 자료:', mats.map(m => ({ title: m.title, templateId: m.templateId })));
      
      // 5. 기존 수업 자료 중복 제거 및 접근 권한 체크
      const userCodesList = userCodes.map(uc => uc.code);
      const seenTemplateIds = new Set<string>();
      const materialsToKeep: string[] = [];
      const materialsToRemove: string[] = [];
      const materialsToUpdate: { id: string; newTitle: string }[] = [];
      
      for (const mat of mats) {
        // 템플릿 ID가 없는 경우 제거
        if (!mat.templateId) {
          materialsToRemove.push(mat.id);
          continue;
        }
        
        // 템플릿 정보 확인
        const template = allTemplates.find(t => t.id === mat.templateId);
        if (!template || !template.code) {
          materialsToRemove.push(mat.id);
          continue;
        }
        
        // 사용자 접근 권한 확인
        if (!userCodesList.includes(template.code)) {
          materialsToRemove.push(mat.id);
          continue;
        }
        
        // 중복 템플릿 체크 (같은 templateId를 가진 수업 자료가 이미 있는 경우)
        if (seenTemplateIds.has(mat.templateId)) {
          materialsToRemove.push(mat.id);
          console.log(`중복 템플릿 제거: ${mat.title} (templateId: ${mat.templateId})`);
          continue;
        }
        
        // 제목이 템플릿과 다른 경우 업데이트 예약
        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
          console.log(`제목 업데이트 예약: "${mat.title}" -> "${template.title}"`);
        }
        
        // 유지할 수업 자료
        seenTemplateIds.add(mat.templateId);
        materialsToKeep.push(mat.id);
      }
      
      console.log('유지할 수업 자료 ID:', materialsToKeep);
      console.log('제거할 수업 자료 ID:', materialsToRemove);
      console.log('업데이트할 수업 자료:', materialsToUpdate);
      
      // 접근할 수 없는 수업 자료들 삭제
      for (const materialId of materialsToRemove) {
        try {
          await deleteLessonMaterial(materialId);
          console.log(`수업 자료 삭제됨: ${materialId}`);
        } catch (error) {
          console.error(`수업 자료 삭제 실패: ${materialId}`, error);
        }
      }
      
      // 제목이 다른 수업 자료들 업데이트
      for (const { id, newTitle } of materialsToUpdate) {
        try {
          await updateLessonMaterial(id, { title: newTitle });
          console.log(`수업 자료 제목 업데이트됨: ${id} -> "${newTitle}"`);
        } catch (error) {
          console.error(`수업 자료 제목 업데이트 실패: ${id}`, error);
        }
      }
      
      // 6. 접근 가능한 기존 수업 자료만 필터링
      const accessibleMaterials = mats.filter(mat => materialsToKeep.includes(mat.id));
      
      // 7. 아직 추가되지 않은 템플릿들을 자동으로 추가 (templateId 기반 체크)
      const existingTemplateIds = new Set(accessibleMaterials.map(m => m.templateId).filter(Boolean));
      const templatesToAdd = accessibleTemplates.filter(tpl => !existingTemplateIds.has(tpl.id));
      console.log('추가할 템플릿:', templatesToAdd.map(t => ({ title: t.title, id: t.id })));
      
      for (const template of templatesToAdd) {
        const order = accessibleMaterials.length + templatesToAdd.indexOf(template);
        const materialId = await addLessonMaterial(userData.userId, template.title, order, template.id);
        console.log(`새 수업 자료 추가됨: ${template.title} (${materialId})`);
        
        // 템플릿의 섹션들을 추가
        for (const section of template.sections.sort((a, b) => a.order - b.order)) {
          await addSection(materialId, { 
            ...section, 
            viewUrl: '', 
            originalUrl: '', 
            order: section.order 
          } as Omit<SectionData, 'id'>);
        }
      }
      
      // 8. 최종 수업 자료 다시 가져오기 (접근 가능한 것만)
      const finalMats = await getLessonMaterials(userData.userId);
      
      // 9. 최종 중복 제거 및 필터링
      const finalSeenTemplateIds = new Set<string>();
      const finalAccessibleMaterials = finalMats.filter(mat => {
        if (!mat.templateId) return false;
        
        const template = allTemplates.find(t => t.id === mat.templateId);
        if (!template || !template.code) return false;
        
        if (!userCodesList.includes(template.code)) return false;
        
        // 중복 제거
        if (finalSeenTemplateIds.has(mat.templateId)) {
          console.log(`최종 중복 제거: ${mat.title}`);
          return false;
        }
        
        finalSeenTemplateIds.add(mat.templateId);
        return true;
      });
      
      console.log('최종 표시될 수업 자료:', finalAccessibleMaterials.map(m => ({ title: m.title, templateId: m.templateId })));
      setMaterials(finalAccessibleMaterials);
      
      // 10. 템플릿 미리 fetch (중복 방지)
      const templateIds = Array.from(new Set(finalAccessibleMaterials.map(m => m.templateId).filter(Boolean)));
      let templateMap: Record<string, LessonMaterialTemplate> = {};
      if (templateIds.length > 0) {
        templateMap = Object.fromEntries(allTemplates.filter(t => templateIds.includes(t.id)).map(t => [t.id, t]));
      }
      
      const sectionMap: Record<string, SectionDataWithLinks[]> = {};
      for (const m of finalAccessibleMaterials) {
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
    } catch (error) {
      console.error('수업 자료 로드 오류:', error);
      setError('수업 자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 대제목별 code 매핑 및 필터링
  const materialCodeMap: Record<string, string> = {};
  materials.forEach(m => {
    if (m.templateId) {
      const tpl = templates.find(t => t.id === m.templateId);
      materialCodeMap[m.id] = tpl?.code || '미지정';
    } else {
      materialCodeMap[m.id] = '미지정';
    }
  });
  
  // 사용자가 접근할 수 있는 코드만 표시 (미지정 제외)
  const userCodes = userJobCodes.map(jc => jc.code);
  const allMaterialCodes = Array.from(new Set(Object.values(materialCodeMap)))
    .filter(code => userCodes.includes(code)); // 미지정 제외
  const sortedMaterialCodes = allMaterialCodes.sort((a, b) => a.localeCompare(b));
  
  const filteredMaterials = selectedMaterialCode
    ? materials.filter(m => materialCodeMap[m.id] === selectedMaterialCode)
    : materials;

  useEffect(() => {
    fetchAll();
  }, [userData]);

  // 코드 필터 초기화 (사용자가 접근할 수 있는 첫 번째 코드로)
  useEffect(() => {
    if (sortedMaterialCodes.length > 0 && !selectedMaterialCode) {
      setSelectedMaterialCode(sortedMaterialCodes[0]);
    }
  }, [sortedMaterialCodes, selectedMaterialCode]);

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

  // 클라이언트 사이드에서만 렌더링되도록 보장
  if (!mounted) {
    return null;
  }

  // 인증 로딩 중
  if (authLoading) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p>로딩 중...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // 로그인하지 않은 경우
  if (!userData) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <p className="text-center">로그인 후 이용 가능합니다.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // jobExperiences가 없는 경우
  if (!userData.jobExperiences || userData.jobExperiences.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <h1 className="text-2xl font-bold mb-2">수업 자료</h1>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <p className="text-center">수업 자료를 이용하려면 직무 경험이 등록되어야 합니다.</p>
            <p className="text-center mt-2">관리자에게 문의해주세요.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 w-full min-h-[70vh]">
        <h1 className="text-2xl font-bold mb-2">수업 자료</h1>
        <p className="text-gray-600 mb-6 text-sm">본인이 참여한 캠프의 수업자료 링크를 업로드하고 관리할 수 있습니다.<br />각 소제목에는 &apos;공개보기&apos;와 &apos;원본&apos; 링크를 입력해주세요.</p>
        {/* 코드별 토글 */}
        {sortedMaterialCodes.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {sortedMaterialCodes.map(code => (
              <button
                key={code}
                className={`px-3 py-1.5 text-sm rounded-full border ${selectedMaterialCode === code ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setSelectedMaterialCode(code)}
              >{code}</button>
            ))}
          </div>
        )}
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {loading ? (
          <div className="text-center text-gray-400 py-12 border rounded-lg">로딩 중...</div>
        ) : (
          <div className="space-y-6">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMaterialDragEnd}>
              <SortableContext items={filteredMaterials.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {filteredMaterials.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 border rounded-lg">해당 코드에 등록된 수업 자료가 없습니다.</div>
                ) : (
                  <div className="space-y-6">
                    {filteredMaterials.map((m) => (
                      <SortableItem key={m.id} id={m.id}>
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 relative group transition-all">
                          <div className="mb-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xl font-bold">{m.title}</span>
                              <div className="flex gap-2 items-center">
                                <span className="cursor-move text-gray-300 hover:text-blue-400 ml-2">
                                  <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="13" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/></svg>
                                </span>
                              </div>
                            </div>
                            {/* 대주제 links 버튼 그룹: 제목 아래에 */}
                            {(() => {
                              const tpl = m.templateId ? templates.find(t => t.id === m.templateId) : undefined;
                              if (tpl && tpl.links && tpl.links.length > 0) {
                                return (
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
                                );
                              }
                              return null;
                            })()}
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
                                  <div className="text-gray-400">소제목이 없습니다</div>
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
                                            {/* 소제목 제목 */}
                                            <div className="font-medium text-base mb-1">{s.title}</div>
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
                                                공개보기
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
                                            <div className="flex gap-2 items-center mt-2 md:mt-0">
                                              <Button size="sm" color="secondary" onClick={() => setEditingSection({ materialId: m.id, section: s })}>수정</Button>
                                              <Button size="sm" color="danger" onClick={() => handleDeleteSection(m.id, s.id)}>삭제</Button>
                                              <span className="cursor-move text-gray-300 hover:text-blue-400 ml-2">
                                                <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="13" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/></svg>
                                              </span>
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
          </div>
        )}
      </main>
      <Footer />
    </>
  );
} 