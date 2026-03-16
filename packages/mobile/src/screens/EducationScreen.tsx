import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { generationResourcesService, ResourceLink, ResourceLinkRole } from '../services';
import { AddLinkModal } from '../components';

// 권한별 배경색 반환 함수
const getRoleBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor':
      return 'rgba(219, 234, 254, 0.5)'; // 멘토 - 연한 파랑 (Tailwind bg-blue-100/50)
    case 'foreign':
      return 'rgba(243, 232, 255, 0.5)'; // 원어민 - 연한 보라 (Tailwind bg-purple-100/50)
    default:
      return 'rgba(243, 244, 246, 0.5)'; // 공통 - 연한 회색 (Tailwind bg-gray-100/50)
  }
};

// 선택된 상태의 배경색 (관리자가 권한별 토글을 선택했을 때)
const getRoleActiveBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor':
      return 'rgb(59, 130, 246)'; // 멘토 - 파랑 (Tailwind bg-blue-500)
    case 'foreign':
      return 'rgb(168, 85, 247)'; // 원어민 - 보라 (Tailwind bg-purple-500)
    default:
      return 'rgb(59, 130, 246)'; // 공통 - 파랑 (기본 선택 색상)
  }
};

export function EducationScreen() {
  const { userData } = useAuth();
  const [educationLinks, setEducationLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState<Record<string, boolean>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editTargetRole, setEditTargetRole] = useState<ResourceLinkRole>('common');
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetLink, setActionSheetLink] = useState<{ link: ResourceLink; index: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  
  const webViewRefs = useRef<Record<string, WebView | null>>({});
  const lastTapTime = useRef<number>(0);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 사용자 role에 따라 교육 링크 필터링
  const filteredEducationLinks = educationLinks.filter(link => {
    if (isAdmin) return true;
    if (!link.targetRole || link.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
    return false;
  });

  const loadEducationLinks = useCallback(async () => {
    if (!activeJobCodeId) {
      console.log('⚠️ EducationScreen: activeJobCodeId 없음');
      setLoading(false);
      setEducationLinks([]);
      setSelectedLinkId(null);
      return;
    }

    try {
      console.log('📥 EducationScreen: 교육 링크 로드 시작 -', activeJobCodeId);
      setLoading(true);
      
      // 기존 데이터 초기화
      setEducationLinks([]);
      setSelectedLinkId(null);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources?.educationLinks) {
        console.log('✅ EducationScreen: 교육 링크 로드 성공 -', resources.educationLinks.length, '개');
        setEducationLinks(resources.educationLinks);
        
        // 필터링된 링크 중 첫 번째를 선택
        const filtered = resources.educationLinks.filter((link: ResourceLink) => {
          if (userData?.role === 'admin') return true;
          if (!link.targetRole || link.targetRole === 'common') return true;
          if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
          if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
          return false;
        });
        
        if (filtered.length > 0) {
          setSelectedLinkId(filtered[0].id);
        }
      } else {
        console.log('⚠️ EducationScreen: 해당 기수의 교육 링크 없음');
      }
    } catch (error) {
      console.error('❌ EducationScreen: 교육 링크 로드 실패:', error);
      Alert.alert('오류', '교육 링크를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId]);

  useEffect(() => {
    console.log('🔄 EducationScreen: activeJobCodeId 변경됨:', activeJobCodeId);
    if (activeJobCodeId) {
      loadEducationLinks();
    }
  }, [activeJobCodeId, loadEducationLinks]);

  const handleNavigationStateChange = (linkId: string) => (navState: WebViewNavigation) => {
    setCanGoBack((prev) => ({
      ...prev,
      [linkId]: navState.canGoBack,
    }));
  };

  const handleGoBack = () => {
    if (!selectedLinkId) return;
    const webView = webViewRefs.current[selectedLinkId];
    if (webView && canGoBack[selectedLinkId]) {
      webView.goBack();
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!activeJobCodeId) return;

    try {
      await generationResourcesService.deleteLink(activeJobCodeId, 'educationLinks', linkId);
      await loadEducationLinks();
      setShowActionSheet(false);
      Alert.alert('성공', '링크가 삭제되었습니다.');
    } catch (error) {
      console.error('링크 삭제 실패:', error);
      Alert.alert('오류', '링크 삭제에 실패했습니다.');
    }
  };

  const handleMoveLink = async (index: number, direction: 'left' | 'right') => {
    if (!activeJobCodeId) return;
    
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= educationLinks.length) return;

    try {
      const newLinks = [...educationLinks];
      const [removed] = newLinks.splice(index, 1);
      newLinks.splice(newIndex, 0, removed);

      await generationResourcesService.reorderLinks(activeJobCodeId, 'educationLinks', newLinks);
      setEducationLinks(newLinks);
    } catch (error) {
      console.error('순서 변경 실패:', error);
      Alert.alert('오류', '순서 변경에 실패했습니다.');
    }
  };

  const handleEditLink = async () => {
    if (!activeJobCodeId || !editingLink || !editTitle.trim() || !editUrl.trim()) {
      Alert.alert('오류', '제목과 URL을 모두 입력해주세요.');
      return;
    }

    try {
      const updatedLinks = educationLinks.map(link =>
        link.id === editingLink.id
          ? { ...link, title: editTitle.trim(), url: editUrl.trim(), targetRole: editTargetRole }
          : link
      );

      await generationResourcesService.reorderLinks(activeJobCodeId, 'educationLinks', updatedLinks);
      setEducationLinks(updatedLinks);
      setShowEditModal(false);
      setShowActionSheet(false);
      Alert.alert('성공', '링크가 수정되었습니다.');
    } catch (error) {
      console.error('링크 수정 실패:', error);
      Alert.alert('오류', '링크 수정에 실패했습니다.');
    }
  };

  const openActionSheet = (link: ResourceLink, index: number) => {
    if (!isAdmin) return;
    setActionSheetLink({ link, index });
    setShowActionSheet(true);
  };

  const openEditModalDirectly = (link: ResourceLink) => {
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditTargetRole(link.targetRole || 'common');
    setShowEditModal(true);
  };

  if (!activeJobCodeId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.loginRequiredTitle}>로그인 필요</Text>
        <Text style={styles.emptyText}>로그인 후 이용 가능합니다.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>교육 자료 로딩 중...</Text>
      </View>
    );
  }

  if (filteredEducationLinks.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>등록된 교육 링크가 없습니다.</Text>
        {isAdmin && (
          <>
            <TouchableOpacity
              style={styles.addButtonLarge}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.addButtonLargeText}>+ 첫 링크 추가하기</Text>
            </TouchableOpacity>
            
            <AddLinkModal
              visible={showAddModal}
              onClose={() => setShowAddModal(false)}
              jobCodeId={activeJobCodeId}
              linkType="educationLinks"
              userId={userData?.userId || ''}
              onSuccess={loadEducationLinks}
            />
          </>
        )}
      </View>
    );
  }

  const selectedLink = educationLinks.find(link => link.id === selectedLinkId);

  return (
    <View style={styles.container}>
      {/* 링크 선택 토글 */}
      <View style={[styles.toggleContainer, editMode && styles.toggleContainerEdit]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.toggleContent, editMode && styles.toggleContentEdit]}
        >
          {isAdmin && (
            <>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddModal(true)}
              >
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.editButton, editMode && styles.editButtonActive]}
                onPress={() => setEditMode(!editMode)}
              >
                <Text style={styles.editButtonText}>✏️</Text>
              </TouchableOpacity>
            </>
          )}
          
          {filteredEducationLinks.map((link, index) => {
            const actualIndex = educationLinks.findIndex(l => l.id === link.id);
            return (
            <View key={link.id} style={styles.linkWrapper}>
              {editMode && (
                <View style={styles.editActionsContainer}>
                  {/* 위쪽 버튼들: 수정, 삭제 */}
                  <View style={styles.editActionsTop}>
                    <TouchableOpacity
                      style={styles.editActionButton}
                      onPress={() => openEditModalDirectly(link)}
                    >
                      <Text style={styles.editActionIcon}>✏️</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.deleteActionButton}
                      onPress={() => {
                        Alert.alert(
                          '삭제 확인',
                          `"${link.title}" 링크를 삭제하시겠습니까?`,
                          [
                            { text: '취소', style: 'cancel' },
                            {
                              text: '삭제',
                              style: 'destructive',
                              onPress: () => handleDeleteLink(link.id),
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.deleteActionIcon}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  editMode && styles.toggleButtonEdit,
                  // 선택되지 않았을 때: 관리자는 권한별 배경색, 일반 유저는 기본 회색
                  selectedLinkId !== link.id && !editMode && { 
                    backgroundColor: isAdmin ? getRoleBgColor(link.targetRole) : '#f3f4f6'
                  },
                  // 선택된 상태: 권한별 활성 색상 적용
                  selectedLinkId === link.id && !editMode && { 
                    backgroundColor: isAdmin ? getRoleActiveBgColor(link.targetRole) : '#3b82f6'
                  },
                ]}
                onPress={() => {
                  if (!editMode) {
                    setSelectedLinkId(link.id);
                  }
                }}
                onLongPress={() => {
                  if (!editMode) {
                    openActionSheet(link, actualIndex);
                  }
                }}
                delayLongPress={500}
                disabled={editMode}
              >
                <Text
                  style={[
                    styles.toggleText,
                    selectedLinkId === link.id && !editMode && styles.toggleTextActive,
                  ]}
                >
                  {link.title}
                </Text>
              </TouchableOpacity>
              
              {editMode && (
                <View style={styles.editActionsBottom}>
                  {/* 아래쪽 버튼들: 화살표 */}
                  {actualIndex > 0 && (
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={() => handleMoveLink(actualIndex, 'left')}
                    >
                      <Text style={styles.moveButtonText}>←</Text>
                    </TouchableOpacity>
                  )}
                  
                  {actualIndex < educationLinks.length - 1 && (
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={() => handleMoveLink(actualIndex, 'right')}
                    >
                      <Text style={styles.moveButtonText}>→</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
          })}
        </ScrollView>
      </View>

      {/* 뒤로가기 버튼 */}
      {selectedLinkId && canGoBack[selectedLinkId] && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Text style={styles.backButtonText}>← 뒤로</Text>
        </TouchableOpacity>
      )}

      {/* 모든 노션 페이지 웹뷰 프리로드 */}
      <View style={styles.webviewContainer}>
        {filteredEducationLinks.map((link) => (
          <View
            key={link.id}
            style={[
              styles.webviewWrapper,
              selectedLinkId !== link.id && styles.hidden,
            ]}
          >
            <WebView
              ref={(ref) => { webViewRefs.current[link.id] = ref; }}
              source={{ uri: link.url }}
              style={styles.webview}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>로딩 중...</Text>
                </View>
              )}
              onNavigationStateChange={handleNavigationStateChange(link.id)}
              cacheEnabled={true}
              cacheMode="LOAD_CACHE_ELSE_NETWORK"
              incognito={false}
              androidLayerType="hardware"
            />
          </View>
        ))}
      </View>

      {/* 링크 추가 모달 */}
      {isAdmin && activeJobCodeId && (
        <AddLinkModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          jobCodeId={activeJobCodeId}
          linkType="educationLinks"
          userId={userData?.userId || ''}
          onSuccess={loadEducationLinks}
        />
      )}

      {/* 액션 시트 (바텀 시트) */}
      {actionSheetLink && (
        <Modal
          visible={showActionSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowActionSheet(false)}
        >
          <TouchableOpacity 
            style={styles.actionSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowActionSheet(false)}
          >
            <View style={styles.actionSheetContainer}>
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle}>{actionSheetLink.link.title}</Text>
                <TouchableOpacity onPress={() => setShowActionSheet(false)}>
                  <Text style={styles.actionSheetClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.actionSheetButton}
                onPress={() => {
                  if (actionSheetLink) {
                    openEditModalDirectly(actionSheetLink.link);
                    setShowActionSheet(false);
                  }
                }}
              >
                <Text style={styles.actionSheetIcon}>✏️</Text>
                <Text style={styles.actionSheetButtonText}>링크 수정</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionSheetButton, styles.actionSheetButtonDanger]}
                onPress={() => {
                  Alert.alert(
                    '삭제 확인',
                    `"${actionSheetLink.link.title}" 링크를 삭제하시겠습니까?`,
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '삭제',
                        style: 'destructive',
                        onPress: () => handleDeleteLink(actionSheetLink.link.id),
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.actionSheetIcon}>🗑️</Text>
                <Text style={[styles.actionSheetButtonText, styles.actionSheetButtonTextDanger]}>링크 삭제</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 링크 수정 모달 */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContainer}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>링크 수정</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.editModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editModalContent}>
              <Text style={styles.editModalLabel}>제목</Text>
              <TextInput
                style={styles.editModalInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="예: 교육일정"
              />

              <Text style={styles.editModalLabel}>URL</Text>
              <TextInput
                style={styles.editModalInput}
                value={editUrl}
                onChangeText={setEditUrl}
                placeholder="https://..."
                autoCapitalize="none"
              />

              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={[styles.editModalButton, styles.editModalButtonCancel]}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.editModalButtonTextCancel}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editModalButton, styles.editModalButtonSave]}
                  onPress={handleEditLink}
                >
                  <Text style={styles.editModalButtonTextSave}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  loginRequiredTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  addButtonLarge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addButtonLargeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 42,
  },
  toggleContainerEdit: {
    backgroundColor: '#fef3c7',
    borderBottomColor: '#f59e0b',
    borderBottomWidth: 2,
    maxHeight: 'none' as any,
  },
  toggleContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleContentEdit: {
    paddingTop: 32,
    paddingBottom: 26,
    alignItems: 'center',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  addButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  editButtonActive: {
    backgroundColor: '#f59e0b',
  },
  editButtonText: {
    fontSize: 14,
  },
  linkWrapper: {
    position: 'relative',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  toggleButtonActive: {
    backgroundColor: '#3b82f6',
  },
  toggleButtonEdit: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  editActionsContainer: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  editActionsTop: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  editActionsBottom: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
    zIndex: 10,
  },
  moveButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 18,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  moveButtonText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '700',
  },
  editActionButton: {
    backgroundColor: '#10b981',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  deleteActionButton: {
    backgroundColor: '#ef4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  editActionIcon: {
    fontSize: 10,
  },
  deleteActionIcon: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: 12,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  actionSheetClose: {
    fontSize: 24,
    color: '#9ca3af',
    fontWeight: '300',
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  actionSheetButtonDanger: {
    backgroundColor: '#fef2f2',
  },
  actionSheetIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  actionSheetButtonText: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '500',
  },
  actionSheetButtonTextDanger: {
    color: '#dc2626',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  editModalClose: {
    fontSize: 24,
    color: '#9ca3af',
    fontWeight: '300',
  },
  editModalContent: {
    padding: 20,
  },
  editModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  editModalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f2937',
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  editModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  editModalButtonCancel: {
    backgroundColor: '#f3f4f6',
  },
  editModalButtonSave: {
    backgroundColor: '#3b82f6',
  },
  editModalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  editModalButtonTextSave: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  webviewContainer: {
    flex: 1,
    position: 'relative',
  },
  webviewWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    opacity: 0,
    zIndex: -1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
});
