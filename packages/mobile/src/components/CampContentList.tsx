import { resolveActiveJobCodeId } from '@smis-mentor/shared';
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
  Platform,
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
import { campPageRoleLabel as getRoleLabel, snippetAround, htmlToSearchText as extractText } from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

interface CampContentListProps {
  category: CampPageCategory;
  linkType: LinkType;
  categoryTitle: string;
  isForeign?: boolean;
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


export function CampContentList({ category, linkType, categoryTitle, isForeign }: CampContentListProps) {
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

  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  // 1단계: 역할 기반 필터 (기존 로직 유지)
  const roleFilteredItems = items.filter(item => {
    if (isAdmin) return true;
    if (!item.targetRole || item.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
    return false;
  });

  // 2단계: 검색어 필터 (제목 + 본문 텍스트 검색)
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = trimmedQuery
    ? roleFilteredItems.filter(item => {
        if (item.title.toLowerCase().includes(trimmedQuery)) return true;
        if (item.content) {
          return extractText(item.content).toLowerCase().includes(trimmedQuery);
        }
        return false;
      })
    : roleFilteredItems;

  // 관리자용 섹션별 그룹화 (역할 필터 기준, 검색 미적용)
  const groupedItems = isAdmin ? {
    common: roleFilteredItems.filter(item => !item.targetRole || item.targetRole === 'common'),
    mentor: roleFilteredItems.filter(item => item.targetRole === 'mentor'),
    foreign: roleFilteredItems.filter(item => item.targetRole === 'foreign'),
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
      Alert.alert(L('common.error'), L('content.failedToLoadMaterials'));
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
      Alert.alert(L('common.error'), L('content.pleaseEnterATitle'));
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
      Alert.alert(L('common.success'), L('content.addedSuccessfully'));
    } catch (error) {
      logger.error('항목 추가 실패:', error);
      Alert.alert(L('common.error'), L('content.failedToAdd'));
    }
  };

  const handleDeleteItem = async (item: DisplayItem) => {
    if (!activeJobCodeId) return;

    Alert.alert(
      L('common.confirmDelete'),
      L('content.areYouSureYouWant', { v0: item.title }),
      [
        { text: L('common.cancel'), style: 'cancel' },
        {
          text: L('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.type === 'page') {
                await campPageService.deletePage(item.id);
              } else {
                await generationResourcesService.deleteLink(activeJobCodeId, linkType, item.id);
              }
              
              await loadItems();
              Alert.alert(L('common.success'), L('content.deletedSuccessfully'));
            } catch (error) {
              logger.error('항목 삭제 실패:', error);
              Alert.alert(L('common.error'), L('content.failedToDelete'));
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
      Alert.alert(L('common.error'), L('content.pleaseEnterATitle'));
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
      Alert.alert(L('common.success'), L('content.updatedSuccessfully'));
    } catch (error) {
      logger.error('항목 수정 실패:', error);
      Alert.alert(L('common.error'), L('content.failedToUpdate'));
    }
  };

  const handleNavigateToDetail = (item: DisplayItem) => {
    if (item.type === 'link') {
      // 링크 타입: 브라우저에서 열기 또는 앱에서 열기 선택
      Alert.alert(
        item.title,
        L('content.howWouldYouLikeTo'),
        [
          {
            text: L('content.openInBrowser'),
            onPress: async () => {
              const url = item.url || '';
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
              } else {
                Alert.alert(L('common.error'), L('content.cannotOpenThisLink'));
              }
            },
          },
          {
            text: L('content.openInApp'),
            onPress: () => {
              navigation.navigate('CampDetail', {
                category,
                itemId: item.id,
                itemTitle: item.title,
              });
            },
          },
          { text: L('common.cancel'), style: 'cancel' },
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

  const handleMoveItemUp = async (item: DisplayItem, sectionItems: DisplayItem[]) => {
    if (!activeJobCodeId || item.type !== 'page') return;

    const index = sectionItems.findIndex(i => i.id === item.id);
    if (index <= 0) return;

    try {
      const newItems = [...sectionItems];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      
      const pageIds = newItems.map(i => i.id);
      
      await campPageService.reorderPages(activeJobCodeId, category, pageIds);
      await loadItems();
      Alert.alert(L('common.success'), L('content.orderUpdated'));
    } catch (error) {
      logger.error('순서 변경 실패:', error);
      Alert.alert(L('common.error'), L('content.failedToUpdateOrder'));
    }
  };

  const handleMoveItemDown = async (item: DisplayItem, sectionItems: DisplayItem[]) => {
    if (!activeJobCodeId || item.type !== 'page') return;

    const index = sectionItems.findIndex(i => i.id === item.id);
    if (index < 0 || index >= sectionItems.length - 1) return;

    try {
      const newItems = [...sectionItems];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      
      const pageIds = newItems.map(i => i.id);
      
      await campPageService.reorderPages(activeJobCodeId, category, pageIds);
      await loadItems();
      Alert.alert(L('common.success'), L('content.orderUpdated'));
    } catch (error) {
      logger.error('순서 변경 실패:', error);
      Alert.alert(L('common.error'), L('content.failedToUpdateOrder'));
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>{L('content.loadingMaterials')}</Text>
      </View>
    );
  }

  if (!userData || !activeJobCodeId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>{L('content.pleaseSelectAnActiveCamp')}</Text>
      </View>
    );
  }

  // 실제 자료가 하나도 없는 경우 (검색 전)
  if (roleFilteredItems.length === 0) {
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
        <Text style={styles.emptyTitle}>{L('content.noMaterialsRegistered')}</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButtonLarge}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonLargeText}>+ {L('content.addFirstMaterial')}</Text>
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
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#3b82f6']}
              tintColor="#3b82f6"
            />
          }
        >
          {/* 헤더 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>{categoryTitle}</Text>
              <Text style={styles.headerSubtitle}>
                {trimmedQuery
                  ? L('content.v0ResultsForV1', { v0: filteredItems.length, v1: searchQuery })
                  : L('content.v0Materials', { v0: roleFilteredItems.length })}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.addButtonText}>+ {L('content.add')}</Text>
            </TouchableOpacity>
          </View>

          {/* 검색바 */}
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isForeign={isForeign}
          />

          {/* 검색 중: 결과 리스트 / 미검색: 섹션 그리드 */}
          {trimmedQuery ? (
            <SearchResultList
              items={filteredItems}
              query={searchQuery}
              onNavigate={handleNavigateToDetail}
              isForeign={isForeign}
            />
          ) : (
            <>
              {/* 공통 자료 섹션 */}
              {groupedItems.common.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: '#9ca3af' }]} />
                    <Text style={styles.sectionTitle}>{L('content.common')}</Text>
                    <Text style={styles.sectionCount}>({groupedItems.common.length})</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    {groupedItems.common.map((item, idx) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        isAdmin={true}
                        onNavigate={handleNavigateToDetail}
                        onDelete={handleDeleteItem}
                        onEdit={handleStartEditItem}
                        onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.common) : undefined}
                        onMoveDown={idx < groupedItems.common.length - 1 ? () => handleMoveItemDown(item, groupedItems.common) : undefined}
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
                    <Text style={styles.sectionTitle}>{L('content.mentorOnly')}</Text>
                    <Text style={styles.sectionCount}>({groupedItems.mentor.length})</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    {groupedItems.mentor.map((item, idx) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        isAdmin={true}
                        onNavigate={handleNavigateToDetail}
                        onDelete={handleDeleteItem}
                        onEdit={handleStartEditItem}
                        onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.mentor) : undefined}
                        onMoveDown={idx < groupedItems.mentor.length - 1 ? () => handleMoveItemDown(item, groupedItems.mentor) : undefined}
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
                    <Text style={styles.sectionTitle}>{L('content.foreignTeacherOnly')}</Text>
                    <Text style={styles.sectionCount}>({groupedItems.foreign.length})</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    {groupedItems.foreign.map((item, idx) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        isAdmin={true}
                        onNavigate={handleNavigateToDetail}
                        onDelete={handleDeleteItem}
                        onEdit={handleStartEditItem}
                        onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.foreign) : undefined}
                        onMoveDown={idx < groupedItems.foreign.length - 1 ? () => handleMoveItemDown(item, groupedItems.foreign) : undefined}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
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
          <Text style={styles.headerSubtitle}>
            {trimmedQuery
              ? L('content.v0ResultsForV1', { v0: filteredItems.length, v1: searchQuery })
              : L('content.v0Materials', { v0: roleFilteredItems.length })}
          </Text>
        </View>
      </View>

      {/* 검색바 */}
      <SearchBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isForeign={isForeign}
      />

      {/* 검색 중: 결과 리스트 / 미검색: 카드 그리드 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={trimmedQuery ? styles.searchResultContent : styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3b82f6']}
            tintColor="#3b82f6"
          />
        }
      >
        {trimmedQuery ? (
          <SearchResultList
            items={filteredItems}
            query={searchQuery}
            onNavigate={handleNavigateToDetail}
            isForeign={isForeign}
          />
        ) : (
          roleFilteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isAdmin={false}
              onNavigate={handleNavigateToDetail}
              onDelete={handleDeleteItem}
              onEdit={handleStartEditItem}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 검색 관련 헬퍼 함수
// ─────────────────────────────────────────────────────────


function extractSnippet(html: string, query: string): string {
  return snippetAround(extractText(html), query);
}

// ─────────────────────────────────────────────────────────
// 검색 관련 컴포넌트
// ─────────────────────────────────────────────────────────

function SearchBar({
  searchQuery,
  setSearchQuery,
  isForeign,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isForeign?: boolean;
}) {
  return (
    <View style={styles.searchContainer}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={L('content.searchByTitleOrContent')}
        placeholderTextColor="#9ca3af"
        returnKeyType="search"
        clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
      />
      {searchQuery.length > 0 && Platform.OS === 'android' && (
        <TouchableOpacity
          onPress={() => setSearchQuery('')}
          style={styles.searchClearButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={L('content.clearSearch')}
          accessibilityRole="button"
        >
          <Text style={styles.searchClearText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HighlightText({
  text,
  query,
  style,
}: {
  text: string;
  query: string;
  style: object;
}) {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) return <Text style={style}>{text}</Text>;

  const lowerText = text.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery, lastIndex);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), highlight: false });
    }
    parts.push({ text: text.slice(index, index + lowerQuery.length), highlight: true });
    lastIndex = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.highlight ? (
          <Text key={i} style={styles.highlight}>{part.text}</Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

function SearchResultList({
  items,
  query,
  onNavigate,
  isForeign,
}: {
  items: DisplayItem[];
  query: string;
  onNavigate: (item: DisplayItem) => void;
  isForeign?: boolean;
}) {
  if (items.length === 0) {
    return (
      <View style={styles.searchEmptyContainer}>
        <Text style={styles.searchEmptyIcon}>🔍</Text>
        <Text style={styles.searchEmptyTitle}>
          {L('content.noResultsForV0', { v0: query })}
        </Text>
        <Text style={styles.searchEmptySubtitle}>
          {L('content.tryADifferentKeyword')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.searchResultListContainer}>
      {items.map((item) => (
        <SearchResultItem
          key={item.id}
          item={item}
          query={query}
          onNavigate={onNavigate}
          isForeign={isForeign}
        />
      ))}
    </View>
  );
}

function SearchResultItem({
  item,
  query,
  onNavigate,
  isForeign,
}: {
  item: DisplayItem;
  query: string;
  onNavigate: (item: DisplayItem) => void;
  isForeign?: boolean;
}) {
  const snippet = item.content ? extractSnippet(item.content, query) : '';
  const badgeColor = getRoleBadgeColor(item.targetRole);
  const roleLabel = getRoleLabel(item.targetRole, isForeign);

  return (
    <TouchableOpacity
      style={styles.searchResultItem}
      onPress={() => onNavigate(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${roleLabel}`}
    >
      <View
        style={[
          styles.searchResultIconBox,
          { backgroundColor: item.type === 'page' ? '#DBEAFE' : '#F3E8FF' },
        ]}
      >
        <Text style={styles.iconText}>
          {item.emoji || (item.type === 'page' ? '📄' : '🔗')}
        </Text>
      </View>

      <View style={styles.searchResultBody}>
        <View style={styles.searchResultHeaderRow}>
          <HighlightText
            text={item.title}
            query={query}
            style={styles.searchResultTitle}
          />
          <View
            style={[
              styles.searchResultBadge,
              { backgroundColor: badgeColor.bg, borderColor: badgeColor.border },
            ]}
          >
            <Text style={[styles.searchResultBadgeText, { color: badgeColor.text }]}>
              {roleLabel}
            </Text>
          </View>
        </View>

        {snippet ? (
          <HighlightText
            text={snippet}
            query={query}
            style={styles.searchResultSnippet}
          />
        ) : null}
      </View>

      <Text style={styles.searchResultArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────
// 카드 컴포넌트
// ─────────────────────────────────────────────────────────

function ItemCard({
  item,
  isAdmin,
  onNavigate,
  onDelete,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  item: DisplayItem;
  isAdmin: boolean;
  onNavigate: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
  onEdit: (item: DisplayItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          </View>

          {isAdmin && (
            <View style={styles.actionButtons}>
              {item.type === 'page' && (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEdit(item);
                    }}
                  >
                    <Text style={styles.editButtonText}>✏️</Text>
                  </TouchableOpacity>
                  {onMoveUp && (
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        onMoveUp();
                      }}
                    >
                      <Text style={styles.moveButtonText}>▲</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete(item);
                  }}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
                {onMoveDown && (
                  <TouchableOpacity
                    style={styles.moveButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onMoveDown();
                    }}
                  >
                    <Text style={styles.moveButtonText}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────

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
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  listContent: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  searchResultContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },

  // ── 검색바 ──
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
    color: '#9ca3af',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
  },
  searchClearButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
    height: 28,
  },
  searchClearText: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // ── 하이라이트 ──
  highlight: {
    backgroundColor: '#fef08a',
    color: '#713f12',
  },

  // ── 검색 결과 리스트 ──
  searchResultListContainer: {
    padding: 12,
    gap: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  searchResultIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  searchResultBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  searchResultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  searchResultTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    flexShrink: 1,
  },
  searchResultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  searchResultBadgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  searchResultSnippet: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
  },
  searchResultArrow: {
    fontSize: 20,
    color: '#d1d5db',
    flexShrink: 0,
    marginLeft: 2,
  },

  // ── 검색 결과 없음 ──
  searchEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  searchEmptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  searchEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 4,
  },
  searchEmptySubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },

  // ── 카드 ──
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
    marginTop: 16,
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

  // ── 모달 ──
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
  buttonRow: {
    flexDirection: 'row',
    gap: 2,
  },
  moveButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  moveButtonText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
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

// ─────────────────────────────────────────────────────────
// 모달 컴포넌트
// ─────────────────────────────────────────────────────────

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
            <Text style={styles.modalTitle}>{L('content.addPage')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* 제목 */}
            <Text style={styles.label}>{L('content.title')}</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={L('content.eGWeek1Materials')}
              placeholderTextColor="#9CA3AF"
            />

            {/* 이모지 선택 */}
            <Text style={styles.label}>{L('content.icon')}</Text>
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Text style={styles.emojiButtonIcon}>{newEmoji}</Text>
              <Text style={styles.emojiButtonText}>{L('content.clickToChange')}</Text>
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
            <Text style={styles.label}>{L('content.audience')}</Text>
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
                <Text style={styles.cancelButtonText}>{L('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addModalButton,
                  !newTitle.trim() && styles.addModalButtonDisabled,
                ]}
                onPress={onAdd}
                disabled={!newTitle.trim()}
              >
                <Text style={styles.addModalButtonText}>{L('task.add')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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
            <Text style={styles.modalTitle}>{L('content.editPage')}</Text>
            <TouchableOpacity onPress={() => setEditingItem(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* 제목 */}
            <Text style={styles.label}>{L('content.title')}</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={L('content.eGWeek1Materials')}
              placeholderTextColor="#9CA3AF"
            />

            {/* 이모지 선택 */}
            <Text style={styles.label}>{L('content.icon')}</Text>
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
            >
              <Text style={styles.emojiButtonIcon}>{editEmoji}</Text>
              <Text style={styles.emojiButtonText}>{L('content.clickToChange')}</Text>
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
            <Text style={styles.label}>{L('content.audience')}</Text>
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
                <Text style={styles.cancelButtonText}>{L('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addModalButton,
                  !editTitle.trim() && styles.addModalButtonDisabled,
                ]}
                onPress={handleSaveEditItem}
                disabled={!editTitle.trim()}
              >
                <Text style={styles.addModalButtonText}>{L('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
