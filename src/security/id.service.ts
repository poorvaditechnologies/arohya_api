import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';

/** Generates the public, prefixed ids used throughout the API responses. */
@Injectable()
export class IdService {
  userId(): string {
    return `usr_${ulid()}`;
  }

  applicationId(): string {
    return `application_${ulid()}`;
  }

  notificationId(): string {
    return `notification_${ulid()}`;
  }

  loanFacilityId(): string {
    return `facility_${ulid()}`;
  }

  otpRequestId(): string {
    return `otp_req_${ulid()}`;
  }

  applicationNumber(seed: number): string {
    // ARH + zero-padded sequential-ish number. Uses a DB sequence value
    // passed in by the caller so numbers stay unique and roughly ordered;
    // see ApplicationsService for how `seed` is produced.
    return `ARH${String(10000 + seed)}`;
  }

  callbackRequestId(): string {
    return `callback_${ulid()}`;
  }
}
