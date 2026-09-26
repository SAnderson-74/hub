import type { AppPage } from "../pages";

/** The phone tab bar fits five items. */
export const PHONE_TABS = 5;

/**
 * Splits pages between the phone tab bar and the More page. Up to five pages all
 * get tabs; with more, the first four do and the rest go under More.
 */
export function phoneNav<T extends Pick<AppPage, "id">>(pages: T[]): { tabs: T[]; more: T[] } {
  if (pages.length <= PHONE_TABS) return { tabs: pages, more: [] };
  return { tabs: pages.slice(0, PHONE_TABS - 1), more: pages.slice(PHONE_TABS - 1) };
}
