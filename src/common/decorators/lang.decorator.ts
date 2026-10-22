import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Lang } from '../i18n/i18n.service';

export const CurrentLang = createParamDecorator((_: unknown, ctx: ExecutionContext): Lang => {
  const req: any = ctx.switchToHttp().getRequest();
  return (req.lang as Lang) ?? 'en';
});
