import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@smis-mentor/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.RRN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('RRN_ENCRYPTION_KEY 환경 변수가 설정되지 않았습니다.');
  }
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('RRN_ENCRYPTION_KEY는 32바이트(base64 인코딩된 256비트)여야 합니다.');
  }
  return key;
}

/**
 * AES-256-GCM으로 평문을 암호화합니다.
 * 반환 형식: iv(16) + authTag(16) + ciphertext - base64 인코딩
 */
export function encryptRRN(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv + authTag + ciphertext를 합쳐 base64로 인코딩
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * AES-256-GCM으로 암호문을 복호화합니다.
 */
export function decryptRRN(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('암호화된 데이터 형식이 올바르지 않습니다.');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * 암호화 키가 설정되어 있는지 확인합니다.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * 기존 평문 rrnLast를 암호화된 값으로 마이그레이션할 때 사용합니다.
 * 이미 암호화된 값인지 heuristic으로 판단합니다 (7자리 숫자면 평문, 그 외 암호화됨).
 */
export function isPlaintextRRN(value: string): boolean {
  return /^\d{7}$/.test(value);
}
