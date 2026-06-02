import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StudentList, StudentDetailModal } from '../components';
import { FamilyList } from '../components/FamilyList';
import { STSheetStudent, CampType, CampCode, CAMP_SHEET_CONFIG } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';

export function RoomScreen() {
  const { userData } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allStudents, setAllStudents] = useState<STSheetStudent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [campType, setCampType] = useState<CampType>('EJ');
  const [campCode, setCampCode] = useState<CampCode | null>(null);

  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  // campCode가 로드된 후에만 F 여부 판단
  const isFamily = campCode != null
    ? CAMP_SHEET_CONFIG[campCode as keyof typeof CAMP_SHEET_CONFIG]?.type === 'F'
    : false;

  const handleStudentPress = (student: STSheetStudent, index: number, students: STSheetStudent[]) => {
    setSelectedIndex(index);
    setAllStudents(students);
    setModalVisible(true);
  };

  const handleCampTypeChange = (type: CampType) => {
    setCampType(type);
  };

  // campCode가 아직 없으면 StudentList가 내부에서 로드 처리를 담당
  // campCode가 F 타입이면 FamilyList로 전환
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
        filterType="room"
        onStudentPress={handleStudentPress}
        onCampTypeChange={handleCampTypeChange}
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
