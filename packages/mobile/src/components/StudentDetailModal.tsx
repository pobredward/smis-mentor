'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { logger, toDriveImageUrl, getFieldConfig, getFieldValue, getDefaultFieldConfig, type STSheetFieldConfig, type FieldItemConfig } from '@smis-mentor/shared';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { STSheetStudent, CampType } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { requestContactsPermission, getContactsPermissionStatus, saveSingleParentContact } from '../services';
import { ContactsPermissionDisclosureModal } from './ContactsPermissionDisclosureModal';
import { authenticatedFetch } from '../utils/apiClient';
import { db } from '../config/firebase';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.78;
const CARD_WIDTH = SCREEN_WIDTH * 0.9;

// 주민등록번호 마스킹
const maskSSN = (ssn: string | null | undefined, isAdmin: boolean, groupRole?: string): string => {
  if (!ssn) return '-';
  const isManagerRole = groupRole === '매니저' || groupRole === '부매니저';
  if (isAdmin || isManagerRole) return ssn;
  const parts = ssn.split('-');
  if (parts.length !== 2) return ssn;
  const front = parts[0];
  const back = parts[1];
  if (back.length === 0) return ssn;
  return `${front}-${back[0]}${'*'.repeat(back.length - 1)}`;
};

// ─── 편집 권한 ────────────────────────────────────────────────────────────────
type EditPermission = 'readonly' | 'all' | 'mentor';

function canEditField(permission: EditPermission, role: string): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

// ─── 공통 행 컴포넌트 ─────────────────────────────────────────────────────────
const InfoRow = React.memo(({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={0}>{value}</Text>
    </View>
  );
});

