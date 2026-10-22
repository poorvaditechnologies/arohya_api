/**
 * Seed script for local/dev testing against the real Neon database.
 *
 * Seeds:
 *  1. The financing-solutions catalog — the 8 products listed verbatim in
 *     the guide's endpoint 6 example response.
 *  2. Support config — 1 RelationshipManager + 3 SupportChannel rows from
 *     endpoint 14's example.
 *  3. One demo User (+ UserConsent + UserPreference) so every protected
 *     endpoint is testable end-to-end without first running the full
 *     sign-up flow.
 *  4. For that demo user only: one demo Application (in "underwriting",
 *     matching the guide's own endpoint 8/9 example so those responses can
 *     be exercised immediately) and one demo LoanFacility ("Working
 *     Capital Line", matching endpoint 11's example) and one demo
 *     Notification (matching endpoint 16's example). These are explicit,
 *     clearly-labelled seed/dev fixtures — NOT runtime-fabricated
 *     business data. No other user ever gets auto-generated facilities;
 *     see LoanFacilitiesService for the "no fake facilities" rule.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    id: 'product_personal_loan',
    slug: 'personal-loan',
    title: 'Personal Loan',
    amountLabel: 'Up to ₹40 Lakhs',
    badgeText: 'Instant KYC',
    badgeTone: 'success',
    rateLabel: 'From 10.49% p.a.',
    iconUrl: 'https://cdn.example.com/products/personal-loan.svg',
    fallbackIconKey: 'person',
    sortOrder: 1,
    visibleInitially: true,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_business_loan',
    slug: 'business-loan',
    title: 'Business Loan',
    amountLabel: 'Up to ₹50 Lakhs',
    badgeText: 'High Limit',
    badgeTone: 'gold',
    rateLabel: 'From 11.75% p.a.',
    iconUrl: 'https://cdn.example.com/products/business-loan.svg',
    fallbackIconKey: 'business',
    sortOrder: 2,
    visibleInitially: true,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_home_loan',
    slug: 'home-loan',
    title: 'Home Loan',
    amountLabel: 'Custom limits',
    badgeText: 'Long Tenure',
    badgeTone: 'neutral',
    rateLabel: 'From 8.50% p.a.',
    iconUrl: 'https://cdn.example.com/products/home-loan.svg',
    fallbackIconKey: 'home',
    sortOrder: 3,
    visibleInitially: true,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_vehicle_loan',
    slug: 'vehicle-loan',
    title: 'Vehicle Loan',
    amountLabel: 'Up to 90% on-road',
    badgeText: 'New & Pre-owned',
    badgeTone: 'neutral',
    rateLabel: 'From 8.90% p.a.',
    iconUrl: 'https://cdn.example.com/products/vehicle-loan.svg',
    fallbackIconKey: 'vehicle',
    sortOrder: 4,
    visibleInitially: true,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_against_property',
    slug: 'against-property',
    title: 'Against Property',
    amountLabel: 'Up to ₹5 Crores',
    badgeText: 'Collateralized',
    badgeTone: 'neutral',
    rateLabel: 'From 9.15% p.a.',
    iconUrl: 'https://cdn.example.com/products/property.svg',
    fallbackIconKey: 'property',
    sortOrder: 5,
    visibleInitially: true,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_invoice_discounting',
    slug: 'invoice-discounting',
    title: 'Invoice Discounting',
    amountLabel: 'Up to 85% invoice',
    badgeText: 'Fast Liquidity',
    badgeTone: 'success',
    rateLabel: 'From 0.85% /mo',
    iconUrl: 'https://cdn.example.com/products/invoice.svg',
    fallbackIconKey: 'invoice',
    sortOrder: 6,
    visibleInitially: false,
    applicationEnabled: true,
    category: 'businessFinance',
    active: true,
  },
  {
    id: 'product_shcg',
    slug: 'shcg',
    title: 'SHCG',
    amountLabel: 'Tailored support',
    badgeText: 'Inclusive Credit',
    badgeTone: 'gold',
    rateLabel: 'Custom pricing',
    iconUrl: 'https://cdn.example.com/products/shcg.svg',
    fallbackIconKey: 'group',
    sortOrder: 7,
    visibleInitially: false,
    applicationEnabled: true,
    category: 'loan',
    active: true,
  },
  {
    id: 'product_insurance',
    slug: 'insurance',
    title: 'Insurance',
    amountLabel: 'Custom coverage',
    badgeText: 'Protection',
    badgeTone: 'info',
    rateLabel: 'Flexible plans',
    iconUrl: 'https://cdn.example.com/products/insurance.svg',
    fallbackIconKey: 'shield',
    sortOrder: 8,
    visibleInitially: false,
    applicationEnabled: true,
    category: 'insurance',
    active: true,
  },
];

const RELATIONSHIP_MANAGER = {
  id: 'rm_01',
  name: 'Vikram Krishnamurthy',
  title: 'Senior Fiduciary Relationship Manager',
  initials: 'VK',
  available: true,
  availabilityLabel: 'Available 09:00 - 19:00 IST',
  profileImageUrl: null,
  active: true,
};

const SUPPORT_CHANNELS = [
  {
    id: 'helpline',
    type: 'PHONE' as const,
    title: 'Institutional Helpline',
    subtitle: '+91 80 4920 1800 (Toll Free)',
    actionUrl: 'tel:+918049201800',
    iconUrl: null,
    fallbackIconKey: 'phone',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'whatsapp',
    type: 'WHATSAPP' as const,
    title: 'Priority WhatsApp Desk',
    subtitle: 'Direct RM chat with document support',
    actionUrl: 'https://wa.me/918049201800',
    iconUrl: null,
    fallbackIconKey: 'chat',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'grievance',
    type: 'EMAIL' as const,
    title: 'Fiduciary Grievance Officer',
    subtitle: 'grievance@arohyacapital.in',
    actionUrl: 'mailto:grievance@arohyacapital.in',
    iconUrl: null,
    fallbackIconKey: 'email',
    sortOrder: 3,
    active: true,
  },
];

const DEMO_USER_ID = 'usr_demo_rajesh';
const DEMO_EMAIL = 'rajesh.gowda@example.com';

async function main() {
  console.log('Seeding financing products...');
  for (const p of PRODUCTS) {
    await prisma.financingProduct.upsert({ where: { id: p.id }, create: p, update: p });
  }

  console.log('Seeding relationship manager...');
  await prisma.relationshipManager.upsert({
    where: { id: RELATIONSHIP_MANAGER.id },
    create: RELATIONSHIP_MANAGER,
    update: RELATIONSHIP_MANAGER,
  });

  console.log('Seeding support channels...');
  for (const c of SUPPORT_CHANNELS) {
    await prisma.supportChannel.upsert({ where: { id: c.id }, create: c, update: c });
  }

  console.log('Seeding demo user...');
  const demoUser = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      fullName: 'Rajesh Kumar Gowda',
      firstName: 'Rajesh',
      email: DEMO_EMAIL,
      mobileNumber: '9845012849',
      pan: 'ABCDE1234F',
      entityType: 'SOLE_PROPRIETORSHIP',
      kycStatus: 'VERIFIED',
      gstinStatus: 'verified',
      gstin: 'AAACB1234F1Z5',
      accountAggregatorStatus: 'linked',
      accountAggregatorHandle: '9845012849@finvu',
      consents: {
        create: {
          termsAccepted: true,
          bureauConsent: true,
          privacyPolicyVersion: '2026-10-01',
          acceptedAt: new Date('2026-10-01T00:00:00Z'),
        },
      },
      preference: { create: { biometricEnabled: true } },
    },
    update: {},
  });

  console.log('Seeding a demo application (underwriting) for the demo user...');
  const existingApp = await prisma.application.findFirst({ where: { userId: demoUser.id } });
  if (!existingApp) {
    await prisma.application.create({
      data: {
        id: 'application_demo_01',
        applicationNumber: 'ARH10294',
        userId: demoUser.id,
        productId: 'product_business_loan',
        firstName: 'Rajesh',
        lastName: 'Gowda',
        mobile: '9845012849',
        email: DEMO_EMAIL,
        income: 150000,
        requestedAmount: 2500000,
        status: 'UNDERWRITING',
        currentStep: 2,
        totalSteps: 4,
        submittedAt: new Date('2026-10-20T10:00:00Z'),
        addresses: {
          create: [
            { kind: 'permanent', addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
            { kind: 'temporary', sameAsPermanent: true, addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
          ],
        },
        timeline: {
          create: [
            { step: 1, title: 'Application Submitted', status: 'COMPLETED', completedAt: new Date('2026-10-20T10:00:00Z') },
            { step: 2, title: 'Syndicate Underwriting', status: 'ACTIVE', completedAt: null },
            { step: 3, title: 'Document Verification', status: 'PENDING', completedAt: null },
            { step: 4, title: 'Final Decision', status: 'PENDING', completedAt: null },
          ],
        },
      },
    });
  }

  console.log('Seeding a demo loan facility for the demo user...');
  const existingFacility = await prisma.loanFacility.findFirst({ where: { userId: demoUser.id } });
  if (!existingFacility) {
    await prisma.loanFacility.create({
      data: {
        id: 'facility_demo_01',
        userId: demoUser.id,
        title: 'Working Capital Line',
        sanctionedAmount: 2500000,
        nextEmiAmount: 58450,
        nextEmiDate: new Date('2026-11-05'),
        status: 'ACTIVE',
        autoDebitActive: true,
      },
    });
  }

  console.log('Seeding a demo notification for the demo user...');
  const existingNotification = await prisma.notification.findFirst({ where: { userId: demoUser.id } });
  if (!existingNotification) {
    await prisma.notification.create({
      data: {
        id: 'notification_demo_01',
        userId: demoUser.id,
        title: 'Application updated',
        message: 'Application ARH10294 has entered underwriting.',
        type: 'APPLICATION_UPDATE',
        referenceId: 'application_demo_01',
        read: false,
        createdAt: new Date('2026-10-22T08:30:00Z'),
      },
    });
  }

  // Demo credentials helper: pre-create a LOGIN OtpChallenge for the demo
  // user with a known OTP so a reviewer can call POST /login immediately
  // without first calling /generate-otp. This is ONLY ever done in the
  // seed script (never in production application code) and the OTP is
  // printed once to the console, never stored in plaintext.
  console.log('Pre-creating a login OTP challenge for the demo user...');
  const demoOtp = '123456';
  const demoOtpHash = await argon2.hash(demoOtp, { type: argon2.argon2id });
  const demoRequestId = `otp_req_${ulid()}`;
  await prisma.otpChallenge.create({
    data: {
      requestId: demoRequestId,
      email: DEMO_EMAIL,
      userId: demoUser.id,
      purpose: 'LOGIN',
      otpHash: demoOtpHash,
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days, seed/dev only
      resendAfter: new Date(),
    },
  });

  console.log('\n================ DEMO CREDENTIALS ================');
  console.log(`Email:          ${DEMO_EMAIL}`);
  console.log(`Pre-seeded OTP: ${demoOtp}`);
  console.log(`otpRequestId:   ${demoRequestId}`);
  console.log('Use these directly with POST /api/v1/login, or call');
  console.log('POST /api/v1/generate-otp with purpose "login" to get a');
  console.log('fresh otpRequestId + debugOtp (NODE_ENV=development only).');
  console.log('====================================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
