import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StudentList, StudentDetailModal } from '../components';
import { STSheetStudent } from '@smis-mentor/shared';

export function RoomScreen() {
  const [selectedStudent, setSelectedStudent] = useState<STSheetStudent | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleStudentPress = (student: STSheetStudent) => {
    setSelectedStudent(student);
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <StudentList
        filterType="room"
        onStudentPress={handleStudentPress}
      />
      <StudentDetailModal
        visible={modalVisible}
        student={selectedStudent}
        onClose={() => setModalVisible(false)}
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
