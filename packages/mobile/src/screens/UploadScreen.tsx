import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { AdminStackScreenProps } from '../navigation/types';
import {
  getLessonMaterialTemplates,
  addLessonMaterialTemplate,
  updateLessonMaterialTemplate,
  deleteLessonMaterialTemplate,
  LessonMaterialTemplate,
  LessonMaterialTemplateSection,
} from '../services/lessonMaterialService';
import jobCodesService, { JobCode } from '../services/jobCodesService';

export function UploadScreen({ navigation }: AdminStackScreenProps<'Upload'>) {
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LessonMaterialTemplate | null>(null);
  
  // 폼 상태
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<LessonMaterialTemplateSection[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState('');
  const [selectedCodeFilter, setSelectedCodeFilter] = useState('');
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  
  // 소제목 추가 상태
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionLinks, setNewSectionLinks] = useState<{ label: string; url: string }[]>([]);
  
  // Job 코드
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [jobCodesLoading, setJobCodesLoading] = useState(false);
  
  // 템플릿 복사 상태
  const [referenceTemplateId, setReferenceTemplateId] = useState<string>('');
  
  // 소제목 섹션 토글
  const [sectionEditorOpen, setSectionEditorOpen] = useState(true);
  
  // DropDownPicker 상태
  const [templateCopyOpen, setTemplateCopyOpen] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchJobCodes();
  }, []);

  // 기수 선택 시 첫 번째 코드 자동 선택
  useEffect(() => {
    if (selectedGeneration && jobCodes.length > 0) {
      const codesForGen = Array.from(
        new Set(jobCodes.filter(jc => jc.generation === selectedGeneration).map(jc => jc.code))
      );
      if (codesForGen.length > 0 && !selectedCodeFilter) {
        setSelectedCodeFilter(codesForGen[0]);
      }
    }
  }, [selectedGeneration, jobCodes, selectedCodeFilter]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await getLessonMaterialTemplates();
      setTemplates(data);
    } catch (error) {
      Alert.alert('오류', '템플릿을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobCodes = async () => {
    setJobCodesLoading(true);
    try {
      const codes = await jobCodesService.getAllJobCodes();
      setJobCodes(codes);
      
      // 첫 로드 시 기본 기수 선택
      if (codes.length > 0 && !selectedGeneration) {
        const generations = Array.from(new Set(codes.map(jc => jc.generation)))
          .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return numB - numA; // 내림차순
          });
        
        if (generations.length > 0) {
          setSelectedGeneration(generations[0]);
        }
      }
    } catch (error) {
      Alert.alert('오류', '직무 코드를 불러오지 못했습니다.');
    } finally {
      setJobCodesLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('입력 오류', '템플릿 이름을 입력해주세요.');
      return;
    }
    if (!selectedCode) {
      Alert.alert('입력 오류', '코드를 선택해주세요.');
      return;
    }

    // 동일 제목 체크
    const duplicateTitle = templates.find(
      t => t.title.trim() === title.trim() && t.code === selectedCode && t.id !== editing?.id
    );
    if (duplicateTitle) {
      Alert.alert('중복 오류', `"${title}" 템플릿이 이미 ${selectedCode}에 존재합니다.\n다른 이름을 사용해주세요.`);
      return;
    }

    // 링크 validation
    const invalidLinks = links.filter(l => (l.label && !l.url) || (!l.label && l.url));
    if (invalidLinks.length > 0) {
      Alert.alert('입력 오류', '링크 제목과 URL을 모두 입력하거나, 둘 다 비워주세요.');
      return;
    }

    try {
      if (editing) {
        await updateLessonMaterialTemplate(editing.id, { title, sections, code: selectedCode, links });
        Alert.alert('성공', '템플릿이 수정되었습니다.');
        setEditing(null);
      } else {
        await addLessonMaterialTemplate(title, sections, selectedCode, links);
        Alert.alert('성공', '템플릿이 추가되었습니다.');
        setShowForm(false);
      }
      
      resetForm();
      fetchTemplates();
    } catch (error) {
      Alert.alert('오류', '템플릿 저장에 실패했습니다.');
    }
  };

  const handleDelete = (id: string, templateTitle: string) => {
    Alert.alert(
      '삭제 확인',
      `"${templateTitle}" 템플릿을 삭제하시겠습니까?\n\n⚠️ 사용자가 입력한 URL은 유지되지만, 이 템플릿은 더 이상 표시되지 않습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLessonMaterialTemplate(id);
              Alert.alert('성공', '템플릿이 삭제되었습니다.');
              fetchTemplates();
            } catch (error) {
              Alert.alert('오류', '템플릿 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (template: LessonMaterialTemplate) => {
    setEditing(template);
    setTitle(template.title);
    setSections(template.sections || []);
    setSelectedCode(template.code || '');
    setLinks(template.links || []);
    setShowForm(true);
  };

  const resetForm = () => {
    setTitle('');
    setSections([]);
    setSelectedCode('');
    setLinks([]);
    setNewSectionTitle('');
    setNewSectionLinks([]);
    setReferenceTemplateId('');
  };

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) {
      Alert.alert('입력 오류', '소제목을 입력해주세요.');
      return;
    }

    const newSection: LessonMaterialTemplateSection = {
      id: `temp-${Date.now()}`,
      title: newSectionTitle.trim(),
      order: sections.length,
      links: newSectionLinks.filter(l => l.label && l.url),
    };

    setSections([...sections, newSection]);
    setNewSectionTitle('');
    setNewSectionLinks([]);
    Alert.alert('성공', '소제목이 추가되었습니다.');
  };

  const handleRemoveSection = (id: string) => {
    Alert.alert('삭제 확인', '이 소제목을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          const newSections = sections
            .filter(s => s.id !== id)
            .map((s, idx) => ({ ...s, order: idx }));
          setSections(newSections);
        },
      },
    ]);
  };

  // 기수별 필터
  const availableGenerations = Array.from(new Set(jobCodes.map(jc => jc.generation)))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numB - numA; // 내림차순
    });

  // 선택된 기수에 해당하는 코드 목록 (커스텀 정렬)
  const codesForSelectedGeneration = selectedGeneration
    ? Array.from(new Set(jobCodes.filter(jc => jc.generation === selectedGeneration).map(jc => jc.code)))
        .sort((a, b) => {
          const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
          
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
        })
    : [];

  // 필터링된 템플릿 목록
  const filteredTemplates = templates.filter(t => {
    const templateCode = t.code || '미지정';
    
    if (selectedGeneration) {
      const jobCode = jobCodes.find(jc => jc.code === templateCode);
      if (!jobCode || jobCode.generation !== selectedGeneration) {
        return false;
      }
    }
    
    if (selectedCodeFilter && templateCode !== selectedCodeFilter) {
      return false;
    }
    
    return true;
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>템플릿을 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>수업 템플릿 관리</Text>
            <Text style={styles.headerSubtitle}>캠프별 수업자료 업로드 템플릿 제작 페이지</Text>
          </View>
        </View>

        {/* 필터 영역 */}
        <View style={styles.filterContainer}>
          {/* 기수 필터 */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>기수</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterButtonsRow}>
                {availableGenerations.map(gen => (
                  <TouchableOpacity
                    key={gen}
                    style={[
                      styles.filterButton,
                      selectedGeneration === gen && styles.filterButtonActive,
                    ]}
                    onPress={() => setSelectedGeneration(gen)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        selectedGeneration === gen && styles.filterButtonTextActive,
                      ]}
                    >
                      {gen}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* 코드 필터 */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>캠프 코드</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterButtonsRow}>
                {codesForSelectedGeneration.map(code => {
                  const templateCount = templates.filter(t => {
                    const templateCode = t.code || '미지정';
                    if (selectedGeneration) {
                      const jc = jobCodes.find(j => j.code === templateCode);
                      return templateCode === code && jc?.generation === selectedGeneration;
                    }
                    return templateCode === code;
                  }).length;

                  return (
                    <TouchableOpacity
                      key={code}
                      style={[
                        styles.filterButton,
                        selectedCodeFilter === code && styles.filterButtonActive,
                      ]}
                      onPress={() => setSelectedCodeFilter(code)}
                    >
                      <Text
                        style={[
                          styles.filterButtonText,
                          selectedCodeFilter === code && styles.filterButtonTextActive,
                        ]}
                      >
                        {code}
                        {templateCount > 0 && ` (${templateCount})`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* 템플릿 추가 버튼 */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setShowForm(true);
              setEditing(null);
              resetForm();
              setSelectedCode(selectedCodeFilter);
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>템플릿 추가</Text>
          </TouchableOpacity>
        </View>

        {/* 템플릿 폼 */}
        {showForm && (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {referenceTemplateId ? '📋 템플릿 복사' : editing ? '✏️ 템플릿 수정' : '➕ 새 템플릿 추가'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowForm(false);
                  setEditing(null);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formBody}>
              {/* 템플릿 복사 드롭다운 (추가 모드에서만 표시) */}
              {!editing && !referenceTemplateId && templates.length > 0 && (
                <View style={[styles.inputGroup, { zIndex: 9000 }]}>
                  <Text style={styles.copyLabel}>💡 기존 템플릿 복사하기 (선택)</Text>
                  <DropDownPicker
                    open={templateCopyOpen}
                    value={null}
                    items={templates
                      .sort((a, b) => {
                        // 코드에서 숫자 추출하여 내림차순 정렬 (높은 기수가 위로)
                        const getNumber = (code: string | undefined) => {
                          if (!code) return 0;
                          const match = code.match(/\d+/);
                          return match ? parseInt(match[0], 10) : 0;
                        };
                        
                        const numA = getNumber(a.code);
                        const numB = getNumber(b.code);
                        
                        // 숫자가 다르면 내림차순 (높은 숫자가 위로)
                        if (numA !== numB) {
                          return numB - numA;
                        }
                        
                        // 숫자가 같으면 코드명으로 알파벳 순
                        return (a.code || '').localeCompare(b.code || '');
                      })
                      .map(tpl => ({
                        label: `[${tpl.code || '미지정'}] ${tpl.title}`,
                        value: tpl.id,
                      }))}
                    setOpen={setTemplateCopyOpen}
                    setValue={(callback) => {
                      const selectedId = typeof callback === 'function' ? callback(null) : callback;
                      if (selectedId) {
                        const refTemplate = templates.find(t => t.id === selectedId);
                        if (refTemplate) {
                          setTitle(refTemplate.title);
                          setSections(refTemplate.sections || []);
                          setLinks(refTemplate.links || []);
                          setSelectedCode(selectedCodeFilter);
                          setReferenceTemplateId(selectedId);
                          setTemplateCopyOpen(false);
                        }
                      }
                    }}
                    placeholder="💡 기존 템플릿 복사하기 (선택)"
                    style={styles.dropdown}
                    dropDownContainerStyle={styles.dropdownContainer}
                    textStyle={styles.dropdownText}
                    labelStyle={styles.dropdownLabel}
                    placeholderStyle={styles.dropdownPlaceholder}
                    listMode="SCROLLVIEW"
                    scrollViewProps={{
                      nestedScrollEnabled: true,
                    }}
                    searchable={true}
                    searchPlaceholder="템플릿 검색..."
                    zIndex={9000}
                    zIndexInverse={1000}
                  />
                </View>
              )}

              {/* 템플릿명 */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>템플릿명</Text>
                <TextInput
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="예: 드림멘토링"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              {/* 코드 선택 */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>코드</Text>
                {jobCodesLoading ? (
                  <Text style={styles.loadingCodeText}>로딩 중...</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.codeSelectRow}>
                      {codesForSelectedGeneration.map(code => {
                        const jobCode = jobCodes.find(jc => jc.code === code);
                        return (
                          <TouchableOpacity
                            key={code}
                            style={[
                              styles.codeSelectButton,
                              selectedCode === code && styles.codeSelectButtonActive,
                              editing && styles.codeSelectButtonDisabled,
                            ]}
                            onPress={() => !editing && setSelectedCode(code)}
                            disabled={!!editing}
                          >
                            <Text
                              style={[
                                styles.codeSelectButtonText,
                                selectedCode === code && styles.codeSelectButtonTextActive,
                              ]}
                            >
                              {code} - {jobCode?.name || ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* 대주제 링크 */}
              <View style={styles.inputGroup}>
                <View style={styles.linkHeader}>
                  <Text style={styles.inputLabel}>대주제 링크</Text>
                  {links.length === 0 && (
                    <TouchableOpacity onPress={() => setLinks([{ label: '', url: '' }])}>
                      <Text style={styles.addLinkText}>+ 추가</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {links.length > 0 && (
                  <View style={styles.linksList}>
                    {links.map((link, idx) => (
                      <View key={idx} style={styles.linkItem}>
                        <View style={styles.linkInputs}>
                          <TextInput
                            style={styles.linkTitleInput}
                            placeholder="제목"
                            placeholderTextColor="#9ca3af"
                            value={link.label}
                            onChangeText={text =>
                              setLinks(links.map((item, i) => (i === idx ? { ...item, label: text } : item)))
                            }
                          />
                          <TextInput
                            style={styles.linkUrlInput}
                            placeholder="URL"
                            placeholderTextColor="#9ca3af"
                            value={link.url}
                            onChangeText={text =>
                              setLinks(links.map((item, i) => (i === idx ? { ...item, url: text } : item)))
                            }
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => setLinks(links.filter((_, i) => i !== idx))}
                          style={styles.removeLinkButton}
                        >
                          <Ionicons name="close" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => setLinks([...links, { label: '', url: '' }])}>
                      <Text style={styles.addLinkText}>+ 링크 추가</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 소제목 에디터 - 토글 가능 */}
              <View style={styles.inputGroup}>
                <TouchableOpacity
                  style={styles.sectionToggleHeader}
                  onPress={() => setSectionEditorOpen(!sectionEditorOpen)}
                >
                  <Ionicons
                    name={sectionEditorOpen ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color="#6b7280"
                  />
                  <Text style={styles.inputLabel}>소제목 구성 ({sections.length}개)</Text>
                </TouchableOpacity>

                {sectionEditorOpen && (
                  <View style={styles.sectionEditorContainer}>
                    {/* 소제목 목록 */}
                    {sections.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Ionicons name="document-outline" size={32} color="#d1d5db" />
                        <Text style={styles.emptyStateText}>소제목이 없습니다</Text>
                      </View>
                    ) : (
                      <View style={styles.sectionList}>
                        {sections.sort((a, b) => a.order - b.order).map((section, idx) => (
                          <View key={section.id} style={styles.sectionItem}>
                            <View style={styles.sectionHeader}>
                              <View style={styles.sectionNumber}>
                                <Text style={styles.sectionNumberText}>{idx + 1}</Text>
                              </View>
                              <Text style={styles.sectionTitle}>{section.title}</Text>
                              <TouchableOpacity
                                onPress={() => handleRemoveSection(section.id)}
                                style={styles.sectionDeleteButton}
                              >
                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                            {section.links && section.links.length > 0 && (
                              <View style={styles.sectionLinks}>
                                {section.links.map((link, linkIdx) => (
                                  <TouchableOpacity
                                    key={linkIdx}
                                    style={styles.linkBadge}
                                    onPress={() => Linking.openURL(link.url)}
                                  >
                                    <Ionicons name="link-outline" size={10} color="#10b981" />
                                    <Text style={styles.linkBadgeText}>{link.label}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 새 소제목 추가 폼 */}
                    <View style={styles.addSectionForm}>
                      <Text style={styles.addSectionTitle}>새 소제목 추가</Text>
                      <TextInput
                        style={styles.textInput}
                        value={newSectionTitle}
                        onChangeText={setNewSectionTitle}
                        placeholder="소제목 (예: 오리엔테이션)"
                        placeholderTextColor="#9ca3af"
                      />

                      {/* 소제목 링크 */}
                      <View style={styles.sectionLinksEditor}>
                        <View style={styles.linkHeader}>
                          <Text style={styles.sectionLinkLabel}>소제목 링크 (선택)</Text>
                          {newSectionLinks.length === 0 && (
                            <TouchableOpacity
                              onPress={() => setNewSectionLinks([{ label: '', url: '' }])}
                            >
                              <Text style={styles.addLinkText}>+ 추가</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {newSectionLinks.length > 0 && (
                          <View style={styles.linksList}>
                            {newSectionLinks.map((link, idx) => (
                              <View key={idx} style={styles.linkItem}>
                                <View style={styles.linkInputs}>
                                  <TextInput
                                    style={styles.linkTitleInput}
                                    placeholder="제목"
                                    placeholderTextColor="#9ca3af"
                                    value={link.label}
                                    onChangeText={text =>
                                      setNewSectionLinks(
                                        newSectionLinks.map((item, i) =>
                                          i === idx ? { ...item, label: text } : item
                                        )
                                      )
                                    }
                                  />
                                  <TextInput
                                    style={styles.linkUrlInput}
                                    placeholder="URL"
                                    placeholderTextColor="#9ca3af"
                                    value={link.url}
                                    onChangeText={text =>
                                      setNewSectionLinks(
                                        newSectionLinks.map((item, i) =>
                                          i === idx ? { ...item, url: text } : item
                                        )
                                      )
                                    }
                                  />
                                </View>
                                <TouchableOpacity
                                  onPress={() =>
                                    setNewSectionLinks(newSectionLinks.filter((_, i) => i !== idx))
                                  }
                                  style={styles.removeLinkButton}
                                >
                                  <Ionicons name="close" size={16} color="#ef4444" />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <TouchableOpacity
                              onPress={() =>
                                setNewSectionLinks([...newSectionLinks, { label: '', url: '' }])
                              }
                            >
                              <Text style={styles.addLinkText}>+ 링크 추가</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      <TouchableOpacity style={styles.addSectionButton} onPress={handleAddSection}>
                        <Ionicons name="add-circle-outline" size={20} color="#3b82f6" />
                        <Text style={styles.addSectionButtonText}>소제목 추가</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* 버튼 */}
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowForm(false);
                    setEditing(null);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveButtonText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* 템플릿 리스트 */}
        {filteredTemplates.length === 0 ? (
          <View style={styles.emptyTemplates}>
            <Ionicons name="folder-open-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyTemplatesText}>해당 코드에 등록된 템플릿이 없습니다</Text>
            <Text style={styles.emptyTemplatesSubtext}>새 템플릿을 추가해보세요</Text>
          </View>
        ) : (
          <View style={styles.templateList}>
            {filteredTemplates.map(template => (
              <View key={template.id} style={styles.templateCard}>
                <View style={styles.templateHeader}>
                  <View style={styles.templateInfo}>
                    <Text style={styles.templateTitle}>{template.title}</Text>
                    <View style={styles.templateMeta}>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{template.code || '미지정'}</Text>
                      </View>
                      <Text style={styles.templateMetaText}>
                        {template.sections?.length || 0}개 소제목
                      </Text>
                    </View>
                  </View>
                  <View style={styles.templateActions}>
                    <TouchableOpacity
                      onPress={() => handleEdit(template)}
                      style={styles.iconButton}
                    >
                      <Ionicons name="create-outline" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(template.id, template.title)}
                      style={styles.iconButton}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 소제목 표시 */}
                {template.sections && template.sections.length > 0 && (
                  <View style={styles.templateSections}>
                    {template.sections.sort((a, b) => a.order - b.order).map((section, idx) => (
                      <View key={section.id} style={styles.sectionReadOnly}>
                        <View style={styles.sectionNumberSmall}>
                          <Text style={styles.sectionNumberSmallText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.sectionTitleSmall}>{section.title}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  filterContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  filterButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  filterButtonTextActive: {
    color: '#1e40af',
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  formCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  formBody: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  templateCopyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  templateCopyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  templateCopyButtonText: {
    fontSize: 12,
    color: '#374151',
  },
  dropdown: {
    borderColor: '#d1d5db',
    borderRadius: 8,
    minHeight: 44,
  },
  dropdownContainer: {
    borderColor: '#d1d5db',
    borderRadius: 8,
  },
  dropdownText: {
    fontSize: 14,
    color: '#111827',
  },
  dropdownLabel: {
    fontSize: 14,
    color: '#111827',
  },
  dropdownPlaceholder: {
    fontSize: 14,
    color: '#9ca3af',
  },
  loadingCodeText: {
    fontSize: 14,
    color: '#9ca3af',
    paddingVertical: 8,
  },
  codeSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  codeSelectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  codeSelectButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  codeSelectButtonDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  codeSelectButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  codeSelectButtonTextActive: {
    color: '#1e40af',
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addLinkText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3b82f6',
  },
  linksList: {
    gap: 8,
  },
  linkItem: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  linkInputs: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  linkTitleInput: {
    width: 90,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#fff',
  },
  linkUrlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#fff',
  },
  removeLinkButton: {
    padding: 4,
  },
  sectionToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionEditorContainer: {
    marginTop: 12,
    paddingLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
  },
  sectionList: {
    gap: 8,
    marginBottom: 16,
  },
  sectionItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  sectionDeleteButton: {
    padding: 4,
  },
  sectionLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginLeft: 32,
  },
  linkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  linkBadgeText: {
    fontSize: 10,
    color: '#065f46',
  },
  addSectionForm: {
    padding: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  sectionLinksEditor: {
    marginTop: 12,
  },
  sectionLinkLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  addSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  addSectionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyTemplates: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTemplatesText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptyTemplatesSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
  },
  templateList: {
    padding: 16,
    gap: 12,
  },
  templateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  templateInfo: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  templateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#dbeafe',
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  templateMetaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  templateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  templateSections: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  sectionReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionNumberSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNumberSmallText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
  },
  sectionTitleSmall: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
});
