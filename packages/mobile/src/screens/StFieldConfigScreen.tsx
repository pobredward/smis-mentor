import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getDefaultFieldConfig,
  type CampType,
  type STSheetFieldConfig,
  type FieldSectionConfig,
  type FieldItemConfig,
  type FieldPermission,
  type FieldType,
} from '@smis-mentor/shared';
import { authenticatedFetch } from '../utils/apiClient';
import type { AdminStackScreenProps } from '../navigation/types';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const CAMP_TYPES: { type: CampType; label: string }[] = [
  { type: 'EJ', label: 'EJ' },
  { type: 'S',  label: 'S'  },
  { type: 'DG', label: 'DG' },
  { type: 'F',  label: 'F'  },
];

const PERMISSION_LABELS: Record<FieldPermission, string> = {
  readonly: '읽기 전용',
  mentor:   '멘토·관리자',
  all:      '전체',
};

const PERMISSION_OPTIONS: FieldPermission[] = ['readonly', 'mentor', 'all'];

function generateSectionId(): string {
  return `section_${Date.now()}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export function StFieldConfigScreen({ navigation }: AdminStackScreenProps<'StFieldConfig'>) {
  const [activeCampType, setActiveCampType] = useState<CampType>('EJ');
  const [config, setConfig] = useState<STSheetFieldConfig | null>(null);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [sections, setSections] = useState<FieldSectionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');

  // 이미 등록된 헤더
  const registeredHeaders = new Set(sections.flatMap(s => s.fields.map(f => f.sheetHeader)));
  const unregisteredHeaders = availableHeaders.filter(h => !registeredHeaders.has(h));

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async (campType: CampType) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/admin/st-field-config?campType=${campType}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { config: fetched, availableHeaders: headers } = await res.json() as {
        config: STSheetFieldConfig | null;
        availableHeaders: string[];
      };
      const cfg = fetched ?? getDefaultFieldConfig(campType);
      setConfig(cfg);
      setSections([...cfg.sections].sort((a, b) => a.order - b.order));
      setAvailableHeaders(headers ?? []);
    } catch {
      const defaultCfg = getDefaultFieldConfig(campType);
      setConfig(defaultCfg);
      setSections([...defaultCfg.sections].sort((a, b) => a.order - b.order));
      setAvailableHeaders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(activeCampType);
  }, [activeCampType, loadConfig]);

  // ─── 저장 ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const updatedConfig: STSheetFieldConfig = {
        ...config,
        sections: sections.map((s, i) => ({ ...s, order: i })),
        updatedAt: new Date().toISOString(),
      };
      const res = await authenticatedFetch('/api/admin/st-field-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setConfig(updatedConfig);
      Alert.alert('저장 완료', '설정이 저장되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      Alert.alert('저장 실패', msg);
    } finally {
      setIsSaving(false);
    }
  }, [config, sections]);

  // ─── 초기화 ──────────────────────────────────────────────────────────────────

  const handleResetToDefault = useCallback(() => {
    Alert.alert(
      '기본값으로 초기화',
      `${activeCampType} 캠프의 설정을 기본값으로 초기화하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            const defaultCfg = getDefaultFieldConfig(activeCampType);
            if (!config) return;
            setIsSaving(true);
            try {
              const res = await authenticatedFetch('/api/admin/st-field-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(defaultCfg),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              setConfig(defaultCfg);
              setSections([...defaultCfg.sections].sort((a, b) => a.order - b.order));
              Alert.alert('완료', '기본값으로 초기화되었습니다.');
            } catch {
              Alert.alert('오류', '초기화에 실패했습니다.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  }, [activeCampType, config]);

  // ─── 섹션 CRUD ───────────────────────────────────────────────────────────────

  const handleAddSection = useCallback(() => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setSections(prev => [
      ...prev,
      { id: generateSectionId(), label, order: prev.length, isVisible: true, fields: [] },
    ]);
    setNewSectionLabel('');
  }, [newSectionLabel]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    Alert.alert('섹션 삭제', '이 섹션을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => setSections(prev => prev.filter(s => s.id !== sectionId)),
      },
    ]);
  }, []);

  const handleMoveSectionUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setSections(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const handleMoveSectionDown = useCallback((idx: number) => {
    setSections(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const handleToggleSectionVisible = useCallback((sectionId: string) => {
    setSections(prev =>
      prev.map(s => s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s),
    );
  }, []);

  const handleSectionLabelChange = useCallback((sectionId: string, label: string) => {
    setSections(prev =>
      prev.map(s => s.id === sectionId ? { ...s, label } : s),
    );
  }, []);

  // ─── 필드 CRUD ───────────────────────────────────────────────────────────────

  const handleAddField = useCallback((sectionId: string, sheetHeader: string) => {
    const newField: FieldItemConfig = {
      sheetHeader,
      fieldKey: sheetHeader,
      label: sheetHeader,
      isLegacy: false,
      permission: 'mentor',
      isEditable: true,
      fieldType: 'text',
      order: 0,
      isVisible: true,
    };
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, fields: [...s.fields, { ...newField, order: s.fields.length }] };
      }),
    );
  }, []);

  const handleDeleteField = useCallback((sectionId: string, sheetHeader: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          fields: s.fields
            .filter(f => f.sheetHeader !== sheetHeader)
            .map((f, i) => ({ ...f, order: i })),
        };
      }),
    );
  }, []);

  const handleFieldChange = useCallback((
    sectionId: string,
    sheetHeader: string,
    patch: Partial<FieldItemConfig>,
  ) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          fields: s.fields.map(f =>
            f.sheetHeader === sheetHeader ? { ...f, ...patch } : f,
          ),
        };
      }),
    );
  }, []);

  const handleMoveFieldUp = useCallback((sectionId: string, idx: number) => {
    if (idx === 0) return;
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        const fields = [...s.fields];
        [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    );
  }, []);

  const handleMoveFieldDown = useCallback((sectionId: string, idx: number) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        if (idx === s.fields.length - 1) return s;
        const fields = [...s.fields];
        [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    );
  }, []);

  // ─── 미등록 헤더 → 섹션 선택 ─────────────────────────────────────────────────

  const handleUnregisteredHeaderPress = useCallback((header: string) => {
    if (sections.length === 0) {
      Alert.alert('섹션 없음', '먼저 섹션을 추가하세요.');
      return;
    }
    Alert.alert(
      `"${header}" 추가`,
      '어느 섹션에 추가할까요?',
      [
        ...sections.map(s => ({
          text: s.label,
          onPress: () => handleAddField(s.id, header),
        })),
        { text: '취소', style: 'cancel' as const },
      ],
    );
  }, [sections, handleAddField]);

  // ─── 권한 선택 ────────────────────────────────────────────────────────────────

  const handlePermissionPress = useCallback((
    sectionId: string,
    sheetHeader: string,
    current: FieldPermission,
  ) => {
    Alert.alert(
      '권한 설정',
      `현재: ${PERMISSION_LABELS[current]}`,
      [
        ...PERMISSION_OPTIONS.map(p => ({
          text: PERMISSION_LABELS[p] + (p === current ? ' ✓' : ''),
          onPress: () => handleFieldChange(sectionId, sheetHeader, { permission: p }),
        })),
        { text: '취소', style: 'cancel' as const },
      ],
    );
  }, [handleFieldChange]);

  // ─── 필드 타입 선택 ───────────────────────────────────────────────────────────

  const handleFieldTypePress = useCallback((
    sectionId: string,
    sheetHeader: string,
    current: FieldType,
  ) => {
    Alert.alert(
      '필드 타입',
      `현재: ${current === 'text' ? '텍스트' : '점수'}`,
      [
        {
          text: '텍스트' + (current === 'text' ? ' ✓' : ''),
          onPress: () => handleFieldChange(sectionId, sheetHeader, { fieldType: 'text' }),
        },
        {
          text: '점수' + (current === 'score' ? ' ✓' : ''),
          onPress: () => handleFieldChange(sectionId, sheetHeader, { fieldType: 'score' }),
        },
        { text: '취소', style: 'cancel' as const },
      ],
    );
  }, [handleFieldChange]);

  // ─── 렌더링 ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ST시트 필드 설정</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving || loading}
          style={[styles.saveBtn, (isSaving || loading) && styles.saveBtnDisabled]}
        >
          {isSaving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>저장</Text>
          }
        </TouchableOpacity>
      </View>

      {/* 캠프 타입 탭 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.campTypeTabs}
        contentContainerStyle={styles.campTypeTabsContent}
      >
        {CAMP_TYPES.map(({ type, label }) => (
          <TouchableOpacity
            key={type}
            onPress={() => setActiveCampType(type)}
            style={[styles.campTypeTab, activeCampType === type && styles.campTypeTabActive]}
          >
            <Text style={[styles.campTypeTabText, activeCampType === type && styles.campTypeTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 안내 + 초기화 */}
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                {availableHeaders.length > 0
                  ? `최신 시트에서 ${availableHeaders.length}개 헤더 감지됨`
                  : '동기화 기록 없음. 캠프 화면에서 ST시트 동기화 먼저 실행하세요.'}
              </Text>
              <TouchableOpacity onPress={handleResetToDefault}>
                <Text style={styles.resetText}>기본값 초기화</Text>
              </TouchableOpacity>
            </View>

            {/* 미등록 헤더 패널 */}
            {unregisteredHeaders.length > 0 && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>
                  미배치 헤더{' '}
                  <Text style={styles.panelHint}>(탭하면 섹션에 추가)</Text>
                </Text>
                <View style={styles.badgeWrap}>
                  {unregisteredHeaders.map(header => (
                    <TouchableOpacity
                      key={header}
                      onPress={() => handleUnregisteredHeaderPress(header)}
                      style={styles.headerBadge}
                    >
                      <Text style={styles.headerBadgeText}>+ {header}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 섹션 목록 */}
            {sections.map((section, sIdx) => (
              <View key={section.id} style={styles.sectionCard}>
                {/* 섹션 헤더 */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionOrderBtns}>
                    <TouchableOpacity
                      onPress={() => handleMoveSectionUp(sIdx)}
                      disabled={sIdx === 0}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.orderBtn, sIdx === 0 && styles.orderBtnDisabled]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveSectionDown(sIdx)}
                      disabled={sIdx === sections.length - 1}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.orderBtn, sIdx === sections.length - 1 && styles.orderBtnDisabled]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={section.label}
                    onChangeText={v => handleSectionLabelChange(section.id, v)}
                    style={styles.sectionLabelInput}
                    placeholder="섹션 이름"
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    onPress={() => handleToggleSectionVisible(section.id)}
                    style={[styles.visibleBadge, section.isVisible ? styles.visibleBadgeOn : styles.visibleBadgeOff]}
                  >
                    <Text style={[styles.visibleBadgeText, section.isVisible ? styles.visibleBadgeTextOn : styles.visibleBadgeTextOff]}>
                      {section.isVisible ? '표시' : '숨김'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteSection(section.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.deleteSectionBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {/* 필드 목록 */}
                {section.fields.length === 0 ? (
                  <Text style={styles.noFieldText}>필드 없음 — 위 미배치 헤더를 탭해 추가하세요.</Text>
                ) : (
                  section.fields.map((field, fIdx) => (
                    <FieldRow
                      key={field.sheetHeader}
                      field={field}
                      idx={fIdx}
                      totalFields={section.fields.length}
                      onMoveUp={() => handleMoveFieldUp(section.id, fIdx)}
                      onMoveDown={() => handleMoveFieldDown(section.id, fIdx)}
                      onChange={patch => handleFieldChange(section.id, field.sheetHeader, patch)}
                      onDelete={() => handleDeleteField(section.id, field.sheetHeader)}
                      onPermissionPress={() => handlePermissionPress(section.id, field.sheetHeader, field.permission as FieldPermission)}
                      onTypePress={() => handleFieldTypePress(section.id, field.sheetHeader, field.fieldType as FieldType)}
                    />
                  ))
                )}
              </View>
            ))}

            {/* 섹션 추가 */}
            <View style={styles.addSectionRow}>
              <TextInput
                value={newSectionLabel}
                onChangeText={setNewSectionLabel}
                onSubmitEditing={handleAddSection}
                placeholder="새 섹션 이름 입력"
                placeholderTextColor="#9ca3af"
                style={styles.addSectionInput}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={handleAddSection}
                disabled={!newSectionLabel.trim()}
                style={[styles.addSectionBtn, !newSectionLabel.trim() && styles.addSectionBtnDisabled]}
              >
                <Text style={styles.addSectionBtnText}>섹션 추가</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ─── FieldRow 서브컴포넌트 ────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldItemConfig;
  idx: number;
  totalFields: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<FieldItemConfig>) => void;
  onDelete: () => void;
  onPermissionPress: () => void;
  onTypePress: () => void;
}

