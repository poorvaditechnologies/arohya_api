import { ApplicationsService } from './applications.service';
import { IdService } from '../../security/id.service';
import { I18nService } from '../../common/i18n/i18n.service';

describe('ApplicationsService', () => {
  let prisma: any;
  let service: ApplicationsService;

  beforeEach(() => {
    prisma = {
      financingProduct: { findUnique: jest.fn() },
      application: { count: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    };
    const files: any = { getApplicationDocuments: jest.fn().mockResolvedValue([]) };
    service = new ApplicationsService(prisma, new IdService(), new I18nService(), files);
  });

  const product = { id: 'product_home_loan', title: 'Home Loan', active: true, applicationEnabled: true };
  const dto = {
    productId: 'product_home_loan',
    firstName: 'Rajesh',
    lastName: 'Gowda',
    mobile: '9845012849',
    email: 'rajesh@example.com',
    income: 75000,
    loanNeededDate: '2026-12-15',
    permanentAddress: { addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
    temporaryAddress: { sameAsPermanent: true, addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
  };

  describe('submit', () => {
    it('returns 404 RESOURCE_NOT_FOUND for an unknown/inactive product', async () => {
      prisma.financingProduct.findUnique.mockResolvedValue(null);
      await expect(service.submit('usr_1', dto as any, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' })],
      });
    });

    it('returns 422 when the product does not accept applications', async () => {
      prisma.financingProduct.findUnique.mockResolvedValue({ ...product, applicationEnabled: false });
      await expect(service.submit('usr_1', dto as any, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'VALIDATION_FAILED' })],
      });
    });

    it('creates the application with requestedAmount null (GAP #1) and status submitted/step 1', async () => {
      prisma.financingProduct.findUnique.mockResolvedValue(product);
      prisma.application.count.mockResolvedValue(0);
      prisma.application.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, product, submittedAt: new Date('2026-10-22T12:45:00Z') }),
      );

      const result = await service.submit('usr_1', dto as any, 'en');

      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requestedAmount: null, status: 'SUBMITTED', currentStep: 1 }) }),
      );
      expect(result.data.status).toBe('submitted');
      expect(result.data.productTitle).toBe('Home Loan');
      expect(result.data.applicationNumber).toMatch(/^ARH/);
    });
  });

  describe('detail (ownership)', () => {
    it('returns 404 when the application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(service.detail('usr_1', 'app_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' })],
      });
    });

    it('returns 403 ACCESS_DENIED when the application belongs to another user', async () => {
      prisma.application.findUnique.mockResolvedValue({ id: 'app_x', userId: 'someone_else', timeline: [], product: { title: 'X' } });
      await expect(service.detail('usr_1', 'app_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCESS_DENIED' })],
      });
    });

    it('returns the application detail with mapped timeline for the owner', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app_x',
        userId: 'usr_1',
        applicationNumber: 'ARH10001',
        productId: 'product_home_loan',
        product: { title: 'Home Loan' },
        requestedAmount: null,
        currency: 'INR',
        status: 'SUBMITTED',
        currentStep: 1,
        totalSteps: 4,
        timeline: [
          { step: 1, title: 'Application Submitted', status: 'COMPLETED', completedAt: new Date('2026-10-22T12:45:00Z') },
          { step: 2, title: 'Syndicate Underwriting', status: 'PENDING', completedAt: null },
        ],
      });

      const result = await service.detail('usr_1', 'app_x', 'en');
      const timeline = result.data.timeline as any[];
      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toMatchObject({ step: 1, status: 'completed' });
      expect(timeline[1]).toMatchObject({ step: 2, status: 'pending', completedAt: null });
    });
  });
});
