import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SALT_BYTES = 32;
const KEY_LENGTH = 64;

/**
 * Creates a password verifier using Node's built-in scrypt.
 *
 * The original password is never stored.
 * The returned value contains only the salt and derived hash.
 */
export function hashPassword(password: string): {
  hash: string;
  salt: string;
} {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const salt = randomBytes(SALT_BYTES);

  const derivedKey = scryptSync(password, salt, KEY_LENGTH);

  return {
    hash: derivedKey.toString("hex"),
    salt: salt.toString("hex"),
  };
}

/**
 * Verifies a password against the stored salt + hash.
 *
 * timingSafeEqual prevents simple timing-based comparisons.
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  if (!password || !storedHash || !storedSalt) {
    return false;
  }

  try {
    const salt = Buffer.from(storedSalt, "hex");
    const expectedHash = Buffer.from(storedHash, "hex");

    if (expectedHash.length !== KEY_LENGTH) {
      return false;
    }

    const actualHash = scryptSync(
      password,
      salt,
      KEY_LENGTH,
    );

    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
