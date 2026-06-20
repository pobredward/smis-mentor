import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { CommunityPost, CommunityPostScope } from '@smis-mentor/shared';
import { getGroupLabel } from '../../../shared/src/types/camp';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  getAllPosts,
  getCampPosts,
  getGroupPosts,
  getDevPosts,
} from '../services/communityService';
import jobCodesService, { type JobCode } from '../services/jobCodesService';
import { PostCard } from '../components/community/PostCard';
import { useAuth } from '../context/AuthContext';
import { MainTabScreenProps } from '../navigation/types';

// ─── 탭 정의 ──────────────────────────────────────────────────────────────────

type BoardTab = 'all' | 'camp' | 'group' | 'dev';

interface TabConfig {
  key: BoardTab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * 활성 jobExperience의 그룹 식별자를 만듭니다.
 * 그룹 게시판 범위: 동일 캠프 + 동일 group (예: "서머")
 */
function buildGroupId(group: string): string {
  return group;
}

export function CommunityScreen({ navigation }: MainTabScreenProps<'Community'>) {
  const { userData } = useAuth();

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId ?? null;

  // 활성 캠프의 jobExperience 항목
  const activeExperience = useMemo(
    () =>
      activeJobCodeId
        ? userData?.jobExperiences?.find((je) => je.id === activeJobCodeId) ?? null
        : null,
    [activeJobCodeId, userData?.jobExperiences]
  );

  // 그룹 식별자: "서머" 형태 (group 값 그대로)
  const activeGroupId = useMemo(
    () =>
      activeExperience
        ? buildGroupId(activeExperience.group)
        : null,
    [activeExperience]
  );

  // 활성 캠프코드의 표시 이름 (게시글 작성 시 저장, 다른 유저에게 보임)
  const [activeJobCodeLabel, setActiveJobCodeLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!activeJobCodeId) {
      setActiveJobCodeLabel(null);
      return;
    }
    jobCodesService.getJobCodeById(activeJobCodeId)
      .then((jc: JobCode | null) => setActiveJobCodeLabel(jc?.code ?? null))
      .catch(() => setActiveJobCodeLabel(null));
  }, [activeJobCodeId]);

  // 탭 구성 (동적 라벨)
  const tabs: TabConfig[] = useMemo(() => {
    const list: TabConfig[] = [
      { key: 'all', label: '전체', icon: 'earth-outline' },
    ];
    if (activeJobCodeId) {
      const campLabel = activeJobCodeLabel ? `${activeJobCodeLabel} 전체` : '캠프 전체';
      list.push({ key: 'camp', label: campLabel, icon: 'school-outline' });
    }
    if (activeGroupId) {
      const grp = activeExperience?.group ?? '그룹';
      const groupLabel = activeJobCodeLabel ? `${activeJobCodeLabel} ${getGroupLabel(grp)}` : getGroupLabel(grp);
      list.push({ key: 'group', label: groupLabel, icon: 'people-outline' });
    }
    list.push({ key: 'dev', label: '개발자 건의', icon: 'construct-outline' });
    return list;
  }, [activeJobCodeId, activeGroupId, activeExperience, activeJobCodeLabel]);

  const [activeTab, setActiveTab] = useState<BoardTab>('all');

  // 탭별 상태 (posts, cursor, hasMore, loading)
  const [postsByTab, setPostsByTab] = useState<Record<BoardTab, CommunityPost[]>>({
    all: [],
    camp: [],
    group: [],
    dev: [],
  });
  const [loadingByTab, setLoadingByTab] = useState<Record<BoardTab, boolean>>({
    all: false,
    camp: false,
    group: false,
    dev: false,
  });
  const [hasMoreByTab, setHasMoreByTab] = useState<Record<BoardTab, boolean>>({
    all: true,
    camp: true,
    group: true,
    dev: true,
  });
  const cursors = useRef<Record<BoardTab, QueryDocumentSnapshot | null>>({
    all: null,
    camp: null,
    group: null,
    dev: null,
  });
  // stale 클로저 없이 중복 호출을 막기 위해 ref로 관리
  const loadingRef = useRef<Record<BoardTab, boolean>>({
    all: false,
    camp: false,
    group: false,
    dev: false,
  });

  const [refreshing, setRefreshing] = useState(false);

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadPosts = useCallback(
    async (tab: BoardTab, reset = false) => {
      if (!reset && !hasMoreByTab[tab]) return;

      // ref 기반 guard — stale 클로저 문제 없음
      if (loadingRef.current[tab]) return;

      // 캠프/그룹 탭인데 필수 ID가 없으면 로딩 없이 빈 상태로 처리
      if (tab === 'camp' && !activeJobCodeId) {
        setPostsByTab((prev) => ({ ...prev, camp: [] }));
        setHasMoreByTab((prev) => ({ ...prev, camp: false }));
        return;
      }
      if (tab === 'group' && (!activeJobCodeId || !activeGroupId)) {
        setPostsByTab((prev) => ({ ...prev, group: [] }));
        setHasMoreByTab((prev) => ({ ...prev, group: false }));
        return;
      }

      loadingRef.current[tab] = true;
      setLoadingByTab((prev) => ({ ...prev, [tab]: true }));

      try {
        const cursor = reset ? null : cursors.current[tab];
        let page;

        if (tab === 'all') {
          page = await getAllPosts(cursor);
        } else if (tab === 'camp') {
          page = await getCampPosts(activeJobCodeId!, cursor);
        } else if (tab === 'group') {
          page = await getGroupPosts(activeJobCodeId!, activeGroupId!, cursor);
        } else {
          page = await getDevPosts(userData?.userId ?? '', isAdmin, cursor);
        }

        setPostsByTab((prev) => ({
          ...prev,
          [tab]: reset ? page.posts : [...prev[tab], ...page.posts],
        }));
        cursors.current[tab] = (page.lastVisible as QueryDocumentSnapshot | null);
        setHasMoreByTab((prev) => ({ ...prev, [tab]: page.hasMore }));
      } catch (err) {
        console.error(`[게시판] ${tab} 탭 로드 실패:`, err);
        setHasMoreByTab((prev) => ({ ...prev, [tab]: false }));
      } finally {
        loadingRef.current[tab] = false;
        setLoadingByTab((prev) => ({ ...prev, [tab]: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeJobCodeId, activeGroupId, isAdmin, userData?.userId]
  );

  // 화면 포커스 시 전체 탭 새로고침 (PostWrite/PostDetail에서 돌아올 때 포함)
  useFocusEffect(
    useCallback(() => {
      cursors.current = { all: null, camp: null, group: null, dev: null };
      setHasMoreByTab({ all: true, camp: true, group: true, dev: true });
      loadPosts('all', true);
      if (activeJobCodeId) loadPosts('camp', true);
      if (activeJobCodeId && activeGroupId) loadPosts('group', true);
      loadPosts('dev', true);
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    cursors.current = { all: null, camp: null, group: null, dev: null };
    setHasMoreByTab({ all: true, camp: true, group: true, dev: true });
    const loads = [loadPosts('all', true), loadPosts('dev', true)];
    if (activeJobCodeId) loads.push(loadPosts('camp', true));
    if (activeJobCodeId && activeGroupId) loads.push(loadPosts('group', true));
    await Promise.all(loads);
    setRefreshing(false);
  }, [loadPosts, activeJobCodeId, activeGroupId]);

  const handleEndReached = useCallback(() => {
    if (hasMoreByTab[activeTab] && !loadingByTab[activeTab]) {
      loadPosts(activeTab, false);
    }
  }, [activeTab, hasMoreByTab, loadingByTab, loadPosts]);

  const handlePostDeleted = useCallback((postId: string) => {
    setPostsByTab((prev) => {
      const next = { ...prev };
      (Object.keys(next) as BoardTab[]).forEach((k) => {
        next[k] = next[k].filter((p) => p.id !== postId);
      });
      return next;
    });
  }, []);

  // 게시글 카드 탭 → 세부 페이지
  const handlePostPress = useCallback(
    (post: CommunityPost) => {
      navigation.navigate('PostDetail', { postId: post.id });
    },
    [navigation]
  );

  // 게시글 수정 → PostWrite 스크린
  const handleEditPost = useCallback(
    (post: CommunityPost) => {
      navigation.navigate('PostWrite', {
        scope: post.scope as CommunityPostScope,
        jobCodeId: post.jobCodeId,
        groupId: post.groupId,
        groupLabel: null,
        authorId: userData?.userId ?? '',
        authorName: userData?.name ?? '',
        authorProfileImage: userData?.profileImage ?? null,
        authorJobCodeLabel: post.authorJobCodeLabel,
        authorIsAdmin: isAdmin,
        editPostId: post.id,
      });
    },
    [navigation, userData, isAdmin]
  );

  // ─── FAB 표시 조건 ──────────────────────────────────────────────────────────

  const canWrite = useMemo((): boolean => {
    if (activeTab === 'all') return true;
    if (activeTab === 'camp') return !!activeJobCodeId;
    if (activeTab === 'group') return !!activeJobCodeId && !!activeGroupId;
    if (activeTab === 'dev') return true;
    return false;
  }, [activeTab, activeJobCodeId, activeGroupId]);

  // 선택한 탭이 아직 tabs 목록에 없으면(캠프 미배정 후 탭 변경) 전체로 이동
  const currentTabExists = tabs.some((t) => t.key === activeTab);
  const displayTab = currentTabExists ? activeTab : 'all';

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  const posts = postsByTab[displayTab];
  const loading = loadingByTab[displayTab];

  const renderItem = useCallback(
    ({ item }: { item: CommunityPost }) => (
      <PostCard
        post={item}
        currentUserId={userData?.userId ?? ''}
        isCurrentUserAdmin={isAdmin}
        onPress={handlePostPress}
        onEdit={handleEditPost}
        onDeleted={handlePostDeleted}
      />
    ),
    [userData?.userId, isAdmin, handlePostPress, handleEditPost, handlePostDeleted]
  );

  const renderFooter = () => {
    if (loading && posts.length > 0) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      );
    }
    return <View style={{ height: 80 }} />;
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      );
    }
    const messages: Record<BoardTab, string> = {
      all: '업무코드 보유 멤버들의 첫 번째 글을 남겨보세요.',
      camp: '캠프 멤버들과 첫 번째 글을 나눠보세요.',
      group: '같은 그룹 멤버들과 소통해보세요.',
      dev: '개발자에게 건의사항을 남겨보세요.',
    };
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="newspaper-outline" size={52} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>아직 게시글이 없습니다</Text>
        <Text style={styles.emptyDesc}>{messages[displayTab]}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 탭 바 (균등 배치) */}
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = displayTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#3b82f6' : '#94a3b8'}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 게시글 목록 */}
      <FlatList
        data={postsByTab[displayTab]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
      />

      {/* 글쓰기 FAB → PostWrite 스크린으로 이동 */}
      {canWrite && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            const currentScope = displayTab as CommunityPostScope;
            navigation.navigate('PostWrite', {
              scope: currentScope,
              jobCodeId:
                currentScope === 'camp' || currentScope === 'group'
                  ? activeJobCodeId
                  : null,
              groupId: currentScope === 'group' ? activeGroupId : null,
              groupLabel:
                activeExperience
                  ? `${getGroupLabel(activeExperience.group)} · ${activeExperience.groupRole}`
                  : null,
              authorId: userData?.userId ?? '',
              authorName: userData?.name ?? '',
              authorProfileImage: userData?.profileImage ?? null,
              authorJobCodeLabel: isAdmin ? null : activeJobCodeLabel,
              authorIsAdmin: isAdmin,
            });
          }}
          accessibilityLabel="게시글 작성"
          accessibilityRole="button"
        >
          <Ionicons name="pencil" size={22} color="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  // 탭 바
  tabBarWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  // 목록
  listContent: {
    paddingTop: 8,
    paddingBottom: 16,
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  // 빈 상태
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 10,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#475569',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 32 : 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
