import * as Contacts from 'expo-contacts';
import { Alert, Linking, Platform } from 'react-native';
import { STSheetStudent } from '@smis-mentor/shared';

export interface ContactSaveResult {
  saved: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * 연락처에 저장될 이름을 생성합니다.
 * 형식: "[캠프코드] [학생이름] [학년+성별] 학부모"
 * 예: "J28 홍길동 G4M 학부모"
 * grade에서 숫자만 추출해 G{숫자}{M|F} 형식으로 조합합니다.
 */
export function buildContactDisplayName(student: STSheetStudent, campCode?: string): string {
  const parts: string[] = [];
  if (campCode) parts.push(campCode);
  parts.push(student.name);

  const gradeNum = student.grade?.match(/\d+/)?.[0];
  const genderChar = student.gender === 'M' ? 'M' : student.gender === 'F' ? 'F' : '';
  if (gradeNum || genderChar) {
    parts.push(`G${gradeNum ?? ''}${genderChar}`);
  }

  parts.push('학부모');
  return parts.join(' ');
}

/**
 * 연락처 앱 접근 권한을 요청합니다.
 * 거부 시 사용자에게 설정 앱으로 이동할지 묻습니다.
 */
export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();

  if (status === 'granted') {
    return true;
  }

  return new Promise((resolve) => {
    Alert.alert(
      '연락처 접근 권한 필요',
      '학생 부모님 연락처를 저장하려면 연락처 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.',
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        {
          text: '설정으로 이동',
          onPress: () => {
            Linking.openSettings();
            resolve(false);
          },
        },
      ],
    );
  });
}

/**
 * STSheetStudent 한 명을 Contacts.Contact 형식으로 변환합니다.
 * - iOS: 레이블에 실명(parentName/otherName) 사용, isPrimary 적용
 * - Android: addContactAsync에서 label/isPrimary가 동작하지 않는 버그(#34047)로
 *   표준 레이블 "mobile" 사용 (정상 표시), isPrimary 미설정
 */
function buildContact(student: STSheetStudent, campCode?: string): Contacts.Contact {
  const displayName = buildContactDisplayName(student, campCode);
  const isAndroid = Platform.OS === 'android';

  const phoneNumbers: Contacts.PhoneNumber[] = [];

  if (student.parentPhone) {
    phoneNumbers.push({
      label: isAndroid ? 'mobile' : (student.parentName || '부모님'),
      number: student.parentPhone,
      ...(isAndroid ? {} : { isPrimary: true }),
    });
  }

  if (student.otherPhone) {
    phoneNumbers.push({
      label: isAndroid ? 'mobile' : (student.otherName || '기타 연락처'),
      number: student.otherPhone,
    });
  }

  const note = buildContactNote(student);

  return {
    [Contacts.Fields.FirstName]: displayName,
    [Contacts.Fields.PhoneNumbers]: phoneNumbers,
    [Contacts.Fields.Note]: note || undefined,
    contactType: Contacts.ContactTypes.Person,
  } as Contacts.Contact;
}

/**
 * 연락처 메모 문자열을 생성합니다.
 * 형식: "E01.03 | Sailor반 | 윤수빈 멘토 | 강준서 유닛"
 */
export function buildContactNote(student: STSheetStudent): string {
  const noteParts: string[] = [];
  if (student.classNumber) noteParts.push(`${student.classNumber}`);
  if (student.className) noteParts.push(`${student.className}반`);
  if (student.classMentor) noteParts.push(`${student.classMentor} 멘토`);
  if (student.unitMentor) noteParts.push(`${student.unitMentor} 유닛`);
  return noteParts.join(' | ');
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * 완전히 동일한 이름+전화번호 쌍이 존재하는지 확인합니다.
 * 번호가 같아도 이름이 다르면(형제자매 등) 중복으로 보지 않습니다.
 */
async function isExactDuplicate(displayName: string, phone: string): Promise<boolean> {
  try {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      name: displayName,
    });

    return data.some(
      (c) =>
        c.name === displayName &&
        c.phoneNumbers?.some((p) => normalizePhone(p.number ?? '') === normalizePhone(phone)),
    );
  } catch {
    return false;
  }
}

/**
 * 학생 한 명의 부모님 연락처를 저장합니다.
 * 저장 전 미리보기 Alert를 표시하고 사용자가 "저장" 을 눌러야 실제 저장됩니다.
 * 이름이 완전히 동일한 연락처가 이미 있으면 중복 안내를 합니다.
 * 번호만 같은 경우(형제자매 등)는 중복으로 처리하지 않고 저장합니다.
 */
export async function saveSingleParentContact(
  student: STSheetStudent,
  campCode?: string,
): Promise<'saved' | 'duplicate' | 'cancelled' | 'error'> {
  if (!student.parentPhone) return 'error';

  const displayName = buildContactDisplayName(student, campCode);

  // 미리보기 + 확인 Alert
  const confirmed = await new Promise<boolean>((resolve) => {
    const isAndroid = Platform.OS === 'android';
    const previewLines = [`이름: ${displayName}`];

    if (isAndroid) {
      // Android: 레이블 미지원 — 번호만 표시
      previewLines.push(`번호: ${student.parentPhone}`);
      if (student.otherPhone) {
        previewLines.push(`번호: ${student.otherPhone}`);
      }
    } else {
      // iOS: 실명 레이블 표시
      previewLines.push(`${student.parentName || '부모님'}: ${student.parentPhone}`);
      if (student.otherPhone) {
        previewLines.push(`${student.otherName || '기타 연락처'}: ${student.otherPhone}`);
      }
    }

    const note = buildContactNote(student);
    if (note) previewLines.push(`메모: ${note}`);

    Alert.alert(
      '연락처 저장',
      previewLines.join('\n'),
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '저장', onPress: () => resolve(true) },
      ],
    );
  });

  if (!confirmed) return 'cancelled';

  try {
    // 이름+번호가 완전히 동일한 경우만 중복으로 처리 (번호만 같은 경우는 허용)
    const duplicate = await isExactDuplicate(displayName, student.parentPhone);

    if (duplicate) {
      Alert.alert('이미 저장됨', `"${displayName}" 연락처가 이미 저장되어 있습니다.`);
      return 'duplicate';
    }

    const contact = buildContact(student, campCode);
    await Contacts.addContactAsync(contact);
    Alert.alert('저장 완료', `"${displayName}" 연락처가 저장되었습니다.`);
    return 'saved';
  } catch (error) {
    Alert.alert('오류', '연락처 저장 중 오류가 발생했습니다.');
    return 'error';
  }
}

/**
 * 학생 배열에서 부모님 연락처를 기기 연락처에 일괄 저장합니다.
 * 이름+번호가 완전히 동일한 경우만 건너뜁니다 (번호 중복은 허용).
 * onProgress: 저장 진행률 콜백 (완료 수, 전체 수)
 */
export async function saveStudentContacts(
  students: STSheetStudent[],
  onProgress?: (done: number, total: number) => void,
  campCode?: string,
): Promise<ContactSaveResult> {
  const result: ContactSaveResult = { saved: 0, skipped: 0, failed: 0, errors: [] };

  const targets = students.filter((s) => s.parentPhone);
  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const student = targets[i];
    onProgress?.(i, total);

    try {
      const displayName = buildContactDisplayName(student, campCode);

      const duplicate = await isExactDuplicate(displayName, student.parentPhone);

      if (duplicate) {
        result.skipped++;
        continue;
      }

      const contact = buildContact(student, campCode);
      await Contacts.addContactAsync(contact);
      result.saved++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${student.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  onProgress?.(total, total);
  return result;
}
