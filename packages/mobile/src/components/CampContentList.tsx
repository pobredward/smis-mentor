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
import { DEFAULT_EMOJIS } from '@smis-mentor/shared';
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
  const [newTitle, setNewTitle] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<CampPageRole>('common');
  const [newEmoji, setNewEmoji] = useState('📄');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [editingItem, setEditingItem] = useState<DisplayItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEmoji, setEditEmoji] = useState('📄');
  const [editTargetRole, setEditTargetRole] = useState<CampPageRole>('common');
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);

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
      await campPageService.createPage({
        jobCodeId: activeJobCodeId,
        category,
        title: newTitle.trim(),
        targetRole: newTargetRole,
        content: '',
        emoji: newEmoji,
        userId: userData.userId,
      });
      
      setShowAddModal(false);
      setNewTitle('');
      setNewTargetRole('common');
      setNewEmoji('📄');
      setShowEmojiPicker(false);
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

  const handleStartEditItem = (item: DisplayItem) => {
    if (item.type !== 'page') return;
    setEditingItem(item);
    setEditTitle(item.title);
    setEditEmoji(item.emoji || '📄');
    setEditTargetRole(item.targetRole);
    setShowEditEmojiPicker(false);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem || !activeJobCodeId || !editTitle.trim() || !userData?.userId) {
      Alert.alert('오류', '제목을 입력해주세요.');
      return;
    }

    if (editingItem.type !== 'page') return;

    try {
      await campPageService.updatePage(editingItem.id, {
        title: editTitle.trim(),
        emoji: editEmoji,
        targetRole: editTargetRole,
        userId: userData.userId,
      });

      setEditingItem(null);
      await loadItems();
      Alert.alert('성공', '수정되었습니다.');
    } catch (error) {
      logger.error('항목 수정 실패:', error);
      Alert.alert('오류', '수정에 실패했습니다.');
    }
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
              setNewEmoji('📄');
              setShowEmojiPicker(false);
            }}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            newEmoji={newEmoji}
            setNewEmoji={setNewEmoji}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
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
                    onEdit={handleStartEditItem}
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
                    onEdit={handleStartEditItem}
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
                    onEdit={handleStartEditItem}
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
              setNewEmoji('📄');
              setShowEmojiPicker(false);
            }}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            newEmoji={newEmoji}
            setNewEmoji={setNewEmoji}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            onAdd={handleAddItem}
          />
        )}

        {/* 수정 모달 */}
        {editingItem && (
          <EditModal
            editingItem={editingItem}
            setEditingItem={setEditingItem}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editEmoji={editEmoji}
            setEditEmoji={setEditEmoji}
            editTargetRole={editTargetRole}
            setEditTargetRole={setEditTargetRole}
            showEditEmojiPicker={showEditEmojiPicker}
            setShowEditEmojiPicker={setShowEditEmojiPicker}
            handleSaveEditItem={handleSaveEditItem}
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
            onEdit={handleStartEditItem}
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
  onEdit,
}: {
  item: DisplayItem;
  isAdmin: boolean;
  onNavigate: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
  onEdit: (item: DisplayItem) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onNavigate(item)}
    >
      <View style={styles.cardContent}>
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
                {item.emoji || (item.type === 'page' ? '📄' : '🔗')}
              </Text>
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </View>

          {isAdmin && (
            <View style={styles.actionButtons}>
              {item.type === 'page' && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                >
                  <Text style={styles.editButtonText}>✏️</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
              >
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AddModal({
  visible,
  onClose,
  newTitle,
  setNewTitle,
  newTargetRole,
  setNewTargetRole,
  newEmoji,
  setNewEmoji,
  showEmojiPicker,
  setShowEmojiPicker,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newTargetRole: CampPageRole;
  setNewTargetRole: (role: CampPageRole) => void;
  newEmoji: string;
  setNewEmoji: (emoji: string) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;
  onAdd: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>페이지 추가</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* 제목 */}
            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="예: 1주차 자료"
              placeholderTextColor="#9CA3AF"
            />

            {/* 이모지 선택 */}
            <Text style={styles.label}>아이콘</Text>
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Text style={styles.emojiButtonIcon}>{newEmoji}</Text>
              <Text style={styles.emojiButtonText}>클릭하여 변경</Text>
            </TouchableOpacity>
            
            {showEmojiPicker && (
              <View style={styles.emojiPicker}>
                <ScrollView style={styles.emojiPickerScroll}>
                  <View style={styles.emojiGrid}>
                    {DEFAULT_EMOJIS.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={styles.emojiOption}
                        onPress={() => {
                          setNewEmoji(emoji);
                          setShowEmojiPicker(false);
                        }}
                      >
                        <Text style={styles.emojiOptionText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
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
                  !newTitle.trim() && styles.addModalButtonDisabled,
                ]}
                onPress={onAdd}
                disabled={!newTitle.trim()}
              >
                <Text style={styles.addModalButtonText}>추가</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    padding: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  iconTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  iconText: {
    fontSize: 16,
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
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
  emojiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  emojiButtonIcon: {
    fontSize: 24,
  },
  emojiButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  emojiPicker: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 200,
  },
  emojiPickerScroll: {
    padding: 8,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiOption: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  emojiOptionText: {
    fontSize: 24,
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 2,
    flexShrink: 0,
  },
  editButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  editButtonText: {
    fontSize: 11,
  },
  deleteButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteButtonText: {
    fontSize: 11,
  },
});

function EditModal({
  editingItem,
  setEditingItem,
  editTitle,
  setEditTitle,
  editEmoji,
  setEditEmoji,
  editTargetRole,
  setEditTargetRole,
  showEditEmojiPicker,
  setShowEditEmojiPicker,
  handleSaveEditItem,
}: {
  editingItem: DisplayItem;
  setEditingItem: (item: DisplayItem | null) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  editEmoji: string;
  setEditEmoji: (emoji: string) => void;
  editTargetRole: CampPageRole;
  setEditTargetRole: (role: CampPageRole) => void;
  showEditEmojiPicker: boolean;
  setShowEditEmojiPicker: (show: boolean) => void;
  handleSaveEditItem: () => void;
}) {
  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={() => setEditingItem(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>페이지 수정</Text>
            <TouchableOpacity onPress={() => setEditingItem(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* 제목 */}
            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="예: 1주차 자료"
              placeholderTextColor="#9CA3AF"
            />

            {/* 이모지 선택 */}
            <Text style={styles.label}>아이콘</Text>
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
            >
              <Text style={styles.emojiButtonIcon}>{editEmoji}</Text>
              <Text style={styles.emojiButtonText}>클릭하여 변경</Text>
            </TouchableOpacity>
            
            {showEditEmojiPicker && (
              <View style={styles.emojiPicker}>
                <ScrollView style={styles.emojiPickerScroll}>
                  <View style={styles.emojiGrid}>
                    {DEFAULT_EMOJIS.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={styles.emojiOption}
                        onPress={() => {
                          setEditEmoji(emoji);
                          setShowEditEmojiPicker(false);
                        }}
                      >
                        <Text style={styles.emojiOptionText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* 권한 */}
            <Text style={styles.label}>대상 권한</Text>
            <View style={styles.roleButtons}>
              {(['common', 'mentor', 'foreign'] as CampPageRole[]).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleButton,
                    editTargetRole === role && styles.roleButtonActive,
                  ]}
                  onPress={() => setEditTargetRole(role)}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      editTargetRole === role && styles.roleButtonTextActive,
                    ]}
                  >
                    {getRoleLabel(role)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 버튼 */}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditingItem(null)}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addModalButton,
                  !editTitle.trim() && styles.addModalButtonDisabled,
                ]}
                onPress={handleSaveEditItem}
                disabled={!editTitle.trim()}
              >
                <Text style={styles.addModalButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
