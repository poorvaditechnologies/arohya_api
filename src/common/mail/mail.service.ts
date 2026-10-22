import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../../config/configuration';
import { Lang } from '../i18n/i18n.service';

/**
 * Thin wrapper around nodemailer, mirroring StorageService's role for S3:
 * all SMTP wiring lives here so business logic (AuthService) stays free of
 * transport details, and so unit tests can mock just this client (see
 * mail.service.spec.ts, which mocks nodemailer#createTransport).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const email = this.config.get('email', { infer: true });
    this.from = email.from;
    this.transporter = nodemailer.createTransport({
      host: email.host,
      port: email.port,
      secure: email.secure,
      auth: { user: email.user, pass: email.password },
    });
  }

  /**
   * Sends the real OTP code to the user's email for login/signUp.
   *
   * Callers (AuthService.generateOtp) deliberately do NOT await a
   * guaranteed-success contract here: if this throws, the caller catches
   * and logs it rather than failing the whole request, since the OTP is
   * already persisted/valid regardless of whether the email made it out
   * (see AuthService for the full rationale).
   */
  async sendOtpEmail(to: string, otp: string, purpose: 'login' | 'signUp', expiresInSeconds: number, lang: Lang): Promise<void> {
    const minutes = Math.ceil(expiresInSeconds / 60);
    const subject = this.subjectFor(purpose, lang);
    const text = this.textBodyFor(otp, minutes, lang);
    const html = this.htmlBodyFor(otp, minutes, lang);

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
  }

  private subjectFor(purpose: 'login' | 'signUp', lang: Lang): string {
    if (lang === 'kn') {
      return purpose === 'signUp' ? 'ಅರೋಹ್ಯ ಕ್ಯಾಪಿಟಲ್ - ನೋಂದಣಿ ಪರಿಶೀಲನಾ ಸಂಕೇತ' : 'ಅರೋಹ್ಯ ಕ್ಯಾಪಿಟಲ್ - ಲಾಗಿನ್ ಪರಿಶೀಲನಾ ಸಂಕೇತ';
    }
    return purpose === 'signUp' ? 'Arohya Capital - Sign-up verification code' : 'Arohya Capital - Login verification code';
  }

  private textBodyFor(otp: string, minutes: number, lang: Lang): string {
    if (lang === 'kn') {
      return `ನಿಮ್ಮ ಪರಿಶೀಲನಾ ಸಂಕೇತ: ${otp}\n\nಇದು ${minutes} ನಿಮಿಷಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ. ಈ ಸಂಕೇತವನ್ನು ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.`;
    }
    return `Your verification code is: ${otp}\n\nThis code will expire in ${minutes} minute(s). Do not share this code with anyone.`;
  }

  private htmlBodyFor(otp: string, minutes: number, lang: Lang): string {
    const title = lang === 'kn' ? 'ನಿಮ್ಮ ಪರಿಶೀಲನಾ ಸಂಕೇತ' : 'Your verification code';
    const note =
      lang === 'kn'
        ? `ಇದು ${minutes} ನಿಮಿಷಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ. ಈ ಸಂಕೇತವನ್ನು ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.`
        : `This code will expire in ${minutes} minute(s). Do not share this code with anyone.`;
    return `<div style="font-family:sans-serif"><p>${title}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>${note}</p></div>`;
  }
}
