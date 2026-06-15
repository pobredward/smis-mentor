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
 * 현재 연락처 권한 상태만 확인합니다 (권한 요청 없음).
 */
export async function getContactsPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Contacts.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * 연락처 앱 접근 권한을 요청합니다.
 * Google Play 정책: 이 함수를 호출하기 전에 반드시 in-app disclosure를 표시해야 합니다.
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
 * - parentPhone만 저장 (otherPhone 제외) — 카카오톡 중복 친구 등록 방지
 * - iOS: 010-xxxx-xxxx와 +82 10-xxxx-xxxx 두 개 저장 (아이폰 발신자 식별용)
 *   레이블에 실명(parentName) 사용, isPrimary 적용
 * - Android: addContactAsync에서 label/isPrimary가 동작하지 않는 버그(#34047)로
 *   표준 레이블 "mobile" 사용 (정상 표시), isPrimary 미설정 / +82 미추가
 */
function buildContact(student: STSheetStudent, campCode?: string): Contacts.Contact {
  const displayName = buildContactDisplayName(student, campCode);
  const isAndroid = Platform.OS === 'android';

  const phoneNumbers: Contacts.PhoneNumber[] = [];

  if (student.parentPhone) {
    const formatted010 = formatTo010(student.parentPhone);
    const formattedPlus82 = !isAndroid ? formatToPlus82(student.parentPhone) : null;
    const parentLabel = student.parentName || '부모님';

    phoneNumbers.push({
      label: isAndroid ? 'mobile' : parentLabel,
      number: formatted010,
      ...(isAndroid ? {} : { isPrimary: true }),
    });

    // iOS 전용: +82 형식 추가 저장 (아이폰 문자 발신자 인식용)
    if (formattedPlus82) {
      phoneNumbers.push({
        label: `${parentLabel}2`,
        number: formattedPlus82,
      });
    }
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
 * 전화번호를 010-xxxx-xxxx 형식으로 정규화합니다.
 * +82, 82, 0082 접두사 제거 후 10으로 시작하면 0을 붙입니다.
 * 11자리 숫자(01012345678) → 010-1234-5678
 * 10자리 숫자(1012345678) → 010-1234-5678
 */
export function formatTo010(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  let local = digits;
  if (local.startsWith('82')) {
    local = '0' + local.slice(2);
  }
  if (local.startsWith('0082')) {
    local = '0' + local.slice(4);
  }
  // 10으로 시작하는 10자리 → 010 붙이기
  if (local.length === 10 && local.startsWith('10')) {
    local = '0' + local;
  }

  if (local.length === 11) {
    return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  }
  // 변환 불가능한 경우 원본 반환
  return phone;
}

/**
 * 전화번호를 +82 10-xxxx-xxxx 형식으로 변환합니다.
 * 010-1234-5678 → +82 10-1234-5678
 */
export function formatToPlus82(phone: string): string | null {
  const normalized = formatTo010(phone);
  // 010-xxxx-xxxx 패턴인 경우만 변환
  const match = normalized.match(/^010-(\d{4})-(\d{4})$/);
  if (!match) return null;
  return `+82 10-${match[1]}-${match[2]}`;
}

/**
 * 완전히 동일한 이름+전화번호 쌍이 존재하는지 확인합니다.
 * 번호가 같아도 이름이 다르면(형제자매 등) 중복으로 보지 않습니다.
 * iOS의 경우 010 형식과 +82 형식 중 하나라도 저장되어 있으면 중복으로 판단합니다.
 */
async function isExactDuplicate(displayName: string, phone: string): Promise<boolean> {
  try {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      name: displayName,
    });

    // 비교 대상 번호: 010 형식 + +82 형식 둘 다 숫자 정규화해서 비교
    const formatted010 = formatTo010(phone);
    const formattedPlus82 = formatToPlus82(phone);
    const candidateNumbers = new Set([
      normalizePhone(phone),
      normalizePhone(formatted010),
      ...(formattedPlus82 ? [normalizePhone(formattedPlus82)] : []),
    ]);

    return data.some(
      (c) =>
        c.name === displayName &&
        c.phoneNumbers?.some((p) => candidateNumbers.has(normalizePhone(p.number ?? ''))),
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
      previewLines.push(`번호: ${formatTo010(student.parentPhone)}`);
    } else {
      // iOS: 실명 레이블 + 010 / +82 두 형식 모두 표시
      const parentLabel = student.parentName || '부모님';
      const parent010 = formatTo010(student.parentPhone);
      const parentPlus82 = formatToPlus82(student.parentPhone);
      previewLines.push(`${parentLabel}: ${parent010}`);
      if (parentPlus82) {
        previewLines.push(`${parentLabel}2: ${parentPlus82}`);
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

export interface ContactDeleteResult {
  deleted: number;
  notFound: number;
  failed: number;
  errors: string[];
}

/**
 * 학생 배열에 해당하는 연락처를 기기에서 일괄 삭제합니다.
 * 이름이 완전히 일치하는 연락처를 찾아 삭제합니다.
 * onProgress: 삭제 진행률 콜백 (완료 수, 전체 수)
 */
export async function deleteStudentContacts(
  students: STSheetStudent[],
  onProgress?: (done: number, total: number) => void,
  campCode?: string,
): Promise<ContactDeleteResult> {
  const result: ContactDeleteResult = { deleted: 0, notFound: 0, failed: 0, errors: [] };

  const targets = students.filter((s) => s.parentPhone);
  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const student = targets[i];
    onProgress?.(i, total);

    try {
      const displayName = buildContactDisplayName(student, campCode);

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        name: displayName,
      });

      // 이름이 완전히 일치하는 연락처만 삭제
      const matched = data.filter((c) => c.name === displayName);

      if (matched.length === 0) {
        result.notFound++;
        continue;
      }

      for (const contact of matched) {
        if (contact.id) {
          await Contacts.removeContactAsync(contact.id);
        }
      }
      result.deleted++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${student.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  onProgress?.(total, total);
  return result;
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
