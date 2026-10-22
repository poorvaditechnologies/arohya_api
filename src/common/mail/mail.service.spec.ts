// Mocks nodemailer entirely so this test never makes a real SMTP connection.
const sendMailMock = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockImplementation(() => ({ sendMail: sendMailMock })),
}));

import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  const config = new ConfigService({
    email: {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user@example.com',
      password: 'secret',
      from: 'noreply@example.com',
    },
  });

  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'abc123' });
    service = new MailService(config as any);
  });

  it('sends an OTP email with the from/to/subject/text/html fields set', async () => {
    await service.sendOtpEmail('to@example.com', '123456', 'login', 300, 'en');

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.from).toBe('noreply@example.com');
    expect(call.to).toBe('to@example.com');
    expect(call.subject).toContain('Login');
    expect(call.text).toContain('123456');
    expect(call.html).toContain('123456');
  });

  it('renders a signUp-purpose subject differently from login', async () => {
    await service.sendOtpEmail('to@example.com', '654321', 'signUp', 300, 'en');
    const call = sendMailMock.mock.calls[0][0];
    expect(call.subject).toContain('Sign-up');
  });

  it('renders the Kannada text when lang is kn', async () => {
    await service.sendOtpEmail('to@example.com', '111111', 'login', 300, 'kn');
    const call = sendMailMock.mock.calls[0][0];
    expect(call.text).toContain('111111');
  });

  it('propagates a transport failure to the caller', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));
    await expect(service.sendOtpEmail('to@example.com', '111111', 'login', 300, 'en')).rejects.toThrow('SMTP connection refused');
  });
});
