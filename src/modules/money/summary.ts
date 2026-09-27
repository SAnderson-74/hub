import { formatSigned } from "../../shared/profit";

type Balance = { balanceCents: number; archived: boolean };

/** What every account in a book adds up to, archived ones included. Owed money subtracts. */
export function netBalance(accounts: readonly Balance[]): number {
  return accounts.reduce((sum, account) => sum + account.balanceCents, 0);
}

/** "3 accounts, $1,240 net", counting open accounts only. */
export function accountsSummary(accounts: readonly Balance[]): string {
  const open = accounts.filter((account) => !account.archived).length;
  if (accounts.length === 0) return "No accounts yet";
  return `${open} ${open === 1 ? "account" : "accounts"}, ${formatSigned(netBalance(accounts))} net`;
}
