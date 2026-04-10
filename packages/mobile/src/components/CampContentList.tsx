import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { getDisplayItems, campPageService } from '../services';
import { generationResourcesService } from '../services';
import type { DisplayItem, CampPageRole, CampPageCategory } from '@smis-mentor/shared';
import type { LinkType, ResourceLinkRole } from '../services/generationResourcesService';
import { RootStackParamList } from '../navigation/types';

interface CampContentListProps {
  category: CampPageCategory;
  linkType: LinkType;
  categoryTitle: string;
}

const getRoleBadgeColor = (targetRole?: CampPageRole) => {
  switch (targetRole) {
    case 'mentor':
      return { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' };
    case 'foreign':
      return { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF' };
    default:
      return { bg: '#F3F4F6', text: '#374151', border: '#E5E7EB' };
  }
};

const getRoleLabel = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return '멘토';
    case 'foreign': return '원어민';
    default: return '공통';
  }
};

export function CampContentList({ category, linkType, categoryTitle }: CampContentListProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userData } = useAuth();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<'page' | 'link'>('page');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<CampPageRole>('common');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const filteredItems = items.filter(item => {
    if (isAdmin) return true;
    if (!item.targetRole || item.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
    return false;
  });

  // 관리자용 섹션별 그룹화
  const groupedItems = isAdmin ? {
    common: filteredItems.filter(item => !item.targetRole || item.targetRole === 'common'),
    mentor: filteredItems.filter(item => item.targetRole === 'mentor'),
    foreign: filteredItems.filter(item => item.targetRole === 'foreign'),
  } : null;

  const loadItems = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setItems([]);
      
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      setItems(displayItems);
    } catch (error) {
      logger.error(`${category} 로드 실패:`, error);
      Alert.alert('오류', '자료를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, category]);

  const onRefresh = useCallback(async () => {
    if (!activeJobCodeId) return;
    
    setRefreshing(true);
    try {
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      setItems(displayItems);
    } catch (error) {
      logger.error(`${category} 새로고침 실패:`, error);
    } finally {
      setRefreshing(false);
    }
  }, [activeJobCodeId, category]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadItems();
    } else {
      setLoading(false);
    }
  }, [activeJobCodeId, loadItems]);

  const handleAddItem = async () => {
    if (!activeJobCodeId || !newTitle.trim() || !userData?.userId) {
      Alert.alert('오류', '제목을 입력해주세요.');
      return;
    }

    try {
      if (addType === 'page') {
        await campPageService.createPage({
          jobCodeId: activeJobCodeId,
          category,
          title: newTitle.trim(),
          targetRole: newTargetRole,
          content: '',
          userId: userData.userId,
        });
      } else {
        if (!newUrl.trim()) {
          Alert.alert('오류', 'URL을 입력해주세요.');
          return;
        }
        await generationResourcesService.addLink(
          activeJobCodeId,
          linkType,
          newTitle.trim(),
          newUrl.trim(),
          userData.userId,
          newTargetRole as ResourceLinkRole
        );
      }
      
      setShowAddModal(false);
      setNewTitle('');
      setNewUrl('');
      setNewTargetRole('common');
      await loadItems();
      Alert.alert('성공', '추가되었습니다.');
    } catch (error) {
      logger.error('항목 추가 실패:', error);
      Alert.alert('오류', '추가에 실패했습니다.');
    }
  };

  const handleDeleteItem = async (item: DisplayItem) => {
    if (!activeJobCodeId) return;

    Alert.alert(
      '삭제 확인',
      `"${item.title}"을(를) 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.type === 'page') {
                await campPageService.deletePage(item.id);
              } else {
                await generationResourcesService.deleteLink(activeJobCodeId, linkType, item.id);
              }
              
              await loadItems();
              Alert.alert('성공', '삭제되었습니다.');
            } catch (error) {
              logger.error('항목 삭제 실패:', error);
              Alert.alert('오류', '삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleNavigateToDetail = (item: DisplayItem) => {
    if (item.type === 'link') {
      // 링크 타입: 브라우저에서 열기 또는 앱에서 열기 선택
      Alert.alert(
        item.title,
        '링크를 어떻게 여시겠습니까?',
        [
          {
            text: '브라우저에서 열기',
            onPress: async () => {
              const url = item.url || '';
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
              } else {
                Alert.alert('오류', '링크를 열 수 없습니다.');
              }
            },
          },
          {
            text: '앱에서 열기',
            onPress: () => {
              navigation.navigate('CampDetail', {
                category,
                itemId: item.id,
                itemTitle: item.title,
              });
            },
          },
          { text: '취소', style: 'cancel' },
        ]
      );
    } else {
      // 페이지 타입: 바로 상세 화면으로 이동
      navigation.navigate('CampDetail', {
        category,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>자료 로딩 중...</Text>
      </View>
    );
  }

  if (!userData || !activeJobCodeId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>활성 캠프를 선택해주세요</Text>
      </View>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3b82f6']}
            tintColor="#3b82f6"
          />
        }
      >
        <Text style={styles.emptyTitle}>등록된 자료가 없습니다</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButtonLarge}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonLargeText}>+ 첫 자료 추가하기</Text>
          </TouchableOpacity>
        )}

        {isAdmin && showAddModal && (
          <AddModal
            visible={showAddModal}
            onClose={() => {
              setShowAddModal(false);
              setNewTitle('');
              setNewUrl('');
            }}
            addType={addType}
            setAddType={setAddType}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            onAdd={handleAddItem}
          />
        )}
      </ScrollView>
    );
  }

  // 관리자 뷰: 섹션별로 분리
  if (isAdmin && groupedItems) {
    return (
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{categoryTitle}</Text>
            <Text style={styles.headerSubtitle}>총 {filteredItems.length}개의 자료</Text>
          </View>
          
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonText}>+ 자료 추가</Text>
          </TouchableOpacity>
        </View>

        {/* 섹션별 리스트 */}
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#3b82f6']}
              tintColor="#3b82f6"
            />
          }
        >
          {/* 공통 자료 섹션 */}
          {groupedItems.common.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#9ca3af' }]} />
                <Text style={styles.sectionTitle}>공통 자료</Text>
                <Text style={styles.sectionCount}>({groupedItems.common.length})</Text>
              </View>
              <View style={styles.sectionContent}>
                {groupedItems.common.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isAdmin={true}
                    onNavigate={handleNavigateToDetail}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </View>
            </View>
          )}

          {/* 멘토 전용 자료 섹션 */}
          {groupedItems.mentor.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#3b82f6' }]} />
                <Text style={styles.sectionTitle}>멘토 전용 자료</Text>
                <Text style={styles.sectionCount}>({groupedItems.mentor.length})</Text>
              </View>
              <View style={styles.sectionContent}>
                {groupedItems.mentor.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isAdmin={true}
                    onNavigate={handleNavigateToDetail}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </View>
            </View>
          )}

          {/* 원어민 전용 자료 섹션 */}
          {groupedItems.foreign.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#a855f7' }]} />
                <Text style={styles.sectionTitle}>원어민 전용 자료</Text>
                <Text style={styles.sectionCount}>({groupedItems.foreign.length})</Text>
              </View>
              <View style={styles.sectionContent}>
                {groupedItems.foreign.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isAdmin={true}
                    onNavigate={handleNavigateToDetail}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* 추가 모달 */}
        {showAddModal && (
          <AddModal
            visible={showAddModal}
            onClose={() => {
              setShowAddModal(false);
              setNewTitle('');
              setNewUrl('');
            }}
            addType={addType}
            setAddType={setAddType}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            onAdd={handleAddItem}
          />
        )}
      </View>
    );
  }

  // 일반 사용자 뷰: 뱃지 없이 단순 그리드
  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{categoryTitle}</Text>
          <Text style={styles.headerSubtitle}>총 {filteredItems.length}개의 자료</Text>
        </View>
      </View>

      {/* 카드 리스트 */}
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3b82f6']}
            tintColor="#3b82f6"
          />
        }
      >
        {filteredItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isAdmin={false}
            onNavigate={handleNavigateToDetail}
            onDelete={handleDeleteItem}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ItemCard({
  item,
  isAdmin,
  onNavigate,
  onDelete,
}: {
  item: DisplayItem;
  isAdmin: boolean;
  onNavigate: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onNavigate(item)}
      onLongPress={() => isAdmin && onDelete(item)}
    >
      <View style={styles.cardContent}>
        {/* 타입 아이콘 */}
        <View style={styles.cardHeader}>
          <View style={styles.iconTitleContainer}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor:
                    item.type === 'page' ? '#DBEAFE' : '#F3E8FF',
                },
              ]}
            >
              <Text style={styles.iconText}>
                {item.type === 'page' ? '📄' : '🔗'}
              </Text>
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardType}>
                {item.type === 'page' ? '페이지' : '외부 링크'}
              </Text>
            </View>
          </View>

          {isAdmin && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AddModal({
  visible,
  onClose,
  addType,
  setAddType,
  newTitle,
  setNewTitle,
  newUrl,
  setNewUrl,
  newTargetRole,
  setNewTargetRole,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  addType: 'page' | 'link';
  setAddType: (type: 'page' | 'link') => void;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newUrl: string;
  setNewUrl: (url: string) => void;
  newTargetRole: CampPageRole;
  setNewTargetRole: (role: CampPageRole) => void;
  onAdd: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>자료 추가</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {/* 유형 선택 */}
            <Text style={styles.label}>유형</Text>
            <View style={styles.typeButtons}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  addType === 'page' && styles.typeButtonActive,
                ]}
                onPress={() => setAddType('page')}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    addType === 'page' && styles.typeButtonTextActive,
                  ]}
                >
                  📄 페이지
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  addType === 'link' && styles.typeButtonActive,
                ]}
                onPress={() => setAddType('link')}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    addType === 'link' && styles.typeButtonTextActive,
                  ]}
                >
                  🔗 링크
                </Text>
              </TouchableOpacity>
            </View>

            {/* 제목 */}
            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="예: 1주차 자료"
              placeholderTextColor="#9CA3AF"
            />

            {/* URL (링크 타입일 때만) */}
            {addType === 'link' && (
              <>
                <Text style={styles.label}>URL</Text>
                <TextInput
                  style={styles.input}
                  value={newUrl}
                  onChangeText={setNewUrl}
                  placeholder="https://..."
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </>
            )}

            {/* 권한 */}
            <Text style={styles.label}>대상 권한</Text>
            <View style={styles.roleButtons}>
              {(['common', 'mentor', 'foreign'] as CampPageRole[]).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleButton,
                    newTargetRole === role && styles.roleButtonActive,
                  ]}
                  onPress={() => setNewTargetRole(role)}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      newTargetRole === role && styles.roleButtonTextActive,
                    ]}
                  >
                    {getRoleLabel(role)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 버튼 */}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addModalButton,
                  (!newTitle.trim() || (addType === 'link' && !newUrl.trim())) &&
                    styles.addModalButtonDisabled,
                ]}
                onPress={onAdd}
                disabled={!newTitle.trim() || (addType === 'link' && !newUrl.trim())}
              >
                <Text style={styles.addModalButtonText}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    flexDirection: 'column',
    overflow: 'hidden',
    width: '48%',
  },
  cardContent: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  iconText: {
    fontSize: 18,
  },
  titleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  cardType: {
    fontSize: 11,
    color: '#6b7280',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6b7280',
    marginLeft: 4,
  },
  sectionContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cardFooter: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalClose: {
    fontSize: 24,
    color: '#9ca3af',
  },
  modalContent: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f2937',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#3b82f6',
  },
  roleButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  roleButtonTextActive: {
    color: '#ffffff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  addModalButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  addModalButtonDisabled: {
    opacity: 0.5,
  },
  addModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
