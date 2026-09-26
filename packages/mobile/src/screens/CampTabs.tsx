import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import React, { useEffect, useState, useMemo } from 'react';
import { logger } from '@smis-mentor/shared';
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
import { L } from '@smis-mentor/shared';

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


export function LessonScreen() {
  const { userData, loading: authLoading } = useAuth();
  // 교육 · 다른 캠프 탭과 같은 기준 (관리자 임시 캠프 → 활성 캠프 → 첫 배정 캠프)
  const lessonJobCodeId = resolveActiveJobCodeId(userData);
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
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
    if (!lessonJobCodeId) {
      setUserJobCodes([]);
      return [];
    }
    
    try {
      const jobCodesInfo = await getUserJobCodesInfo([lessonJobCodeId]);
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
    if (!lessonJobCodeId) {
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
          if (mat.userCode && !activeCodesList.includes(mat.userCode)) {
            continue;
          }
          continue;
        }

        const template = allTemplates.find((t) => t.id === mat.templateId);
        if (!template) continue;

        if (!template.code || !activeCodesList.includes(template.code)) continue;

        if (seenTemplateIds.has(mat.templateId)) continue;

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

      // write가 없으면 2차 getLessonMaterials 재조회 생략
      const needsRefetch = materialsToUpdate.length > 0 || accessibleTemplates.some(t => !seenTemplateIds.has(t.id));
      let finalMats: LessonMaterialData[];
      if (needsRefetch) {
        finalMats = await getLessonMaterials(userData.userId);
      } else {
        finalMats = mats;
      }
      
      // 활성화된 코드에 해당하는 자료만 필터링 + 중복 제거
      const seenTemplateIdsInFinal = new Set<string>();
      const filteredMats = finalMats.filter((mat) => {
        if (mat.templateId) {
          const template = allTemplates.find((t) => t.id === mat.templateId);
          if (!template?.code || !activeCodesList.includes(template.code)) {
            return false;
          }
          if (seenTemplateIdsInFinal.has(mat.templateId)) {
            return false;
          }
          seenTemplateIdsInFinal.add(mat.templateId);
          return true;
        } else {
          return mat.userCode && activeCodesList.includes(mat.userCode);
        }
      });
      
      setMaterials(filteredMats);

      // filteredMats(표시할 항목)만 Promise.all 병렬 조회
      const sectionResults = await Promise.all(
        filteredMats.map(async (mat) => {
          const matSections = await getSections(mat.id);
          const template = mat.templateId ? allTemplates.find((t) => t.id === mat.templateId) : null;

          const mergedSections: SectionDataWithLinks[] = [];
          const processedUserSectionIds = new Set<string>();

          if (template?.sections) {
            const deletedSectionIds = new Set(template.deletedSectionIds || []);
            for (const templateSection of template.sections) {
              if (deletedSectionIds.has(templateSection.id)) continue;
              const userSection = matSections.find((s) => s.templateSectionId === templateSection.id);
              if (userSection) {
                mergedSections.push({
                  ...userSection,
                  isFromTemplate: true,
                  templateSectionId: templateSection.id,
                  title: templateSection.title,
                  links: templateSection.links || [],
                  order: templateSection.order,
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
            .map((section) => ({ ...section, isFromTemplate: false }));

          return { matId: mat.id, sections: [...mergedSections, ...additionalUserSections] };
        })
      );

      const allSections: Record<string, SectionDataWithLinks[]> = {};
      for (const { matId, sections } of sectionResults) {
        allSections[matId] = sections;
      }
      setSections(allSections);
    } catch (error) {
      logger.error('데이터 로드 오류:', error);
      Alert.alert(L('common.error'), L('content.anErrorOccurredWhileLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [userData]);

  // 코드별 필터링을 위한 materialCodeMap 생성
  const materialCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    materials.forEach((m) => {
      if (m.templateId) {
        const tpl = templates.find((t) => t.id === m.templateId);
        map[m.id] = tpl?.code || '미지정';
      } else {
        map[m.id] = m.userCode || '개인 자료';
      }
    });
    return map;
  }, [materials, templates]);

  const sortedMaterialCodes = useMemo(() => {
    const userCodes = userJobCodes.map((jc) => jc.code);
    const allCodes = Array.from(new Set(Object.values(materialCodeMap))).filter(
      (code) => userCodes.includes(code) || code === '개인 자료'
    );
    return allCodes.sort((a, b) => {
      if (a === '개인 자료') return 1;
      if (b === '개인 자료') return -1;
      return a.localeCompare(b);
    });
  }, [materialCodeMap, userJobCodes]);

  const sortedFilteredMaterials = useMemo(() => {
    const filtered = selectedMaterialCode
      ? materials.filter((m) => materialCodeMap[m.id] === selectedMaterialCode)
      : materials;
    return [...filtered].sort((a, b) => {
      if (!a.templateId && b.templateId) return -1;
      if (a.templateId && !b.templateId) return 1;
      return a.order - b.order;
    });
  }, [materials, materialCodeMap, selectedMaterialCode]);

  // 코드 필터 초기화
  useEffect(() => {
    if (sortedMaterialCodes.length > 0) {
      if (!selectedMaterialCode || !sortedMaterialCodes.includes(selectedMaterialCode)) {
        const hasPersonalMaterials = materials.some((m) => !m.templateId);
        if (hasPersonalMaterials && sortedMaterialCodes.includes('개인 자료')) {
          setSelectedMaterialCode('개인 자료');
        } else {
          setSelectedMaterialCode(sortedMaterialCodes[0]);
        }
      }
    }
  }, [sortedMaterialCodes, selectedMaterialCode, materials]);

  // 소제목 추가
  const handleAddSection = async (materialId: string) => {
    if (!sectionTitle.trim()) {
      Alert.alert(L('common.error'), L('content.pleaseEnterASubsectionName'));
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
      Alert.alert(L('common.success'), L('content.subsectionAdded'));
    } catch (error) {
      logger.error('소제목 추가 오류:', error);
      Alert.alert(L('common.error'), L('content.anErrorOccurredWhileAdding'));
    }
  };

  // 소제목 수정
  const handleEditSection = async (materialId: string, sectionId: string) => {
    if (!sectionTitle.trim()) {
      Alert.alert(L('common.error'), L('content.pleaseEnterASubsectionName'));
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
      Alert.alert(L('common.success'), L('content.subsectionUpdated'));
    } catch (error) {
      logger.error('소제목 수정 오류:', error);
      Alert.alert(L('common.error'), L('content.anErrorOccurredWhileUpdating'));
    }
  };

  // 소제목 삭제
  const handleDeleteSection = async (materialId: string, sectionId: string) => {
    const section = sections[materialId]?.find((s) => s.id === sectionId);
    if (section?.isFromTemplate) {
      Alert.alert(L('common.error'), L('content.subsectionsSetByAnAdministrator'));
      return;
    }

    Alert.alert(L('common.confirmDelete'), L('content.areYouSureYouWant3'), [
      { text: L('common.cancel'), style: 'cancel' },
      {
        text: L('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSection(materialId, sectionId);
            setSections((prev) => ({
              ...prev,
              [materialId]: prev[materialId]?.filter((s) => s.id !== sectionId) || [],
            }));
            Alert.alert(L('common.success'), L('content.subsectionDeleted'));
          } catch (error) {
            logger.error('소제목 삭제 오류:', error);
            Alert.alert(L('common.error'), L('content.anErrorOccurredWhileDeleting'));
          }
        },
      },
    ]);
  };

  // 유저 대주제 추가
  const handleAddUserMaterial = async () => {
    if (!newMaterialTitle.trim()) {
      Alert.alert(L('common.error'), L('content.pleaseEnterATopicName'));
      return;
    }

    if (!selectedMaterialCode) {
      Alert.alert(L('common.error'), L('content.selectACodeBeforeAdding'));
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
      Alert.alert(L('common.success'), L('content.topicAddedTo', { v0: selectedMaterialCode }));
    } catch (error) {
      logger.error('대주제 추가 오류:', error);
      Alert.alert(L('common.error'), L('content.anErrorOccurredWhileAdding2'));
    }
  };

  // 유저 대주제 삭제
  const handleDeleteUserMaterial = async (materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    if (!material) return;

    if (material.templateId) {
      Alert.alert(L('common.error'), L('content.templateBasedTopicsCannotBe'));
      return;
    }

    Alert.alert(L('common.confirmDelete'), L('content.deleteThisAllSubsectionsWill'), [
      { text: L('common.cancel'), style: 'cancel' },
      {
        text: L('common.delete'),
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
            Alert.alert(L('common.success'), L('content.topicDeleted'));
          } catch (error) {
            logger.error('대주제 삭제 오류:', error);
            Alert.alert(L('common.error'), L('content.anErrorOccurredWhileDeleting2'));
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
          <Text style={styles.placeholderTitle}>{L('common.loginRequired')}</Text>
          <Text style={styles.placeholderText}>{L('common.pleaseLogInToUse')}</Text>
        </View>
      </View>
    );
  }

  if (!userData.jobExperiences || userData.jobExperiences.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <Ionicons name="warning-outline" size={64} color="#f59e0b" />
          <Text style={styles.placeholderTitle}>{L('content.jobExperienceRequired')}</Text>
          <Text style={styles.placeholderText}>
            {L('content.aJobExperienceMustBe')}
          </Text>
          <Text style={[styles.placeholderText, { marginTop: 4 }]}>
            {L('content.pleaseContactAnAdministrator')}
          </Text>
        </View>
      </View>
    );
  }

  if (!lessonJobCodeId) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContainer}>
          <Ionicons name="settings-outline" size={64} color="#3b82f6" />
          <Text style={styles.placeholderTitle}>{L('common.pleaseSelectACamp')}</Text>
          <Text style={styles.placeholderText}>
            {L('common.selectACampToActivate')}
          </Text>
          <Text style={styles.placeholderText}>
            {L('content.toViewThatCampS')}
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
            {L('content.loadingLessonMaterials')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
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

        {/* 유저 대주제 추가 */}
        {selectedMaterialCode && selectedMaterialCode !== '개인 자료' && (
          <>
            {showAddMaterialForm ? (
              <View style={styles.addMaterialForm}>
                <Text style={styles.addMaterialFormTitle}>
                  {selectedMaterialCode}{L('content.addANewTopic2')}
                </Text>
                <Text style={styles.addMaterialFormSubtitle}>
                  {selectedMaterialCode} {L('content.addANewTopicTo')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={L('content.topicNameEGPersonal')}
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
                    <Text style={styles.cancelButtonText}>{L('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleAddUserMaterial}
                  >
                    <Text style={styles.saveButtonText}>{L('task.add2')}</Text>
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
                  {selectedMaterialCode}{L('content.addANewTopic')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* 대주제 목록 */}
        {sortedFilteredMaterials.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{L('content.noLessonMaterialsYet')}</Text>
            <Text style={styles.emptyText}>
              {L('content.theyAppearAutomaticallyWhenAn')}
            </Text>
          </View>
        ) : (
          <View style={styles.materialsContainer}>
            {sortedFilteredMaterials.map((material) => {
              const sectionCount = sections[material.id]?.length || 0;
              const tpl = material.templateId
                ? templates.find((t) => t.id === material.templateId)
                : undefined;

              return (
                <View key={material.id} style={styles.materialCard}>
                  {/* 대주제 헤더 */}
                  <View style={styles.materialHeader}>
                    <View style={styles.materialHeaderLeft}>
                      <View style={styles.materialIcon}>
                        <Ionicons name="document-text-outline" size={20} color="#3b82f6" />
                      </View>
                      <View style={styles.materialInfo}>
                        <Text style={styles.materialTitle}>{material.title}</Text>
                        <Text style={styles.materialSubtitle}>{sectionCount}{L('content.subsections')}</Text>
                      </View>
                    </View>
                    <View style={styles.materialHeaderRight}>
                      {tpl && tpl.links && tpl.links.length > 0 && (
                        <View style={styles.templateLinksContainer}>
                          {tpl.links.slice(0, 2).map((l, idx) =>
                            l.label && l.url ? (
                              <TouchableOpacity
                                key={idx}
                                style={styles.templateLinkBadge}
                                onPress={() => Linking.openURL(l.url)}
                              >
                                <Text style={styles.templateLinkBadgeText}>{l.label}</Text>
                              </TouchableOpacity>
                            ) : null
                          )}
                        </View>
                      )}
                      {!material.templateId && (
                        <TouchableOpacity
                          style={styles.deleteIconButton}
                          onPress={() => handleDeleteUserMaterial(material.id)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#d1d5db" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* 소제목 목록 - 항상 표시 */}
                  <View style={styles.sectionsContainer}>
                      {sections[material.id]?.length === 0 ? (
                        <View style={styles.emptySections}>
                          <Ionicons name="albums-outline" size={32} color="#cbd5e1" />
                          <Text style={styles.emptySectionsText}>{L('content.noSubsections')}</Text>
                          <Text style={[styles.emptySectionsText, { fontSize: 12 }]}>
                            {L('content.tapTheButtonBelowTo')}
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
                                  placeholder={L('content.subsectionName')}
                                  value={sectionTitle}
                                  onChangeText={setSectionTitle}
                                  editable={!section.isFromTemplate}
                                />
                                {section.isFromTemplate && (
                                  <Text style={styles.helperText}>
                                    {L('content.titlesSetByAnAdministrator')}
                                  </Text>
                                )}
                                <TextInput
                                  style={styles.input}
                                  placeholder={L('content.publicViewLink')}
                                  value={sectionViewUrl}
                                  onChangeText={setSectionViewUrl}
                                  autoCapitalize="none"
                                />
                                <Text style={[styles.helperText, { color: '#dc2626', fontWeight: '600', marginBottom: 8 }]}>
                                  {L('content.requiredInCanvaClickShare')}
                                </Text>
                                <TextInput
                                  style={styles.input}
                                  placeholder={L('content.originalLink')}
                                  value={sectionOriginalUrl}
                                  onChangeText={setSectionOriginalUrl}
                                  autoCapitalize="none"
                                />
                                <Text style={[styles.helperText, { color: '#dc2626', fontWeight: '600', marginBottom: 8 }]}>
                                  {L('content.requiredInCanvaSetAccess')}
                                </Text>
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
                                    <Text style={styles.cancelButtonText}>{L('common.cancel')}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.saveButton}
                                    onPress={() => handleEditSection(material.id, section.id)}
                                  >
                                    <Text style={styles.saveButtonText}>{L('content.done')}</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <>
                                {/* 소제목 컴팩트 레이아웃 */}
                                <View style={styles.sectionContent}>
                                  {/* 왼쪽: 제목, 관리자 링크 */}
                                  <View style={styles.sectionLeft}>
                                    <View style={styles.sectionTitleRow}>
                                      {section.isFromTemplate && (
                                        <Text style={{ fontSize: 12, marginRight: 4 }}>📌</Text>
                                      )}
                                      <Text style={[styles.sectionTitle, section.isFromTemplate && styles.sectionTitleTemplate]}>
                                        {section.title}
                                      </Text>
                                    </View>
                                    {/* 관리자 링크들 */}
                                    {section.links && section.links.length > 0 && (
                                      <View style={styles.adminLinksContainer}>
                                        {section.links.map((link, idx) => (
                                          <TouchableOpacity
                                            key={idx}
                                            style={styles.adminLinkChip}
                                            onPress={() => Linking.openURL(link.url)}
                                          >
                                            <Ionicons name="open-outline" size={10} color="#374151" />
                                            <Text style={styles.adminLinkChipText}>{link.label}</Text>
                                          </TouchableOpacity>
                                        ))}
                                      </View>
                                    )}
                                  </View>

                                  {/* 오른쪽: 액션 버튼들 */}
                                  <View style={styles.sectionActions}>
                                    {/* 공개보기/원본 버튼 */}
                                    <TouchableOpacity
                                      style={[
                                        styles.actionLinkButton,
                                        styles.actionLinkButtonView,
                                        !section.viewUrl && styles.actionLinkButtonDisabled,
                                      ]}
                                      onPress={() => section.viewUrl && Linking.openURL(section.viewUrl)}
                                      disabled={!section.viewUrl}
                                    >
                                      <Ionicons
                                        name="eye-outline"
                                        size={12}
                                        color={section.viewUrl ? '#ffffff' : '#9ca3af'}
                                      />
                                      <Text
                                        style={[
                                          styles.actionLinkButtonText,
                                          !section.viewUrl && styles.actionLinkButtonTextDisabled,
                                        ]}
                                      >
                                        {L('content.public')}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        styles.actionLinkButton,
                                        styles.actionLinkButtonOriginal,
                                        !section.originalUrl && styles.actionLinkButtonDisabled,
                                      ]}
                                      onPress={() =>
                                        section.originalUrl && Linking.openURL(section.originalUrl)
                                      }
                                      disabled={!section.originalUrl}
                                    >
                                      <Text
                                        style={[
                                          styles.actionLinkButtonText,
                                          !section.originalUrl && styles.actionLinkButtonTextDisabled,
                                        ]}
                                      >
                                        {L('content.original')}
                                      </Text>
                                    </TouchableOpacity>
                                    {/* 수정/삭제 버튼 */}
                                    <TouchableOpacity
                                      style={styles.editButton}
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
                                      <Ionicons name="pencil-outline" size={12} color="#9ca3af" />
                                    </TouchableOpacity>
                                    {!section.isFromTemplate && (
                                      <TouchableOpacity
                                        style={styles.editButton}
                                        onPress={() =>
                                          handleDeleteSection(material.id, section.id)
                                        }
                                      >
                                        <Ionicons name="trash-outline" size={12} color="#9ca3af" />
                                      </TouchableOpacity>
                                    )}
                                  </View>
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
                            placeholder={L('content.subsectionName')}
                            value={sectionTitle}
                            onChangeText={setSectionTitle}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder={L('content.publicViewLink')}
                            value={sectionViewUrl}
                            onChangeText={setSectionViewUrl}
                            autoCapitalize="none"
                          />
                          <Text style={[styles.helperText, { color: '#dc2626', fontWeight: '600', marginBottom: 8 }]}>
                            {L('content.requiredInCanvaClickShare')}
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder={L('content.originalLink')}
                            value={sectionOriginalUrl}
                            onChangeText={setSectionOriginalUrl}
                            autoCapitalize="none"
                          />
                          <Text style={[styles.helperText, { color: '#dc2626', fontWeight: '600', marginBottom: 8 }]}>
                            {L('content.requiredInCanvaSetAccess')}
                          </Text>
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
                              <Text style={styles.cancelButtonText}>{L('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.saveButton}
                              onPress={() => handleAddSection(material.id)}
                            >
                              <Text style={styles.saveButtonText}>{L('task.add2')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addSectionButton}
                          onPress={() => setAddingSectionFor(material.id)}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#9ca3af" />
                          <Text style={styles.addSectionButtonText}>{L('content.addSubsection')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                </View>
              );
            })}
          </View>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  materialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
  templateLinksContainer: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 8,
  },
  templateLinkBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  templateLinkBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  deleteIconButton: {
    padding: 4,
  },
  linkButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  sectionsContainer: {
    backgroundColor: '#ffffff',
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
  },
  sectionCardTemplate: {
    backgroundColor: 'transparent',
  },
  sectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  sectionTitleTemplate: {
    color: '#374151',
  },
  adminLinksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  adminLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  adminLinkChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  actionLinkButtonView: {
    backgroundColor: '#3b82f6',
  },
  actionLinkButtonOriginal: {
    backgroundColor: '#10b981',
  },
  actionLinkButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  actionLinkButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionLinkButtonTextDisabled: {
    color: '#9ca3af',
  },
  editButton: {
    padding: 2,
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
    gap: 4,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingVertical: 8,
    marginTop: 8,
  },
  addSectionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  addMaterialForm: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    margin: 16,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  addMaterialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
