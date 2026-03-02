import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { STSheetStudent } from '@smis-mentor/shared';

interface StudentDetailModalProps {
  visible: boolean;
  student: STSheetStudent | null;
  onClose: () => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  visible,
  student,
  onClose,
}) => {
  if (!student) return null;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
      <View style={styles.infoRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>학생 상세 정보</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* 기본 정보 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>기본 정보</Text>
            <InfoRow label="이름" value={student.name} />
            <InfoRow label="학생 ID" value={student.studentId} />
            <InfoRow label="영문명" value={student.englishName} />
            <InfoRow label="성별" value={student.gender === 'M' ? '남' : '여'} />
            <InfoRow label="학년" value={student.grade} />
          </View>

          {/* 반/유닛 정보 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>반/유닛 정보</Text>
            <InfoRow label="반 번호" value={student.classNumber} />
            <InfoRow label="반 이름" value={student.className} />
            <InfoRow label="반 멘토" value={student.classMentor} />
            <InfoRow label="유닛 멘토" value={student.unitMentor} />
            <InfoRow label="방 번호" value={student.roomNumber} />
          </View>

          {/* 연락처 정보 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>연락처</Text>
            <InfoRow label="보호자명" value={student.parentName} />
            <InfoRow label="보호자 전화" value={student.parentPhone} />
            <InfoRow label="기타 연락처명" value={student.otherName} />
            <InfoRow label="기타 전화" value={student.otherPhone} />
            <InfoRow label="이메일" value={student.email} />
          </View>

          {/* 주소 정보 */}
          {student.address && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>주소</Text>
              <InfoRow label="지역" value={student.region} />
              <InfoRow label="주소" value={student.address} />
              <InfoRow label="상세주소" value={student.addressDetail} />
            </View>
          )}

          {/* 의료 정보 */}
          {student.medication && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>의료 정보</Text>
              <Text style={styles.notes}>{student.medication}</Text>
            </View>
          )}

          {/* 기타 정보 */}
          {student.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>비고</Text>
              <Text style={styles.notes}>{student.notes}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as '700',
    color: '#1e293b',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#64748b',
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: '#64748b',
  },
  value: {
    flex: 2,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500' as '500',
  },
  notes: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
});
