/**
 * 학생 상세 모달 (mobile) — 반/방/입소/퇴소/숙소 명단 공용.
 * 전체 화면 + 상단 요약 헤더 + 가로 스크롤 탭. 좌우 스와이프(또는 ‹ ›)로 이전/다음 학생.
 * 탭 구성·표시 판단은 shared/utils/studentModal 과 같아 web 과 동일하다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, ScrollView, FlatList, TouchableOpacity, StyleSheet, Dimensions, TextInput,
  Alert, ActivityIndicator, Linking, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  L, dataLabel, logger, resolveActiveJobCodeId, toDriveImageUrl, getFieldConfig, getFieldValue, getFixedFieldValue,
  getDefaultFieldConfig, getStudentPatientRecords, studentTabsFor, sectionsForTab, visibleDynamicFields,
  hasMedicationInfo, isOpenPatientRecord, formatAllowance, placementSummary, guardianContacts, dialablePhone, STUDENT_TAB_LABEL_KEYS,
  type STSheetFieldConfig, type FieldSectionConfig, type FieldItemConfig, type PatientRecord, type StudentTabId,
  type STSheetStudent, type CampType,
} from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { requestContactsPermission, getContactsPermissionStatus, saveSingleParentContact } from '../services';
import { ContactsPermissionDisclosureModal } from './ContactsPermissionDisclosureModal';
import { authenticatedFetch } from '../utils/apiClient';
import { db } from '../config/firebase';
import { StudentAllowanceTab, useStudentAllowance } from './StudentAllowanceTab';
import { StudentDevicesTab, useStudentDevices, useDeviceContext } from './StudentDevicesTab';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type EditPermission = 'readonly' | 'all' | 'mentor';

function canEditField(permission: EditPermission, role: string): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

const SECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  campInfo: 'flag-outline', basicInfo: 'person-outline', guardianInfo: 'people-outline', detail: 'document-text-outline',
  placement: 'bar-chart-outline', counsel: 'chatbubbles-outline', survey: 'clipboard-outline',
};

// 모달을 다시 열어도 마지막으로 보던 탭을 유지
const tabMemory: { current: StudentTabId } = { current: 'basic' };

type EditingField = { key: string; value: string } | null;

// ─── 편집 가능한 행 ─────────────────────────────────────────────
interface EditableRowProps {
  fieldKey: string;
  label: string;
  isMultiline: boolean;
  maxScore?: number;
  value: string;
  highlight?: boolean;
  editingField: EditingField;
  fieldSaving: boolean;
  canEdit: boolean;
  onStartEdit: (key: string, currentValue: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const EditableRow = React.memo(({
  fieldKey, label, isMultiline, maxScore, value, highlight,
  editingField, fieldSaving, canEdit, onStartEdit, onChange, onSave, onCancel,
}: EditableRowProps) => {
  const isThisEditing = editingField?.key === fieldKey;
  const isSavingThis = isThisEditing && fieldSaving;
  const displayValue = value ? (maxScore != null && maxScore > 0 ? `${value} / ${maxScore}` : value) : '';

  if (isThisEditing) {
    return (
      <View style={styles.rowColumn}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={[styles.editInput, isMultiline && styles.editInputMultiline]}
          value={editingField!.value}
          onChangeText={onChange}
          multiline={isMultiline}
          numberOfLines={isMultiline ? 3 : 1}
          autoFocus
          placeholder={L('common.enterDetails')}
          placeholderTextColor="#cbd5e1"
        />
        <View style={styles.editButtons}>
          <TouchableOpacity onPress={onSave} disabled={isSavingThis} style={[styles.editBtn, styles.editBtnSave]} accessibilityRole="button">
            {isSavingThis ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.editBtnSaveText}>{L('common.save')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} disabled={isSavingThis} style={[styles.editBtn, styles.editBtnCancel]} accessibilityRole="button">
            <Text style={styles.editBtnCancelText}>{L('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <Text style={[styles.label, highlight && styles.labelHighlight]}>{label}</Text>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, !displayValue && styles.valuePlaceholder, highlight && styles.valueHighlight]}>
          {displayValue || '-'}
        </Text>
        {canEdit && !editingField && (
          <TouchableOpacity
            onPress={() => onStartEdit(fieldKey, value)}
            style={styles.editIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={L('students.edit', { v0: label })}
          >
            <Text style={styles.editIconText}>{L('task.edit')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// ─── Props ─────────────────────────────────────────────────────
interface StudentDetailModalProps {
  visible: boolean;
  students: STSheetStudent[];
  initialIndex: number;
  onClose: () => void;
  campType: CampType;
  campCode?: string;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  visible, students, initialIndex, onClose, campType, campCode,
}) => {
  const { userData } = useAuth();
  const role = userData?.role ?? '';
  const isAdmin = role === 'admin';
  const isForeign = role === 'foreign' || role === 'foreign_temp';
  const activeJobCodeId = resolveActiveJobCodeId(userData);
  const groupRole = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId)?.groupRole;

  const listRef = useRef<FlatList<STSheetStudent>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tab, setTab] = useState<StudentTabId>(() => tabMemory.current);
  useEffect(() => { tabMemory.current = tab; }, [tab]);

  const [editingField, setEditingField] = useState<EditingField>(null);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig>(() => getDefaultFieldConfig(campType));
  const [recordsById, setRecordsById] = useState<Record<string, PatientRecord[]>>({});

  const [showContactsDisclosure, setShowContactsDisclosure] = useState(false);
  const pendingStudentRef = useRef<STSheetStudent | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCurrentIndex(initialIndex);
    setEditingField(null);
    setFieldConfig(getDefaultFieldConfig(campType));
    getFieldConfig(db, campType).then(setFieldConfig).catch((err) => {
      logger.warn('[StudentDetailModal] fieldConfig 로드 실패, 기본값 사용:', err?.message);
    });
  }, [visible, initialIndex, campType]);

  const merge = useCallback((s: STSheetStudent): STSheetStudent => {
    const o = overrides[s.studentId];
    if (!o) return s;
    return {
      ...s,
      ...(o as Partial<STSheetStudent>),
      displayFields: { ...(s.displayFields ?? {}), ...((o.displayFields as Record<string, string> | undefined) ?? {}) },
    };
  }, [overrides]);

  const base = students[currentIndex] ?? students[0];
  const student = useMemo(() => (base ? merge(base) : undefined), [base, merge]);

  // 보건 기록 (현재 학생)
  useEffect(() => {
    if (!visible || !campCode || !base) return;
    const id = base.studentId;
    getStudentPatientRecords(db, campCode, id)
      .then(r => setRecordsById(prev => ({ ...prev, [id]: r })))
      .catch(e => { logger.warn('[StudentDetailModal] 보건 기록 조회 실패', e); setRecordsById(prev => ({ ...prev, [id]: [] })); });
  }, [visible, campCode, base]);

  const allowance = useStudentAllowance(campCode, campType, student, base ? recordsById[base.studentId] ?? null : null, visible);
  const actor = useMemo(() => ({ uid: userData?.userId ?? '', name: userData?.name ?? '' }), [userData?.userId, userData?.name]);
  const devices = useStudentDevices(campCode, base?.studentId, visible);
  const deviceCtx = useDeviceContext(campCode, activeJobCodeId, visible);
  // 가로 페이지 높이 — 각 페이지(세로 ScrollView)가 남은 높이를 정확히 채워야 세로 스크롤이 된다
  const [pageHeight, setPageHeight] = useState(0);

  const tabs = useMemo(() => (student ? studentTabsFor(student, campType, fieldConfig) : []), [student, campType, fieldConfig]);
  const activeTab: StudentTabId = tabs.includes(tab) ? tab : 'basic';

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= students.length) return;
    setEditingField(null);
    setCurrentIndex(idx);
    listRef.current?.scrollToIndex({ index: idx, animated: true });
  }, [students.length]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== currentIndex && idx >= 0 && idx < students.length) {
      setCurrentIndex(idx);
      setEditingField(null);
    }
  }, [currentIndex, students.length]);

  const findFieldInConfig = useCallback((key: string): FieldItemConfig | null => {
    for (const section of fieldConfig.sections) {
      const field = section.fields.find(f => f.fieldKey === key);
      if (field) return field;
    }
    return null;
  }, [fieldConfig]);

  const handleSaveField = useCallback(async () => {
    if (!editingField || !campCode || !base) return;
    setFieldSaving(true);
    try {
      const response = await authenticatedFetch('/api/st/update-placement', {
        method: 'POST',
        body: JSON.stringify({
          campCode,
          studentId: base.studentId,
          rowNumber: base.rowNumber,
          fields: { [editingField.key]: editingField.value },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '' })) as { error?: string };
        logger.error('저장 API 응답 오류:', { status: response.status, error: err.error });
        throw new Error(err.error || L('students.saveFailed', { v0: response.status }));
      }
      const fieldInfo = findFieldInConfig(editingField.key);
      const isLegacy = fieldInfo?.isLegacy ?? true;
      const sheetHeader = fieldInfo?.sheetHeader ?? editingField.key;
      setOverrides(prev => {
        const existing = prev[base.studentId] ?? {};
        if (isLegacy) return { ...prev, [base.studentId]: { ...existing, [editingField.key]: editingField.value } };
        const prevDisplay = (existing.displayFields as Record<string, string> | undefined) ?? {};
        return { ...prev, [base.studentId]: { ...existing, displayFields: { ...prevDisplay, [sheetHeader]: editingField.value } } };
      });
      setEditingField(null);
    } catch (e: unknown) {
      logger.error('모바일 학생 카드 저장 실패:', e);
      Alert.alert(L('common.saveFailed'), e instanceof Error ? e.message : L('common.failedToSavePleaseTry'));
    } finally {
      setFieldSaving(false);
    }
  }, [editingField, campCode, base, findFieldInConfig]);

  const handleSaveParentContact = useCallback(async (s: STSheetStudent) => {
    if (!s.parentPhone) return;
    const currentStatus = await getContactsPermissionStatus();
    if (currentStatus === 'granted') {
      await saveSingleParentContact(s, campCode);
      return;
    }
    pendingStudentRef.current = s;
    setShowContactsDisclosure(true);
  }, [campCode]);

  const handleContactsDisclosureAccept = useCallback(async () => {
    setShowContactsDisclosure(false);
    const s = pendingStudentRef.current;
    pendingStudentRef.current = null;
    if (!s) return;
    const granted = await requestContactsPermission();
    if (!granted) return;
    await saveSingleParentContact(s, campCode);
  }, [campCode]);

  const handleContactsDisclosureDeny = useCallback(() => {
    setShowContactsDisclosure(false);
    pendingStudentRef.current = null;
  }, []);

  if (students.length === 0 || !student) return null;

  const fixedOpts = { isAdmin, isForeign, groupRole };
  const photoUrl = toDriveImageUrl(student.profilePhoto);
  const classLine = getFixedFieldValue(student, 'classInfo', campType, fixedOpts);
  const unitLine = getFixedFieldValue(student, 'unitInfo', campType, fixedOpts);
  const medAlert = hasMedicationInfo(student) ? student.medication!.trim() : null;
  const records = recordsById[student.studentId] ?? null;
  const openCount = (records ?? []).filter(isOpenPatientRecord).length;
  const allowancePending = allowance.pending.length;
  const negative = allowance.balances.filter(b => b.balance < 0);
  const uncollected = (devices ?? []).filter(d => d.location === 'student').length;
  const needCharge = (devices ?? []).filter(d => d.needsCharge && d.location !== 'returned').length;

  const selectTab = (t: StudentTabId) => { setTab(t); setEditingField(null); };

  return (
    <>
      <ContactsPermissionDisclosureModal
        visible={showContactsDisclosure}
        onAccept={handleContactsDisclosureAccept}
        onDeny={handleContactsDisclosureDeny}
      />
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          {/* 상단 바 */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={L('common.close')}>
              <Ionicons name="chevron-down" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>{L('studentModal.studentDetails')}</Text>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} style={styles.iconBtn} accessibilityLabel={L('studentModal.prevStudent')}>
                <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? '#d1d5db' : '#374151'} />
              </TouchableOpacity>
              <Text style={styles.pageText}>{currentIndex + 1} / {students.length}</Text>
              <TouchableOpacity onPress={() => goTo(currentIndex + 1)} disabled={currentIndex >= students.length - 1} style={styles.iconBtn} accessibilityLabel={L('studentModal.nextStudent')}>
                <Ionicons name="chevron-forward" size={20} color={currentIndex >= students.length - 1 ? '#d1d5db' : '#374151'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* 요약 헤더 */}
          <View style={styles.header}>
            <View style={[styles.photo, { backgroundColor: student.gender === 'M' ? '#dbeafe' : '#fef9c3' }]}>
              {photoUrl ? (
                <Image source={photoUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="memory-disk" />
              ) : (
                <Ionicons name="person" size={44} color={student.gender === 'M' ? '#93c5fd' : '#fcd34d'} />
              )}
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.name} numberOfLines={1}>
                {student.name}{student.englishName ? <Text style={styles.englishName}>  {student.englishName}</Text> : null}
              </Text>
              <View style={styles.chips}>
                {!!student.grade && <Text style={[styles.chip, styles.chipBlue]}>{student.grade}</Text>}
                <Text style={[styles.chip, student.gender === 'M' ? styles.chipSky : styles.chipPink]}>
                  {student.gender === 'M' ? L('students.m') : L('students.f')}
                </Text>
                {!!student.studentId && <Text style={[styles.chip, styles.chipGray]}>{student.studentId}</Text>}
              </View>
              {!!classLine && <Text style={styles.metaLine} numberOfLines={1}>{classLine}</Text>}
              {!!unitLine && <Text style={styles.metaLine} numberOfLines={1}>{unitLine}</Text>}
            </View>
          </View>

          {(medAlert || openCount > 0 || allowancePending > 0 || negative.length > 0 || uncollected > 0 || needCharge > 0) && (
            <View style={styles.alerts}>
              {!!medAlert && (
                <TouchableOpacity style={styles.alertRed} onPress={() => selectTab('health')} activeOpacity={0.8}>
                  <Text style={styles.alertRedTitle}>⚠️ {L('studentModal.medicationAlert')}</Text>
                  <Text style={styles.alertRedBody} numberOfLines={2}>{medAlert}</Text>
                </TouchableOpacity>
              )}
              {(uncollected > 0 || needCharge > 0) && (
                <TouchableOpacity style={styles.alertSky} onPress={() => selectTab('devices')} activeOpacity={0.8}>
                  <Text style={styles.alertSkyText}>📱 {[
                    uncollected > 0 ? L('studentDevice.uncollectedBadge', { v0: uncollected }) : '',
                    needCharge > 0 ? L('studentDevice.chargeBadge', { v0: needCharge }) : '',
                  ].filter(Boolean).join(' · ')}</Text>
                </TouchableOpacity>
              )}
              {(allowancePending > 0 || negative.length > 0) && (
                <TouchableOpacity style={styles.alertOrange} onPress={() => selectTab('allowance')} activeOpacity={0.8}>
                  <Text style={styles.alertOrangeText}>💰 {[
                    allowancePending > 0 ? L('allowance.pendingBadge', { v0: allowancePending }) : '',
                    ...negative.map(b => `${L('allowance.lowBalance')} ${formatAllowance(b.balance, b.currency)}`),
                  ].filter(Boolean).join(' · ')}</Text>
                </TouchableOpacity>
              )}
              {openCount > 0 && (
                <TouchableOpacity style={styles.alertAmber} onPress={() => selectTab('health')} activeOpacity={0.8}>
                  <Text style={styles.alertAmberText}>🩹 {L('studentModal.patientOpen', { v0: openCount })}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 탭 바 */}
          <View style={styles.tabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
              {tabs.map(t => (
                <TouchableOpacity key={t} onPress={() => selectTab(t)} style={[styles.tabItem, activeTab === t && styles.tabItemActive]}>
                  <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{L(STUDENT_TAB_LABEL_KEYS[t])}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 학생별 페이지 (좌우 스와이프) */}
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            onLayout={e => setPageHeight(e.nativeEvent.layout.height)}
            data={students}
            keyExtractor={(s, i) => s.studentId || String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(initialIndex, Math.max(0, students.length - 1))}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            onMomentumScrollEnd={onMomentumEnd}
            keyboardShouldPersistTaps="handled"
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            extraData={{ activeTab, currentIndex, editingField, fieldSaving, overrides, recordsById, fieldConfig, pageHeight, devices, deviceCtx, allowance }}
            renderItem={({ item, index }) => (
              <View style={{ width: SCREEN_WIDTH, height: pageHeight || undefined }}>
                {Math.abs(index - currentIndex) > 1 ? null : (
                  <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    <TabBody
                      student={merge(item)}
                      tab={activeTab}
                      campType={campType}
                      config={fieldConfig}
                      role={role}
                      fixedOpts={fixedOpts}
                      records={index === currentIndex ? records : null}
                      editingField={index === currentIndex ? editingField : null}
                      fieldSaving={fieldSaving}
                      onStartEdit={(key, value) => setEditingField({ key, value })}
                      onChangeEdit={(value) => setEditingField(prev => (prev ? { ...prev, value } : null))}
                      onSaveField={handleSaveField}
                      onCancelEdit={() => setEditingField(null)}
                      onSaveContact={handleSaveParentContact}
                      allowanceNode={index === currentIndex && campCode
                        ? <StudentAllowanceTab data={allowance} student={merge(item)} campCode={campCode} roster={students} actor={actor} />
                        : null}
                      devicesNode={index === currentIndex && campCode
                        ? <StudentDevicesTab devices={devices} student={merge(item)} campCode={campCode} roster={students} actor={actor} ctx={deviceCtx.ctx} staff={deviceCtx.staff} />
                        : null}
                    />
                  </ScrollView>
                )}
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
};

// ─── 탭 내용 ───────────────────────────────────────────────────
interface TabBodyProps {
  student: STSheetStudent;
  tab: StudentTabId;
  campType: CampType;
  config: STSheetFieldConfig;
  role: string;
  fixedOpts: { isAdmin: boolean; isForeign: boolean; groupRole?: string };
  records: PatientRecord[] | null;
  editingField: EditingField;
  fieldSaving: boolean;
  onStartEdit: (key: string, value: string) => void;
  onChangeEdit: (value: string) => void;
  onSaveField: () => void;
  onCancelEdit: () => void;
  onSaveContact: (s: STSheetStudent) => void;
  allowanceNode: React.ReactNode;
  devicesNode: React.ReactNode;
}

function TabBody(props: TabBodyProps) {
  const { student: s, tab, campType, config, role, fixedOpts, records } = props;

  const renderSection = (section: FieldSectionConfig) => {
    const header = (
      <View style={styles.cardHeader}>
        <Ionicons name={SECTION_ICON[section.id] ?? 'document-outline'} size={16} color="#4f46e5" />
        <Text style={styles.cardTitle}>{dataLabel(section.label)}</Text>
      </View>
    );

    if (section.isFixed) {
      const rows = section.fields
        .filter(f => f.isVisible)
        .sort((a, b) => a.order - b.order)
        .map(f => ({
          key: f.fieldKey,
          label: f.label,
          value: f.isLegacy
            ? getFixedFieldValue(s, f.fieldKey, campType, fixedOpts)
            : (getFieldValue(s, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: false }) || null),
        }))
        .filter(r => r.value !== null);
      if (rows.length === 0) return null;
      return (
        <View key={section.id} style={styles.card}>
          {header}
          {rows.map(r => (
            <View key={r.key} style={styles.row}>
              <Text style={styles.label}>{dataLabel(r.label)}</Text>
              <Text style={[styles.value, styles.valueFlex]}>{r.value}</Text>
            </View>
          ))}
        </View>
      );
    }

    const fields = visibleDynamicFields(s, section);
    if (fields.length === 0) return null;

    if (section.id === 'survey') {
      return (
        <View key={section.id} style={styles.card}>
          {header}
          <View style={styles.tileGrid}>
            {fields.map(f => (
              <View key={f.fieldKey} style={styles.tile}>
                <Text style={styles.tileLabel}>{dataLabel(f.label)}</Text>
                <Text style={styles.tileValue}>{getFieldValue(s, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: f.isLegacy }) || '-'}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.card}>
        {header}
        {fields.map(field => (
          <EditableRow
            key={field.fieldKey}
            fieldKey={field.fieldKey}
            label={dataLabel(field.label)}
            isMultiline={field.fieldType === 'text'}
            maxScore={field.maxScore}
            value={getFieldValue(s, { fieldKey: field.fieldKey, sheetHeader: field.sheetHeader, isLegacy: field.isLegacy })}
            highlight={field.fieldKey === 'medication' && hasMedicationInfo(s)}
            editingField={props.editingField}
            fieldSaving={props.fieldSaving}
            canEdit={canEditField(field.permission as EditPermission, role) && field.isEditable}
            onStartEdit={props.onStartEdit}
            onChange={props.onChangeEdit}
            onSave={props.onSaveField}
            onCancel={props.onCancelEdit}
          />
        ))}
      </View>
    );
  };

  const sections = (t: StudentTabId) => sectionsForTab(config, t).map(renderSection);

  if (tab === 'allowance') return props.allowanceNode ? <>{props.allowanceNode}</> : <ActivityIndicator style={{ marginTop: 24 }} color="#3b82f6" />;
  if (tab === 'devices') return props.devicesNode ? <>{props.devicesNode}</> : <ActivityIndicator style={{ marginTop: 24 }} color="#3b82f6" />;

  if (tab === 'health') {
    const contacts = guardianContacts(s);
    return (
      <>
        {contacts.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="call-outline" size={16} color="#4f46e5" />
              <Text style={styles.cardTitle}>{L('studentModal.quickContact')}</Text>
              {!!s.parentPhone && (
                <TouchableOpacity onPress={() => props.onSaveContact(s)} style={styles.saveContactBtn}
                  accessibilityLabel={L('students.saveParentContacts')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="person-add-outline" size={15} color="#10b981" />
                </TouchableOpacity>
              )}
            </View>
            {contacts.map(c => (
              <View key={c.role} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactRole}>{c.role === 'primary' ? L('studentModal.primaryGuardian') : L('studentModal.otherGuardian')}</Text>
                  <Text style={styles.contactText}>{c.name ? `${c.name} · ` : ''}{c.phone}</Text>
                </View>
                <TouchableOpacity style={[styles.contactBtn, styles.contactCall]} onPress={() => Linking.openURL(`tel:${dialablePhone(c.phone)}`)}>
                  <Ionicons name="call" size={14} color="#047857" />
                  <Text style={styles.contactCallText}>{L('studentModal.call')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.contactBtn, styles.contactSms]} onPress={() => Linking.openURL(`sms:${dialablePhone(c.phone)}`)}>
                  <Ionicons name="chatbubble" size={14} color="#1d4ed8" />
                  <Text style={styles.contactSmsText}>{L('studentModal.sms')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {sections('health')}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="medkit-outline" size={16} color="#4f46e5" />
            <Text style={styles.cardTitle}>{L('studentModal.patientHistory')}</Text>
          </View>
          {records === null ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color="#3b82f6" />
          ) : records.length === 0 ? (
            <Text style={styles.emptyText}>{L('studentModal.noPatientRecords')}</Text>
          ) : (
            records.map(r => {
              const d = r.visitDate?.toDate?.();
              const open = isOpenPatientRecord(r);
              const visits = (r.hospitalVisits ?? []).length;
              return (
                <View key={r.id} style={styles.recordRow}>
                  <Text style={styles.recordDate}>{d ? `${d.getMonth() + 1}/${d.getDate()}` : '-'}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.recordTop}>
                      <Text style={styles.recordSymptom}>{r.symptom || '-'}</Text>
                      <Text style={[styles.smallChip, open ? styles.smallChipAmber : styles.smallChipGreen]}>{dataLabel(r.progressStatus)}</Text>
                      {(r.types ?? []).map(t => <Text key={t} style={[styles.smallChip, styles.smallChipGray]}>{dataLabel(t)}</Text>)}
                    </View>
                    {(!!r.treatment || visits > 0) && (
                      <Text style={styles.recordSub}>
                        {r.treatment}{r.treatment && visits > 0 ? ' · ' : ''}{visits > 0 ? L('studentModal.hospitalVisits', { v0: visits }) : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </>
    );
  }

  if (tab === 'study') {
    const rows = placementSummary(s);
    const showProgress = rows.length > 0 && rows.some(r => r.final !== null);
    return (
      <>
        {showProgress && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="trending-up-outline" size={16} color="#4f46e5" />
              <Text style={styles.cardTitle}>{L('studentModal.levelProgress')}</Text>
            </View>
            <View style={styles.scoreRow}>
              {rows.map(r => {
                const diff = r.entry !== null && r.final !== null ? r.final - r.entry : null;
                return (
                  <View key={r.skill} style={styles.scoreBox}>
                    <Text style={styles.tileLabel}>{r.skill}</Text>
                    <Text style={styles.scoreMain}>{r.entry ?? '-'} → {r.final ?? '-'}</Text>
                    {diff !== null && (
                      <Text style={[styles.scoreDiff, { color: diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#9ca3af' }]}>
                        {diff > 0 ? `+${diff}` : diff}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {sections('study')}
      </>
    );
  }

  const blocks = sections(tab === 'survey' ? 'survey' : 'basic');
  if (blocks.every(b => b === null)) return <Text style={styles.emptyText}>{L('studentModal.nothingToShow')}</Text>;
  return <>{blocks}</>;
}

// ─── 스타일 ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  topTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  pageText: { fontSize: 12, color: '#6b7280', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },

  header: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  photo: { width: 84, height: 84, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  headerInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '800', color: '#111827' },
  englishName: { fontSize: 14, fontWeight: '400', color: '#6b7280' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chipBlue: { backgroundColor: '#eff6ff', color: '#1d4ed8' },
  chipSky: { backgroundColor: '#f0f9ff', color: '#0369a1' },
  chipPink: { backgroundColor: '#fdf2f8', color: '#be185d' },
  chipGray: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  metaLine: { fontSize: 12, color: '#4b5563', marginTop: 4 },

  alerts: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  alertRed: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  alertRedTitle: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  alertRedBody: { fontSize: 12, color: '#991b1b', marginTop: 2 },
  alertAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  alertSky: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  alertSkyText: { fontSize: 12, fontWeight: '700', color: '#075985' },
  alertOrange: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  alertOrangeText: { fontSize: 12, fontWeight: '700', color: '#9a3412' },
  alertAmberText: { fontSize: 12, fontWeight: '700', color: '#92400e' },

  tabBar: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBarContent: { paddingHorizontal: 8 },
  tabItem: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#2563eb' },
  tabText: { fontSize: 14, color: '#6b7280' },
  tabTextActive: { color: '#2563eb', fontWeight: '700' },

  page: { flex: 1, backgroundColor: '#f8fafc' },
  pageContent: { padding: 12, gap: 10, paddingBottom: 32 },

  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingBottom: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  rowHighlight: { backgroundColor: '#fef2f2', marginHorizontal: -14, paddingHorizontal: 14 },
  rowColumn: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 6 },
  label: { width: 96, fontSize: 12, color: '#6b7280' },
  labelHighlight: { color: '#b91c1c', fontWeight: '700' },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  value: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '500' },
  valueFlex: { flex: 1 },
  valueHighlight: { color: '#991b1b' },
  valuePlaceholder: { color: '#cbd5e1' },

  editInput: { borderWidth: 1, borderColor: '#60a5fa', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827' },
  editInputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  editButtons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  editBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, minWidth: 56, alignItems: 'center' },
  editBtnSave: { backgroundColor: '#2563eb' },
  editBtnCancel: { backgroundColor: '#f3f4f6' },
  editBtnSaveText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  editBtnCancelText: { color: '#4b5563', fontSize: 13, fontWeight: '600' },
  editIconBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#eff6ff' },
  editIconText: { fontSize: 11, color: '#2563eb', fontWeight: '600' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  tileLabel: { fontSize: 11, color: '#6b7280' },
  tileValue: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  contactRole: { fontSize: 11, color: '#6b7280' },
  contactText: { fontSize: 13, color: '#111827', fontWeight: '500', marginTop: 1 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  contactCall: { backgroundColor: '#ecfdf5' },
  contactSms: { backgroundColor: '#eff6ff' },
  contactCallText: { fontSize: 12, fontWeight: '600', color: '#047857' },
  contactSmsText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
  saveContactBtn: { padding: 4, borderRadius: 8, backgroundColor: '#ecfdf5' },

  recordRow: { flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  recordDate: { width: 40, fontSize: 12, color: '#6b7280', paddingTop: 1 },
  recordTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  recordSymptom: { fontSize: 13, fontWeight: '600', color: '#111827' },
  recordSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  smallChip: { fontSize: 10, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  smallChipAmber: { backgroundColor: '#fef3c7', color: '#92400e' },
  smallChipGreen: { backgroundColor: '#ecfdf5', color: '#047857' },
  smallChipGray: { backgroundColor: '#f3f4f6', color: '#4b5563' },

  scoreRow: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  scoreBox: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, alignItems: 'center', paddingVertical: 8 },
  scoreMain: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },
  scoreDiff: { fontSize: 11, fontWeight: '700', marginTop: 1 },

  emptyText: { fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  soon: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', paddingVertical: 40, paddingHorizontal: 24 },
  soonTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginTop: 8 },
  soonBody: { fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'center' },
});
