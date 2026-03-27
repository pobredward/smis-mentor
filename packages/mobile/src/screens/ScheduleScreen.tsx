import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWebViewCache } from '../context/WebViewCacheContext';
import { useAuth } from '../context/AuthContext';
import { AddLinkModal } from '../components';
import { generationResourcesService, ResourceLink, ResourceLinkRole } from '../services';

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

export function ScheduleScreen() {
  const { schedules, loadingStates, zoomLevels, setZoomLevel, applyZoom, renderWebView, refreshResources, loading } = useWebViewCache();
  const { userData } = useAuth();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | undefined>(undefined);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ResourceLink | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editTargetRole, setEditTargetRole] = useState<ResourceLinkRole>('common');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 사용자 role에 따라 시간표 링크 필터링
  const filteredSchedules = schedules.filter(link => {
    if (isAdmin) return true;
    if (!link.targetRole || link.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
    return false;
  });

  // 필터링된 시간표가 로드되면 첫 번째 항목을 자동 선택
  useEffect(() => {
    if (filteredSchedules.length > 0 && !selectedScheduleId) {
      setSelectedScheduleId(filteredSchedules[0].id);
    }
  }, [filteredSchedules, selectedScheduleId]);

  const selectedSchedule = filteredSchedules.find(s => s.id === selectedScheduleId) || filteredSchedules[0];
  
  // 구글 시트인지 확인하는 함수
  const isGoogleSheet = (url: string) => {
    return url.includes('docs.google.com/spreadsheets') || url.includes('sheets.google.com');
  };

  // 선택된 시간표가 구글 시트인지 확인
  const isSelectedScheduleGoogleSheet = selectedSchedule ? isGoogleSheet(selectedSchedule.url) : false;
  
  // 구글 시트가 아닌 경우 기본 줌을 1.0(100%)로 설정, 구글 시트는 플랫폼별로 설정
  const defaultZoom = isSelectedScheduleGoogleSheet 
    ? (Platform.OS === 'android' ? 1.0 : 0.6)
    : 1.0;
  const currentZoom = selectedScheduleId ? (zoomLevels[selectedScheduleId] || defaultZoom) : defaultZoom;
  const isLoading = selectedScheduleId ? (loadingStates[selectedScheduleId] ?? true) : true;

  // 시간표가 변경되었을 때 구글 시트가 아니면 줌을 100%로 자동 설정
  useEffect(() => {
    if (selectedScheduleId && selectedSchedule && !isSelectedScheduleGoogleSheet) {
      // 이미 설정된 줌 레벨이 없는 경우에만 1.0으로 설정
      if (zoomLevels[selectedScheduleId] === undefined) {
        setZoomLevel(selectedScheduleId, 1.0);
        applyZoom(selectedScheduleId, 1.0);
      }
    }
  }, [selectedScheduleId, selectedSchedule, isSelectedScheduleGoogleSheet]);

  const handleZoomIn = () => {
    if (!selectedScheduleId) return;
    const newZoom = Math.min(currentZoom + 0.2, 3.0);
    setZoomLevel(selectedScheduleId, newZoom);
    applyZoom(selectedScheduleId, newZoom);
  };

  const handleZoomOut = () => {
    if (!selectedScheduleId) return;
    const newZoom = Math.max(currentZoom - 0.2, 0.5);
    setZoomLevel(selectedScheduleId, newZoom);
    applyZoom(selectedScheduleId, newZoom);
  };

  const handleZoomReset = () => {
    if (!selectedScheduleId) return;
    setZoomLevel(selectedScheduleId, 1.0);
    applyZoom(selectedScheduleId, 1.0);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!activeJobCodeId) return;

    Alert.alert(
      '삭제 확인',
      '이 시간표를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await generationResourcesService.deleteLink(activeJobCodeId, 'scheduleLinks', scheduleId);
              await refreshResources();
              Alert.alert('성공', '시간표가 삭제되었습니다.');
              if (selectedScheduleId === scheduleId && schedules.length > 1) {
                setSelectedScheduleId(schedules[0].id);
              }
            } catch (error) {
              console.error('시간표 삭제 실패:', error);
              Alert.alert('오류', '시간표 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleMoveSchedule = async (index: number, direction: 'left' | 'right') => {
    if (!activeJobCodeId) return;
    
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= schedules.length) return;

    try {
      const newSchedules = [...schedules];
      const [removed] = newSchedules.splice(index, 1);
      newSchedules.splice(newIndex, 0, removed);

      await generationResourcesService.reorderLinks(activeJobCodeId, 'scheduleLinks', newSchedules);
      await refreshResources();
    } catch (error) {
      console.error('순서 변경 실패:', error);
      Alert.alert('오류', '순서 변경에 실패했습니다.');
    }
  };

  const openEditModalDirectly = (schedule: ResourceLink) => {
    setEditingSchedule(schedule);
    setEditTitle(schedule.title);
    setEditUrl(schedule.url);
    setEditTargetRole(schedule.targetRole || 'common');
    setShowEditModal(true);
  };

  const handleEditSchedule = async () => {
    if (!activeJobCodeId || !editingSchedule || !editTitle.trim() || !editUrl.trim()) {
      Alert.alert('오류', '제목과 URL을 모두 입력해주세요.');
      return;
    }

    try {
      const updatedSchedules = schedules.map(schedule =>
        schedule.id === editingSchedule.id
          ? { ...schedule, title: editTitle.trim(), url: editUrl.trim(), targetRole: editTargetRole }
          : schedule
      );

      await generationResourcesService.reorderLinks(activeJobCodeId, 'scheduleLinks', updatedSchedules);
      await refreshResources();
      setShowEditModal(false);
      Alert.alert('성공', '시간표가 수정되었습니다.');
    } catch (error) {
      console.error('시간표 수정 실패:', error);
      Alert.alert('오류', '시간표 수정에 실패했습니다.');
    }
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
        <Text style={styles.loadingText}>시간표 로딩 중...</Text>
      </View>
    );
  }

  if (filteredSchedules.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>등록된 시간표가 없습니다.</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButtonLarge}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonLargeText}>+ 첫 시간표 추가하기</Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <AddLinkModal
            visible={showAddModal}
            onClose={() => setShowAddModal(false)}
            jobCodeId={activeJobCodeId}
            linkType="scheduleLinks"
            userId={userData?.userId || ''}
            onSuccess={refreshResources}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 시간표 선택 버튼들 */}
      <View style={[styles.buttonContainer, editMode && styles.buttonContainerEdit]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.buttonContent, editMode && styles.buttonContentEdit]}
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

          {filteredSchedules.map((schedule, index) => {
            const actualIndex = schedules.findIndex(s => s.id === schedule.id);
            return (
            <View key={schedule.id} style={[styles.linkWrapper, { marginHorizontal: 3 }]}>
              {editMode && (
                <View style={styles.editActionsContainer}>
                  <View style={styles.editActionsTop}>
                    <TouchableOpacity
                      style={styles.editActionButton}
                      onPress={() => openEditModalDirectly(schedule)}
                    >
                      <Text style={styles.editActionIcon}>✏️</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.deleteActionButton}
                      onPress={() => handleDeleteSchedule(schedule.id)}
                    >
                      <Text style={styles.deleteActionIcon}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              <TouchableOpacity
                style={[
                  styles.button,
                  editMode && styles.buttonEdit,
                  // 선택되지 않았을 때: 관리자는 권한별 배경색, 일반 유저는 기본 회색
                  selectedScheduleId !== schedule.id && !editMode && { 
                    backgroundColor: isAdmin ? getRoleBgColor(schedule.targetRole) : '#f3f4f6'
                  },
                  // 선택된 상태: 권한별 활성 색상 적용
                  selectedScheduleId === schedule.id && !editMode && { 
                    backgroundColor: isAdmin ? getRoleActiveBgColor(schedule.targetRole) : '#3b82f6'
                  },
                ]}
                onPress={() => {
                  if (!editMode) {
                    setSelectedScheduleId(schedule.id);
                  }
                }}
                disabled={editMode}
              >
                <Text style={[
                  styles.buttonText,
                  selectedScheduleId === schedule.id && !editMode && styles.buttonTextActive
                ]}>
                  {schedule.title}
                </Text>
              </TouchableOpacity>
              
              {editMode && (
                <View style={styles.editActionsBottom}>
                  {actualIndex > 0 && (
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={() => handleMoveSchedule(actualIndex, 'left')}
                    >
                      <Text style={styles.moveButtonText}>←</Text>
                    </TouchableOpacity>
                  )}
                  {actualIndex < schedules.length - 1 && (
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={() => handleMoveSchedule(actualIndex, 'right')}
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

      {/* 줌 컨트롤 버튼들 - 구글 시트일 때만 표시 */}
      {isSelectedScheduleGoogleSheet && (
        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
            <Text style={styles.zoomButtonText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomResetButton} onPress={handleZoomReset}>
            <Text style={styles.zoomResetText}>{Math.round(currentZoom * 100)}%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
            <Text style={styles.zoomButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 웹뷰 컨테이너 */}
      <View style={styles.webViewContainer}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>시간표 로딩 중...</Text>
          </View>
        )}
        
        {schedules.map((schedule) => (
          <View
            key={schedule.id}
            style={[
              styles.webViewWrapper,
              selectedScheduleId !== schedule.id && styles.hidden
            ]}
          >
            {renderWebView(schedule.id, selectedScheduleId === schedule.id)}
          </View>
        ))}
      </View>

      {/* 시간표 추가 모달 */}
      {isAdmin && activeJobCodeId && (
        <AddLinkModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          jobCodeId={activeJobCodeId}
          linkType="scheduleLinks"
          userId={userData?.userId || ''}
          onSuccess={refreshResources}
        />
      )}

      {/* 시간표 수정 모달 */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContainer}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>시간표 수정</Text>
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
                placeholder="예: 1주차 시간표"
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
                  onPress={handleEditSchedule}
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
  buttonContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 42,
  },
  buttonContainerEdit: {
    backgroundColor: '#fef3c7',
    borderBottomColor: '#f59e0b',
    borderBottomWidth: 2,
    maxHeight: 'none' as any,
  },
  buttonContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonContentEdit: {
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
  button: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  buttonActive: {
    backgroundColor: '#3b82f6',
  },
  buttonEdit: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
  },
  buttonText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  buttonTextActive: {
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
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 6,
  },
  zoomButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  zoomButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  zoomResetButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 60,
    alignItems: 'center',
  },
  zoomResetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webViewWrapper: {
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
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    zIndex: 10,
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
});
