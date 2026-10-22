export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    accessExpiresInSeconds: number;
    refreshSecret: string;
    refreshExpiresInDays: number;
  };
  otp: {
    ttlSeconds: number;
    resendAfterSeconds: number;
    maxVerifyAttempts: number;
    lockoutMinutes: number;
    generateMaxPerWindow: number;
    generateWindowSeconds: number;
  };
  aws: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-secret',
    accessExpiresInSeconds: parseInt(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? '900', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshExpiresInDays: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '30', 10),
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
    resendAfterSeconds: parseInt(process.env.OTP_RESEND_AFTER_SECONDS ?? '30', 10),
    maxVerifyAttempts: parseInt(process.env.OTP_MAX_VERIFY_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.OTP_LOCKOUT_MINUTES ?? '15', 10),
    generateMaxPerWindow: parseInt(process.env.OTP_GENERATE_MAX_PER_WINDOW ?? '5', 10),
    generateWindowSeconds: parseInt(process.env.OTP_GENERATE_WINDOW_SECONDS ?? '600', 10),
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    region: process.env.AWS_REGION ?? 'ap-south-1',
    bucketName: process.env.AWS_BUCKET_NAME ?? '',
  },
});
