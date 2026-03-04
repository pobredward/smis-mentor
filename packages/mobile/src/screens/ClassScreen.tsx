import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StudentList, StudentDetailModal } from '../components';
import { STSheetStudent, CampType } from '@smis-mentor/shared';

export function ClassScreen() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allStudents, setAllStudents] = useState<STSheetStudent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [campType, setCampType] = useState<CampType>('EJ');

  const handleStudentPress = (student: STSheetStudent, index: number, students: STSheetStudent[]) => {
    setSelectedIndex(index);
    setAllStudents(students);
    setModalVisible(true);
  };

  const handleCampTypeChange = (type: CampType) => {
    setCampType(type);
  };

  return (
    <View style={styles.container}>
      <StudentList
        filterType="class"
        onStudentPress={handleStudentPress}
        onCampTypeChange={handleCampTypeChange}
      />
      <StudentDetailModal
        visible={modalVisible}
        students={allStudents}
        initialIndex={selectedIndex}
        onClose={() => setModalVisible(false)}
        campType={campType}
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
