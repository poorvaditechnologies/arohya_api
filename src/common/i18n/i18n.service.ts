import { Injectable } from '@nestjs/common';
import { DICTIONARY } from './dictionary';

export type Lang = 'en' | 'kn';

@Injectable()
export class I18nService {
  translate(key: string, lang: Lang = 'en'): string {
    const entry = DICTIONARY[key];
    if (!entry) return key;
    return entry[lang] ?? entry.en;
  }
}
