/**
 * 학생 민감정보(stSheetSensitive) 한 항목 — 주민번호는 암호화해서 저장한다 (RRN_ENCRYPTION_KEY, users 주민번호 · 계좌와 같은 키)
 * 예전 형식 { ssn: 평문 } 도 읽는다 (이관 전 데이터).
 */
import { encryptRRN, decryptRRN } from './encryption';

export type SensitiveEntry = { ssn?: string; ssnEnc?: string };

export const sealSensitive = (ssn: string): SensitiveEntry => ({ ssnEnc: encryptRRN(ssn) });

export function openSensitive(entry: SensitiveEntry | null | undefined): string | undefined {
  if (!entry) return undefined;
  if (entry.ssnEnc) return decryptRRN(entry.ssnEnc);
  return entry.ssn || undefined;
}
