import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StudentList, StudentDetailModal } from '../components';
import { STSheetStudent, CampType, CampCode } from '@smis-mentor/shared';
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

  const handleStudentPress = (student: STSheetStudent, index: number, students: STSheetStudent[]) => {
    setSelectedIndex(index);
    setAllStudents(students);
    setModalVisible(true);
  };

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
