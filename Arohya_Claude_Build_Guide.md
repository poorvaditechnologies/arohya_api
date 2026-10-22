# Arohya Capital — Claude Backend Build Guide

This file is a companion to `Arohya_Backend_Technical_Specification.docx`. The original API contract below is the wire-level source of truth.

## Stack
NestJS + Fastify, TypeScript strict, PostgreSQL + Prisma, JWT access (900s), rotating hashed refresh tokens, secure email OTP, Swagger, Docker. Modular monolith, not microservices.

## Build instructions
1. Preserve all 17 endpoints and exact /api/v1 response contracts.
2. Implement modules: auth, users/profile, financing-solutions, applications, dashboard, loan-facilities, support, notifications, shared database/config/security.
3. Use DTO validation, global error/success envelopes, request IDs, en/kn localization, pagination, ownership checks.
4. Prisma models: User, UserConsent, OtpChallenge, RefreshSession, FinancingProduct, Application, ApplicationAddress, ApplicationTimeline, LoanFacility, UserPreference, SupportChannel, RelationshipManager, CallbackRequest, Notification, AuditEvent. Adapt only with documented reasons.
5. No fake production loans, KYC, bureau scores, AA linkages, interest offers, support numbers or EMIs.
6. Keep loan facilities empty until verified data exists; clarify requestedAmount missing in POST /applications; clarify PAN uniqueness and status transitions.
7. Deliver runnable code, migrations, seed, env.example, Docker, Swagger, README, tests.
8. Work in phases: foundation; auth; catalog/applications; remaining endpoints; tests/deployment. At each phase summarize files changed and verification.

## Original API contract (verbatim)

