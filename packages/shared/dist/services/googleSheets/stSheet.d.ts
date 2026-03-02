import { STSheetStudent } from '../../types';
export declare class STSheetService {
    private sheets;
    private spreadsheetId;
    private sheetName;
    constructor(serviceAccountKey: any);
    /**
     * 전체 ST시트 데이터 가져오기
     */
    fetchAllStudents(): Promise<STSheetStudent[]>;
    /**
     * 특정 멘토의 학생만 필터링하여 가져오기
     */
    fetchStudentsByMentor(mentorName: string, filterType: 'class' | 'unit'): Promise<STSheetStudent[]>;
    /**
     * 멘토 목록 추출 (중복 제거)
     */
    getMentorList(): Promise<{
        classMentors: string[];
        unitMentors: string[];
        allMentors: string[];
    }>;
    /**
     * 행 데이터를 STSheetStudent 객체로 변환
     */
    private mapRowToStudent;
}
//# sourceMappingURL=stSheet.d.ts.map