// 편집 가능한 행 컴포넌트 (FieldItemConfig 기반)
interface EditableRowProps {
  fieldKey: string;
  label: string;
  isMultiline: boolean;
  maxScore?: number;
  value: string;
  editingField: { key: string; value: string } | null;
  fieldSaving: boolean;
  canEdit: boolean;
  onStartEdit: (key: string, currentValue: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const EditableRow = React.memo(({
  fieldKey, label, isMultiline, maxScore, value,
  editingField, fieldSaving, canEdit,
  onStartEdit, onChange, onSave, onCancel,
}: EditableRowProps) => {
  const isThisEditing = editingField?.key === fieldKey;
  const isSavingThis = isThisEditing && fieldSaving;
  const displayValue = value
    ? (maxScore != null && maxScore > 0 ? `${value} / ${maxScore}` : value)
    : '';

  if (isThisEditing) {
    return (
      <View style={styles.editableRowColumn}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.editContainer}>
          <TextInput
            style={[styles.editInput, isMultiline && styles.editInputMultiline]}
            value={editingField!.value}
            onChangeText={onChange}
            multiline={isMultiline}
            numberOfLines={isMultiline ? 3 : 1}
            autoFocus
            placeholder="내용을 입력하세요"
            placeholderTextColor="#cbd5e1"
          />
          <View style={styles.editButtons}>
            <TouchableOpacity
              onPress={onSave}
              disabled={isSavingThis}
              style={[styles.editBtn, styles.editBtnSave]}
              accessibilityRole="button"
            >
              {isSavingThis
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.editBtnSaveText}>저장</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCancel}
              disabled={isSavingThis}
              style={[styles.editBtn, styles.editBtnCancel]}
              accessibilityRole="button"
            >
              <Text style={styles.editBtnCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={[styles.value, !displayValue && styles.valuePlaceholder]} numberOfLines={0}>
          {displayValue || '-'}
        </Text>
        {canEdit && !editingField && (
          <TouchableOpacity
            onPress={() => onStartEdit(fieldKey, value)}
            style={styles.editIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${label} 수정`}
          >
            <Text style={styles.editIconText}>수정</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface StudentDetailModalProps {
  visible: boolean;
  students: STSheetStudent[];
  initialIndex: number;
  onClose: () => void;
  campType: CampType;
  campCode?: string;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  visible,
  students,
  initialIndex,
  onClose,
  campType,
  campCode,
}) => {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  const activeJobExp = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId);
  const groupRole = activeJobExp?.groupRole;

  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const [editingField, setEditingField] = useState<{ key: string; value: string } | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  // 동적 필드 설정 — 기본값으로 초기화하여 로드 전에도 기본 섹션이 표시되게 함
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig>(() => getDefaultFieldConfig(campType));

  const [showContactsDisclosure, setShowContactsDisclosure] = useState(false);
  const pendingStudentRef = useRef<STSheetStudent | null>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setEditingField(null);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 160, friction: 14 }),
        Animated.spring(translateY, { toValue: 1, useNativeDriver: true, tension: 160, friction: 14 }),
      ]).start();
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: initialIndex * CARD_WIDTH, animated: false });
      }, 0);
      // campType 기준 동적 필드 설정 로드 — 우선 기본값으로, Firestore 로드 완료 후 교체
      setFieldConfig(getDefaultFieldConfig(campType));
      getFieldConfig(db, campType).then(setFieldConfig).catch((err) => {
        logger.warn('[StudentDetailModal] fieldConfig 로드 실패, 기본값 사용:', err?.message);
      });
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, initialIndex, campType]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_WIDTH);
    if (index !== currentIndex && index >= 0 && index < students.length) {
      setCurrentIndex(index);
      setEditingField(null); // 페이지 전환 시 편집 취소
    }
  };

  // 편집 시작
  const handleStartEdit = useCallback((fieldKey: string, currentValue: string) => {
    setEditingField({ key: fieldKey, value: currentValue });
  }, []);

  // 편집 취소
  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  // fieldConfig에서 해당 필드 정보 조회
  const findFieldInConfig = useCallback((key: string): FieldItemConfig | null => {
    for (const section of fieldConfig.sections) {
      const field = section.fields.find(f => f.fieldKey === key);
      if (field) return field;
    }
    return null;
  }, [fieldConfig]);

  // 저장
  const handleSaveField = useCallback(async () => {
    if (!editingField || !campCode) return;
    const student = students[currentIndex];
    if (!student) return;

    setFieldSaving(true);
    try {
      const response = await authenticatedFetch('/api/st/update-placement', {
        method: 'POST',
        body: JSON.stringify({
          campCode,
          studentId: student.studentId,
          rowNumber: student.rowNumber,
          fields: { [editingField.key]: editingField.value },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '' })) as { error?: string };
        logger.error('저장 API 응답 오류:', { status: response.status, error: err.error });
        throw new Error(err.error || `저장 실패 (${response.status})`);
      }

      // 레거시 필드는 최상위에, 동적 필드는 displayFields 하위에 저장
      const fieldInfo = findFieldInConfig(editingField.key);
      const isLegacy = fieldInfo?.isLegacy ?? true;
      const sheetHeader = fieldInfo?.sheetHeader ?? editingField.key;

      setOverrides(prev => {
        const existing = prev[student.studentId] ?? {};
        if (isLegacy) {
          return { ...prev, [student.studentId]: { ...existing, [editingField.key]: editingField.value } };
        }
        const prevDisplay = (existing.displayFields as Record<string, string> | undefined) ?? {};
        return {
          ...prev,
          [student.studentId]: {
            ...existing,
            displayFields: { ...prevDisplay, [sheetHeader]: editingField.value },
          },
        };
      });
      setEditingField(null);
    } catch (e: unknown) {
      logger.error('모바일 학생 카드 저장 실패:', e);
      const message = e instanceof Error ? e.message : '저장에 실패했습니다. 다시 시도해주세요.';
      Alert.alert('저장 실패', message);
    } finally {
      setFieldSaving(false);
    }
  }, [editingField, campCode, students, currentIndex, findFieldInConfig]);

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

  if (students.length === 0) return null;

  const student = students[currentIndex] ?? students[0];
  const userRole = userData?.role ?? '';

  return (
    <>
      <ContactsPermissionDisclosureModal
        visible={showContactsDisclosure}
        onAccept={handleContactsDisclosureAccept}
        onDeny={handleContactsDisclosureDeny}
      />
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

          <Animated.View style={[styles.cardContainer, { transform: [{ scale }], opacity: translateY }]}>
            {/* 헤더 */}
            <View style={styles.header}>
              <View style={styles.headerCenter}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.pageIndicator}>{currentIndex + 1} / {students.length}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 가로 스와이프 */}
            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={false}
              snapToInterval={CARD_WIDTH}
              decelerationRate="fast"
            >
              {students.map((s, idx) => {
                const studentOverrides = overrides[s.studentId] ?? {};
                const merged: STSheetStudent = {
                  ...s,
                  ...(studentOverrides as Partial<STSheetStudent>),
                  displayFields: {
                    ...(s.displayFields ?? {}),
                    ...(studentOverrides as Record<string, unknown>).displayFields as Record<string, string> | undefined,
                  },
                };
                return (
                  <View key={s.studentId} style={styles.page}>
                    <StudentCard
                      student={merged}
                      campType={campType}
                      isAdmin={isAdmin}
                      groupRole={groupRole}
                      userRole={userRole}
                      fieldConfig={fieldConfig}
                      editingField={idx === currentIndex ? editingField : null}
                      fieldSaving={fieldSaving}
                      onSaveContact={handleSaveParentContact}
                      onStartEdit={handleStartEdit}
                      onChangeEdit={(value) => setEditingField(prev => prev ? { ...prev, value } : null)}
                      onSaveField={handleSaveField}
                      onCancelEdit={handleCancelEdit}
                    />
                  </View>
                );
              })}
            </ScrollView>

            {/* 페이지 인디케이터 */}
            {students.length > 1 && (
              <View style={styles.dotsContainer}>
                {students.map((s, idx) => (
                  <View key={s.studentId} style={[styles.dot, idx === currentIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

// ─── StudentCard ──────────────────────────────────────────────────────────────
interface StudentCardProps {
  student: STSheetStudent;
  campType: CampType;
  isAdmin: boolean;
  groupRole?: string;
  userRole: string;
  fieldConfig: STSheetFieldConfig;
  editingField: { key: string; value: string } | null;
  fieldSaving: boolean;
  onSaveContact: (s: STSheetStudent) => void;
  onStartEdit: (key: string, value: string) => void;
  onChangeEdit: (value: string) => void;
  onSaveField: () => void;
  onCancelEdit: () => void;
}

const StudentCard = React.memo(({
  student: s, campType, isAdmin, groupRole, userRole,
  fieldConfig, editingField, fieldSaving,
  onSaveContact, onStartEdit, onChangeEdit, onSaveField, onCancelEdit,
}: StudentCardProps) => {
  const profilePhotoUrl = toDriveImageUrl(s.profilePhoto);

  return (
    <ScrollView style={styles.cardScrollView} showsVerticalScrollIndicator bounces={false} indicatorStyle="black">
      {/* 프로필 사진 */}
      <View style={styles.profilePhotoContainer}>
        {profilePhotoUrl ? (
          <Image source={profilePhotoUrl} style={styles.profilePhoto} contentFit="cover" transition={0} cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.profilePhoto, styles.profilePhotoPlaceholder]}>
            <Ionicons name="person" size={120} color={s.gender === 'M' ? '#93c5fd' : '#fcd34d'} />
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        {/* 캠프 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>캠프 정보</Text>
          <InfoRow label="고유번호" value={s.studentId} />
          <InfoRow
            label="반 정보"
            value={s.classNumber || s.className || s.classMentor
              ? `${s.classNumber || '-'} | ${s.className || '-'}반 | ${s.classMentor || '-'} 멘토`
              : undefined}
          />
          <InfoRow
            label="유닛 정보"
            value={s.unit || s.unitMentor || s.roomNumber
              ? `${s.unit || s.unitMentor || '-'} 유닛 | ${s.roomNumber || '-'}호`
              : undefined}
          />
        </View>

        {/* 기본 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>기본 정보</Text>
          <InfoRow label="신상" value={`${s.name} | ${s.englishName || '-'} | ${s.grade} | ${s.gender === 'M' ? '남' : '여'}`} />
          <InfoRow label="주민등록번호" value={maskSSN(s.ssn, isAdmin, groupRole)} />
          <InfoRow label="도로명 주소" value={s.address} />
          <InfoRow label="세부 주소" value={s.addressDetail} />
          {campType === 'EJ' && (
            <InfoRow
              label="입퇴소공항"
              value={s.departureRoute || s.arrivalRoute
                ? `${s.departureRoute || '-'} 입소 | ${s.arrivalRoute || '-'} 퇴소`
                : undefined}
            />
          )}
          {campType === 'S' && (
            <>
              <InfoRow label="단체티 사이즈" value={s.shirtSize} />
              <InfoRow
                label="여권정보"
                value={s.passportName || s.passportNumber || s.passportExpiry
                  ? `${s.passportName || '-'} | ${s.passportNumber || '-'} | ${s.passportExpiry || '-'}`
                  : undefined}
              />
            </>
          )}
        </View>

        {/* 보호자 정보 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>보호자 정보</Text>
            {s.parentPhone && (
              <TouchableOpacity
                onPress={() => onSaveContact(s)}
                style={styles.saveContactBtn}
                accessibilityLabel="보호자 연락처 저장"
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="person-add-outline" size={15} color="#10b981" />
              </TouchableOpacity>
            )}
          </View>
          <InfoRow
            label="대표 보호자"
            value={s.parentPhone || s.parentName
              ? `${s.parentPhone || '-'} | ${s.parentName || '-'}`
              : undefined}
          />
          <InfoRow label="대표 이메일" value={s.email} />
          <InfoRow
            label="기타 보호자"
            value={s.otherPhone || s.otherName
              ? `${s.otherPhone || '-'} | ${s.otherName || '-'}`
              : undefined}
          />
        </View>

        {/* 동적 섹션 — fieldConfig 기반 렌더링 */}
        {fieldConfig.sections
          .filter(sec => sec.isVisible)
          .sort((a, b) => a.order - b.order)
          .map(section => {
            // readonly + 비편집 필드는 값이 없으면 숨김 (설문조사 등)
            const visibleFields = section.fields
              .filter(f => f.isVisible)
              .sort((a, b) => a.order - b.order)
              .filter(f => {
                if (!f.isEditable && f.permission === 'readonly') {
                  return !!getFieldValue(s, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: f.isLegacy });
                }
                return true;
              });
            // 표시할 필드가 없으면 섹션 자체 숨김
            if (visibleFields.length === 0) return null;
            return (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                {visibleFields.map(field => {
                  const canEdit = canEditField(field.permission as EditPermission, userRole) && field.isEditable;
                  const rawValue = getFieldValue(s, {
                    fieldKey: field.fieldKey,
                    sheetHeader: field.sheetHeader,
                    isLegacy: field.isLegacy,
                  });
                  const isMultiline = field.fieldType === 'text';
                  return (
                    <EditableRow
                      key={field.fieldKey}
                      fieldKey={field.fieldKey}
                      label={field.label}
                      isMultiline={isMultiline}
                      maxScore={field.maxScore}
                      value={rawValue}
                      editingField={editingField}
                      fieldSaving={fieldSaving}
                      canEdit={canEdit}
                      onStartEdit={onStartEdit}
                      onChange={onChangeEdit}
                      onSave={onSaveField}
                      onCancel={onCancelEdit}
                    />
                  );
                })}
              </View>
            );
          })}

      </View>
    </ScrollView>
  );
});

// ─── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    position: 'relative',
    minHeight: 48,
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700' as '700',
    color: '#1e293b',
  },
  pageIndicator: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 22,
    color: '#64748b',
    fontWeight: '400' as '400',
  },
  page: {
    width: CARD_WIDTH,
  },
  cardScrollView: {
    flex: 1,
  },
  profilePhotoContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  profilePhoto: {
    width: 280,
    height: 280,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profilePhotoPlaceholder: {
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  editableRowColumn: {
    flexDirection: 'column',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
  },
  valueContainer: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  value: {
    flex: 1,
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500' as '500',
  },
  valuePlaceholder: {
    color: '#cbd5e1',
  },
  editContainer: {
    marginTop: 4,
    gap: 6,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
  },
  editInputMultiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnSave: {
    backgroundColor: '#3b82f6',
  },
  editBtnCancel: {
    backgroundColor: '#f1f5f9',
  },
  editBtnSaveText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600' as '600',
  },
  editBtnCancelText: {
    fontSize: 12,
    color: '#64748b',
  },
  editIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#eff6ff',
  },
  editIconText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '500' as '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 2,
    marginVertical: 2,
  },
  dotActive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3b82f6',
  },
  saveContactBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
});