const FieldRow = React.memo(({
  field, idx, totalFields,
  onMoveUp, onMoveDown, onChange, onDelete,
  onPermissionPress, onTypePress,
}: FieldRowProps) => {
  return (
    <View style={fieldStyles.row}>
      {/* 1행: 순서 버튼 + 헤더명 + 표시명 입력 */}
      <View style={fieldStyles.top}>
        <View style={fieldStyles.orderBtns}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={idx === 0}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={[fieldStyles.orderBtn, idx === 0 && fieldStyles.orderBtnDisabled]}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={idx === totalFields - 1}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={[fieldStyles.orderBtn, idx === totalFields - 1 && fieldStyles.orderBtnDisabled]}>▼</Text>
          </TouchableOpacity>
        </View>
        <Text style={fieldStyles.sheetHeader} numberOfLines={1}>{field.sheetHeader}</Text>
        <TextInput
          value={field.label}
          onChangeText={v => onChange({ label: v })}
          style={fieldStyles.labelInput}
          placeholder="표시명"
          placeholderTextColor="#d1d5db"
        />
      </View>

      {/* 2행: 권한 + 타입 + 편집 + 표시 + legacy 뱃지 + 삭제 */}
      <View style={fieldStyles.bottom}>
        <TouchableOpacity onPress={onPermissionPress} style={fieldStyles.chip}>
          <Text style={fieldStyles.chipText}>{PERMISSION_LABELS[field.permission as FieldPermission]}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onTypePress} style={fieldStyles.chip}>
          <Text style={fieldStyles.chipText}>{field.fieldType === 'score' ? '점수' : '텍스트'}</Text>
        </TouchableOpacity>

        {field.fieldType === 'score' && (
          <View style={fieldStyles.maxScoreWrap}>
            <TextInput
              value={field.maxScore != null ? String(field.maxScore) : ''}
              onChangeText={v => onChange({ maxScore: Number(v) || undefined })}
              keyboardType="numeric"
              style={fieldStyles.maxScoreInput}
              placeholder="만점"
              placeholderTextColor="#d1d5db"
            />
          </View>
        )}

        <TouchableOpacity
          onPress={() => onChange({ isEditable: !field.isEditable })}
          disabled={field.permission === 'readonly'}
          style={[fieldStyles.toggleChip, field.isEditable && fieldStyles.toggleChipActive]}
        >
          <Text style={[fieldStyles.toggleChipText, field.isEditable && fieldStyles.toggleChipTextActive]}>편집</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onChange({ isVisible: !field.isVisible })}
          style={[fieldStyles.toggleChip, field.isVisible && fieldStyles.toggleChipActive]}
        >
          <Text style={[fieldStyles.toggleChipText, field.isVisible && fieldStyles.toggleChipTextActive]}>표시</Text>
        </TouchableOpacity>

        {field.isLegacy && (
          <View style={fieldStyles.legacyBadge}>
            <Text style={fieldStyles.legacyBadgeText}>기존</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={onDelete}
          style={fieldStyles.deleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={14} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── 스타일 ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  saveBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  campTypeTabs: {
    flexGrow: 0,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  campTypeTabsContent: {
    paddingHorizontal: 12,
    gap: 4,
    alignItems: 'center',
    height: 44,
  },
  campTypeTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  campTypeTabActive: {
    backgroundColor: '#eff6ff',
  },
  campTypeTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  campTypeTabTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: '#9ca3af',
    marginRight: 8,
  },
  resetText: {
    fontSize: 11,
    color: '#6b7280',
    textDecorationLine: 'underline',
  },
  panel: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  panelHint: {
    fontSize: 11,
    fontWeight: '400',
    color: '#9ca3af',
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
  },
  headerBadgeText: {
    fontSize: 11,
    color: '#374151',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 6,
  },
  sectionOrderBtns: {
    gap: 2,
  },
  orderBtn: {
    fontSize: 10,
    color: '#9ca3af',
  },
  orderBtnDisabled: {
    opacity: 0.2,
  },
  sectionLabelInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 4,
  },
  visibleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  visibleBadgeOn: {
    backgroundColor: '#dcfce7',
  },
  visibleBadgeOff: {
    backgroundColor: '#f3f4f6',
  },
  visibleBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  visibleBadgeTextOn: {
    color: '#16a34a',
  },
  visibleBadgeTextOff: {
    color: '#6b7280',
  },
  deleteSectionBtn: {
    padding: 4,
  },
  noFieldText: {
    fontSize: 11,
    color: '#9ca3af',
    padding: 12,
    textAlign: 'center',
  },
  addSectionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  addSectionInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
  },
  addSectionBtn: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSectionBtnDisabled: {
    opacity: 0.4,
  },
  addSectionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

const fieldStyles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderBtns: {
    gap: 1,
  },
  orderBtn: {
    fontSize: 9,
    color: '#9ca3af',
  },
  orderBtnDisabled: {
    opacity: 0.2,
  },
  sheetHeader: {
    width: 80,
    fontSize: 11,
    color: '#9ca3af',
  },
  labelInput: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingLeft: 28,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipText: {
    fontSize: 11,
    color: '#374151',
  },
  maxScoreWrap: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  maxScoreInput: {
    width: 44,
    fontSize: 11,
    color: '#374151',
    paddingHorizontal: 5,
    paddingVertical: 3,
    textAlign: 'center',
  },
  toggleChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toggleChipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  toggleChipText: {
    fontSize: 11,
    color: '#6b7280',
  },
  toggleChipTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  legacyBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: '#eff6ff',
    borderRadius: 4,
  },
  legacyBadgeText: {
    fontSize: 10,
    color: '#3b82f6',
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: 2,
  },
});