```text
Build REST APIs for the Arohya Flutter application using the following contract.

BASE URL
/api/v1

GENERAL RULES
- Request and response bodies use JSON.
- Dates use YYYY-MM-DD.
- Timestamps use ISO-8601 UTC.
- OTP must be handled as a string because it may start with zero.
- Never return the OTP in production responses.
- Protected endpoints require:
  Authorization: Bearer <accessToken>
- Support localization through:
  Accept-Language: en
  Accept-Language: kn
- Money values are represented in INR as numbers.
- Every endpoint must return the standard response format below.

SUCCESS RESPONSE
{
  "success": true,
  "message": "Human-readable message",
  "data": {}
}

ERROR RESPONSE
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "code": "INVALID_EMAIL",
      "message": "Enter a valid email address"
    }
  ],
  "requestId": "req_01J..."
}


==================================================
1. GENERATE OTP
==================================================

POST /generate-otp

Request:
{
  "email": "rajesh.gowda@example.com",
  "purpose": "login"
}

purpose enum:
- login
- signUp

Successful response: HTTP 200
{
  "success": true,
  "message": "Verification code sent successfully",
  "data": {
    "otpRequestId": "otp_req_01JABC123",
    "purpose": "login",
    "maskedEmail": "ra***@example.com",
    "expiresInSeconds": 300,
    "resendAfterSeconds": 30
  }
}

Important:
- Do not return the generated OTP in production.
- Store only a secure hash of the OTP.
- OTP expires after 5 minutes.
- Limit verification attempts.
- Rate-limit OTP generation by email and IP.
- For local development only, an optional debugOtp field may be returned when the server is explicitly running in development mode.

Possible errors:
- 400 INVALID_EMAIL
- 404 ACCOUNT_NOT_FOUND when purpose is login
- 409 ACCOUNT_ALREADY_EXISTS when purpose is signUp
- 429 OTP_RATE_LIMITED


==================================================
2. LOGIN WITH EMAIL OTP
==================================================

POST /login

Request:
{
  "email": "rajesh.gowda@example.com",
  "otp": "123456",
  "otpRequestId": "otp_req_01JABC123",
  "rememberDevice": true,
  "device": {
    "deviceId": "device_abc123",
    "platform": "android",
    "appVersion": "1.0.0"
  }
}

Successful response: HTTP 200
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "access-token",
    "refreshToken": "refresh-token",
    "accessTokenExpiresInSeconds": 900,
    "user": {
      "id": "usr_rajesh_01",
      "fullName": "Rajesh Kumar Gowda",
      "firstName": "Rajesh",
      "email": "rajesh.gowda@example.com",
      "mobileNumber": "9845012849",
      "entityType": "Sole Proprietorship",
      "kycStatus": "verified"
    }
  }
}

Possible errors:
- 400 INVALID_OTP
- 400 OTP_EXPIRED
- 400 OTP_REQUEST_MISMATCH
- 404 ACCOUNT_NOT_FOUND
- 423 ACCOUNT_LOCKED
- 429 TOO_MANY_ATTEMPTS


==================================================
3. CREATE ACCOUNT
==================================================

POST /sign-up

The app currently collects full name, email, PAN, entity type and statutory consents. These values must be included in the signup request.

Request:
{
  "fullName": "Rajesh Kumar Gowda",
  "email": "rajesh.gowda@example.com",
  "pan": "ABCDE1234F",
  "entityType": "Sole Proprietorship",
  "advisorCode": null,
  "otp": "123456",
  "otpRequestId": "otp_req_01JABC456",
  "consents": {
    "termsAccepted": true,
    "bureauConsent": true,
    "privacyPolicyVersion": "2026-10-01",
    "acceptedAt": "2026-10-22T12:30:00Z"
  }
}

Successful response: HTTP 201
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "accessToken": "access-token",
    "refreshToken": "refresh-token",
    "accessTokenExpiresInSeconds": 900,
    "user": {
      "id": "usr_01JNEWUSER",
      "fullName": "Rajesh Kumar Gowda",
      "firstName": "Rajesh",
      "email": "rajesh.gowda@example.com",
      "mobileNumber": null,
      "panMasked": "ABCDE****F",
      "entityType": "Sole Proprietorship",
      "kycStatus": "pending"
    }
  }
}

Possible errors:
- 400 INVALID_OTP
- 400 OTP_EXPIRED
- 400 INVALID_PAN
- 400 CONSENT_REQUIRED
- 409 EMAIL_ALREADY_REGISTERED
- 409 PAN_ALREADY_REGISTERED


==================================================
4. REFRESH ACCESS TOKEN
==================================================

POST /auth/refresh-token

Request:
{
  "refreshToken": "refresh-token"
}

Response:
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token",
    "accessTokenExpiresInSeconds": 900
  }
}


==================================================
5. LOGOUT
==================================================

POST /auth/logout

Protected endpoint.

Request:
{
  "refreshToken": "refresh-token",
  "deviceId": "device_abc123"
}

Response:
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}


==================================================
6. FINANCING SOLUTIONS
==================================================

GET /financing-solutions

Optional query parameters:
- applicationEnabled=true
- category=loan
- page=1
- limit=50

This endpoint must completely control the Financing Solutions cards.

The Flutter app must not hardcode product titles or keep a static LoanTypes list. The same response should be used for:
1. Financing Solutions cards.
2. “View More” products.
3. The product dropdown on the application screen.

Response:
{
  "success": true,
  "message": "Financing solutions retrieved",
  "data": {
    "initialVisibleCount": 5,
    "products": [
      {
        "id": "product_personal_loan",
        "slug": "personal-loan",
        "title": "Personal Loan",
        "amountLabel": "Up to ₹40 Lakhs",
        "badgeText": "Instant KYC",
        "badgeTone": "success",
        "rateLabel": "From 10.49% p.a.",
        "iconUrl": "https://cdn.example.com/products/personal-loan.svg",
        "fallbackIconKey": "person",
        "sortOrder": 1,
        "visibleInitially": true,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_business_loan",
        "slug": "business-loan",
        "title": "Business Loan",
        "amountLabel": "Up to ₹50 Lakhs",
        "badgeText": "High Limit",
        "badgeTone": "gold",
        "rateLabel": "From 11.75% p.a.",
        "iconUrl": "https://cdn.example.com/products/business-loan.svg",
        "fallbackIconKey": "business",
        "sortOrder": 2,
        "visibleInitially": true,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_home_loan",
        "slug": "home-loan",
        "title": "Home Loan",
        "amountLabel": "Custom limits",
        "badgeText": "Long Tenure",
        "badgeTone": "neutral",
        "rateLabel": "From 8.50% p.a.",
        "iconUrl": "https://cdn.example.com/products/home-loan.svg",
        "fallbackIconKey": "home",
        "sortOrder": 3,
        "visibleInitially": true,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_vehicle_loan",
        "slug": "vehicle-loan",
        "title": "Vehicle Loan",
        "amountLabel": "Up to 90% on-road",
        "badgeText": "New & Pre-owned",
        "badgeTone": "neutral",
        "rateLabel": "From 8.90% p.a.",
        "iconUrl": "https://cdn.example.com/products/vehicle-loan.svg",
        "fallbackIconKey": "vehicle",
        "sortOrder": 4,
        "visibleInitially": true,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_against_property",
        "slug": "against-property",
        "title": "Against Property",
        "amountLabel": "Up to ₹5 Crores",
        "badgeText": "Collateralized",
        "badgeTone": "neutral",
        "rateLabel": "From 9.15% p.a.",
        "iconUrl": "https://cdn.example.com/products/property.svg",
        "fallbackIconKey": "property",
        "sortOrder": 5,
        "visibleInitially": true,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_invoice_discounting",
        "slug": "invoice-discounting",
        "title": "Invoice Discounting",
        "amountLabel": "Up to 85% invoice",
        "badgeText": "Fast Liquidity",
        "badgeTone": "success",
        "rateLabel": "From 0.85% /mo",
        "iconUrl": "https://cdn.example.com/products/invoice.svg",
        "fallbackIconKey": "invoice",
        "sortOrder": 6,
        "visibleInitially": false,
        "applicationEnabled": true,
        "category": "businessFinance",
        "active": true
      },
      {
        "id": "product_shcg",
        "slug": "shcg",
        "title": "SHCG",
        "amountLabel": "Tailored support",
        "badgeText": "Inclusive Credit",
        "badgeTone": "gold",
        "rateLabel": "Custom pricing",
        "iconUrl": "https://cdn.example.com/products/shcg.svg",
        "fallbackIconKey": "group",
        "sortOrder": 7,
        "visibleInitially": false,
        "applicationEnabled": true,
        "category": "loan",
        "active": true
      },
      {
        "id": "product_insurance",
        "slug": "insurance",
        "title": "Insurance",
        "amountLabel": "Custom coverage",
        "badgeText": "Protection",
        "badgeTone": "info",
        "rateLabel": "Flexible plans",
        "iconUrl": "https://cdn.example.com/products/insurance.svg",
        "fallbackIconKey": "shield",
        "sortOrder": 8,
        "visibleInitially": false,
        "applicationEnabled": true,
        "category": "insurance",
        "active": true
      }
    ]
  }
}

Backend behavior:
- Return only active products to the mobile app.
- Sort using sortOrder.
- Products with visibleInitially=false appear after “View More”.
- Removing or disabling a product in the backend must remove it from the app.
- New products should appear without an app update.
- Use iconUrl for fully dynamic icons.
- The app should show a generic fallback icon if iconUrl cannot load.
- The application screen must send productId, not the product title.


==================================================
7. SUBMIT PRODUCT/LOAN APPLICATION
==================================================

POST /applications

Protected endpoint.

Use a generic applications endpoint because products may include loans, SHCG or insurance.

Request:
{
  "productId": "product_home_loan",
  "firstName": "Rajesh",
  "lastName": "Gowda",
  "mobile": "9845012849",
  "email": "rajesh.gowda@example.com",
  "income": 75000,
  "loanNeededDate": "2026-12-15",
  "permanentAddress": {
    "addressLine": "24 MG Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560001",
    "country": "IN"
  },
  "temporaryAddress": {
    "sameAsPermanent": true,
    "addressLine": "24 MG Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560001",
    "country": "IN"
  }
}

Optional fields:
- email
- income
- loanNeededDate

Response: HTTP 201
{
  "success": true,
  "message": "Application submitted successfully",
  "data": {
    "id": "application_01JABC",
    "applicationNumber": "ARH10295",
    "productId": "product_home_loan",
    "productTitle": "Home Loan",
    "status": "submitted",
    "currentStep": 1,
    "totalSteps": 4,
    "submittedAt": "2026-10-22T12:45:00Z"
  }
}


==================================================
8. LIST USER APPLICATIONS
==================================================

GET /applications?page=1&limit=20

Protected endpoint.

Response:
{
  "success": true,
  "message": "Applications retrieved",
  "data": {
    "items": [
      {
        "id": "application_01JABC",
        "applicationNumber": "ARH10294",
        "productId": "product_business_loan",
        "productTitle": "MSME Business Loan",
        "requestedAmount": 2500000,
        "currency": "INR",
        "status": "underwriting",
        "statusLabel": "In Syndicate Underwriting",
        "currentStep": 2,
        "totalSteps": 4,
        "submittedAt": "2026-10-20T10:00:00Z",
        "updatedAt": "2026-10-22T08:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "hasNextPage": false
    }
  }
}


==================================================
9. APPLICATION DETAILS/TRACKER
==================================================

GET /applications/{applicationId}

Protected endpoint.

Response:
{
  "success": true,
  "message": "Application details retrieved",
  "data": {
    "id": "application_01JABC",
    "applicationNumber": "ARH10294",
    "productId": "product_business_loan",
    "productTitle": "MSME Business Loan",
    "requestedAmount": 2500000,
    "currency": "INR",
    "status": "underwriting",
    "statusLabel": "In Syndicate Underwriting",
    "currentStep": 2,
    "totalSteps": 4,
    "timeline": [
      {
        "step": 1,
        "title": "Application Submitted",
        "status": "completed",
        "completedAt": "2026-10-20T10:00:00Z"
      },
      {
        "step": 2,
        "title": "Syndicate Underwriting",
        "status": "active",
        "completedAt": null
      },
      {
        "step": 3,
        "title": "Document Verification",
        "status": "pending",
        "completedAt": null
      },
      {
        "step": 4,
        "title": "Final Decision",
        "status": "pending",
        "completedAt": null
      }
    ]
  }
}


==================================================
10. DASHBOARD
==================================================

GET /dashboard

Protected endpoint.

Response:
{
  "success": true,
  "message": "Dashboard retrieved",
  "data": {
    "user": {
      "firstName": "Rajesh",
      "kycStatus": "verified",
      "tierLabel": "Fiduciary Tier 1 Verified"
    },
    "activeApplication": {
      "id": "application_01JABC",
      "applicationNumber": "ARH10294",
      "productTitle": "MSME Business Loan",
      "requestedAmount": 2500000,
      "currency": "INR",
      "status": "underwriting",
      "statusLabel": "In Syndicate Underwriting",
      "currentStep": 2,
      "totalSteps": 4
    },
    "unreadNotificationCount": 0
  }
}


==================================================
11. ACTIVE LOAN FACILITIES
==================================================

GET /loan-facilities?page=1&limit=20

Protected endpoint.

Response:
{
  "success": true,
  "message": "Loan facilities retrieved",
  "data": {
    "items": [
      {
        "id": "facility_01",
        "title": "Working Capital Line",
        "sanctionedAmount": 2500000,
        "currency": "INR",
        "nextEmiAmount": 58450,
        "nextEmiDate": "2026-11-05",
        "status": "active",
        "statusLabel": "Active",
        "autoDebitActive": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "hasNextPage": false
    }
  }
}


==================================================
12. USER PROFILE
==================================================

GET /profile

Protected endpoint.

Response:
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "id": "usr_rajesh_01",
    "fullName": "Rajesh Kumar Gowda",
    "email": "rajesh.gowda@example.com",
    "mobileNumber": "9845012849",
    "businessType": "Sole Proprietorship",
    "panMasked": "ABCDE****F",
    "gstinStatus": "verified",
    "gstinMasked": "AAACB****F1Z5",
    "accountAggregator": {
      "status": "linked",
      "handle": "9845012849@finvu"
    },
    "kycStatus": "verified",
    "preferences": {
      "biometricEnabled": true
    }
  }
}


==================================================
13. UPDATE PROFILE PREFERENCES
==================================================

PATCH /profile/preferences

Protected endpoint.

Request:
{
  "biometricEnabled": false
}

Response:
{
  "success": true,
  "message": "Preferences updated",
  "data": {
    "biometricEnabled": false
  }
}


==================================================
14. SUPPORT CONFIGURATION
==================================================

GET /support

Protected endpoint.

The support screen should be driven from this endpoint so phone numbers,
relationship managers, WhatsApp links and email addresses can change without
an app update.

Response:
{
  "success": true,
  "message": "Support information retrieved",
  "data": {
    "relationshipManager": {
      "id": "rm_01",
      "name": "Vikram Krishnamurthy",
      "title": "Senior Fiduciary Relationship Manager",
      "initials": "VK",
      "available": true,
      "availabilityLabel": "Available 09:00 - 19:00 IST",
      "profileImageUrl": null
    },
    "channels": [
      {
        "id": "helpline",
        "type": "phone",
        "title": "Institutional Helpline",
        "subtitle": "+91 80 4920 1800 (Toll Free)",
        "actionUrl": "tel:+918049201800",
        "iconUrl": null,
        "fallbackIconKey": "phone",
        "sortOrder": 1,
        "active": true
      },
      {
        "id": "whatsapp",
        "type": "whatsapp",
        "title": "Priority WhatsApp Desk",
        "subtitle": "Direct RM chat with document support",
        "actionUrl": "https://wa.me/918049201800",
        "iconUrl": null,
        "fallbackIconKey": "chat",
        "sortOrder": 2,
        "active": true
      },
      {
        "id": "grievance",
        "type": "email",
        "title": "Fiduciary Grievance Officer",
        "subtitle": "grievance@arohyacapital.in",
        "actionUrl": "mailto:grievance@arohyacapital.in",
        "iconUrl": null,
        "fallbackIconKey": "email",
        "sortOrder": 3,
        "active": true
      }
    ]
  }
}


==================================================
15. SCHEDULE SUPPORT CALL
==================================================

POST /support/callback-requests

Protected endpoint.

Request:
{
  "preferredDate": "2026-10-25",
  "preferredTimeSlot": "14:00-16:00",
  "topic": "Business Loan",
  "notes": "Need help understanding required documents"
}

Response: HTTP 201
{
  "success": true,
  "message": "Callback scheduled successfully",
  "data": {
    "callbackRequestId": "callback_01JABC",
    "status": "scheduled",
    "preferredDate": "2026-10-25",
    "preferredTimeSlot": "14:00-16:00"
  }
}


==================================================
16. NOTIFICATIONS
==================================================

GET /notifications?page=1&limit=20

Protected endpoint.

Response:
{
  "success": true,
  "message": "Notifications retrieved",
  "data": {
    "unreadCount": 1,
    "items": [
      {
        "id": "notification_01",
        "title": "Application updated",
        "message": "Application ARH10294 has entered underwriting.",
        "type": "applicationUpdate",
        "referenceId": "application_01JABC",
        "read": false,
        "createdAt": "2026-10-22T08:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "hasNextPage": false
    }
  }
}

PATCH /notifications/{notificationId}/read

Response:
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": "notification_01",
    "read": true
  }
}


==================================================
RECOMMENDED HTTP STATUS CODES
==================================================

200 - Successful request
201 - Resource created
400 - Validation error, invalid OTP or expired OTP
401 - Missing or invalid access token
403 - Access denied
404 - Resource not found
409 - Duplicate account or conflicting data
422 - Business validation failure
423 - Account locked
429 - Rate limit exceeded
500 - Unexpected server error


==================================================
IMPORTANT MOBILE APP INTEGRATION CHANGES
==================================================

1. Replace the mock OTP provider with /generate-otp.
2. Send otpRequestId with /login and /sign-up.
3. Securely store accessToken and refreshToken.
4. Replace the hardcoded FinancingSolutionsGrid lists with
   GET /financing-solutions.
5. Remove the static LoanTypes.all list.
6. Pass productId to the application screen instead of passing the product title.
7. Populate the application product dropdown from GET /financing-solutions
   where applicationEnabled=true.
8. Use iconUrl for backend-controlled icons and fallbackIconKey when loading fails.
9. Replace mock application submission with POST /applications.
10. Replace dashboard placeholder data with GET /dashboard.
11. Replace loan facilities placeholder data with GET /loan-facilities.
12. Replace profile placeholder data with GET /profile.
13. Replace support placeholder data with GET /support.
14. Cache financing solutions and support configuration locally so the app can
    display the last successful response when temporarily offline.
```
