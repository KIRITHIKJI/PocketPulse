import type { Metadata } from "next";
import { Archive, ArchiveRestore, ChevronRight, Info, Star, Wallet } from "lucide-react";

import { AccountFormDialog } from "@/components/accounts/account-form";
import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { type AccountBalance, moneyFormatter, toLocalDate } from "@/domain";
import { makeDefaultAccount, setAccountArchived } from "@/lib/actions/accounts";
import {
  type AccountRecord,
  getAccountsWithDefault,
  getProfile,
  getWalletBalances,
  readWalletBalances,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant } from "@/lib/data/slices";
import { formatLocalDate } from "@/lib/format";
import { entriesBeforeOpeningText } from "@/lib/opening-note";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";

export const metadata: Metadata = { title: "Wallets" };

export default async function AccountsPage() {
  // Every user has a default wallet to preselect, even one who skipped onboarding.
  const now = requestNow();
  const [profile, { accounts }, read] = await Promise.all([
    getProfile(),
    getAccountsWithDefault(),
    getWalletBalances(isoInstant(now)),
  ]);
  // Only when the default wallet was created just now can the balances have missed it.
  const balances = accounts.every((a) => read.closing.accounts.some((b) => b.accountId === a.id))
    ? read
    : await readWalletBalances(isoInstant(now));
  const today = toLocalDate(now, profile.timeZone);
  // Archived wallets still count: their money and history are still in the ledger.
  const total = balances.closing;
  const balanceOf = new Map(total.accounts.map((b) => [b.accountId, b]));
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  const money = moneyFormatter(profile.currency);

  return (
    <>
      <PageHeader
        title="Wallets"
        description="Where your money is. Balances come only from what you enter."
        actions={<AccountFormDialog today={today} />}
      />

      <Surface variant="hero" className="gap-1">
        <h2 className="type-body text-muted-foreground">Tracked total across wallets · now</h2>
        <p className="type-display money">{money(total.balancePaise)}</p>
        <p className="mt-1 flex gap-1.5 type-body text-text-secondary">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Opening balances plus the entries you’ve recorded. This isn’t a bank balance and isn’t
            verified with any bank.
            {total.untrackedAccountIds.length > 0 &&
              ` ${total.untrackedAccountIds.length} wallet${total.untrackedAccountIds.length === 1 ? " starts" : "s start"} tracking on a later date and isn’t counted yet.`}
          </span>
        </p>
      </Surface>

      <section aria-labelledby="active-wallets" className="flex flex-col gap-3">
        <h2 id="active-wallets" className="type-heading">
          Active wallets
        </h2>
        {active.length <= 1 && (
          <Notice tone="info">Add a wallet for each place you keep money: UPI, bank, cash.</Notice>
        )}
        <WalletList>
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balanceOf.get(account.id)}
              beforeOpening={balances.entriesBeforeOpening.get(account.id) ?? 0}
              money={money}
              today={today}
            />
          ))}
        </WalletList>
      </section>

      {archived.length > 0 && (
        <section aria-label="Archived">
          <details className="group">
            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg type-heading outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 text-muted-foreground transition-transform duration-(--duration-quick) group-open:rotate-90"
                aria-hidden="true"
              />
              Archived ({archived.length})
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <p className="type-body text-muted-foreground">
                Hidden from entry forms. Their history and balances still count toward your total.
              </p>
              <WalletList>
                {archived.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    balance={balanceOf.get(account.id)}
                    beforeOpening={balances.entriesBeforeOpening.get(account.id) ?? 0}
                    money={money}
                    today={today}
                  />
                ))}
              </WalletList>
            </div>
          </details>
        </section>
      )}
    </>
  );
}

/**
 * Phones: one surface with a row per wallet. Desktop: the surface box drops away (`contents`)
 * and each wallet becomes its own surface in a 3-column grid.
 */
function WalletList({ children }: { children: React.ReactNode }) {
  return (
    <Surface className="py-0 lg:contents">
      <ul className="flex flex-col divide-y lg:grid lg:grid-cols-3 lg:gap-4 lg:divide-y-0">
        {children}
      </ul>
    </Surface>
  );
}

function AccountCard({
  account,
  balance,
  beforeOpening,
  money,
  today,
}: {
  account: AccountRecord;
  balance: AccountBalance | undefined;
  beforeOpening: number;
  money: (paise: number) => string;
  today: string;
}) {
  const tracked = balance?.tracked && balance.balancePaise !== null;
  return (
    <li className="min-w-0">
      <Surface
        className="h-full max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:px-0 max-lg:py-3 max-lg:shadow-none"
        data-testid={`wallet-${account.name}`}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 truncate type-heading">{account.name}</h3>
              {account.isDefault && (
                <Badge>
                  <Star aria-hidden="true" />
                  Default
                </Badge>
              )}
              {account.archivedAt && <Badge variant="outline">Archived</Badge>}
            </div>
            <p className="type-body text-muted-foreground">{ACCOUNT_KIND_LABELS[account.kind]}</p>
          </div>
          <div className="shrink-0 text-right">
            {tracked ? (
              <>
                <p className="type-heading money">{money(balance!.balancePaise!)}</p>
                <p className="type-body text-muted-foreground">now</p>
              </>
            ) : (
              <p className="type-body text-muted-foreground">
                Starts {formatLocalDate(account.openingBalanceDate)}
              </p>
            )}
          </div>
        </div>
        <p className="type-body text-text-secondary">
          Opening balance <span className="money">{money(account.openingBalancePaise)}</span> on{" "}
          {formatLocalDate(account.openingBalanceDate)}
        </p>
        {beforeOpening > 0 && (
          <Notice tone="warning">{entriesBeforeOpeningText(beforeOpening)}</Notice>
        )}
        <div className="mt-auto -ml-2 flex flex-wrap items-center gap-1 lg:ml-0 lg:border-t lg:pt-2">
          <AccountFormDialog account={account} today={today} />
          {!account.archivedAt && !account.isDefault && (
            <InlineAction
              action={makeDefaultAccount}
              fields={{ id: account.id }}
              pendingLabel="Saving…"
              aria-label={`Make default: ${account.name}`}
            >
              <Star aria-hidden="true" />
              Make default
            </InlineAction>
          )}
          {!account.archivedAt && !account.isDefault && (
            <ConfirmAction
              action={setAccountArchived}
              fields={{ id: account.id, archive: "true" }}
              trigger={
                <Button variant="ghost" size="sm">
                  <Archive aria-hidden="true" />
                  Archive
                </Button>
              }
              title={`Archive ${account.name}?`}
              description={
                <>
                  <p>It disappears from entry forms. Nothing is deleted.</p>
                  <p>
                    Its entries stay in your history and its balance
                    {tracked ? ` (${money(balance!.balancePaise!)})` : ""} still counts toward your
                    total. If it’s empty in real life but shows money here, record what happened to
                    that money first.
                  </p>
                </>
              }
              confirmLabel="Archive"
              pendingLabel="Archiving…"
            />
          )}
          {account.archivedAt && (
            <InlineAction
              action={setAccountArchived}
              fields={{ id: account.id, archive: "false" }}
              pendingLabel="Restoring…"
            >
              <ArchiveRestore aria-hidden="true" />
              Restore
            </InlineAction>
          )}
          {account.isDefault && (
            <p className="px-2 type-body text-muted-foreground">
              Preselected in every entry form. Make another wallet the default to archive this one.
            </p>
          )}
        </div>
      </Surface>
    </li>
  );
}
