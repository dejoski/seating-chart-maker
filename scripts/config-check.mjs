import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
export const PRINT_KIT_LINK_EMPTY = /PRINT_KIT_LINK = ''/.test(src) && /TEACHER_PACK_LINK = ''/.test(src);
