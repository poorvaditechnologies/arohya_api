import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Central place for all secret hashing (OTP codes, refresh tokens).
 * argon2id is used for both — OTPs are short-lived but still never stored
 * or logged in plaintext, per the guide's explicit "never log/return the
 * OTP" requirement.
 */
@Injectable()
export class HashService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
