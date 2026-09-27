/**
 * 학생 자유 메모 — 학생 상세 모달 "보호자·건강" 탭.
 * 복용약·특이사항(ST 시트, 관리자만 수정) 아래에 두는 선생님용 메모. ST 시트와 연동하지 않고 Firestore 에만 저장.
 * studentMemos/{campCode}_{studentId}
 */
import type { Timestamp } from 'firebase/firestore';

export const STUDENT_MEMO_KEYS = ['classMemo', 'unitMemo', 'groupMemo'] as const;
export type StudentMemoKey = (typeof STUDENT_MEMO_KEYS)[number];

export interface StudentMemoEntry {
  text: string;
  by: string;
  byId: string;
  at: Timestamp;
}

export interface StudentMemo {
  id: string;
  campCode: string;
  studentId: string;
  studentName?: string;
  classMemo?: StudentMemoEntry;
  unitMemo?: StudentMemoEntry;
  groupMemo?: StudentMemoEntry;
}

export const studentMemoId = (campCode: string, studentId: string) => `${campCode}_${studentId}`;
