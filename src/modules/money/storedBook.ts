/** The book Money last showed, remembered in this browser. */
export const BOOK_KEY = "hub.money.book";

export function storedBookId(): number | null {
  try {
    return Number(localStorage.getItem(BOOK_KEY)) || null;
  } catch {
    return null;
  }
}
