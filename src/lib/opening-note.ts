/**
 * The one explanation for entries dated before a wallet's opening date (domain rule:
 * `isBeforeOpeningDate` / `entriesBeforeOpening`): they're treated as already included in the
 * opening balance, so they don't change the wallet's balance. Wallets, the entry form and the
 * entry detail all use this wording.
 */

/** For a wallet card: "2 entries are dated before the opening date, so they’re …". */
export function entriesBeforeOpeningText(count: number): string {
  const one = count === 1;
  return `${count} ${one ? "entry is" : "entries are"} dated before the opening date, so ${one ? "it’s" : "they’re"} treated as already included in the opening balance and ${one ? "doesn’t" : "don’t"} change it. Move the opening date earlier if you want ${one ? "it" : "them"} counted.`;
}

/** For one entry and one wallet (form preview or saved entry). */
export function beforeOpeningText(
  walletName: string,
  openingDateLabel: string,
  saved = false,
): string {
  return `${saved ? "This entry is" : "This date is"} before ${walletName}’s opening date (${openingDateLabel}), so it’s treated as already included in the opening balance and ${saved ? "doesn’t" : "won’t"} change ${walletName}’s balance. Move the opening date earlier on Wallets if you want it counted.`;
}
