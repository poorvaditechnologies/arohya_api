import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IdService } from '../../security/id.service';
import { buildPagination } from '../../common/dto/pagination-query.dto';
import { applicationStatusToLabel, applicationStatusToWire, timelineStatusToWire, APPLICATION_TIMELINE_STEPS } from '../../common/utils/application-status.util';
import { CreateApplicationDto } from './dto/create-application.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
    private readonly i18n: I18nService,
    private readonly files: FilesService,
  ) {}

  // ---------------------------------------------------------------------
  // 7. SUBMIT APPLICATION
  // ---------------------------------------------------------------------
  async submit(userId: string, dto: CreateApplicationDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const product = await this.prisma.financingProduct.findUnique({ where: { id: dto.productId } });
    if (!product || !product.active) {
      throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'productId');
    }
    if (!product.applicationEnabled) {
      throw AppException.of(422, ErrorCode.VALIDATION_FAILED, 'This product is not currently accepting applications', 'productId');
    }

    // applicationNumber sequence: best-effort monotonic counter based on
    // current row count. A tiny race window exists under heavy concurrent
    // writes (two submissions could in theory read the same count before
    // either insert completes) — acceptable for this scope/traffic profile
    // and does not affect correctness of any single application, only the
    // cosmetic sequential-ness of the human-facing number. A DB sequence
    // would remove the race entirely if higher concurrency is expected.
    const count = await this.prisma.application.count();
    const applicationNumber = this.ids.applicationNumber(count + 1);

    const application = await this.prisma.application.create({
      data: {
        id: this.ids.applicationId(),
        applicationNumber,
        userId,
        productId: product.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        mobile: dto.mobile,
        email: dto.email,
        income: dto.income,
        loanNeededDate: dto.loanNeededDate ? new Date(dto.loanNeededDate) : null,
        // GAP #1: requestedAmount is not present in the POST request body
        // per the guide's contract, so it stays null here. We deliberately
        // do NOT fabricate a number from the product's amountLabel range —
        // that would be inventing data the guide explicitly forbids
        // (no fake underwriting/interest/amount logic anywhere). It is
        // populated later by a real underwriting step once one exists.
        requestedAmount: null,
        status: 'SUBMITTED',
        currentStep: 1,
        totalSteps: APPLICATION_TIMELINE_STEPS.length,
        addresses: {
          create: [
            { kind: 'permanent', ...dto.permanentAddress },
            { kind: 'temporary', ...dto.temporaryAddress },
          ],
        },
        timeline: {
          // Step 1 ("Application Submitted") is completed the instant the
          // application exists; every later step is pending until a real
          // (non-fabricated) backend process advances it.
          create: APPLICATION_TIMELINE_STEPS.map((s) => ({
            step: s.step,
            title: s.title,
            status: s.step === 1 ? 'COMPLETED' : 'PENDING',
            completedAt: s.step === 1 ? new Date() : null,
          })),
        },
      },
      include: { product: true },
    });

    return {
      message: this.i18n.translate('application.submitted', lang),
      data: {
        id: application.id,
        applicationNumber: application.applicationNumber,
        productId: application.productId,
        productTitle: application.product.title,
        status: applicationStatusToWire(application.status),
        currentStep: application.currentStep,
        totalSteps: application.totalSteps,
        submittedAt: application.submittedAt.toISOString(),
      },
    };
  }

  // ---------------------------------------------------------------------
  // 8. LIST USER APPLICATIONS
  // ---------------------------------------------------------------------
  async list(userId: string, page: number, limit: number, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where: { userId },
        include: { product: true },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.application.count({ where: { userId } }),
    ]);

    return {
      message: this.i18n.translate('application.list.retrieved', lang),
      data: {
        items: items.map((a) => ({
          id: a.id,
          applicationNumber: a.applicationNumber,
          productId: a.productId,
          productTitle: a.product.title,
          requestedAmount: a.requestedAmount,
          currency: a.currency,
          status: applicationStatusToWire(a.status),
          statusLabel: applicationStatusToLabel(a.status),
          currentStep: a.currentStep,
          totalSteps: a.totalSteps,
          submittedAt: a.submittedAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        pagination: buildPagination(page, limit, total),
      },
    };
  }

  // ---------------------------------------------------------------------
  // 9. APPLICATION DETAILS / TRACKER
  // ---------------------------------------------------------------------
  async detail(userId: string, applicationId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { product: true, timeline: { orderBy: { step: 'asc' } } },
    });
    if (!application) {
      throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'applicationId');
    }
    // Ownership check: a user may only read their own applications. We
    // return 403 ACCESS_DENIED (not 404) when the resource exists but
    // belongs to someone else, matching the guide's own status-code list
    // ("403 - Access denied" is explicitly listed alongside "404 -
    // Resource not found" as a distinct case).
    if (application.userId !== userId) {
      throw AppException.of(403, ErrorCode.ACCESS_DENIED, this.i18n.translate('error.accessDenied', lang), 'applicationId');
    }

    // documents: confirmed attachments scoped to this application, each
    // with a fresh presigned GET URL (file storage extension phase).
    const documents = await this.files.getApplicationDocuments(application.id);

    return {
      message: this.i18n.translate('application.detail.retrieved', lang),
      data: {
        id: application.id,
        applicationNumber: application.applicationNumber,
        productId: application.productId,
        productTitle: application.product.title,
        requestedAmount: application.requestedAmount,
        currency: application.currency,
        status: applicationStatusToWire(application.status),
        statusLabel: applicationStatusToLabel(application.status),
        currentStep: application.currentStep,
        totalSteps: application.totalSteps,
        timeline: application.timeline.map((t) => ({
          step: t.step,
          title: t.title,
          status: timelineStatusToWire(t.status),
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        })),
        documents,
      },
    };
  }
}
