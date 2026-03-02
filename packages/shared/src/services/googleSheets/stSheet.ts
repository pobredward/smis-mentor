// Google Sheets API 서비스

import { google } from 'googleapis';
import { ST_SHEET_COLUMNS, STSheetStudent, STSheetConfig, MentorStudentFilter } from '../../types';

export class STSheetService {
  private sheets;
  private spreadsheetId = '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8';
  private sheetName = 'ST';

  constructor(serviceAccountKey: any) {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * 전체 ST시트 데이터 가져오기
   */
  async fetchAllStudents(): Promise<STSheetStudent[]> {
    try {
      console.log('📊 ST시트 데이터 가져오기 시작...');

      // 헤더 행 가져오기 (1행)
      const headerResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:BE1`
      });

      const headers = headerResponse.data.values?.[0] || [];
      console.log(`📋 헤더 ${headers.length}개 로드`);

      // 데이터 행 가져오기 (2행부터)
      const dataResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:BE`
      });

      const rows = dataResponse.data.values || [];
      console.log(`📊 총 ${rows.length}개 행 로드`);

      // 각 행을 STSheetStudent 객체로 변환
      const students: STSheetStudent[] = rows
        .filter(row => row[0])  // A열(고유번호)이 있는 행만
        .map((row, index) => this.mapRowToStudent(row, headers, index + 2));

      console.log(`✅ ${students.length}명의 학생 데이터 변환 완료`);
      return students;
    } catch (error) {
      console.error('❌ ST시트 데이터 가져오기 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 멘토의 학생만 필터링하여 가져오기
   */
  async fetchStudentsByMentor(
    mentorName: string,
    filterType: 'class' | 'unit'
  ): Promise<STSheetStudent[]> {
    const allStudents = await this.fetchAllStudents();
    
    const filtered = allStudents.filter(student => {
      if (filterType === 'class') {
        return student.classMentor === mentorName;
      } else {
        return student.unitMentor === mentorName;
      }
    });

    console.log(`✅ ${mentorName} 멘토의 ${filterType} 학생: ${filtered.length}명`);
    return filtered;
  }

  /**
   * 멘토 목록 추출 (중복 제거)
   */
  async getMentorList(): Promise<{
    classMentors: string[];
    unitMentors: string[];
    allMentors: string[];
  }> {
    const students = await this.fetchAllStudents();
    
    const classMentors = [...new Set(
      students.map(s => s.classMentor).filter(Boolean)
    )].sort();
    
    const unitMentors = [...new Set(
      students.map(s => s.unitMentor).filter(Boolean)
    )].sort();
    
    const allMentors = [...new Set([...classMentors, ...unitMentors])].sort();
    
    return { classMentors, unitMentors, allMentors };
  }

  /**
   * 행 데이터를 STSheetStudent 객체로 변환
   */
  private mapRowToStudent(
    row: any[],
    headers: string[],
    rowNumber: number
  ): STSheetStudent {
    const getColumnIndex = (columnLetter: string): number => {
      let index = 0;
      for (let i = 0; i < columnLetter.length; i++) {
        index = index * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
      }
      return index - 1;
    };

    const getValue = (columnLetter: string): string => {
      const index = getColumnIndex(columnLetter);
      return row[index] || '';
    };

    return {
      // 기본 정보
      studentId: getValue(ST_SHEET_COLUMNS.STUDENT_ID),
      name: getValue(ST_SHEET_COLUMNS.NAME),
      englishName: getValue(ST_SHEET_COLUMNS.ENGLISH_NAME),
      grade: getValue(ST_SHEET_COLUMNS.GRADE),
      gender: getValue(ST_SHEET_COLUMNS.GENDER) as 'M' | 'F',
      
      // 연락처
      parentPhone: getValue(ST_SHEET_COLUMNS.PARENT_PHONE),
      parentName: getValue(ST_SHEET_COLUMNS.PARENT_NAME),
      otherPhone: getValue(ST_SHEET_COLUMNS.OTHER_PHONE),
      otherName: getValue(ST_SHEET_COLUMNS.OTHER_NAME),
      medication: getValue(ST_SHEET_COLUMNS.MEDICATION),
      notes: getValue(ST_SHEET_COLUMNS.NOTES),
      
      // 개인정보
      ssn: getValue(ST_SHEET_COLUMNS.SSN),
      region: getValue(ST_SHEET_COLUMNS.REGION),
      address: getValue(ST_SHEET_COLUMNS.ADDRESS),
      addressDetail: getValue(ST_SHEET_COLUMNS.ADDRESS_DETAIL),
      email: getValue(ST_SHEET_COLUMNS.EMAIL),
      
      // ⭐️ 멘토 및 반 배정
      classNumber: getValue(ST_SHEET_COLUMNS.CLASS_NUMBER),
      className: getValue(ST_SHEET_COLUMNS.CLASS_NAME),
      classMentor: getValue(ST_SHEET_COLUMNS.CLASS_MENTOR),
      unitMentor: getValue(ST_SHEET_COLUMNS.UNIT_MENTOR),
      roomNumber: getValue(ST_SHEET_COLUMNS.ROOM_NUMBER),
      
      // 메타
      rowNumber,
      lastSyncedAt: new Date(),
      displayFields: {}
    };
  }
}
