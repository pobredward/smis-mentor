import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
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
} from '../services/lessonMaterialService';
import { getUserJobCodesInfo } from '../services/authService';

interface JobCodeWithGroup {
  generation: string;
  code: string;
  name: string;
}

// SectionData 타입 확장 (관리자 links 지원)
type SectionDataWithLinks = SectionData & {
  links?: { label: string; url: string }[];
  isFromTemplate?: boolean;
  templateSectionId?: string;
};

export function TasksScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.placeholderContainer}>
        <Ionicons name="briefcase-outline" size={64} color="#cbd5e1" />
        <Text style={styles.placeholderText}>업무 화면 (추후 구현)</Text>
      </View>
    </View>
  );
}

export function RoomScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.placeholderContainer}>
        <Ionicons name="bed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.placeholderText}>방 화면 (추후 구현)</Text>
      </View>
    </View>
  );
}

export function LessonScreen() {
  const { userData, loading: authLoading } = useAuth();
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<{
    materialId: string;
    section: SectionDataWithLinks;
  } | null>(null);
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');

  // 섹션 폼 상태
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionViewUrl, setSectionViewUrl] = useState('');
  const [sectionOriginalUrl, setSectionOriginalUrl] = useState('');

  // 활성화된 캠프의 jobCode 정보 가져오기
  const fetchActiveJobCode = async () => {
    console.log('📍 fetchActiveJobCode 시작');
    console.log('  - activeJobExperienceId:', userData?.activeJobExperienceId);
    
    if (!userData?.activeJobExperienceId) {
      console.log('  ❌ activeJobExperienceId 없음');
      setUserJobCodes([]);
      return [];
    }
    
    try {
      // activeJobExperienceId를 배열로 전달
      console.log('  🔍 getUserJobCodesInfo 호출:', [userData.activeJobExperienceId]);
      const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
      console.log('  ✅ jobCodesInfo:', jobCodesInfo);
      setUserJobCodes(jobCodesInfo);
      return jobCodesInfo;
    } catch (error) {
      console.error('활성화된 직무 코드 정보 가져오기 오류:', error);
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
    console.log('📍 fetchAll 시작');
    console.log('  - userData:', userData?.name, userData?.userId);
    console.log('  - activeJobExperienceId:', userData?.activeJobExperienceId);
    
    if (!userData) return;
    
    // 활성화된 캠프가 없으면 빈 상태로 표시
    if (!userData.activeJobExperienceId) {
      console.log('  ❌ activeJobExperienceId 없음 - 빈 상태 표시');
      setLoading(false);
      setMaterials([]);
      setSections({});
      return;
    }
    
    setLoading(true);
    try {
      console.log('🔍 1. 활성화된 jobCode 가져오기...');
      const activeJobCode = await fetchActiveJobCode();
      console.log('  ✅ activeJobCode:', activeJobCode);
      
      console.log('🔍 2. 모든 템플릿 가져오기...');
      const allTemplates = await getLessonMaterialTemplates();
      console.log('  ✅ 전체 템플릿 개수:', allTemplates.length);
      console.log('  📋 템플릿 목록:', allTemplates.map(t => ({ id: t.id, title: t.title, code: t.code })));
      setTemplates(allTemplates);

      console.log('🔍 3. 접근 가능한 템플릿 필터링...');
      const accessibleTemplates = getAccessibleTemplates(allTemplates, activeJobCode);
      console.log('  ✅ 접근 가능한 템플릿:', accessibleTemplates.map(t => ({ id: t.id, title: t.title, code: t.code })));
      
      console.log('🔍 4. 사용자 수업 자료 가져오기...');
      const mats = await getLessonMaterials(userData.userId);
      console.log('  ✅ 기존 수업 자료 개수:', mats.length);
      console.log('  📋 수업 자료 목록:', mats.map(m => ({ id: m.id, title: m.title, templateId: m.templateId })));

      const activeCodesList = activeJobCode.map((uc) => uc.code);
      console.log('  📌 활성 코드 목록:', activeCodesList);
      
      const seenTemplateIds = new Set<string>();
      const materialsToRemove: string[] = [];
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
          console.log('  ⚠️ 템플릿 없음 - 제거 대상:', mat.id);
          materialsToRemove.push(mat.id);
          continue;
        }

        if (!template.code || !activeCodesList.includes(template.code)) {
          // 활성화된 코드가 아닌 템플릿은 제거
          console.log('  ⚠️ 비활성 코드 템플릿 - 제거 대상:', mat.id, template.code);
          materialsToRemove.push(mat.id);
          continue;
        }

        if (seenTemplateIds.has(mat.templateId)) {
          console.log('  ⚠️ 중복 템플릿 - 제거 대상:', mat.id);
          materialsToRemove.push(mat.id);
          continue;
        }

        seenTemplateIds.add(mat.templateId);

        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
        }
      }

      console.log('🔍 5. 제거할 자료:', materialsToRemove.length, '개');
      for (const matId of materialsToRemove) {
        await deleteLessonMaterial(matId);
      }

      console.log('🔍 6. 업데이트할 자료:', materialsToUpdate.length, '개');
      for (const { id, newTitle } of materialsToUpdate) {
        await updateLessonMaterial(id, { title: newTitle });
      }

      console.log('🔍 7. 새로운 템플릿 추가 확인...');
      for (const template of accessibleTemplates) {
        if (!seenTemplateIds.has(template.id)) {
          console.log('  ➕ 새 템플릿 추가:', template.title);
          await addLessonMaterial(userData.userId, template.title, 0, template.id);
        }
      }

      console.log('🔍 8. 최종 수업 자료 가져오기...');
      const finalMats = await getLessonMaterials(userData.userId);
      console.log('  ✅ 최종 수업 자료 개수:', finalMats.length);
      
      // 활성화된 코드에 해당하는 자료만 필터링
      const filteredMats = finalMats.filter((mat) => {
        if (mat.templateId) {
          const template = allTemplates.find((t) => t.id === mat.templateId);
          return template?.code && activeCodesList.includes(template.code);
        } else {
          // 사용자가 추가한 대주제는 userCode로 필터링
          return mat.userCode && activeCodesList.includes(mat.userCode);
        }
      });
      
      console.log('  ✅ 필터링된 자료 개수:', filteredMats.length);
      console.log('  📋 필터링된 자료:', filteredMats.map(m => ({ id: m.id, title: m.title })));
      
      setMaterials(filteredMats);

      const allSections: Record<string, SectionDataWithLinks[]> = {};
      for (const mat of finalMats) {
        const matSections = await getSections(mat.id);
        const template = mat.templateId ? allTemplates.find((t) => t.id === mat.templateId) : null;

        const mergedSections: SectionDataWithLinks[] = [];
        const processedUserSectionIds = new Set<string>();

        if (template?.sections) {
          for (const templateSection of template.sections) {
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
      console.error('데이터 로드 오류:', error);
      Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
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

  const filteredMaterials = selectedMaterialCode
    ? materials.filter((m) => materialCodeMap[m.id] === selectedMaterialCode)
    : materials;

  // 코드 필터 초기화
  useEffect(() => {
    if (sortedMaterialCodes.length > 0 && !selectedMaterialCode) {
      const hasPersonalMaterials = materials.some((m) => !m.templateId);
      if (hasPersonalMaterials && sortedMaterialCodes.includes('개인 자료')) {
        setSelectedMaterialCode('개인 자료');
      } else {
        setSelectedMaterialCode(sortedMaterialCodes[0]);
      }
    }
  }, [sortedMaterialCodes, selectedMaterialCode, materials]);

  // 소제목 추가
  const handleAddSection = async (materialId: string) => {
    if (!sectionTitle.trim()) {
      Alert.alert('오류', '소제목 이름을 입력해주세요.');
      return;
    }

    try {
      const currentSections = sections[materialId] || [];
      const templateSections = currentSections.filter((s) => s.isFromTemplate);
      const userSections = currentSections.filter((s) => !s.isFromTemplate);
      const order = templateSections.length + userSections.length;

      const sectionId = await addSection(materialId, {
        title: sectionTitle.trim(),
        viewUrl: sectionViewUrl.trim(),
        originalUrl: sectionOriginalUrl.trim(),
        order,
        // templateSectionId는 일반 유저 섹션이므로 없음
      });

      const newSection: SectionDataWithLinks = {
        id: sectionId,
        title: sectionTitle.trim(),
        order,
        viewUrl: sectionViewUrl.trim(),
        originalUrl: sectionOriginalUrl.trim(),
        links: [],
        isFromTemplate: false,
      };

      setSections((prev) => ({
        ...prev,
        [materialId]: [...(prev[materialId] || []), newSection],
      }));

      setAddingSectionFor(null);
      setSectionTitle('');
      setSectionViewUrl('');
      setSectionOriginalUrl('');
      Alert.alert('성공', '소제목이 추가되었습니다.');
    } catch (error) {
      console.error('소제목 추가 오류:', error);
      Alert.alert('오류', '소제목 추가 중 오류가 발생했습니다.');
    }
  };

  // 소제목 수정
  const handleEditSection = async (materialId: string, sectionId: string) => {
    if (!sectionTitle.trim()) {
      Alert.alert('오류', '소제목 이름을 입력해주세요.');
      return;
    }

    try {
      const section = sections[materialId]?.find((s) => s.id === sectionId);

      if (section?.isFromTemplate) {
        if (sectionId.startsWith('template-')) {
          // 가상 ID인 경우 새로운 유저 섹션 생성 (templateSectionId 포함)
          const order = section.order;
          const newSectionId = await addSection(materialId, {
            title: section.title, // 템플릿 제목 유지
            viewUrl: sectionViewUrl.trim(),
            originalUrl: sectionOriginalUrl.trim(),
            order,
            templateSectionId: section.templateSectionId, // templateSectionId 전달
          });

          const newSection: SectionDataWithLinks = {
            id: newSectionId,
            title: section.title,
            order,
            viewUrl: sectionViewUrl.trim(),
            originalUrl: sectionOriginalUrl.trim(),
            links: section.links || [],
            isFromTemplate: true,
            templateSectionId: section.templateSectionId,
          };

          setSections((prev) => ({
            ...prev,
            [materialId]:
              prev[materialId]?.map((s) => (s.id === sectionId ? newSection : s)) || [],
          }));
        } else {
          // 실제 유저 섹션 업데이트 (제목은 템플릿 것 유지)
          await updateSection(materialId, sectionId, {
            title: section.title,
            viewUrl: sectionViewUrl.trim(),
            originalUrl: sectionOriginalUrl.trim(),
            order: section.order,
            templateSectionId: section.templateSectionId,
          });

          setSections((prev) => ({
            ...prev,
            [materialId]:
              prev[materialId]?.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      viewUrl: sectionViewUrl.trim(),
                      originalUrl: sectionOriginalUrl.trim(),
                    }
                  : s
              ) || [],
          }));
        }
      } else {
        // 일반 유저 섹션 업데이트
        await updateSection(materialId, sectionId, {
          title: sectionTitle.trim(),
          viewUrl: sectionViewUrl.trim(),
          originalUrl: sectionOriginalUrl.trim(),
          order: section?.order || 0,
        });

        setSections((prev) => ({
          ...prev,
          [materialId]:
            prev[materialId]?.map((s) =>
              s.id === sectionId
                ? {
                    ...s,
                    title: sectionTitle.trim(),
                    viewUrl: sectionViewUrl.trim(),
                    originalUrl: sectionOriginalUrl.trim(),
                  }
                : s
            ) || [],
        }));
      }

      setEditingSection(null);
      setSectionTitle('');
      setSectionViewUrl('');
      setSectionOriginalUrl('');
      Alert.alert('성공', '소제목이 수정되었습니다.');
    } catch (error) {
      console.error('소제목 수정 오류:', error);
      Alert.alert('오류', '소제목 수정 중 오류가 발생했습니다.');
    }
  };

  // 소제목 삭제
  const handleDeleteSection = async (materialId: string, sectionId: string) => {
    const section = sections[materialId]?.find((s) => s.id === sectionId);
    if (section?.isFromTemplate) {
      Alert.alert('오류', '관리자가 설정한 소제목은 삭제할 수 없습니다.');
      return;
    }

    Alert.alert('삭제 확인', '정말 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSection(materialId, sectionId);
            setSections((prev) => ({
              ...prev,
              [materialId]: prev[materialId]?.filter((s) => s.id !== sectionId) || [],
            }));
            Alert.alert('성공', '소제목이 삭제되었습니다.');
          } catch (error) {
            console.error('소제목 삭제 오류:', error);
            Alert.alert('오류', '소제목 삭제 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  // 유저 대주제 추가
  const handleAddUserMaterial = async () => {
    if (!newMaterialTitle.trim()) {
      Alert.alert('오류', '대주제 이름을 입력해주세요.');
      return;
    }

    if (!selectedMaterialCode) {
      Alert.alert('오류', '코드를 선택한 후 대주제를 추가해주세요.');
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
      Alert.alert('성공', `${selectedMaterialCode}에 대주제가 추가되었습니다.`);
    } catch (error) {
      console.error('대주제 추가 오류:', error);
      Alert.alert('오류', '대주제 추가 중 오류가 발생했습니다.');
    }
  };

  // 유저 대주제 삭제
  const handleDeleteUserMaterial = async (materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    if (!material) return;

    if (material.templateId) {
      Alert.alert('오류', '템플릿 기반 대주제는 삭제할 수 없습니다.');
      return;
    }

    Alert.alert('삭제 확인', '정말 삭제하시겠습니까? 모든 소제목도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLessonMaterial(materialId);
            setMaterials((prev) => prev.filter((m) => m.id !== materialId));
            setSections((prev) => {
              const newSections = { ...prev };
              delete newSections[materialId];
              return newSections;
            });
            Alert.alert('성공', '대주제가 삭제되었습니다.');
          } catch (error) {
            console.error('대주제 삭제 오류:', error);
            Alert.alert('오류', '대주제 삭제 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  if (!userData) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
          <Text style={styles.placeholderTitle}>로그인 필요</Text>
          <Text style={styles.placeholderText}>로그인 후 이용 가능합니다.</Text>
        </View>
      </View>
    );
  }

  if (!userData.jobExperiences || userData.jobExperiences.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <Ionicons name="warning-outline" size={64} color="#f59e0b" />
          <Text style={styles.placeholderTitle}>직무 경험 필요</Text>
          <Text style={styles.placeholderText}>
            수업 자료를 이용하려면 직무 경험이 등록되어야 합니다.
          </Text>
          <Text style={[styles.placeholderText, { marginTop: 4 }]}>
            관리자에게 문의해주세요.
          </Text>
        </View>
      </View>
    );
  }

  if (!userData.activeJobExperienceId) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <Ionicons name="settings-outline" size={64} color="#3b82f6" />
          <Text style={styles.placeholderTitle}>캠프를 선택해주세요</Text>
          <Text style={styles.placeholderText}>
            마이페이지에서 활성화할 캠프를 선택하면
          </Text>
          <Text style={styles.placeholderText}>
            해당 캠프의 수업 자료를 확인할 수 있습니다.
          </Text>
        </View>
      </View>
    );
  }

  if (authLoading || loading) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.placeholderText, { marginTop: 16 }]}>
            수업 자료를 불러오는 중...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>수업 자료 업로드</Text>
          <Text style={styles.headerSubtitle}>참여하는 캠프 코드의 자료만 확인 가능합니다</Text>
        </View>

        {/* 코드별 필터 탭 */}
        {sortedMaterialCodes.length > 1 && (
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sortedMaterialCodes.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.filterTab,
                    selectedMaterialCode === code && styles.filterTabActive,
                  ]}
                  onPress={() => setSelectedMaterialCode(code)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      selectedMaterialCode === code && styles.filterTabTextActive,
                    ]}
                  >
                    {code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 대주제 목록 */}
        {filteredMaterials.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>등록된 수업 자료가 없습니다</Text>
            <Text style={styles.emptyText}>
              관리자가 템플릿을 추가하면 자동으로 표시됩니다
            </Text>
          </View>
        ) : (
          <View style={styles.materialsContainer}>
            {filteredMaterials.map((material) => {
              const isExpanded = expandedMaterials.has(material.id);
              const sectionCount = sections[material.id]?.length || 0;
              const tpl = material.templateId
                ? templates.find((t) => t.id === material.templateId)
                : undefined;

              return (
                <View key={material.id} style={styles.materialCard}>
                  {/* 대주제 헤더 */}
                  <TouchableOpacity
                    style={styles.materialHeader}
                    onPress={() => {
                      setExpandedMaterials((prev) => {
                        const newSet = new Set(prev);
                        if (newSet.has(material.id)) {
                          newSet.delete(material.id);
                        } else {
                          newSet.add(material.id);
                        }
                        return newSet;
                      });
                    }}
                  >
                    <View style={styles.materialHeaderLeft}>
                      <View style={styles.materialIcon}>
                        <Ionicons name="document-text-outline" size={20} color="#3b82f6" />
                      </View>
                      <View style={styles.materialInfo}>
                        <Text style={styles.materialTitle}>{material.title}</Text>
                        <Text style={styles.materialSubtitle}>{sectionCount}개 소제목</Text>
                      </View>
                    </View>
                    <View style={styles.materialHeaderRight}>
                      {tpl && tpl.links && tpl.links.length > 0 && (
                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (tpl.links && tpl.links[0]?.url) {
                              Linking.openURL(tpl.links[0].url);
                            }
                          }}
                        >
                          <Ionicons name="link-outline" size={16} color="#3b82f6" />
                        </TouchableOpacity>
                      )}
                      {!material.templateId && (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteUserMaterial(material.id);
                          }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#9ca3af"
                      />
                    </View>
                  </TouchableOpacity>

                  {/* 소제목 목록 */}
                  {isExpanded && (
                    <View style={styles.sectionsContainer}>
                      {sections[material.id]?.length === 0 ? (
                        <View style={styles.emptySections}>
                          <Ionicons name="albums-outline" size={32} color="#cbd5e1" />
                          <Text style={styles.emptySectionsText}>소제목이 없습니다</Text>
                          <Text style={[styles.emptySectionsText, { fontSize: 12 }]}>
                            아래 버튼을 클릭하여 소제목을 추가해보세요
                          </Text>
                        </View>
                      ) : (
                        sections[material.id]?.map((section) => (
                          <View
                            key={section.id}
                            style={[
                              styles.sectionCard,
                              section.isFromTemplate && styles.sectionCardTemplate,
                            ]}
                          >
                            {editingSection?.materialId === material.id &&
                            editingSection?.section.id === section.id ? (
                              <View style={styles.sectionForm}>
                                <TextInput
                                  style={[
                                    styles.input,
                                    section.isFromTemplate && styles.inputDisabled,
                                  ]}
                                  placeholder="소제목 이름"
                                  value={sectionTitle}
                                  onChangeText={setSectionTitle}
                                  editable={!section.isFromTemplate}
                                />
                                {section.isFromTemplate && (
                                  <Text style={styles.helperText}>
                                    관리자가 설정한 제목은 수정할 수 없습니다.
                                  </Text>
                                )}
                                <TextInput
                                  style={styles.input}
                                  placeholder="공개보기 링크"
                                  value={sectionViewUrl}
                                  onChangeText={setSectionViewUrl}
                                  autoCapitalize="none"
                                />
                                <TextInput
                                  style={styles.input}
                                  placeholder="원본 링크"
                                  value={sectionOriginalUrl}
                                  onChangeText={setSectionOriginalUrl}
                                  autoCapitalize="none"
                                />
                                <View style={styles.formActions}>
                                  <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() => {
                                      setEditingSection(null);
                                      setSectionTitle('');
                                      setSectionViewUrl('');
                                      setSectionOriginalUrl('');
                                    }}
                                  >
                                    <Text style={styles.cancelButtonText}>취소</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.saveButton}
                                    onPress={() => handleEditSection(material.id, section.id)}
                                  >
                                    <Text style={styles.saveButtonText}>수정 완료</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <>
                                <View style={styles.sectionHeader}>
                                  <View style={styles.sectionHeaderLeft}>
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                    {section.isFromTemplate && (
                                      <View style={styles.templateBadge}>
                                        <Text style={styles.templateBadgeText}>관리자 설정</Text>
                                      </View>
                                    )}
                                  </View>
                                  <View style={styles.sectionActions}>
                                    <TouchableOpacity
                                      style={styles.actionButton}
                                      onPress={() => {
                                        setEditingSection({
                                          materialId: material.id,
                                          section,
                                        });
                                        setSectionTitle(section.title);
                                        setSectionViewUrl(section.viewUrl || '');
                                        setSectionOriginalUrl(section.originalUrl || '');
                                      }}
                                    >
                                      <Ionicons name="pencil-outline" size={16} color="#3b82f6" />
                                    </TouchableOpacity>
                                    {!section.isFromTemplate && (
                                      <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() =>
                                          handleDeleteSection(material.id, section.id)
                                        }
                                      >
                                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>

                                {/* 관리자 링크들 */}
                                {section.links && section.links.length > 0 && (
                                  <View style={styles.linksContainer}>
                                    {section.links.map((link, idx) => (
                                      <TouchableOpacity
                                        key={idx}
                                        style={styles.linkChip}
                                        onPress={() => Linking.openURL(link.url)}
                                      >
                                        <Ionicons
                                          name="link-outline"
                                          size={12}
                                          color="#10b981"
                                        />
                                        <Text style={styles.linkChipText}>{link.label}</Text>
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                )}

                                {/* 액션 버튼들 */}
                                <View style={styles.sectionLinks}>
                                  <TouchableOpacity
                                    style={[
                                      styles.sectionLinkButton,
                                      !section.viewUrl && styles.sectionLinkButtonDisabled,
                                    ]}
                                    onPress={() =>
                                      section.viewUrl && Linking.openURL(section.viewUrl)
                                    }
                                    disabled={!section.viewUrl}
                                  >
                                    <Ionicons
                                      name="eye-outline"
                                      size={14}
                                      color={section.viewUrl ? '#ffffff' : '#9ca3af'}
                                    />
                                    <Text
                                      style={[
                                        styles.sectionLinkButtonText,
                                        !section.viewUrl && styles.sectionLinkButtonTextDisabled,
                                      ]}
                                    >
                                      공개보기
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.sectionLinkButton,
                                      styles.sectionLinkButtonOriginal,
                                      !section.originalUrl &&
                                        styles.sectionLinkButtonDisabled,
                                    ]}
                                    onPress={() =>
                                      section.originalUrl && Linking.openURL(section.originalUrl)
                                    }
                                    disabled={!section.originalUrl}
                                  >
                                    <Ionicons
                                      name="document-outline"
                                      size={14}
                                      color={section.originalUrl ? '#ffffff' : '#9ca3af'}
                                    />
                                    <Text
                                      style={[
                                        styles.sectionLinkButtonText,
                                        !section.originalUrl &&
                                          styles.sectionLinkButtonTextDisabled,
                                      ]}
                                    >
                                      원본
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </>
                            )}
                          </View>
                        ))
                      )}

                      {/* 소제목 추가 섹션 */}
                      {addingSectionFor === material.id ? (
                        <View style={styles.addSectionForm}>
                          <TextInput
                            style={styles.input}
                            placeholder="소제목 이름"
                            value={sectionTitle}
                            onChangeText={setSectionTitle}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="공개보기 링크"
                            value={sectionViewUrl}
                            onChangeText={setSectionViewUrl}
                            autoCapitalize="none"
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="원본 링크"
                            value={sectionOriginalUrl}
                            onChangeText={setSectionOriginalUrl}
                            autoCapitalize="none"
                          />
                          <View style={styles.formActions}>
                            <TouchableOpacity
                              style={styles.cancelButton}
                              onPress={() => {
                                setAddingSectionFor(null);
                                setSectionTitle('');
                                setSectionViewUrl('');
                                setSectionOriginalUrl('');
                              }}
                            >
                              <Text style={styles.cancelButtonText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.saveButton}
                              onPress={() => handleAddSection(material.id)}
                            >
                              <Text style={styles.saveButtonText}>추가하기</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addSectionButton}
                          onPress={() => setAddingSectionFor(material.id)}
                        >
                          <Ionicons name="add-circle-outline" size={20} color="#3b82f6" />
                          <Text style={styles.addSectionButtonText}>소제목 추가하기</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* 유저 대주제 추가 */}
        {selectedMaterialCode && selectedMaterialCode !== '개인 자료' && (
          <>
            {showAddMaterialForm ? (
              <View style={styles.addMaterialForm}>
                <Text style={styles.addMaterialFormTitle}>
                  {selectedMaterialCode}에 새 대주제 추가
                </Text>
                <Text style={styles.addMaterialFormSubtitle}>
                  {selectedMaterialCode} 카테고리에 새로운 대주제를 추가합니다.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="대주제 이름 (예: 개인 프로젝트)"
                  value={newMaterialTitle}
                  onChangeText={setNewMaterialTitle}
                />
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowAddMaterialForm(false);
                      setNewMaterialTitle('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleAddUserMaterial}
                  >
                    <Text style={styles.saveButtonText}>추가하기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addMaterialButton}
                onPress={() => setShowAddMaterialForm(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#3b82f6" />
                <Text style={styles.addMaterialButtonText}>
                  {selectedMaterialCode}에 새 대주제 추가하기
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  placeholderText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  materialsContainer: {
    padding: 16,
  },
  materialCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    overflow: 'hidden',
  },
  materialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  materialHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  materialIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  materialInfo: {
    flex: 1,
  },
  materialTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  materialSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  materialHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  sectionsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    padding: 16,
    paddingTop: 12,
  },
  emptySections: {
    alignItems: 'center',
    padding: 24,
  },
  emptySectionsText: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 8,
  },
  sectionCardTemplate: {
    backgroundColor: '#ecfdf5',
    borderColor: '#d1fae5',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  templateBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  templateBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#065f46',
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  linksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  linkChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065f46',
  },
  sectionLinks: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  sectionLinkButtonOriginal: {
    backgroundColor: '#10b981',
  },
  sectionLinkButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  sectionLinkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  sectionLinkButtonTextDisabled: {
    color: '#9ca3af',
  },
  sectionForm: {
    gap: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
  },
  helperText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: -8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  addSectionForm: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    gap: 12,
    marginTop: 8,
  },
  addSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  addSectionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  addMaterialForm: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    margin: 16,
    marginTop: 0,
    gap: 12,
  },
  addMaterialFormTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
  },
  addMaterialFormSubtitle: {
    fontSize: 12,
    color: '#3b82f6',
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    margin: 16,
    marginTop: 0,
  },
  addMaterialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
