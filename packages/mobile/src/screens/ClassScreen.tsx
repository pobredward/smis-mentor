import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StudentList, StudentDetailModal } from '../components';
import { FamilyList } from '../components/FamilyList';
import { STSheetStudent, CampType, CampCode, CAMP_SHEET_CONFIG } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { jobCodesService, stSheetService } from '../services';

export function ClassScreen() {
  const { userData } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allStudents, setAllStudents] = useState<STSheetStudent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [campType, setCampType] = useState<CampType>('EJ');
  const [campCode, setCampCode] = useState<CampCode | null>(null);

  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  // activeJobCodeId 변경을 직접 구독 → FamilyList 렌더 중에도 campCode 갱신
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  useEffect(() => {
    if (!activeJobCodeId) { setCampCode(null); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then((codes) => {
      if (codes.length > 0 && codes[0].code) {
        const code = codes[0].code as CampCode;
        setCampCode(code);
        setCampType(stSheetService.getCampType(code));
      }
    }).catch(() => {});
  }, [activeJobCodeId]);

  const isFamily = campCode != null
    ? CAMP_SHEET_CONFIG[campCode as keyof typeof CAMP_SHEET_CONFIG]?.type === 'F'
    : false;

  const handleStudentPress = (student: STSheetStudent, index: number, students: STSheetStudent[]) => {
    setSelectedIndex(index);
    setAllStudents(students);
    setModalVisible(true);
  };

  // F캠프이면 FamilyList로 전환
  if (isFamily && campCode) {
    return (
      <View style={styles.container}>
        <FamilyList campCode={campCode} isForeign={isForeign} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StudentList
        filterType="class"
        onStudentPress={handleStudentPress}
        onCampTypeChange={setCampType}
        onCampCodeChange={setCampCode}
        isForeign={isForeign}
      />
      <StudentDetailModal
        visible={modalVisible}
        students={allStudents}
        initialIndex={selectedIndex}
        onClose={() => setModalVisible(false)}
        campType={campType}
        campCode={campCode ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});
