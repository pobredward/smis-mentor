'use client';
import { logger } from '@smis-mentor/shared';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  getLessonMaterials,
  addLessonMaterial,
  getSections,
  addSection,
  updateSection,
  deleteSection,
  LessonMaterialData,
  SectionData,
  getLessonMaterialTemplates,
  LessonMaterialTemplate,
  deleteLessonMaterial,
  updateLessonMaterial,
} from '@/lib/lessonMaterialService';
import { getUserJobCodesInfo } from '@/lib/firebaseService';
import { JobCodeWithGroup } from '@/types';

// SectionData 타입 확장 (관리자 links 지원)
type SectionDataWithLinks = SectionData & {
  links?: { label: string; url: string }[];
  isFromTemplate?: boolean;
  templateSectionId?: string;
};

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

  const isValidUrl = (url: string) => {
    if (!url.trim()) return true; // 빈 값은 허용
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    // URL 형식 검증 (값이 있을 때만)
    if (viewUrl && !isValidUrl(viewUrl)) {
      alert('공개보기 링크의 URL 형식이 올바르지 않습니다.\n예: https://docs.google.com/...');
      return;
    }
    if (originalUrl && !isValidUrl(originalUrl)) {
      alert('원본 링크의 URL 형식이 올바르지 않습니다.\n예: https://docs.google.com/...');
      return;
    }
    
    onSave({
      title,
      viewUrl,
      originalUrl,
      order: initial?.order ?? 0,
    });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
      <form
        className="space-y-3"
        onSubmit={handleSubmit}
      >
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">소제목 이름</label>
          <input
            className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all ${
              isFromTemplate ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
            placeholder="예: 1차시 수업자료"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
          <label className="block text-xs font-medium text-gray-700 mb-1">공개보기 링크</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            placeholder="https://docs.google.com/presentation/d/..."
            value={viewUrl}
            onChange={(e) => setViewUrl(e.target.value)}
            aria-label="공개보기 링크"
          />
          <p className="text-xs text-red-600 font-medium mt-1">
            ⚠️ 필수: Canva에서 '공유' → '공개 보기 링크' → '공개 보기 링크 만들기' → '복사' 클릭
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">원본 링크</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            placeholder="https://docs.google.com/presentation/d/..."
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            aria-label="원본 링크"
          />
          <p className="text-xs text-red-600 font-medium mt-1">
            ⚠️ 필수: Canva에서 '액세스 수준'을 '링크가 있는 모든 사용자'로 변경 → '링크 복사' 클릭 
          </p>
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

export default function LessonContent() {
  const { userData, loading: authLoading } = useAuth();
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [loading, setLoading] = useState(true);
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<{
    materialId: string;
    section: SectionDataWithLinks;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('');
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // 활성화된 캠프의 jobCode 정보 가져오기
  const fetchActiveJobCode = async () => {
    if (!userData?.activeJobExperienceId) {
      setUserJobCodes([]);
      return [];
    }
    
    try {
      // activeJobExperienceId를 배열로 전달
      const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
      setUserJobCodes(jobCodesInfo);
      return jobCodesInfo;
    } catch (error) {
      logger.error('활성화된 직무 코드 정보 가져오기 오류:', error);
      return [];
    }
  };

  // 사용자가 접근할 수 있는 템플릿 필터링 (활성화된 코드만)
  const getAccessibleTemplates = (
    allTemplates: LessonMaterialTemplate[],
    activeJobCode: JobCodeWithGroup[]
  ) => {
    if (!activeJobCode.length) return [];
    const codes = activeJobCode.map((jc) => jc.code);
    return allTemplates.filter((template) => template.code && codes.includes(template.code));
  };

  // 대제목/소제목 fetch 및 자동 템플릿 추가
  const fetchAll = async () => {
    if (!userData) return;
    
    // 활성화된 캠프가 없으면 빈 상태로 표시
    if (!userData.activeJobExperienceId) {
      setLoading(false);
      setMaterials([]);
      setSections({});
      return;
    }
    
    setLoading(true);
    try {
      const activeJobCode = await fetchActiveJobCode();
      const allTemplates = await getLessonMaterialTemplates();
      setTemplates(allTemplates);

      const accessibleTemplates = getAccessibleTemplates(allTemplates, activeJobCode);
      const mats = await getLessonMaterials(userData.userId);

      const activeCodesList = activeJobCode.map((uc) => uc.code);
      const seenTemplateIds = new Set<string>();
      const materialsToUpdate: { id: string; newTitle: string }[] = [];

      for (const mat of mats) {
        if (!mat.templateId) {
          // 사용자가 추가한 대주제 - 활성화된 코드와 일치하는지 확인
          if (mat.userCode && !activeCodesList.includes(mat.userCode)) {
            // 활성화된 코드가 아니면 숨김 (삭제하지 않음)
            continue;
          }
          continue;
        }

        const template = allTemplates.find((t) => t.id === mat.templateId);
        if (!template) {
          // 템플릿이 존재하지 않는 경우에도 유지 (사용자 데이터 보호)
          continue;
        }

        if (!template.code || !activeCodesList.includes(template.code)) {
          // 활성화된 코드가 아닌 템플릿도 유지 (사용자 데이터 보호)
          continue;
        }

        if (seenTemplateIds.has(mat.templateId)) {
          // 중복된 템플릿도 유지 (첫 번째 것만 표시)
          continue;
        }

        seenTemplateIds.add(mat.templateId);

        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
        }
      }

      for (const { id, newTitle } of materialsToUpdate) {
        await updateLessonMaterial(id, { title: newTitle });
      }

      for (let i = 0; i < accessibleTemplates.length; i++) {
        const template = accessibleTemplates[i];
        if (!seenTemplateIds.has(template.id)) {
          await addLessonMaterial(userData.userId, template.title, i, template.id);
        }
      }

      const finalMats = await getLessonMaterials(userData.userId);
      
      // 활성화된 코드에 해당하는 자료만 필터링 + 중복 제거
      const seenTemplateIdsInFinal = new Set<string>();
      const filteredMats = finalMats.filter((mat) => {
        // 활성 코드 체크
        if (mat.templateId) {
          const template = allTemplates.find((t) => t.id === mat.templateId);
          if (!template?.code || !activeCodesList.includes(template.code)) {
            return false;
          }
          
          // 중복 templateId 체크 (첫 번째만 표시)
          if (seenTemplateIdsInFinal.has(mat.templateId)) {
            logger.info('🚫 중복 제거:', mat.id, mat.title, `(templateId: ${mat.templateId})`);
            return false;
          }
          seenTemplateIdsInFinal.add(mat.templateId);
          return true;
        } else {
          // 사용자가 추가한 대주제는 userCode로 필터링 (중복 없음)
          return mat.userCode && activeCodesList.includes(mat.userCode);
        }
      });
      
      setMaterials(filteredMats);

      const allSections: Record<string, SectionDataWithLinks[]> = {};
      for (const mat of finalMats) {
        const matSections = await getSections(mat.id);
        const template = mat.templateId ? allTemplates.find((t) => t.id === mat.templateId) : null;

        const mergedSections: SectionDataWithLinks[] = [];
        const processedUserSectionIds = new Set<string>();

        if (template?.sections) {
          // 삭제된 섹션 ID 목록
          const deletedSectionIds = new Set(template.deletedSectionIds || []);
          
          for (const templateSection of template.sections) {
            // 삭제된 섹션은 건너뛰기
            if (deletedSectionIds.has(templateSection.id)) {
              continue;
            }
            
            // templateSectionId로 유저 section 찾기 (order 대신)
            const userSection = matSections.find((s) => s.templateSectionId === templateSection.id);

            if (userSection) {
              mergedSections.push({
                ...userSection,
                isFromTemplate: true,
                templateSectionId: templateSection.id,
                title: templateSection.title,
                links: templateSection.links || [],
                order: templateSection.order, // 템플릿 순서 적용
              });
              processedUserSectionIds.add(userSection.id);
            } else {
              mergedSections.push({
                id: `template-${templateSection.id}`,
                title: templateSection.title,
                order: templateSection.order,
                viewUrl: '',
                originalUrl: '',
                links: templateSection.links || [],
                isFromTemplate: true,
                templateSectionId: templateSection.id,
              });
            }
          }
        }

        const additionalUserSections = matSections
          .filter((s) => !processedUserSectionIds.has(s.id))
          .map((section) => ({
            ...section,
            isFromTemplate: false,
          }));

        allSections[mat.id] = [...mergedSections, ...additionalUserSections];
      }
      setSections(allSections);
    } catch (error) {
      logger.error('데이터 로드 오류:', error);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [userData]);

  // 코드별 필터링을 위한 materialCodeMap 생성
  const materialCodeMap: Record<string, string> = {};
  materials.forEach((m) => {
    if (m.templateId) {
      const tpl = templates.find((t) => t.id === m.templateId);
      materialCodeMap[m.id] = tpl?.code || '미지정';
    } else {
      materialCodeMap[m.id] = m.userCode || '개인 자료';
    }
  });

  const userCodes = userJobCodes.map((jc) => jc.code);
  const allMaterialCodes = Array.from(new Set(Object.values(materialCodeMap))).filter(
    (code) => userCodes.includes(code) || code === '개인 자료'
  );
  const sortedMaterialCodes = allMaterialCodes.sort((a, b) => {
    if (a === '개인 자료') return 1;
    if (b === '개인 자료') return -1;
    return a.localeCompare(b);
  });
  
  logger.info('📊 [WEB] materialCodeMap:', materialCodeMap);
  logger.info('📊 [WEB] userCodes:', userCodes);
  logger.info('📊 [WEB] allMaterialCodes:', allMaterialCodes);
  logger.info('📊 [WEB] sortedMaterialCodes:', sortedMaterialCodes);
  logger.info('📊 [WEB] selectedMaterialCode:', selectedMaterialCode);
  logger.info('📊 [WEB] 대주제 추가 버튼 표시 조건:', selectedMaterialCode && selectedMaterialCode !== '개인 자료');

  const filteredMaterials = selectedMaterialCode
    ? materials.filter((m) => materialCodeMap[m.id] === selectedMaterialCode)
    : materials;

  // 커스텀 대주제가 먼저 오도록 정렬 (templateId가 없는 것이 위로)
  const sortedFilteredMaterials = [...filteredMaterials].sort((a, b) => {
    // templateId가 없는 것(커스텀)이 위로
    if (!a.templateId && b.templateId) return -1;
    if (a.templateId && !b.templateId) return 1;
    // 둘 다 커스텀이거나 둘 다 템플릿이면 order 순서 유지
    return a.order - b.order;
  });

  // 코드 필터 초기화
  useEffect(() => {
    logger.info('📍 [WEB] 코드 필터 초기화 useEffect');
    logger.info('  - sortedMaterialCodes:', sortedMaterialCodes);
    logger.info('  - selectedMaterialCode:', selectedMaterialCode);
    logger.info('  - materials 개수:', materials.length);
    
    if (sortedMaterialCodes.length > 0) {
      // selectedMaterialCode가 없거나, sortedMaterialCodes에 포함되지 않으면 업데이트
      if (!selectedMaterialCode || !sortedMaterialCodes.includes(selectedMaterialCode)) {
        const hasPersonalMaterials = materials.some((m) => !m.templateId);
        logger.info('  - hasPersonalMaterials:', hasPersonalMaterials);
        
        if (hasPersonalMaterials && sortedMaterialCodes.includes('개인 자료')) {
          logger.info('  ✅ selectedMaterialCode 설정: 개인 자료');
          setSelectedMaterialCode('개인 자료');
        } else {
          logger.info('  ✅ selectedMaterialCode 설정:', sortedMaterialCodes[0]);
          setSelectedMaterialCode(sortedMaterialCodes[0]);
        }
      } else {
        logger.info('  ℹ️ selectedMaterialCode 유지:', selectedMaterialCode);
      }
    }
  }, [sortedMaterialCodes, selectedMaterialCode, materials]);

  // 소제목 추가
  const handleAddSection = async (materialId: string, data: Omit<SectionData, 'id'>) => {
    try {
      const currentSections = sections[materialId] || [];
      const templateSections = currentSections.filter((s) => s.isFromTemplate);
      const userSections = currentSections.filter((s) => !s.isFromTemplate);
      const order = templateSections.length + userSections.length;

      const sectionId = await addSection(materialId, { 
        ...data, 
        order,
        // templateSectionId는 일반 유저 섹션이므로 없음
      });

      const newSection: SectionDataWithLinks = {
        id: sectionId,
        title: data.title,
        order,
        viewUrl: data.viewUrl,
        originalUrl: data.originalUrl,
        links: [],
        isFromTemplate: false,
      };

      setSections((prev) => ({
        ...prev,
        [materialId]: [...(prev[materialId] || []), newSection],
      }));

      setAddingSectionFor(null);
      toast.success('소제목이 추가되었습니다.');
    } catch (error) {
      logger.error('소제목 추가 오류:', error);
      toast.error('소제목 추가 중 오류가 발생했습니다.');
    }
  };

  // 소제목 수정
  const handleEditSection = async (
    materialId: string,
    sectionId: string,
    data: Omit<SectionData, 'id'>
  ) => {
    try {
      const section = sections[materialId]?.find((s) => s.id === sectionId);

      if (section?.isFromTemplate) {
        if (sectionId.startsWith('template-')) {
          // 가상 ID인 경우 새로운 유저 섹션 생성 (templateSectionId 포함)
          const order = section.order;
          const newSectionId = await addSection(materialId, { 
            ...data, 
            order,
            title: section.title, // 템플릿 제목 유지
            templateSectionId: section.templateSectionId, // templateSectionId 전달
          });

          const newSection: SectionDataWithLinks = {
            id: newSectionId,
            title: section.title,
            order,
            viewUrl: data.viewUrl,
            originalUrl: data.originalUrl,
            links: section.links || [],
            isFromTemplate: true,
            templateSectionId: section.templateSectionId,
          };

          setSections((prev) => ({
            ...prev,
            [materialId]: prev[materialId]?.map((s) => (s.id === sectionId ? newSection : s)) || [],
          }));
        } else {
          // 실제 유저 섹션 업데이트 (제목은 템플릿 것 유지)
          await updateSection(materialId, sectionId, {
            ...data,
            title: section.title,
            templateSectionId: section.templateSectionId,
          });

          setSections((prev) => ({
            ...prev,
            [materialId]:
              prev[materialId]?.map((s) =>
                s.id === sectionId ? { ...s, viewUrl: data.viewUrl, originalUrl: data.originalUrl } : s
              ) || [],
          }));
        }
      } else {
        // 일반 유저 섹션 업데이트
        await updateSection(materialId, sectionId, data);

        setSections((prev) => ({
          ...prev,
          [materialId]: prev[materialId]?.map((s) => (s.id === sectionId ? { ...s, ...data } : s)) || [],
        }));
      }

      setEditingSection(null);
      toast.success('소제목이 수정되었습니다.');
    } catch (error) {
      logger.error('소제목 수정 오류:', error);
      toast.error('소제목 수정 중 오류가 발생했습니다.');
    }
  };

  // 소제목 삭제
  const handleDeleteSection = async (materialId: string, sectionId: string) => {
    const section = sections[materialId]?.find((s) => s.id === sectionId);
    if (section?.isFromTemplate) {
      toast.error('관리자가 설정한 소제목은 삭제할 수 없습니다.');
      return;
    }

    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      await deleteSection(materialId, sectionId);

      setSections((prev) => ({
        ...prev,
        [materialId]: prev[materialId]?.filter((s) => s.id !== sectionId) || [],
      }));

      toast.success('소제목이 삭제되었습니다.');
    } catch (error) {
      logger.error('소제목 삭제 오류:', error);
      toast.error('소제목 삭제 중 오류가 발생했습니다.');
    }
  };

  // 유저 대주제 추가
  const handleAddUserMaterial = async () => {
    if (!newMaterialTitle.trim()) {
      toast.error('대주제 이름을 입력해주세요.');
      return;
    }

    if (!selectedMaterialCode) {
      toast.error('코드를 선택한 후 대주제를 추가해주세요.');
      return;
    }

    try {
      const order = materials.length;
      const materialId = await addLessonMaterial(userData!.userId, newMaterialTitle.trim(), order);

      await updateLessonMaterial(materialId, {
        title: newMaterialTitle.trim(),
        userCode: selectedMaterialCode,
      } as any);

      const newMaterial: LessonMaterialData = {
        id: materialId,
        userId: userData!.userId,
        title: newMaterialTitle.trim(),
        order,
        templateId: undefined,
        userCode: selectedMaterialCode,
      };

      setMaterials((prev) => [...prev, newMaterial]);
      setSections((prev) => ({
        ...prev,
        [materialId]: [],
      }));

      setNewMaterialTitle('');
      setShowAddMaterialForm(false);
      toast.success(`${selectedMaterialCode}에 대주제가 추가되었습니다.`);
    } catch (error) {
      logger.error('대주제 추가 오류:', error);
      toast.error('대주제 추가 중 오류가 발생했습니다.');
    }
  };

  // 유저 대주제 삭제
  const handleDeleteUserMaterial = async (materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    if (!material) return;

    if (material.templateId) {
      toast.error('템플릿 기반 대주제는 삭제할 수 없습니다.');
      return;
    }

    if (!confirm('정말 삭제하시겠습니까? 모든 소제목도 함께 삭제됩니다.')) return;

    try {
      await deleteLessonMaterial(materialId);

      setMaterials((prev) => prev.filter((m) => m.id !== materialId));
      setSections((prev) => {
        const newSections = { ...prev };
        delete newSections[materialId];
        return newSections;
      });

      toast.success('대주제가 삭제되었습니다.');
    } catch (error) {
      logger.error('대주제 삭제 오류:', error);
      toast.error('대주제 삭제 중 오류가 발생했습니다.');
    }
  };

  if (!mounted) {
    return null;
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
        <p className="mt-3 text-sm">로딩 중...</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <p className="text-center">로그인 후 이용 가능합니다.</p>
      </div>
    );
  }

  if (!userData.jobExperiences || userData.jobExperiences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <p className="text-center font-medium mb-1">직무 경험이 필요합니다</p>
        <p className="text-center text-sm text-gray-500">
          수업 자료를 이용하려면 직무 경험이 등록되어야 합니다.
        </p>
        <p className="text-center text-sm text-gray-500">관리자에게 문의해주세요.</p>
      </div>
    );
  }

  if (!userData.activeJobExperienceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-lg font-semibold text-gray-700 mb-2">활성화된 캠프가 없습니다</p>
        <p className="text-center text-sm text-gray-500 mb-4">
          프로필 페이지에서 참여 중인 캠프를 활성화해주세요.
        </p>
        <a
          href="/profile"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium"
        >
          프로필 페이지로 이동
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
        <p className="mt-3 text-gray-500 text-sm">수업 자료를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* 코드별 필터 탭 */}
      {sortedMaterialCodes.length > 1 && (
        <div className="mb-4 px-4">
          <div className="flex flex-wrap gap-2">
            {sortedMaterialCodes.map((code) => (
              <button
                key={code}
                className={`px-3 py-1.5 text-sm font-medium rounded border transition-all flex items-center gap-1 ${
                  selectedMaterialCode === code
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedMaterialCode(code)}
              >
                {code === '개인 자료' && (
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                )}
                {code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 유저 대주제 추가 */}
      {selectedMaterialCode && selectedMaterialCode !== '개인 자료' && (
        <>
          {showAddMaterialForm ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mx-4 mb-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-2">
                {selectedMaterialCode}에 새 대주제 추가
              </h3>
              <p className="text-xs text-blue-600 mb-3">
                {selectedMaterialCode} 카테고리에 새로운 대주제를 추가합니다.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    대주제 이름
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                    placeholder="예: 개인 프로젝트, 추가 학습 자료"
                    value={newMaterialTitle}
                    onChange={(e) => setNewMaterialTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddUserMaterial();
                    }}
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mx-4 mb-4 text-blue-600 bg-blue-50 border border-dashed border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all text-sm font-medium"
              style={{ width: 'calc(100% - 2rem)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              {selectedMaterialCode}에 새 대주제 추가하기
            </button>
          )}
        </>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 mx-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
          <div className="flex items-center">
            <svg
              className="w-4 h-4 text-red-500 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* 대주제 목록 */}
      {sortedFilteredMaterials.length === 0 ? (
        <div className="text-center py-12 mx-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">해당 코드에 등록된 수업 자료가 없습니다</p>
          <p className="text-gray-400 text-sm mt-1">
            관리자가 템플릿을 추가하면 자동으로 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-2 px-2">
          {sortedFilteredMaterials.map((material) => {
            const sectionCount = sections[material.id]?.length || 0;
            const tpl = material.templateId
              ? templates.find((t) => t.id === material.templateId)
              : undefined;

            return (
              <div
                key={material.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all"
              >
                {/* 카드 헤더 */}
                <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* 아이콘 */}
                      <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-medium text-gray-900">{material.title}</h3>
                        <p className="text-[10px] sm:text-xs text-gray-500">{sectionCount}개 소제목</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      {tpl && tpl.links && tpl.links.length > 0 && (
                        <div className="flex gap-1 mr-1 sm:mr-2">
                          {tpl.links.slice(0, 2).map((l, idx) =>
                            l.label && l.url ? (
                              <a
                                key={idx}
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                                aria-label={l.label}
                              >
                                {l.label}
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                      {!material.templateId && (
                        <button
                          onClick={() => handleDeleteUserMaterial(material.id)}
                          className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                          title="대주제 삭제"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 카드 본문 - 항상 표시 */}
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-white">
                    <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3">
                      {sections[material.id]?.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          <svg
                            className="w-8 h-8 mx-auto mb-2 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <p className="text-sm">소제목이 없습니다</p>
                          <p className="text-xs mt-1">아래 버튼을 클릭하여 소제목을 추가해보세요</p>
                        </div>
                      ) : (
                        sections[material.id]?.map((section) => (
                          <div
                            key={section.id}
                            className="border-b border-gray-200 last:border-b-0 py-2 sm:py-2.5 transition-all group"
                          >
                            {editingSection?.materialId === material.id &&
                            editingSection?.section.id === section.id ? (
                              <SectionForm
                                initial={editingSection.section}
                                onSave={(data) => handleEditSection(material.id, section.id, data)}
                                onCancel={() => setEditingSection(null)}
                                isFromTemplate={section.isFromTemplate}
                              />
                            ) : (
                              <>
                                {/* 소제목 컴팩트 레이아웃 */}
                                <div className="flex items-center justify-between gap-2 sm:gap-3">
                                  {/* 왼쪽: 제목, 링크 */}
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1 min-w-0">
                                    <div className="flex items-center gap-1 sm:gap-1.5">
                                      {section.isFromTemplate && (
                                        <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0">📌</span>
                                      )}
                                      <h4 className={`font-medium text-xs sm:text-sm ${section.isFromTemplate ? 'text-gray-700' : 'text-gray-800'}`}>
                                        {section.title}
                                      </h4>
                                    </div>
                                    {/* 관리자 링크들 */}
                                    {section.links && section.links.length > 0 && (
                                      <>
                                        {section.links.map((link, idx) => (
                                          <a
                                            key={idx}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all border border-gray-300"
                                          >
                                            <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            {link.label}
                                          </a>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                  
                                  {/* 오른쪽: 액션 버튼들 */}
                                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                    {/* 공개보기/원본 버튼 */}
                                    <a
                                      href={section.viewUrl || undefined}
                                      target="_blank"
                                      rel="noopener"
                                      className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                                        section.viewUrl
                                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                                          : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                      }`}
                                    >
                                      <svg
                                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 hidden sm:block"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                        />
                                      </svg>
                                      <span className="hidden sm:inline">공개보기</span>
                                      <span className="sm:hidden">공개</span>
                                    </a>
                                    <a
                                      href={section.originalUrl || undefined}
                                      target="_blank"
                                      rel="noopener"
                                      className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                                        section.originalUrl
                                          ? 'bg-green-500 text-white hover:bg-green-600'
                                          : 'bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none'
                                      }`}
                                    >
                                      <svg
                                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 hidden sm:block"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                      원본
                                    </a>
                                    {/* 수정/삭제 버튼 */}
                                    <button
                                      onClick={() =>
                                        setEditingSection({ materialId: material.id, section })
                                      }
                                      className="p-0.5 sm:p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                      title="수정"
                                    >
                                      <svg
                                        className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    {!section.isFromTemplate && (
                                      <button
                                        onClick={() => handleDeleteSection(material.id, section.id)}
                                        className="p-0.5 sm:p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                        title="삭제"
                                      >
                                        <svg
                                          className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* 소제목 추가 섹션 */}
                    {addingSectionFor === material.id ? (
                      <SectionForm
                        onSave={(data) => handleAddSection(material.id, data)}
                        onCancel={() => setAddingSectionFor(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingSectionFor(material.id)}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1 mt-2 text-gray-500 bg-transparent border border-dashed border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 hover:text-gray-700 transition-all text-xs"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        소제목 추가
                      </button>
                    )}
                  </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
