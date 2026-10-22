import { ApplicationStatus, TimelineStepStatus } from '@prisma/client';

const STATUS_TO_WIRE: Record<ApplicationStatus, string> = {
  SUBMITTED: 'submitted',
  UNDERWRITING: 'underwriting',
  DOCUMENT_VERIFICATION: 'documentVerification',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed',
};

const STATUS_TO_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDERWRITING: 'In Syndicate Underwriting',
  DOCUMENT_VERIFICATION: 'Document Verification',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISBURSED: 'Disbursed',
};

export function applicationStatusToWire(status: ApplicationStatus): string {
  return STATUS_TO_WIRE[status];
}

export function applicationStatusToLabel(status: ApplicationStatus): string {
  return STATUS_TO_LABEL[status];
}

const TIMELINE_STATUS_TO_WIRE: Record<TimelineStepStatus, string> = {
  COMPLETED: 'completed',
  ACTIVE: 'active',
  PENDING: 'pending',
};

export function timelineStatusToWire(status: TimelineStepStatus): string {
  return TIMELINE_STATUS_TO_WIRE[status];
}

// The 4 fixed tracker steps used across every product (loans, SHCG,
// insurance alike) per the guide's generic-applications-endpoint note
// ("Use a generic applications endpoint because products may include
// loans, SHCG or insurance").
export const APPLICATION_TIMELINE_STEPS = [
  { step: 1, title: 'Application Submitted' },
  { step: 2, title: 'Syndicate Underwriting' },
  { step: 3, title: 'Document Verification' },
  { step: 4, title: 'Final Decision' },
];
