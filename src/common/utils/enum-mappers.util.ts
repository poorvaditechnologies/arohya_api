import { EntityType, KycStatus } from '@prisma/client';

// Guide examples use human-readable display strings ("Sole Proprietorship")
// on the wire while Prisma stores a normalized enum. These two small maps
// keep that translation in one place.
const ENTITY_TYPE_TO_DISPLAY: Record<EntityType, string> = {
  SOLE_PROPRIETORSHIP: 'Sole Proprietorship',
  PARTNERSHIP: 'Partnership',
  PRIVATE_LIMITED: 'Private Limited',
  LLP: 'LLP',
  INDIVIDUAL: 'Individual',
};

const DISPLAY_TO_ENTITY_TYPE: Record<string, EntityType> = Object.fromEntries(
  Object.entries(ENTITY_TYPE_TO_DISPLAY).map(([k, v]) => [v.toLowerCase(), k as EntityType]),
);

export function entityTypeToDisplay(value: EntityType): string {
  return ENTITY_TYPE_TO_DISPLAY[value] ?? value;
}

export function displayToEntityType(value: string): EntityType | null {
  return DISPLAY_TO_ENTITY_TYPE[value.trim().toLowerCase()] ?? null;
}

const KYC_STATUS_TO_WIRE: Record<KycStatus, string> = {
  PENDING: 'pending',
  IN_PROGRESS: 'inProgress',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export function kycStatusToWire(value: KycStatus): string {
  return KYC_STATUS_TO_WIRE[value] ?? value;
}
