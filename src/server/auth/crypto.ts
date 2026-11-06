import 'server-only';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Gera um hash de senha seguro utilizando `scrypt` (N=16384, r=8, p=1) com salt aleatório de 16 bytes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verifica uma senha contra o hash armazenado usando comparação em tempo constante (`timingSafeEqual`).
 */
export async function verifyPassword(params: { password: string; hash: string }): Promise<boolean> {
  const parts = params.hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }

  const expectedBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scryptAsync(
    params.password.normalize('NFKC'),
    salt,
    expectedBuffer.length,
  )) as Buffer;

  if (expectedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, derivedKey);
}

/**
 * Gera um token criptograficamente seguro em formato URL-safe (base64url) com 32 bytes (256 bits) de entropia.
 */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Calcula o hash SHA-256 hexadecimal de um token para armazenamento seguro no banco (`token_hash`).
 * O token puro jamais é persistido em `invitations` ou `verifications`.
 */
export function sha256Hex(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
