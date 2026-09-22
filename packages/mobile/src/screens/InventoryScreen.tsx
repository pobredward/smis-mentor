import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, Linking, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../config/firebase';
import { uriToBlob } from '../utils';
import { authenticatedFetch } from '../utils/apiClient';
import jobCodesService from '../services/jobCodesService';
import { stSheetService } from '../services/stSheet';
import {
  subscribeInventoryItems,
  subscribeInventoryStocks,
  subscribeInventoryGroups,
  subscribeInventoryMovements,
  subscribeInventoryRequests,
  subscribeInventoryRequestEntries,
  saveInventoryRequestEntry,
  summarizeRequestEntries,
  subscribeLostItems,
  addLostItem,
  updateLostItem,
  setLostItemStatus,
  addLostItemMedia,
  removeLostItemMedia,
  deleteLostItem,
  lostItemMediaPath,
  LOST_ITEM_STATUSES,
  LOST_ITEM_STATUS_LABELS,
  restock,
  adjustStockTo,
  getCampGroups,
  findGroupByClassCode,
  itemLabel,
  setGroupMinStock,
  buildInventoryViews,
  computePurchaseNeeds,
  getGroupStock,
  getMinStock,
  INVENTORY_CATEGORIES,
  INVENTORY_MOVEMENT_LABELS,
} from '@smis-mentor/shared';
import type {
  CampCode,
  InventoryItem,
  InventoryItemView,
  InventoryStock,
  InventoryGroup,
  InventoryMovement,
  InventoryCategory,
  PurchaseNeed,
  InventoryRequest,
  InventoryRequestEntry,
  InventoryRequestLine,
  LostItem,
  LostItemMedia,
  LostItemStatus,
  CampGroup,
  STSheetStudent,
} from '@smis-mentor/shared';

