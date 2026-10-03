import { describe, expect, it } from './_expect';
import { driveFolderIdFromUrl, driveFolderNameKey, matchTeacherDriveFolder, driveKindLabel, DRIVE_FOLDER_MIME, type DriveItem } from '../src/utils/lessonPlanDrive';

const F = (id: string, name: string): DriveItem => ({ id, name, mimeType: DRIVE_FOLDER_MIME, isFolder: true, url: '' });
const s28 = ['01) Jenna ★', '02) Bri', '03) Julian ★', '04) Jeremy', '05) Felicity ', '06) Allan', '07) Tristan', '08) Hana', '09) Kevin', '10) Fatima', '11) Londiwe'].map((n, i) => F(`s${i}`, n));

describe('레슨플랜 드라이브', () => {
  it('링크에서 폴더 id', () => {
    expect(driveFolderIdFromUrl('https://drive.google.com/drive/folders/1cBxZm9eo70rmPEZsgrEGd_HJt_UwXLTA')).toBe('1cBxZm9eo70rmPEZsgrEGd_HJt_UwXLTA');
    expect(driveFolderIdFromUrl('https://drive.google.com/drive/u/1/folders/1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM?usp=sharing')).toBe('1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM');
    expect(driveFolderIdFromUrl('https://drive.google.com/open?id=1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM')).toBe('1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM');
    expect(driveFolderIdFromUrl('1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM')).toBe('1yB5bE1Rbf4xPIbV45kO51nHqPJM_EzsM');
    expect(driveFolderIdFromUrl('https://naver.com')).toBeNull();
  });
  it('폴더 이름 정리', () => {
    expect(driveFolderNameKey('01) Jenna ★')).toBe('jenna');
    expect(driveFolderNameKey('05) Felicity ')).toBe('felicity');
    expect(driveFolderNameKey('All about me SMIS')).toBe('all about me smis');
  });
  it('원어민 폴더 찾기 — 영어 이름·성까지 쓴 이름·고정', () => {
    expect(matchTeacherDriveFolder(s28, { name: 'Jenna' }).folder?.id).toBe('s0');
    expect(matchTeacherDriveFolder(s28, { name: '제나', englishName: 'Julian Smith' }).folder?.id).toBe('s2');
    expect(matchTeacherDriveFolder(s28, { name: 'Felicity Brown' }).how).toBe('name');
    expect(matchTeacherDriveFolder(s28, { name: 'Nobody' }).folder).toBeNull();
    expect(matchTeacherDriveFolder(s28, { userId: 'u1', name: 'Nobody' }, { u1: 's5' }).folder?.name).toBe('06) Allan');
    // 같은 이름 폴더가 둘이면 고르지 않는다
    expect(matchTeacherDriveFolder([...s28, F('x', '12) Kevin')], { name: 'Kevin' }).folder).toBeNull();
  });
  it('파일 종류', () => {
    expect(driveKindLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBe('문서');
    expect(driveKindLabel('application/vnd.google-apps.document')).toBe('문서');
    expect(driveKindLabel('image/gif')).toBe('이미지');
  });
});
