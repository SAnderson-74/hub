/** The book Money last showed, remembered in this browser. */
export const BOOK_KEY = "hub.money.book";

export function storedBookId(): number | null {
  try {
    return Number(localStorage.getItem(BOOK_KEY)) || null;
  } catch {
    return null;
  }
}

/** Remembers the book for Money to show next. */
export function storeBookId(id: number): void {
  try {
    localStorage.setItem(BOOK_KEY, String(id));
  } catch {
    // Private browsing; Money falls back to the first book.
  }
}