type SubTab = 'stock' | 'request' | 'purchase' | 'lost';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(ts: InventoryMovement['at']): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 캠프 › 재고 (모바일) — 현황·검색·상세·내역, 관리자는 입고/조정/최소 수량. 품목·그룹·패키지 관리는 웹에서 */
export function InventoryScreen() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const userName = userData?.name ?? '';

  const activeJobCodeId = useMemo(() => {
    return isAdmin
      ? ((userData as unknown as Record<string, unknown>)?.adminTempActiveCamp as string | undefined) || userData?.activeJobExperienceId
      : userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  }, [userData, isAdmin]);

  const [campCode, setCampCode] = useState<CampCode | null>(null);
  useEffect(() => {
    if (!activeJobCodeId) return;
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then(codes => {
      if (codes.length > 0 && codes[0].code) setCampCode(codes[0].code as CampCode);
    }).catch(() => {});
  }, [activeJobCodeId]);

  // 캠프 그룹 · 학생 명단 — 분실물 이름표 알림 대상 계산
  const [campGroups, setCampGroups] = useState<CampGroup[]>([]);
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  useEffect(() => {
    if (!campCode) return;
    getCampGroups(db, campCode).then(setCampGroups).catch(() => {});
    stSheetService.getCachedData(campCode).then(s => setStudents((s ?? []) as STSheetStudent[])).catch(() => {});
  }, [campCode]);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stocks, setStocks] = useState<Record<string, InventoryStock>>({});
  const [groups, setGroups] = useState<InventoryGroup[]>([]);
  useEffect(() => subscribeInventoryItems(db, setItems), []);
  useEffect(() => {
    if (!campCode) return;
    const u1 = subscribeInventoryStocks(db, campCode, setStocks);
    const u2 = subscribeInventoryGroups(db, campCode, setGroups);
    return () => { u1(); u2(); };
  }, [campCode]);

  const [requests, setRequests] = useState<InventoryRequest[]>([]);
  useEffect(() => { if (campCode) return subscribeInventoryRequests(db, campCode, setRequests); }, [campCode]);
  const openRequests = useMemo(() => requests.filter(r => r.status === 'open'), [requests]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  useEffect(() => { if (campCode) return subscribeLostItems(db, campCode, setLostItems); }, [campCode]);
  const keptLostCount = useMemo(() => lostItems.filter(l => l.status === 'found').length, [lostItems]);

  const views = useMemo(() => buildInventoryViews(items, stocks, groups), [items, stocks, groups]);
  const needs = useMemo(() => computePurchaseNeeds(views, groups), [views, groups]);
  const shortItems = useMemo(() => new Set(needs.map(n => n.itemId)), [needs]);

  const [subTab, setSubTab] = useState<SubTab>('stock');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | '전체'>('전체');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => views.find(v => v.id === selectedId) ?? null, [views, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter(v => {
      if (v.isActive === false) return false;
      if (category !== '전체' && v.category !== category) return false;
      if (!q) return true;
      return [v.name, v.kind, v.subCategory, v.spec, v.description].some(f => f?.toLowerCase().includes(q));
    });
  }, [views, search, category]);

  const sections = useMemo(() => {
    const map = new Map<string, InventoryItemView[]>();
    filtered.forEach(v => {
      const key = v.subCategory ? `${v.category} · ${v.subCategory}` : v.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return [...map.entries()];
  }, [filtered]);

  if (!activeJobCodeId || !campCode) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cube-outline" size={40} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>{activeJobCodeId ? '캠프 정보를 불러오는 중...' : '활성 캠프를 선택해주세요.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 세부탭 */}
      <View style={styles.tabRow}>
        {([
          { id: 'stock' as SubTab, title: isForeign ? 'Stock' : '재고 현황', icon: 'cube-outline' as const },
          { id: 'request' as SubTab, title: isForeign ? 'Request' : '재고 요청', icon: 'clipboard-outline' as const, badge: openRequests.length },
          { id: 'purchase' as SubTab, title: isForeign ? 'To buy' : '구매 필요', icon: 'cart-outline' as const, badge: needs.length },
          { id: 'lost' as SubTab, title: isForeign ? 'Lost' : '분실물', icon: 'search-outline' as const, badge: keptLostCount },
        ]).map(tab => (
          <TouchableOpacity key={tab.id} onPress={() => setSubTab(tab.id)} style={styles.tabBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={tab.icon} size={14} color={subTab === tab.id ? '#047857' : '#6b7280'} />
              <Text style={[styles.tabText, subTab === tab.id && styles.tabTextActive]}>{tab.title}</Text>
              {!!tab.badge && <View style={styles.badge}><Text style={styles.badgeText}>{tab.badge}</Text></View>}
            </View>
            {subTab === tab.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'stock' ? (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
          {openRequests.length > 0 && (
            <TouchableOpacity onPress={() => setSubTab('request')} style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e40af' }}>📝 {openRequests.map(r => r.title).join(', ')} 진행 중</Text>
              <Text style={{ fontSize: 10, color: '#1d4ed8', marginTop: 2 }}>필요한 물품과 수량을 재고 요청 탭에서 입력해주세요 →</Text>
            </TouchableOpacity>
          )}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={15} color="#9ca3af" />
            <TextInput value={search} onChangeText={setSearch} placeholder="품목명 · 종류 · 규격 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(['전체', ...INVENTORY_CATEGORIES] as const).map(c => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {groups.length === 0 && (
            <View style={styles.notice}><Text style={styles.noticeText}>이 캠프에 재고 그룹이 아직 없습니다. 관리자가 웹 재고 탭 › 관리에서 그룹(패키지)을 적용하면 수량이 표시됩니다.</Text></View>
          )}

          {views.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>등록된 품목이 없습니다.</Text>
              <Text style={styles.emptyBody}>관리자가 웹 재고 탭 › 관리에서 품목을 등록하면 여기에 표시됩니다.</Text>
            </View>
          ) : filtered.length === 0 ? (
            <Text style={[styles.emptyBody, { textAlign: 'center', paddingVertical: 30 }]}>검색 결과가 없습니다.</Text>
          ) : (
            sections.map(([title, list]) => (
              <View key={title}>
                <Text style={styles.sectionTitle}>{title} <Text style={{ color: '#d1d5db', fontWeight: '400' }}>{list.length}</Text></Text>
                <View style={{ gap: 6 }}>
                  {list.map(v => {
                    const isShort = shortItems.has(v.id);
                    return (
                      <TouchableOpacity key={v.id} onPress={() => setSelectedId(v.id)} style={[styles.card, isShort && { borderColor: '#fecaca' }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <Text style={styles.itemName}>{v.name}</Text>
                            {v.kind ? <Text style={styles.itemMeta}>{v.kind}</Text> : null}
                            {v.spec ? <Text style={[styles.itemMeta, { color: '#9ca3af' }]}>{v.spec}</Text> : null}
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {groups.map(g => {
                              const n = getGroupStock(v, g.id);
                              const min = getMinStock(v, g.id);
                              const low = n < 0 || (min > 0 && n < min);
                              return (
                                <View key={g.id} style={[styles.groupChip, low ? styles.groupChipLow : n === 0 ? styles.groupChipEmpty : null]}>
                                  <Text style={[styles.groupChipText, low && { color: '#b91c1c', fontWeight: '700' }, n === 0 && !low && { color: '#d1d5db' }]}>{g.name} {n}{n < 0 ? ' · 실사 필요' : ''}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.total, isShort && { color: '#dc2626' }]}>{v.total}<Text style={styles.totalUnit}>{v.unit}</Text></Text>
                          <Text style={styles.totalLabel}>총 재고</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      ) : subTab === 'request' ? (
        <RequestListMobile requests={requests} items={items} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      ) : subTab === 'lost' ? (
        <LostListMobile campCode={campCode} jobCodeId={activeJobCodeId ?? ''} students={students} campGroups={campGroups} lostItems={lostItems} isAdmin={isAdmin} userId={userData?.userId ?? ''} userName={userName} />
      ) : (
        <PurchaseListMobile needs={needs} groups={groups} onSelect={setSelectedId} />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelectedId(null)}>
        {selected && (
          <ItemDetailMobile view={selected} groups={groups} campCode={campCode} isAdmin={isAdmin} userName={userName} onClose={() => setSelectedId(null)} />
        )}
      </Modal>
    </View>
  );
}

// ==================== 구매 필요 ====================

function PurchaseListMobile({ needs, groups, onSelect }: { needs: PurchaseNeed[]; groups: InventoryGroup[]; onSelect: (id: string) => void }) {
  const byItem = useMemo(() => {
    const map = new Map<string, PurchaseNeed[]>();
    needs.forEach(n => { if (!map.has(n.itemId)) map.set(n.itemId, []); map.get(n.itemId)!.push(n); });
    return [...map.entries()];
  }, [needs]);
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>구매 필요 <Text style={{ color: '#dc2626' }}>{needs.length}</Text></Text>
      <Text style={{ fontSize: 10, color: '#9ca3af' }}>그룹별 현재 수량이 최소 보유 수량보다 적은 항목 (전체가 충분해도 표시)</Text>
      {groups.length === 0 ? (
        <Text style={styles.emptyBody}>재고 그룹이 없어 계산할 수 없습니다.</Text>
      ) : needs.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cart-outline" size={36} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>모든 그룹의 재고가 최소 수량 이상입니다.</Text>
        </View>
      ) : byItem.map(([itemId, list]) => (
        <TouchableOpacity key={itemId} onPress={() => onSelect(itemId)} style={[styles.card, { borderColor: '#fecaca', flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={styles.itemName}>{list[0].itemName}</Text>
          {list.map(n => (
            <Text key={n.groupId} style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
              <Text style={{ fontWeight: '700', color: '#b91c1c' }}>{n.groupName}</Text> · 현재 {n.current}{n.unit} / 최소 {n.min}{n.unit} → <Text style={{ fontWeight: '700', color: '#dc2626' }}>부족 {n.shortage}{n.unit}</Text>
            </Text>
          ))}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ==================== 재고 요청 (내 요청 입력) ====================

function RequestListMobile({ requests, items, isAdmin, userId, userName }: {
  requests: InventoryRequest[]; items: InventoryItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = requests.find(r => r.id === openId) ?? null;
  if (opened) return <RequestDetailMobile request={opened} items={items} isAdmin={isAdmin} userId={userId} userName={userName} onBack={() => setOpenId(null)} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>재고 요청</Text>
      <Text style={{ fontSize: 10, color: '#9ca3af' }}>관리자가 만든 요청에 각자 필요한 물품과 수량을 입력합니다. 요청 만들기·취합·구매 목록 추가는 웹에서 합니다.</Text>
      {requests.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="clipboard-outline" size={36} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>진행 중인 재고 요청이 없습니다.</Text>
        </View>
      ) : requests.map(r => (
        <TouchableOpacity key={r.id} onPress={() => setOpenId(r.id)} style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', borderColor: r.status === 'open' ? '#bfdbfe' : '#e5e7eb', opacity: r.status === 'open' ? 1 : 0.7 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: r.status === 'open' ? '#dbeafe' : '#f3f4f6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: r.status === 'open' ? '#1d4ed8' : '#6b7280' }}>{r.status === 'open' ? '진행 중' : '마감'}</Text>
            </View>
            <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>{r.title}</Text>
            {r.dueDate ? <Text style={{ fontSize: 10, color: '#9ca3af' }}>~{r.dueDate}</Text> : null}
          </View>
          {r.note ? <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{r.note}</Text> : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function RequestDetailMobile({ request, items, isAdmin, userId, userName, onBack }: {
  request: InventoryRequest; items: InventoryItem[]; isAdmin: boolean; userId: string; userName: string; onBack: () => void;
}) {
  const [entries, setEntries] = useState<InventoryRequestEntry[]>([]);
  useEffect(() => subscribeInventoryRequestEntries(db, request.id, setEntries), [request.id]);
  const mine = entries.find(e => e.userId === userId);
  const isOpen = request.status === 'open';

  const [lines, setLines] = useState<InventoryRequestLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  useEffect(() => { if (!dirty) setLines(mine?.items ?? []); }, [mine, dirty]);

  const newLine = (): InventoryRequestLine => ({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: '', quantity: 1, unit: '개' });
  const update = (id: string, patch: Partial<InventoryRequestLine>) => { setDirty(true); setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l)); };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveInventoryRequestEntry(db, { requestId: request.id, campCode: request.campCode, userId, userName, items: lines });
      setDirty(false);
      Alert.alert('저장됨', '내 요청을 저장했습니다.');
    } catch (e) { console.error('요청 저장 오류:', e); Alert.alert('오류', '저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };
  const summary = useMemo(() => summarizeRequestEntries(entries), [entries]);
  const pickerItems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return items.filter(i => i.isActive !== false && (!q || i.name.toLowerCase().includes(q) || i.kind?.toLowerCase().includes(q))).slice(0, 12);
  }, [items, pickerQuery]);
  const UNITS = ['개', '박스', '통', '팩', '병', '정', '세트'];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <TouchableOpacity onPress={onBack}><Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>← 목록</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{request.title} <Text style={{ fontSize: 10, fontWeight: '600', color: isOpen ? '#1d4ed8' : '#6b7280' }}>{isOpen ? '진행 중' : '마감'}</Text></Text>
            {request.note ? <Text style={{ fontSize: 11, color: '#6b7280' }}>{request.note}</Text> : null}
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{request.dueDate ? `~${request.dueDate} · ` : ''}{entries.length}명 입력</Text>
          </View>
        </View>

        {/* 내 요청 */}
        <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>내 요청 <Text style={{ color: '#9ca3af', fontWeight: '400' }}>({userName})</Text></Text>
            {isOpen && (
              <TouchableOpacity onPress={() => { setDirty(true); const l = newLine(); setLines(ls => [...ls, l]); setPickerFor(l.id); setPickerQuery(''); }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>+ 항목 추가</Text>
              </TouchableOpacity>
            )}
          </View>
          {lines.length === 0 && <Text style={styles.emptyBody}>{isOpen ? '필요한 물품을 추가해주세요.' : '입력한 항목이 없습니다.'}</Text>}
          {lines.map(l => (
            <View key={l.id} style={{ borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 8, padding: 8, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity disabled={!isOpen} onPress={() => { setPickerFor(pickerFor === l.id ? null : l.id); setPickerQuery(l.name); }} style={[styles.input, { flex: 1, justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 12, color: l.name ? '#111827' : '#9ca3af' }}>{l.name || '품목 선택 / 입력'}</Text>
                </TouchableOpacity>
                {isOpen && <TouchableOpacity onPress={() => { setDirty(true); setLines(ls => ls.filter(x => x.id !== l.id)); }}><Text style={{ fontSize: 12 }}>🗑️</Text></TouchableOpacity>}
              </View>
              {pickerFor === l.id && isOpen && (
                <View style={{ gap: 6 }}>
                  <TextInput value={pickerQuery} onChangeText={v => { setPickerQuery(v); update(l.id, { name: v, itemId: undefined }); }} placeholder="품목명 검색 또는 직접 입력" placeholderTextColor="#9ca3af" autoFocus style={styles.input} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {pickerItems.map(i => (
                      <TouchableOpacity key={i.id} onPress={() => { update(l.id, { name: itemLabel(i), itemId: i.id, unit: i.unit }); setPickerFor(null); }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: l.itemId === i.id ? '#059669' : '#f3f4f6' }}>
                        <Text style={{ fontSize: 11, color: l.itemId === i.id ? '#fff' : '#374151' }}>{itemLabel(i)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity disabled={!isOpen} onPress={() => update(l.id, { quantity: Math.max(1, l.quantity - 1) })} style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14 }}>−</Text></TouchableOpacity>
                <Text style={{ minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: '700' }}>{l.quantity}</Text>
                <TouchableOpacity disabled={!isOpen} onPress={() => update(l.id, { quantity: l.quantity + 1 })} style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14 }}>+</Text></TouchableOpacity>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ flex: 1 }}>
                  {[...new Set([l.unit, ...UNITS])].map(u => (
                    <TouchableOpacity key={u} disabled={!isOpen} onPress={() => update(l.id, { unit: u })} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: l.unit === u ? '#fef3c7' : '#f3f4f6', borderWidth: 1, borderColor: l.unit === u ? '#f59e0b' : '#f3f4f6' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: l.unit === u ? '#92400e' : '#6b7280' }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <TextInput value={l.memo ?? ''} onChangeText={v => update(l.id, { memo: v || undefined })} editable={isOpen} placeholder="메모 (선택)" placeholderTextColor="#9ca3af" style={[styles.input, { paddingVertical: 5, fontSize: 11 }]} />
            </View>
          ))}
          {isOpen && (
            <TouchableOpacity onPress={save} disabled={!dirty || saving} style={[styles.btn, { backgroundColor: '#059669', opacity: !dirty || saving ? 0.4 : 1 }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{saving ? '저장 중...' : '내 요청 저장'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 취합 (관리자, 읽기 전용) */}
        {isAdmin && (
          <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>취합 결과 <Text style={{ color: '#9ca3af', fontWeight: '400' }}>(구매 목록 추가는 웹에서)</Text></Text>
            {summary.length === 0 ? <Text style={styles.emptyBody}>아직 입력된 요청이 없습니다.</Text> : summary.map(s => (
              <View key={s.key} style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#111827' }}>{s.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#b45309' }}>총 {s.total}{s.unit}</Text>
                </View>
                <Text style={{ fontSize: 10, color: '#6b7280' }}>{s.requesters.map(r => `${r.userName} ${r.quantity}${s.unit}${r.memo ? `(${r.memo})` : ''}`).join(' · ')}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ==================== 분실물 (모바일) ====================

const LOST_STATUS_COLOR: Record<LostItemStatus, { bg: string; text: string }> = {
  found: { bg: '#dbeafe', text: '#1d4ed8' },
  claimed: { bg: '#d1fae5', text: '#047857' },
  discarded: { bg: '#f3f4f6', text: '#6b7280' },
};

type PickedMedia = { uri: string; type: 'image' | 'video'; mimeType?: string; fileName?: string; fileSize?: number };

/** 갤러리에서 사진·영상 여러 개 선택 */
async function pickLostMedia(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('권한 필요', '사진 접근 권한을 허용해주세요.'); return []; }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
  if (result.canceled) return [];
  return result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined }));
}

/** 카메라로 촬영 (사진) */
async function captureLostPhoto(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) { Alert.alert('권한 필요', '카메라 권한을 허용해주세요.'); return []; }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
  if (result.canceled) return [];
  return result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined }));
}

async function uploadLostMediaMobile(campCode: string, lostItemId: string, picked: PickedMedia[]): Promise<LostItemMedia[]> {
  const out: LostItemMedia[] = [];
  for (const m of picked) {
    const blob = await uriToBlob(m.uri);
    const ext = m.fileName?.split('.').pop() || (m.type === 'video' ? 'mp4' : 'jpg');
    const path = lostItemMediaPath(campCode, lostItemId, m.fileName || `${m.type}.${ext}`);
    const r = storageRef(storage, path);
    const contentType = m.mimeType || blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg');
    await uploadBytes(r, blob, { contentType });
    const url = await getDownloadURL(r);
    out.push({ url, path, type: m.type, name: m.fileName, size: m.fileSize ?? blob.size });
  }
  return out;
}

function MediaPickerMobile({ picked, onChange, disabled }: { picked: PickedMedia[]; onChange: (p: PickedMedia[]) => void; disabled?: boolean }) {
  const tooBig = picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TouchableOpacity disabled={disabled} onPress={async () => onChange([...picked, ...(await pickLostMedia())])} style={[styles.mediaBtn, disabled && { opacity: 0.5 }]}>
          <Ionicons name="images-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>사진·영상 선택</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={disabled} onPress={async () => onChange([...picked, ...(await captureLostPhoto())])} style={[styles.mediaBtn, disabled && { opacity: 0.5 }]}>
          <Ionicons name="camera-outline" size={16} color="#1d4ed8" /><Text style={styles.mediaBtnText}>촬영</Text>
        </TouchableOpacity>
      </View>
      {picked.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {picked.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={styles.thumb}>
              {p.type === 'video'
                ? <View style={[styles.thumbFill, { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="videocam" size={22} color="#fff" /></View>
                : <Image source={{ uri: p.uri }} style={styles.thumbFill} contentFit="cover" />}
              {!disabled && (
                <TouchableOpacity onPress={() => onChange(picked.filter((_, j) => j !== i))} style={styles.thumbRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 10, color: tooBig ? '#dc2626' : '#9ca3af' }}>{tooBig ? '50MB를 넘는 파일이 있습니다.' : '사진·영상 각 50MB 이하, 여러 개 첨부 가능'}</Text>
    </View>
  );
}

function LostListMobile({ campCode, jobCodeId, students, campGroups, lostItems, isAdmin, userId, userName }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  lostItems: LostItem[]; isAdmin: boolean; userId: string; userName: string;
}) {
  const [filter, setFilter] = useState<LostItemStatus | '전체'>('found');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = lostItems.find(l => l.id === openId) ?? null;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lostItems.filter(l => (filter === '전체' || l.status === filter) &&
      (!q || [l.name, l.description, l.foundPlace, l.keptAt, l.claimedBy, l.reportedBy].some(f => f?.toLowerCase().includes(q))));
  }, [lostItems, filter, search]);
  const count = (s: LostItemStatus) => lostItems.filter(l => l.status === s).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>분실물 <Text style={{ color: '#2563eb' }}>{count('found')}</Text> <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '400' }}>보관 중</Text></Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>누구나 등록·확인 · 주인을 찾으면 상태를 바꿔주세요</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Ionicons name="add" size={14} color="#fff" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>등록</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput value={search} onChangeText={setSearch} placeholder="물품명 · 장소 · 학생 이름 검색" placeholderTextColor="#9ca3af" style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {([['found', `보관 중 ${count('found')}`], ['claimed', `주인 찾음 ${count('claimed')}`], ['discarded', `폐기 ${count('discarded')}`], ['전체', '전체']] as const).map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setFilter(id)} style={[styles.chip, filter === id && { backgroundColor: '#2563eb', borderColor: '#2563eb' }]}>
              <Text style={[styles.chipText, filter === id && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {list.length === 0 ? (
          <View style={styles.centered}><Ionicons name="search-outline" size={36} color="#cbd5e1" /><Text style={styles.emptyTitle}>{lostItems.length === 0 ? '등록된 분실물이 없습니다.' : '해당하는 분실물이 없습니다.'}</Text></View>
        ) : list.map(l => {
          const thumb = l.media.find(m => m.type === 'image');
          const c = LOST_STATUS_COLOR[l.status];
          return (
            <TouchableOpacity key={l.id} onPress={() => setOpenId(l.id)} style={[styles.card, { padding: 0, overflow: 'hidden', alignItems: 'stretch', borderColor: l.status === 'found' ? '#bfdbfe' : '#e5e7eb', opacity: l.status === 'found' ? 1 : 0.8 }]}>
              <View style={{ width: 84, height: 84, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                {thumb ? <Image source={{ uri: thumb.url }} style={{ width: 84, height: 84 }} contentFit="cover" />
                  : l.media.length > 0 ? <Ionicons name="videocam" size={24} color="#9ca3af" /> : <Ionicons name="image-outline" size={24} color="#d1d5db" />}
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{LOST_ITEM_STATUS_LABELS[l.status]}</Text></View>
                  <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>{l.name}{l.ownerName ? <Text style={{ fontSize: 10, color: '#e11d48', fontWeight: '600' }}>  🏷️ {l.ownerName}</Text> : null}</Text>
                  {l.media.length > 1 && <Text style={{ fontSize: 9, color: '#9ca3af' }}>+{l.media.length - 1}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }} numberOfLines={1}>📍 {l.foundPlace || '장소 미상'} · {l.foundDate}</Text>
                <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{l.keptAt ? `보관: ${l.keptAt} · ` : ''}등록 {l.reportedBy}{l.status === 'claimed' && l.claimedBy ? ` · → ${l.claimedBy}` : ''}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <LostItemFormMobile campCode={campCode} jobCodeId={jobCodeId} students={students} campGroups={campGroups} userId={userId} userName={userName} onClose={() => setShowForm(false)} onCreated={id => { setShowForm(false); setOpenId(id); }} />
      </Modal>
      <Modal visible={!!opened} animationType="slide" transparent onRequestClose={() => setOpenId(null)}>
        {opened && <LostItemDetailMobile item={opened} isAdmin={isAdmin} userId={userId} userName={userName} onClose={() => setOpenId(null)} />}
      </Modal>
    </View>
  );
}

function LostItemFormMobile({ campCode, jobCodeId, students, campGroups, userId, userName, onClose, onCreated }: {
  campCode: string; jobCodeId: string; students: STSheetStudent[]; campGroups: CampGroup[];
  userId: string; userName: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  // 이름표(주인)가 있으면 담임·방 담당·그룹 매니저에게, 없으면 캠프 전체에 알림 — 끌 수 있음
  const [owner, setOwner] = useState<STSheetStudent | null>(null);
  const [ownerQuery, setOwnerQuery] = useState('');
  const [notify, setNotify] = useState(true);
  const ownerResults = useMemo(() => {
    const q = ownerQuery.trim();
    return q ? students.filter(s => s.name.includes(q)).slice(0, 6) : [];
  }, [ownerQuery, students]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [foundPlace, setFoundPlace] = useState('');
  const [foundDate, setFoundDate] = useState(todayStr());
  const [keptAt, setKeptAt] = useState('');
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const tooBig = picked.some(p => (p.fileSize ?? 0) > 50 * 1024 * 1024);

  const submit = async () => {
    if (!name.trim() || busy || tooBig) return;
    setBusy(true);
    try {
      setProgress('등록 중...');
      const ownerGroup = owner?.className ? findGroupByClassCode(campGroups, owner.className)?.name.toLowerCase() : undefined;
      const id = await addLostItem(db, {
        campCode, name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined,
        foundDate, keptAt: keptAt.trim() || undefined, reportedBy: userName, reportedById: userId,
        jobCodeId: jobCodeId || undefined, notify,
        ownerStudentId: owner?.studentId, ownerName: owner?.name, ownerClassCode: owner?.className,
        ownerClassMentor: owner?.classMentor, ownerUnitMentor: owner?.unitMentor, ownerGroup,
      });
      if (picked.length) {
        setProgress(`사진·영상 ${picked.length}개 업로드 중...`);
        const media = await uploadLostMediaMobile(campCode, id, picked);
        await addLostItemMedia(db, id, media);
      }
      if (notify) authenticatedFetch('/api/inventory/notify-lost', { method: 'POST', body: JSON.stringify({ lostItemId: id }) }).catch(e => console.warn('분실물 알림 요청 실패:', e));
      onCreated(id);
    } catch (e) { console.error('분실물 등록 오류:', e); Alert.alert('오류', '등록 중 오류가 발생했습니다.'); }
    finally { setBusy(false); setProgress(''); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { flex: 1 }]}>🔍 분실물 등록</Text>
          <TouchableOpacity onPress={onClose} disabled={busy} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          <View><Text style={styles.label}>물품명 *</Text><TextInput value={name} onChangeText={setName} placeholder="예: 파란색 물통, 안경, 후드집업" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={styles.label}>발견 장소</Text><TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder="예: 강당, 3층 복도" placeholderTextColor="#9ca3af" style={styles.input} /></View>
            <View style={{ width: 120 }}><Text style={styles.label}>발견일</Text><TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          </View>
          <View><Text style={styles.label}>보관 장소</Text><TextInput value={keptAt} onChangeText={setKeptAt} placeholder="예: 2층 교무실 분실물 박스" placeholderTextColor="#9ca3af" style={styles.input} /></View>
          <View><Text style={styles.label}>설명 (특징, 이름표 여부 등)</Text><TextInput value={description} onChangeText={setDescription} multiline placeholder="예: 뚜껑에 스티커 붙어 있음, 이름 없음" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} /></View>
          <View>
            <Text style={styles.label}>🏷️ 이름표 (주인을 아는 경우)</Text>
            {owner ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#fecdd3', backgroundColor: '#fff1f2', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#9f1239' }}>{owner.name}</Text>
                <Text style={{ flex: 1, fontSize: 10, color: '#be123c' }} numberOfLines={1}>{[owner.className, owner.classMentor && `담임 ${owner.classMentor}`, owner.unitMentor && `방 ${owner.unitMentor}`].filter(Boolean).join(' · ')}</Text>
                <TouchableOpacity onPress={() => setOwner(null)}><Text style={{ color: '#fb7185' }}>✕</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                <TextInput value={ownerQuery} onChangeText={setOwnerQuery} placeholder="학생 이름 검색 (모르면 비워두세요)" placeholderTextColor="#9ca3af" style={styles.input} />
                {ownerResults.map(s => (
                  <TouchableOpacity key={s.studentId} onPress={() => { setOwner(s); setOwnerQuery(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                    <Text style={{ fontSize: 12, color: '#111827' }}>{s.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{s.className}{s.classMentor ? ` · 담임 ${s.classMentor}` : ''}</Text></Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => setNotify(v => !v)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}>
            <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={18} color={notify ? '#2563eb' : '#9ca3af'} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>푸시 알림 보내기</Text>
              <Text style={{ fontSize: 10, color: '#9ca3af' }}>{owner ? '담임 · 방 담당 · 그룹 매니저에게 보냅니다' : '캠프 선생님 전체에게 보냅니다 — 중요하지 않은 물품이면 끄세요'}</Text>
            </View>
          </TouchableOpacity>
          {progress ? <Text style={{ fontSize: 11, color: '#2563eb', textAlign: 'center' }}>{progress}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || busy || tooBig} style={[styles.btn, { backgroundColor: '#2563eb', opacity: !name.trim() || busy || tooBig ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '등록 중...' : '등록'}</Text></TouchableOpacity>
          </View>
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function LostItemDetailMobile({ item, isAdmin, userId, userName, onClose }: {
  item: LostItem; isAdmin: boolean; userId: string; userName: string; onClose: () => void;
}) {
  const canDelete = isAdmin || item.reportedById === userId;
  const [claimName, setClaimName] = useState(item.claimedBy ?? item.ownerName ?? '');
  const [claiming, setClaiming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [foundPlace, setFoundPlace] = useState(item.foundPlace ?? '');
  const [foundDate, setFoundDate] = useState(item.foundDate);
  const [keptAt, setKeptAt] = useState(item.keptAt ?? '');
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<LostItemMedia | null>(null);
  const c = LOST_STATUS_COLOR[item.status];
  const screenW = Dimensions.get('window').width;
  const tile = Math.floor((screenW - 28 - 12) / 3);

  const saveEdit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await updateLostItem(db, item.id, { name: name.trim(), description: description.trim() || undefined, foundPlace: foundPlace.trim() || undefined, foundDate, keptAt: keptAt.trim() || undefined }); setEditing(false); }
    finally { setBusy(false); }
  };
  const uploadMore = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try { const media = await uploadLostMediaMobile(item.campCode, item.id, picked); await addLostItemMedia(db, item.id, media); setPicked([]); }
    catch (e) { console.error('첨부 추가 오류:', e); Alert.alert('오류', '업로드 중 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };
  const removeMedia = (m: LostItemMedia) => {
    Alert.alert('첨부 삭제', '이 첨부를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { try { await deleteObject(storageRef(storage, m.path)); } catch { /* 없으면 무시 */ } await removeLostItemMedia(db, item.id, item.media, m.path); } },
    ]);
  };
  const setStatus = async (status: LostItemStatus) => {
    if (busy) return;
    if (status === 'claimed' && !claimName.trim()) { setClaiming(true); return; }
    setBusy(true);
    try { await setLostItemStatus(db, item.id, status, userName, claimName); setClaiming(false); }
    finally { setBusy(false); }
  };
  const remove = () => {
    Alert.alert('기록 삭제', '이 분실물 기록과 첨부를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await Promise.all(item.media.map(m => deleteObject(storageRef(storage, m.path)).catch(() => undefined))); await deleteLostItem(db, item.id); onClose(); }
        finally { setBusy(false); }
      } },
    ]);
  };
  const openMedia = (m: LostItemMedia) => { if (m.type === 'video') Linking.openURL(m.url); else setViewer(m); };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: c.text }}>{LOST_ITEM_STATUS_LABELS[item.status]}</Text></View>
              <Text style={styles.modalTitle} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>등록 {item.reportedBy} · {fmtDateTime(item.createdAt)}{item.status !== 'found' && item.claimedHandler ? ` · 처리 ${item.claimedHandler}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          {item.media.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {item.media.map(m => (
                <View key={m.path} style={{ width: tile, height: tile, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                  <TouchableOpacity onPress={() => openMedia(m)} style={{ flex: 1 }}>
                    {m.type === 'video'
                      ? <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', gap: 2 }}><Ionicons name="play-circle" size={28} color="#fff" /><Text style={{ fontSize: 9, color: '#fff' }}>영상 열기</Text></View>
                      : <Image source={{ uri: m.url }} style={{ flex: 1 }} contentFit="cover" />}
                  </TouchableOpacity>
                  {canDelete && <TouchableOpacity onPress={() => removeMedia(m)} style={styles.thumbRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></TouchableOpacity>}
                </View>
              ))}
            </View>
          )}
          <MediaPickerMobile picked={picked} onChange={setPicked} disabled={busy} />
          {picked.length > 0 && (
            <TouchableOpacity onPress={uploadMore} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb', opacity: busy ? 0.4 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '업로드 중...' : `${picked.length}개 첨부 업로드`}</Text></TouchableOpacity>
          )}

          {editing ? (
            <View style={{ gap: 8 }}>
              <TextInput value={name} onChangeText={setName} placeholder="물품명" placeholderTextColor="#9ca3af" style={styles.input} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={foundPlace} onChangeText={setFoundPlace} placeholder="발견 장소" placeholderTextColor="#9ca3af" style={[styles.input, { flex: 1 }]} />
                <TextInput value={foundDate} onChangeText={setFoundDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" style={[styles.input, { width: 120 }]} />
              </View>
              <TextInput value={keptAt} onChangeText={setKeptAt} placeholder="보관 장소" placeholderTextColor="#9ca3af" style={styles.input} />
              <TextInput value={description} onChangeText={setDescription} multiline placeholder="설명" placeholderTextColor="#9ca3af" style={[styles.input, { minHeight: 56 }]} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setEditing(false)} style={[styles.btn, { backgroundColor: '#f3f4f6' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} disabled={busy} style={[styles.btn, { backgroundColor: '#2563eb' }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>저장</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', padding: 10, gap: 4 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>📍 발견 장소: <Text style={{ fontWeight: '700' }}>{item.foundPlace || '—'}</Text> · 발견일 <Text style={{ fontWeight: '700' }}>{item.foundDate}</Text></Text>
              <Text style={{ fontSize: 12, color: '#374151' }}>📦 보관 장소: <Text style={{ fontWeight: '700' }}>{item.keptAt || '—'}</Text></Text>
              {item.description ? <Text style={{ fontSize: 12, color: '#4b5563' }}>📝 {item.description}</Text> : null}
              {item.ownerName ? <Text style={{ fontSize: 12, color: '#be123c' }}>🏷️ 이름표: <Text style={{ fontWeight: '700' }}>{item.ownerName}</Text>{item.ownerClassCode ? ` (${item.ownerClassCode})` : ''}</Text> : null}
              {item.status === 'claimed' ? <Text style={{ fontSize: 12, color: '#047857' }}>✅ {item.claimedBy || '주인'}에게 돌려줌</Text> : null}
              <TouchableOpacity onPress={() => setEditing(true)}><Text style={{ fontSize: 11, color: '#2563eb' }}>정보 수정</Text></TouchableOpacity>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>상태 변경</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {LOST_ITEM_STATUSES.map(s => {
                const on = item.status === s; const sc = LOST_STATUS_COLOR[s];
                return (
                  <TouchableOpacity key={s} onPress={() => setStatus(s)} disabled={busy} style={[styles.btn, { backgroundColor: on ? sc.bg : '#fff', borderWidth: 1, borderColor: on ? sc.bg : '#e5e7eb' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? sc.text : '#6b7280' }}>{LOST_ITEM_STATUS_LABELS[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(claiming || item.status === 'claimed') && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={claimName} onChangeText={setClaimName} placeholder="돌려준 학생(사람) 이름" placeholderTextColor="#9ca3af" autoFocus={claiming} style={[styles.input, { flex: 1 }]} />
                <TouchableOpacity onPress={() => setStatus('claimed')} disabled={busy || !claimName.trim()} style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, opacity: busy || !claimName.trim() ? 0.4 : 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{item.status === 'claimed' ? '이름 저장' : '주인 찾음 처리'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {canDelete && <TouchableOpacity onPress={remove} disabled={busy} style={{ alignItems: 'center', paddingVertical: 8 }}><Text style={{ fontSize: 11, color: '#ef4444' }}>기록 삭제</Text></TouchableOpacity>}
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer.url }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          <TouchableOpacity onPress={() => setViewer(null)} style={{ position: 'absolute', top: 50, right: 20, padding: 8 }}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==================== 품목 상세 ====================

function ItemDetailMobile({ view, groups, campCode, isAdmin, userName, onClose }: {
  view: InventoryItemView; groups: InventoryGroup[]; campCode: string; isAdmin: boolean; userName: string; onClose: () => void;
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => subscribeInventoryMovements(db, campCode, view.id, setMovements), [campCode, view.id]);

  const [mode, setMode] = useState<{ type: 'restock' | 'adjust' | 'min'; groupId: string } | null>(null);
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const group = groups.find(g => g.id === mode?.groupId);
  const current = mode ? getGroupStock(view, mode.groupId) : 0;

  const submit = async () => {
    if (!mode || !group || busy) return;
    const n = parseInt(qty, 10);
    if (mode.type !== 'min' && (isNaN(n) || n < 0)) return;
    setBusy(true);
    try {
      const base = { itemId: view.id, itemName: view.name, groupId: group.id, groupName: group.name };
      if (mode.type === 'restock') {
        if (!(n > 0)) return;
        await restock(db, campCode, { ...base, quantity: n, memo: memo.trim() || undefined }, userName);
      } else if (mode.type === 'adjust') {
        if (!memo.trim()) { Alert.alert('입력 필요', '조정 사유를 입력해주세요.'); return; }
        await adjustStockTo(db, campCode, { ...base, current, target: n, reason: memo.trim() }, userName);
      } else {
        await setGroupMinStock(db, campCode, view.id, group.id, qty === '' ? null : Math.max(0, n || 0));
      }
      setMode(null); setQty(''); setMemo('');
    } catch (e) {
      console.error('재고 처리 오류:', e);
      Alert.alert('오류', '처리 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>{view.category}{view.subCategory ? ` · ${view.subCategory}` : ''}{view.kind ? ` · ${view.kind}` : ''}</Text>
            <Text style={styles.modalTitle}>{view.name} {view.spec ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#9ca3af' }}>{view.spec}</Text> : null}</Text>
            {view.description ? <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>ℹ️ {view.description}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#047857', lineHeight: 26 }}>{view.total}<Text style={{ fontSize: 11, color: '#9ca3af' }}>{view.unit}</Text></Text>
            <Text style={{ fontSize: 9, color: '#9ca3af' }}>전체 재고</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* 그룹별 수량 */}
          <View>
            <Text style={styles.sectionTitle}>그룹별 수량</Text>
            {groups.length === 0 ? <Text style={styles.emptyBody}>재고 그룹이 없습니다.</Text> : (
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                {groups.map((g, i) => {
                  const n = getGroupStock(view, g.id);
                  const min = getMinStock(view, g.id);
                  const low = min > 0 && n < min;
                  return (
                    <View key={g.id} style={{ paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6', gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{g.name} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{g.location ?? ''}</Text></Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: low ? '#dc2626' : '#1f2937' }}>{n}<Text style={{ fontSize: 10, color: '#9ca3af' }}>{view.unit}</Text></Text>
                        <Text style={{ fontSize: 10, color: '#9ca3af' }}>최소 {min}</Text>
                        {low ? <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>구매 필요 −{min - n}</Text>
                          : <Text style={{ fontSize: 9, color: '#9ca3af' }}>충분</Text>}
                      </View>
                      {isAdmin && (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity onPress={() => { setMode({ type: 'restock', groupId: g.id }); setQty(''); setMemo(''); }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>+입고</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setMode({ type: 'adjust', groupId: g.id }); setQty(String(n)); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>조정</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setMode({ type: 'min', groupId: g.id }); setQty(view.minStocks?.[g.id] != null ? String(view.minStocks[g.id]) : ''); setMemo(''); }}><Text style={{ fontSize: 11, color: '#6b7280' }}>최소</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {mode && group && (
            <View style={{ borderRadius: 10, borderWidth: 1, padding: 10, gap: 8, borderColor: mode.type === 'restock' ? '#a7f3d0' : '#fde68a', backgroundColor: mode.type === 'restock' ? '#ecfdf5' : '#fffbeb' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>
                {mode.type === 'restock' ? '📥 재고 입고' : mode.type === 'adjust' ? '✏️ 수량 직접 조정' : '📏 최소 보유 수량'} · {group.name} <Text style={{ fontWeight: '400', color: '#6b7280' }}>현재 {current}{view.unit}</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" autoFocus
                  placeholder={mode.type === 'restock' ? '입고 수량' : mode.type === 'adjust' ? '조정 후 수량' : `비우면 기본값(${view.minStockDefault ?? 0})`} placeholderTextColor="#9ca3af"
                  style={[styles.input, { width: 130 }]} />
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{view.unit}</Text>
                {mode.type === 'restock' && qty ? <Text style={{ fontSize: 11, color: '#047857' }}>→ {current + (parseInt(qty, 10) || 0)}</Text> : null}
                {mode.type === 'adjust' && qty ? <Text style={{ fontSize: 11, color: '#b45309' }}>차이 {(parseInt(qty, 10) || 0) - current > 0 ? '+' : ''}{(parseInt(qty, 10) || 0) - current}</Text> : null}
              </View>
              {mode.type !== 'min' && (
                <TextInput value={memo} onChangeText={setMemo} placeholder={mode.type === 'restock' ? '메모 (선택)' : '조정 사유 (필수)'} placeholderTextColor="#9ca3af" style={styles.input} />
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setMode(null)} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }]}><Text style={{ fontSize: 12, color: '#6b7280' }}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: '#059669', opacity: busy ? 0.5 : 1 }]}><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{busy ? '처리 중...' : '저장'}</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {/* 변동 내역 */}
          <View>
            <Text style={styles.sectionTitle}>변동 내역 <Text style={{ color: '#9ca3af', fontWeight: '400' }}>({movements.length}건)</Text></Text>
            {movements.length === 0 ? <Text style={styles.emptyBody}>이 캠프에서 아직 변동이 없습니다.</Text> : (
              <View style={{ gap: 4 }}>
                {movements.map(m => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 10, color: '#9ca3af', width: 66 }}>{fmtDateTime(m.at)}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: '#374151' }}>
                      <Text style={{ fontWeight: '700', color: '#1f2937' }}>{m.refLabel || INVENTORY_MOVEMENT_LABELS[m.reason]}</Text>
                      <Text style={{ color: '#9ca3af' }}> · {m.groupName}</Text>{m.memo ? <Text style={{ color: '#6b7280' }}> · {m.memo}</Text> : null}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>{m.by}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right', color: m.delta > 0 ? '#047857' : '#dc2626' }}>{m.delta > 0 ? '+' : ''}{m.delta}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyBody: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', position: 'relative' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#047857' },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#059669' },
  badge: { minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', padding: 0 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#4b5563' },
  chipTextActive: { color: '#fff' },
  notice: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10 },
  noticeText: { fontSize: 11, color: '#92400e', lineHeight: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 10, color: '#6b7280' },
  groupChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#f9fafb' },
  groupChipLow: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  groupChipEmpty: { backgroundColor: '#fff' },
  groupChipText: { fontSize: 10, color: '#374151' },
  total: { fontSize: 18, fontWeight: '800', color: '#047857', lineHeight: 22 },
  totalUnit: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },
  totalLabel: { fontSize: 9, color: '#9ca3af' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: '#111827', backgroundColor: '#fff' },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: '#374151', marginBottom: 4 },
  mediaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  mediaBtnText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  thumb: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  thumbFill: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
