'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  TouchSensor,
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
type SectionDataWithLinks = SectionData & { 
  links?: { label: string; url: string }[];
  isFromTemplate?: boolean; // 템플릿에서 온 섹션인지 구분
  templateSectionId?: string; // 템플릿 섹션 ID
};

function SortableItem({ id, children, disabled = false }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id,
    disabled 
  });
  
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      className={disabled ? "cursor-default" : "cursor-move"}
    >
      {children}
    </div>
  );
}

function SectionForm({
  onSave,
  onCancel,
  initial,
  isFromTemplate = false,
}: {
  onSave: (data: Omit<SectionData, 'id'>) => void;
  onCancel: () => void;
  initial?: Partial<SectionData>;
  isFromTemplate?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [viewUrl, setViewUrl] = useState(initial?.viewUrl || '');
  const [originalUrl, setOriginalUrl] = useState(initial?.originalUrl || '');
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
      
      <form
        className="space-y-3"
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
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            소제목 이름
          </label>
          <input
            className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all ${
              isFromTemplate ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
            placeholder="예: 1차시 수업자료"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            aria-label="소제목"
            disabled={isFromTemplate}
            readOnly={isFromTemplate}
          />
          {isFromTemplate && (
            <p className="text-xs text-gray-500 mt-1">관리자가 설정한 제목은 수정할 수 없습니다.</p>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            공개보기 링크
          </label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            placeholder="https://docs.google.com/presentation/d/..."
            value={viewUrl}
            onChange={e => setViewUrl(e.target.value)}
            aria-label="공개보기 링크"
          />
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            원본 링크
          </label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            placeholder="https://docs.google.com/presentation/d/..."
            value={originalUrl}
            onChange={e => setOriginalUrl(e.target.value)}
            aria-label="원본 링크"
          />
        </div>
        
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          >
            {initial?.title ? '수정 완료' : '추가하기'}
          </button>
        </div>
      </form>
    </div>
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
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');

  // 클라이언트 사이드에서만 렌더링되도록 보장
  useEffect(() => {
    setMounted(true);
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
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
        
        const template = allTemplates.find(t => t.id === mat.templateId);
        if (!template) {
          // 템플릿이 존재하지 않는 경우 제거
          materialsToRemove.push(mat.id);
          continue;
        }
        
        if (!template.code || !userCodesList.includes(template.code)) {
          // 사용자가 접근할 수 없는 템플릿인 경우 제거
          materialsToRemove.push(mat.id);
          continue;
        }
        
        if (seenTemplateIds.has(mat.templateId)) {
          // 중복된 템플릿인 경우 제거
          materialsToRemove.push(mat.id);
          continue;
        }
        
        seenTemplateIds.add(mat.templateId);
        materialsToKeep.push(mat.id);
        
        // 제목이 다른 경우 업데이트
        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
        }
      }
      
      // 6. 제거할 수업 자료 삭제
      for (const matId of materialsToRemove) {
        console.log('제거할 수업 자료:', matId);
        await deleteLessonMaterial(matId);
      }
      
      // 7. 제목 업데이트
      for (const { id, newTitle } of materialsToUpdate) {
        console.log('제목 업데이트:', id, newTitle);
        await updateLessonMaterial(id, { title: newTitle });
      }
      
      // 8. 새로운 템플릿 추가
      for (const template of accessibleTemplates) {
        if (!seenTemplateIds.has(template.id)) {
          console.log('새 템플릿 추가:', template.title);
          await addLessonMaterial(userData.userId, template.title, 0, template.id);
        }
      }
      
      // 9. 최종 수업 자료 가져오기
      const finalMats = await getLessonMaterials(userData.userId);
      setMaterials(finalMats);
      
      // 10. 각 수업 자료의 소제목 가져오기
      const allSections: Record<string, SectionDataWithLinks[]> = {};
      for (const mat of finalMats) {
        const matSections = await getSections(mat.id);
        
        // 템플릿 sections 가져오기
        const template = mat.templateId ? allTemplates.find(t => t.id === mat.templateId) : null;
        console.log('Material:', mat.title, 'Template:', template?.title, 'Template sections:', template?.sections);
        
        // 유저 sections에 템플릿 정보 병합
        const mergedSections: SectionDataWithLinks[] = [];
        const processedUserSectionIds = new Set<string>();
        
        // 먼저 템플릿 sections를 기반으로 유저 sections와 매칭
        if (template?.sections) {
          for (let i = 0; i < template.sections.length; i++) {
            const templateSection = template.sections[i];
            // 해당 순서의 유저 section이 있는지 확인
            const userSection = matSections.find(s => s.order === i);
            
            if (userSection) {
              // 유저 section이 있으면 템플릿 정보와 병합
              mergedSections.push({
                ...userSection,
                isFromTemplate: true,
                templateSectionId: templateSection.id,
                // 템플릿의 제목과 링크는 유지하되, 유저가 추가한 URL은 보존
                title: templateSection.title, // 템플릿 제목 강제 적용
                links: templateSection.links || [], // 템플릿 링크 유지
              });
              processedUserSectionIds.add(userSection.id);
            } else {
              // 유저 section이 없으면 템플릿 section만 표시 (편집 가능)
              mergedSections.push({
                id: `template-${templateSection.id}`,
                title: templateSection.title,
                order: i,
                viewUrl: '',
                originalUrl: '',
                links: templateSection.links || [],
                isFromTemplate: true,
                templateSectionId: templateSection.id,
              });
            }
          }
        }
        
        // 템플릿과 매칭되지 않은 모든 유저 sections 추가 (순서에 관계없이)
        const additionalUserSections = matSections
          .filter(s => !processedUserSectionIds.has(s.id))
          .map(section => ({
            ...section,
            isFromTemplate: false,
          }));
        
        allSections[mat.id] = [...mergedSections, ...additionalUserSections];
        console.log('Final sections for', mat.title, ':', allSections[mat.id]);
      }
      setSections(allSections);
      
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 코드별 필터링을 위한 materialCodeMap 생성
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
    
    // 로컬 상태 즉시 업데이트
    setMaterials(newMaterials);
    
    try {
      await reorderLessonMaterials(userData!.userId, newMaterials.map(m => m.id));
      toast.success('대제목 순서가 변경되었습니다.');
    } catch (error) {
      console.error('대제목 순서 변경 오류:', error);
      toast.error('대제목 순서 변경 중 오류가 발생했습니다.');
      // 오류 발생 시 원래 상태로 복원
      setMaterials(materials);
    }
  };

  // 소제목 추가
  const handleAddSection = async (materialId: string, data: Omit<SectionData, 'id'> & { links?: { label: string; url: string }[] }) => {
    try {
      // 템플릿 섹션 개수 + 유저 섹션 개수로 order 계산
      const currentSections = sections[materialId] || [];
      const templateSections = currentSections.filter(s => s.isFromTemplate);
      const userSections = currentSections.filter(s => !s.isFromTemplate);
      const order = templateSections.length + userSections.length;
      
      const sectionId = await addSection(materialId, { ...data, order } as Omit<SectionData, 'id'>);
      
      // 로컬 상태 즉시 업데이트
      const newSection: SectionDataWithLinks = {
        id: sectionId,
        title: data.title,
        order,
        viewUrl: data.viewUrl,
        originalUrl: data.originalUrl,
        links: data.links || [],
        isFromTemplate: false,
      };
      
      setSections(prev => ({
        ...prev,
        [materialId]: [...(prev[materialId] || []), newSection]
      }));
      
      setAddingSectionFor(null);
      toast.success('소제목이 추가되었습니다.');
    } catch (error) {
      console.error('소제목 추가 오류:', error);
      toast.error('소제목 추가 중 오류가 발생했습니다.');
    }
  };

  // 유저 대주제 추가
  const handleAddUserMaterial = async () => {
    if (!newMaterialTitle.trim()) {
      toast.error('대주제 이름을 입력해주세요.');
      return;
    }
    
    try {
      const order = materials.length;
      const materialId = await addLessonMaterial(userData!.userId, newMaterialTitle.trim(), order);
      
      // 로컬 상태 즉시 업데이트
      const newMaterial: LessonMaterialData = {
        id: materialId,
        userId: userData!.userId,
        title: newMaterialTitle.trim(),
        order,
        templateId: undefined,
      };
      
      setMaterials(prev => [...prev, newMaterial]);
      setSections(prev => ({
        ...prev,
        [materialId]: []
      }));
      
      setNewMaterialTitle('');
      setShowAddMaterialForm(false);
      toast.success('대주제가 추가되었습니다.');
    } catch (error) {
      console.error('대주제 추가 오류:', error);
      toast.error('대주제 추가 중 오류가 발생했습니다.');
    }
  };

  // 소제목 수정
  const handleEditSection = async (materialId: string, sectionId: string, data: Omit<SectionData, 'id'> & { links?: { label: string; url: string }[] }) => {
    try {
      const section = sections[materialId]?.find(s => s.id === sectionId);
      
      if (section?.isFromTemplate) {
        // 템플릿 섹션의 경우
        if (sectionId.startsWith('template-')) {
          // 가상 ID인 경우 새로운 유저 섹션 생성
          const order = section.order;
          const newSectionId = await addSection(materialId, { ...data, order } as Omit<SectionData, 'id'>);
          
          // 로컬 상태에서 템플릿 섹션을 실제 유저 섹션으로 교체
          const newSection: SectionDataWithLinks = {
            id: newSectionId,
            title: data.title,
            order,
            viewUrl: data.viewUrl,
            originalUrl: data.originalUrl,
            links: data.links || [],
            isFromTemplate: true,
            templateSectionId: section.templateSectionId,
          };
          
          setSections(prev => ({
            ...prev,
            [materialId]: prev[materialId]?.map(s => 
              s.id === sectionId ? newSection : s
            ) || []
          }));
        } else {
          // 실제 유저 섹션이 있는 경우 업데이트
          await updateSection(materialId, sectionId, data as Omit<SectionData, 'id'>);
          
          // 로컬 상태 업데이트
          setSections(prev => ({
            ...prev,
            [materialId]: prev[materialId]?.map(s => 
              s.id === sectionId ? { ...s, ...data } : s
            ) || []
          }));
        }
      } else {
        // 일반 유저 섹션 업데이트
        await updateSection(materialId, sectionId, data as Omit<SectionData, 'id'>);
        
        // 로컬 상태 업데이트
        setSections(prev => ({
          ...prev,
          [materialId]: prev[materialId]?.map(s => 
            s.id === sectionId ? { ...s, ...data } : s
          ) || []
        }));
      }
      
      setEditingSection(null);
      toast.success('소제목이 수정되었습니다.');
    } catch (error) {
      console.error('소제목 수정 오류:', error);
      toast.error('소제목 수정 중 오류가 발생했습니다.');
    }
  };

  // 소제목 삭제
  const handleDeleteSection = async (materialId: string, sectionId: string) => {
    // 템플릿에서 온 섹션은 삭제할 수 없음
    const section = sections[materialId]?.find(s => s.id === sectionId);
    if (section?.isFromTemplate) {
      toast.error('관리자가 설정한 소제목은 삭제할 수 없습니다.');
      return;
    }
    
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
      await deleteSection(materialId, sectionId);
      
      // 로컬 상태에서 섹션 제거
      setSections(prev => ({
        ...prev,
        [materialId]: prev[materialId]?.filter(s => s.id !== sectionId) || []
      }));
      
      toast.success('소제목이 삭제되었습니다.');
    } catch (error) {
      console.error('소제목 삭제 오류:', error);
      toast.error('소제목 삭제 중 오류가 발생했습니다.');
    }
  };

  // 유저 대주제 삭제 (템플릿 기반이 아닌 것만)
  const handleDeleteUserMaterial = async (materialId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return;
    
    // 템플릿 기반 대주제는 삭제할 수 없음
    if (material.templateId) {
      toast.error('템플릿 기반 대주제는 삭제할 수 없습니다.');
      return;
    }
    
    if (!confirm('정말 삭제하시겠습니까? 모든 소제목도 함께 삭제됩니다.')) return;
    
    try {
      await deleteLessonMaterial(materialId);
      
      // 로컬 상태에서 대주제와 관련 섹션들 제거
      setMaterials(prev => prev.filter(m => m.id !== materialId));
      setSections(prev => {
        const newSections = { ...prev };
        delete newSections[materialId];
        return newSections;
      });
      
      toast.success('대주제가 삭제되었습니다.');
    } catch (error) {
      console.error('대주제 삭제 오류:', error);
      toast.error('대주제 삭제 중 오류가 발생했습니다.');
    }
  };

  // 소제목 순서변경
  const handleSectionDragEnd = async (materialId: string, event: import('@dnd-kit/core').DragEndEvent) => {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;
    
    const currentSections = sections[materialId] || [];
    const templateSections = currentSections.filter(s => s.isFromTemplate);
    const userSections = currentSections.filter(s => !s.isFromTemplate);
    
    const oldIndex = userSections.findIndex(s => s.id === String(active.id));
    const newIndex = userSections.findIndex(s => s.id === String(over.id));
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // 사용자 소제목 배열에서만 순서 변경
    const newUserSections = arrayMove(userSections, oldIndex, newIndex);
    
    // 템플릿 소제목과 재결합
    const newSections = [...templateSections, ...newUserSections];
    
    // 로컬 상태 즉시 업데이트
    setSections(prev => ({
      ...prev,
      [materialId]: newSections
    }));
    
    try {
      // 사용자 소제목만 서버에 순서 업데이트
      await reorderSections(materialId, newUserSections.map(s => s.id));
      toast.success('소제목 순서가 변경되었습니다.');
    } catch (error) {
      console.error('소제목 순서 변경 오류:', error);
      toast.error('소제목 순서 변경 중 오류가 발생했습니다.');
      // 오류 발생 시 원래 상태로 복원
      setSections(prev => ({
        ...prev,
        [materialId]: currentSections
      }));
    }
  };

  // 토글 함수
  const toggleMaterial = (materialId: string) => {
    setExpandedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) {
        newSet.delete(materialId);
      } else {
        newSet.add(materialId);
      }
      return newSet;
    });
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
        <main className="max-w-4xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
            <p className="mt-3 text-sm">로딩 중...</p>
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
        <main className="max-w-4xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
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
        <main className="max-w-4xl mx-auto px-4 py-8 w-full min-h-[70vh]">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">수업 자료</h1>
            <p className="text-gray-600 text-sm">본인이 참여한 캠프의 수업자료를 관리할 수 있습니다.</p>
          </div>
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-center font-medium mb-1">직무 경험이 필요합니다</p>
            <p className="text-center text-sm text-gray-500">수업 자료를 이용하려면 직무 경험이 등록되어야 합니다.</p>
            <p className="text-center text-sm text-gray-500">관리자에게 문의해주세요.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 w-full min-h-[70vh]">
        {/* 헤더 섹션 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">수업 자료 업로드</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            참여하는 캠프 코드의 자료만 확인 가능합니다
          </p>
        </div>

        {/* 코드별 필터 탭 */}
        {sortedMaterialCodes.length > 1 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {sortedMaterialCodes.map(code => (
                <button
                  key={code}
                  className={`px-3 py-1.5 text-sm font-medium rounded border transition-all ${
                    selectedMaterialCode === code 
                      ? 'bg-blue-500 border-blue-500 text-white' 
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedMaterialCode(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

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
            <p className="mt-3 text-gray-500 text-sm">수업 자료를 불러오는 중...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMaterialDragEnd}>
              <SortableContext items={filteredMaterials.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">해당 코드에 등록된 수업 자료가 없습니다</p>
                    <p className="text-gray-400 text-sm mt-1">관리자가 템플릿을 추가하면 자동으로 표시됩니다</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMaterials.map((m) => {
                      const isExpanded = expandedMaterials.has(m.id);
                      const sectionCount = sections[m.id]?.length || 0;
                      
                      return (
                        <SortableItem key={m.id} id={m.id}>
                          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                            {/* 카드 헤더 - 항상 표시 */}
                            <div 
                              className="p-4 cursor-pointer"
                              onClick={() => toggleMaterial(m.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <h3 className="font-medium text-gray-900">{m.title}</h3>
                                    <p className="text-xs text-gray-500">{sectionCount}개 소제목</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* 대주제 링크 버튼들 */}
                                  {(() => {
                                    const tpl = m.templateId ? templates.find(t => t.id === m.templateId) : undefined;
                                    if (tpl && tpl.links && tpl.links.length > 0) {
                                      return (
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
                                      );
                                    }
                                    return null;
                                  })()}
                                  {/* 유저가 추가한 대주제 삭제 버튼 */}
                                  {!m.templateId && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteUserMaterial(m.id);
                                      }}
                                      className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                      title="대주제 삭제"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  )}
                                  <div className="cursor-move text-gray-300 hover:text-gray-500 p-1" style={{ touchAction: 'none' }} onClick={(e) => e.stopPropagation()}>
                                    <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                                      <circle cx="4" cy="6" r="1" fill="currentColor"/>
                                      <circle cx="4" cy="10" r="1" fill="currentColor"/>
                                      <circle cx="8" cy="6" r="1" fill="currentColor"/>
                                      <circle cx="8" cy="10" r="1" fill="currentColor"/>
                                      <circle cx="12" cy="6" r="1" fill="currentColor"/>
                                      <circle cx="12" cy="10" r="1" fill="currentColor"/>
                                    </svg>
                                  </div>
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
                                {/* 소제목 목록 */}
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={event => handleSectionDragEnd(m.id, event)}
                                >
                                  <SortableContext items={sections[m.id]?.filter(s => !s.isFromTemplate).map(s => s.id) || []} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2 mt-3">
                                      {sections[m.id]?.length === 0 ? (
                                        <div className="text-center py-6 text-gray-400">
                                          <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                          <p className="text-sm">소제목이 없습니다</p>
                                          <p className="text-xs mt-1">아래 버튼을 클릭하여 소제목을 추가해보세요</p>
                                        </div>
                                      ) : (
                                        sections[m.id]?.map((s) => (
                                          s.isFromTemplate ? (
                                            <div key={s.id} className={`rounded border p-3 transition-all group bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}>
                                              {editingSection?.materialId === m.id && editingSection?.section.id === s.id ? (
                                                <SectionForm
                                                  initial={editingSection.section}
                                                  onSave={data => handleEditSection(m.id, s.id, data)}
                                                  onCancel={() => setEditingSection(null)}
                                                  isFromTemplate={s.isFromTemplate}
                                                />
                                              ) : (
                                                <>
                                                  {/* 소제목 헤더 */}
                                                  <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                      <h4 className="font-medium text-sm text-gray-800">{s.title}</h4>
                                                      <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                                                        관리자 설정
                                                      </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 transition-opacity">
                                                      <button
                                                        onClick={() => setEditingSection({ materialId: m.id, section: s })}
                                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                                        title="수정"
                                                      >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                      </button>
                                                      <div className="p-1 text-gray-300" title="관리자가 설정한 소제목입니다 (순서 변경 불가)">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                      </div>
                                                    </div>
                                                  </div>

                                                  {/* 소제목 링크들 */}
                                                  {s.links && Array.isArray(s.links) && s.links.length > 0 && (
                                                    <div className="flex gap-1 flex-wrap mb-2">
                                                      {s.links.map((l, idx) => (
                                                        <a
                                                          key={idx}
                                                          href={l.url}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
                                                        >
                                                          {l.label}
                                                        </a>
                                                      ))}
                                                    </div>
                                                  )}

                                                  {/* 액션 버튼들 */}
                                                  <div className="flex gap-2">
                                                    <a
                                                      href={s.viewUrl || undefined}
                                                      target="_blank"
                                                      rel="noopener"
                                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                                        s.viewUrl
                                                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                          : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                                      }`}
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                      </svg>
                                                      공개보기
                                                    </a>
                                                    <a
                                                      href={s.originalUrl || undefined}
                                                      target="_blank"
                                                      rel="noopener"
                                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                                        s.originalUrl
                                                          ? 'bg-green-500 text-white hover:bg-green-600'
                                                          : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                                      }`}
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                      </svg>
                                                      원본
                                                    </a>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          ) : (
                                            <SortableItem key={s.id} id={s.id}>
                                              <div className={`rounded border p-3 transition-all group bg-gray-50 hover:bg-gray-100`}>
                                                {editingSection?.materialId === m.id && editingSection?.section.id === s.id ? (
                                                  <SectionForm
                                                    initial={editingSection.section}
                                                    onSave={data => handleEditSection(m.id, s.id, data)}
                                                    onCancel={() => setEditingSection(null)}
                                                    isFromTemplate={s.isFromTemplate}
                                                  />
                                                ) : (
                                                  <>
                                                    {/* 소제목 헤더 */}
                                                    <div className="flex items-start justify-between mb-2">
                                                      <div className="flex items-center gap-2">
                                                        <h4 className="font-medium text-sm text-gray-800">{s.title}</h4>
                                                      </div>
                                                      <div className="flex items-center gap-1 transition-opacity">
                                                        <button
                                                          onClick={() => setEditingSection({ materialId: m.id, section: s })}
                                                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                                          title="수정"
                                                        >
                                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                          </svg>
                                                        </button>
                                                        <button
                                                          onClick={() => handleDeleteSection(m.id, s.id)}
                                                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                                          title="삭제"
                                                        >
                                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                          </svg>
                                                        </button>
                                                        <div className="cursor-move text-gray-300 hover:text-gray-500 p-1" style={{ touchAction: 'none' }}>
                                                          <svg width="12" height="12" fill="none" viewBox="0 0 12 12">
                                                            <circle cx="3" cy="4" r="0.5" fill="currentColor"/>
                                                            <circle cx="3" cy="8" r="0.5" fill="currentColor"/>
                                                            <circle cx="6" cy="4" r="0.5" fill="currentColor"/>
                                                            <circle cx="6" cy="8" r="0.5" fill="currentColor"/>
                                                            <circle cx="9" cy="4" r="0.5" fill="currentColor"/>
                                                            <circle cx="9" cy="8" r="0.5" fill="currentColor"/>
                                                          </svg>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    {/* 소제목 링크들 */}
                                                    {s.links && Array.isArray(s.links) && s.links.length > 0 && (
                                                      <div className="flex gap-1 flex-wrap mb-2">
                                                        {s.links.map((l, idx) => (
                                                          <a
                                                            key={idx}
                                                            href={l.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                                                          >
                                                            {l.label}
                                                          </a>
                                                        ))}
                                                      </div>
                                                    )}

                                                    {/* 액션 버튼들 */}
                                                    <div className="flex gap-2">
                                                      <a
                                                        href={s.viewUrl || undefined}
                                                        target="_blank"
                                                        rel="noopener"
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                                          s.viewUrl
                                                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                            : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                                        }`}
                                                      >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        공개보기
                                                      </a>
                                                      <a
                                                        href={s.originalUrl || undefined}
                                                        target="_blank"
                                                        rel="noopener"
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                                          s.originalUrl
                                                            ? 'bg-green-500 text-white hover:bg-green-600'
                                                            : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                                        }`}
                                                      >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        원본
                                                      </a>
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                                            </SortableItem>
                                          )
                                        ))
                                      )}
                                    </div>
                                  </SortableContext>
                                </DndContext>

                                {/* 소제목 추가 섹션 */}
                                {addingSectionFor === m.id ? (
                                  <SectionForm
                                    onSave={data => handleAddSection(m.id, data)}
                                    onCancel={() => setAddingSectionFor(null)}
                                  />
                                ) : (
                                  <button
                                    onClick={() => setAddingSectionFor(m.id)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-3 text-blue-600 bg-blue-50 border border-dashed border-blue-200 rounded hover:bg-blue-100 hover:border-blue-300 transition-all text-sm"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    소제목 추가하기
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </SortableItem>
                      );
                    })}
                  </div>
                )}
              </SortableContext>
            </DndContext>

            {/* 유저 대주제 추가 섹션 */}
            {showAddMaterialForm ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">새 대주제 추가</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      대주제 이름
                    </label>
                    <input
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                      placeholder="예: 개인 프로젝트"
                      value={newMaterialTitle}
                      onChange={e => setNewMaterialTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddUserMaterial(); }}
                      aria-label="대주제 이름"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowAddMaterialForm(false);
                        setNewMaterialTitle('');
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-all"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleAddUserMaterial}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    >
                      추가하기
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddMaterialForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 text-blue-600 bg-blue-50 border border-dashed border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                새 대주제 추가하기
              </button>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
} 