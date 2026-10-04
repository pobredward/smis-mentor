/**
 * 사진·동영상 모아보기 — 격자(최신 순, 달마다 머리글) · 아래로 내리면 더 불러오기 · 누르면 보기 화면(불러온 것 전부 좌우로)
 * [선택] → 눌러서 고르기 · 'n개 선택' · [모두 선택] · [선택한 것 저장](사진첩)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  SectionList,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { L, loadChatMediaPage, logger, type ChatMediaItem, type ChatMemberInfo } from '@smis-mentor/shared';
import { db } from '../../config/firebase';
import { MediaViewer, type MediaViewerItemMeta } from './MediaViewer';
import { saveChatMediaWithFeedback } from './saveWithFeedback';
import { CHAT_COLORS, formatDuration } from './chatTheme';

interface GalleryItem {
  key: string;
  item: ChatMediaItem;
  meta: MediaViewerItemMeta;
}

interface ChatGalleryModalProps {
  visible: boolean;
  roomId: string;
  campCode?: string | null;
  memberInfo?: Record<string, ChatMemberInfo>;
  onClose: () => void;
}

const PAGE = 60;

export function ChatGalleryModal({ visible, roomId, campCode, memberInfo, onClose }: ChatGalleryModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cols = width >= 420 ? 4 : 3;
  const cell = Math.floor((width - (cols - 1) * 2) / cols);

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [viewerStart, setViewerStart] = useState<number | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const r = await loadChatMediaPage(db, roomId, { before: cursorRef.current, pageSize: PAGE });
      cursorRef.current = r.oldest;
      hasMoreRef.current = r.hasMore;
      setHasMore(r.hasMore);
      const add: GalleryItem[] = [];
      r.messages.forEach((m) => {
        const ms = (m.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        const at = ms ? new Date(ms) : null;
        const senderName = memberInfo?.[m.senderId]?.name || m.senderName;
        (m.media ?? []).forEach((item, index) => {
          if (item.kind !== 'image' && item.kind !== 'video') return;
          add.push({ key: `${m.id}_${index}`, item, meta: { senderName, at, index } });
        });
      });
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.key));
        return [...prev, ...add.filter((x) => !seen.has(x.key))];
      });
    } catch (e) {
      logger.warn('사진·동영상 모아보기 불러오기 실패:', e);
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [roomId, memberInfo]);

  useEffect(() => {
    if (!visible) return;
    setItems([]);
    setSelecting(false);
    setSelected(new Set());
    setViewerStart(null);
    cursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    void loadMore();
    // 열 때마다 처음부터
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roomId]);

  // 달마다 머리글 · 줄마다 cols 칸
  const sections = useMemo(() => {
    const out: Array<{ key: string; title: string; data: Array<{ key: string; cells: Array<{ g: GalleryItem; i: number }> }> }> = [];
    let current: { key: string; title: string; flat: Array<{ g: GalleryItem; i: number }> } | null = null;
    const flush = () => {
      if (!current) return;
      const rows = [];
      for (let k = 0; k < current.flat.length; k += cols) rows.push({ key: `${current.key}_${k}`, cells: current.flat.slice(k, k + cols) });
      out.push({ key: current.key, title: current.title, data: rows });
    };
    items.forEach((g, i) => {
      const d = g.meta.at;
      const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}` : '?';
      if (!current || current.key !== key) {
        flush();
        current = { key, title: d ? L('chat.appGalleryMonth', { y: d.getFullYear(), m: d.getMonth() + 1 }) : '', flat: [] };
      }
      current.flat.push({ g, i });
    });
    flush();
    return out;
  }, [items, cols]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saveSelected = async () => {
    const list = items.filter((g) => selected.has(g.key));
    if (!list.length || saving) return;
    setSaving({ done: 0, total: list.length });
    await saveChatMediaWithFeedback(
      list.map((g, i) => ({ item: g.item, index: i })),
      { campCode, at: new Date(), onProgress: (done, total) => setSaving({ done, total }) },
    );
    setSaving(null);
    setSelecting(false);
    setSelected(new Set());
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerBtn} accessibilityLabel={L('common.close')}>
            <Ionicons name="close" size={26} color={CHAT_COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {selecting ? L('chat.gallerySelectedN', { n: selected.size }) : L('chat.galleryTitle')}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setSelecting((v) => !v);
              setSelected(new Set());
            }}
            hitSlop={10}
            style={styles.headerBtn}
            disabled={!items.length}
          >
            <Text style={[styles.headerAction, !items.length && styles.dim]}>{selecting ? L('common.cancel') : L('chat.gallerySelect')}</Text>
          </TouchableOpacity>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled
          onEndReached={() => {
            if (hasMore) void loadMore();
          }}
          onEndReachedThreshold={0.6}
          renderSectionHeader={({ section }) => (section.title ? <Text style={styles.month}>{section.title}</Text> : null)}
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.cells.map(({ g, i }, j) => {
                const on = selected.has(g.key);
                return (
                  <Pressable
                    key={g.key}
                    style={[{ width: cell, height: cell }, j > 0 && styles.gapLeft]}
                    onPress={() => (selecting ? toggle(g.key) : setViewerStart(i))}
                  >
                    {g.item.thumbUrl || g.item.kind === 'image' ? (
                      <Image
                        source={{ uri: g.item.thumbUrl || g.item.url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        recyclingKey={g.key}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.empty]} />
                    )}
                    {g.item.kind === 'video' ? (
                      <View style={styles.video} pointerEvents="none">
                        <Ionicons name="play" size={12} color="#ffffff" />
                        <Text style={styles.videoText}>{formatDuration(g.item.durationMs)}</Text>
                      </View>
                    ) : null}
                    {selecting ? (
                      <View style={[styles.check, on && styles.checkOn]} pointerEvents="none">
                        {on ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyWrap}>
                <Ionicons name="images-outline" size={44} color="#cbd5e1" />
                <Text style={styles.emptyText}>{L('chat.galleryEmpty')}</Text>
              </View>
            )
          }
          ListFooterComponent={loading ? <ActivityIndicator style={styles.loading} color={CHAT_COLORS.sub} /> : null}
          contentContainerStyle={{ paddingBottom: (selecting ? 70 : 16) + insets.bottom }}
        />

        {selecting ? (
          <View style={[styles.selectBar, { paddingBottom: insets.bottom + 10 }]}>
            <TouchableOpacity onPress={() => setSelected(new Set(items.map((g) => g.key)))} style={styles.selectAll}>
              <Text style={styles.selectAllText}>{L('chat.gallerySelectAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveSelected}
              disabled={!selected.size || !!saving}
              style={[styles.saveBtn, (!selected.size || !!saving) && styles.dim]}
            >
              {saving ? (
                <Text style={styles.saveText}>{L('chat.appSaving', { done: saving.done, total: saving.total })}</Text>
              ) : (
                <Text style={styles.saveText}>{L('chat.gallerySaveSelected')}</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <MediaViewer
          visible={viewerStart !== null}
          media={items.map((g) => g.item)}
          itemMeta={items.map((g) => g.meta)}
          startIndex={viewerStart ?? 0}
          senderName=""
          at={null}
          campCode={campCode}
          onClose={() => setViewerStart(null)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  headerBtn: { minWidth: 56, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', color: CHAT_COLORS.text },
  headerAction: { fontSize: 15, color: CHAT_COLORS.primary, fontWeight: '600' },
  dim: { opacity: 0.4 },
  month: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 13.5,
    fontWeight: '700',
    color: CHAT_COLORS.text,
  },
  row: { flexDirection: 'row', marginBottom: 2 },
  gapLeft: { marginLeft: 2 },
  empty: { backgroundColor: '#334155' },
  video: { position: 'absolute', left: 5, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  videoText: { color: '#ffffff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: CHAT_COLORS.primary, borderColor: CHAT_COLORS.primary },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: CHAT_COLORS.sub, fontSize: 14 },
  loading: { paddingVertical: 20 },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_COLORS.border,
  },
  selectAll: { paddingHorizontal: 10, paddingVertical: 10 },
  selectAllText: { fontSize: 14.5, color: CHAT_COLORS.primary, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: CHAT_COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#ffffff', fontSize: 14.5, fontWeight: '700' },
});
