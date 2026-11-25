export function cssDe(html: string): string;
export function reglasTope(css: string): string[];
export function norm(r: string): string;
export const SELECTOR_PAPEL: RegExp;
export function reglasDePapel(html: string, selector?: RegExp): string[];
export interface ReglaPlana { media: string; selector: string; cuerpo: string; }
export function reglasPlanas(html: string): ReglaPlana[];
