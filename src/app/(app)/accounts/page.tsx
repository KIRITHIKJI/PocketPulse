import type { Metadata } from "next";
import { Archive, ArchiveRestore, Info, Star, Wallet } from "lucide-react";

import { AccountFormDialog } from "@/components/accounts/account-form";
import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type AccountBalance,
  consolidatedBalanceAt,
  entriesBeforeOpening,
  formatMoney,
  toLocalDate,
} from "@/domain";
import { makeDefaultAccount, setAccountArchived } from "@/lib/actions/accounts";
import {
  type AccountRecord,
  ensureDefaultAccount,
  getAccounts,
  getLedger,
  getProfile,
} from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { formatLocalDate } from "@/lib/format";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";

export const metadata: Metadata = { title: "Wallets" };

export default async function AccountsPage() {
  const session = await requireSession();
  // Every user has a default wallet to preselect, even one who skipped onboarding.
  await ensureDefaultAccount(session);
  const [profile, accounts, ledger] = await Promise.all([getProfile(), getAccounts(), getLedger()]);
  const tz = profile.timeZone;
  const now = requestNow();
  const today = toLocalDate(now, tz);
  // Archived wallets still count: their money and history are still in the ledger.
  const total = consolidatedBalanceAt(accounts, ledger, now, tz);
  const balanceOf = new Map(total.accounts.map((b) => [b.accountId, b]));
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });

  return (
    <>
      <PageHeader
        title="Wallets"
        description="Where your money is: cash, bank, UPI. Balances come only from what you enter."
        actions={<AccountFormDialog today={today} />}
      />

      <Card className="gap-2">
        <p className="text-sm text-muted-foreground">Tracked total across wallets · now</p>
        <p className="tabular text-3xl font-semibold tracking-tight">{money(total.balancePaise)}</p>
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Opening balances plus the entries you’ve recorded. This isn’t a bank balance and isn’t
          verified with any bank.
          {total.untrackedAccountIds.length > 0 &&
            ` ${total.untrackedAccountIds.length} wallet${total.untrackedAccountIds.length === 1 ? " starts" : "s start"} tracking on a later date and isn’t counted yet.`}
        </p>
      </Card>

      <section aria-labelledby="active-wallets" className="flex flex-col gap-3">
        <h2 id="active-wallets" className="text-base font-semibold">
          Active wallets
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balanceOf.get(account.id)}
              beforeOpening={entriesBeforeOpening(account, ledger, tz).length}
              money={money}
              today={today}
            />
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="archived-wallets" className="flex flex-col gap-3">
          <h2 id="archived-wallets" className="text-base font-semibold">
            Archived
          </h2>
          <p className="text-sm text-muted-foreground">
            Hidden from entry forms. Their history and balances still count toward your total.
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {archived.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                balance={balanceOf.get(account.id)}
                beforeOpening={entriesBeforeOpening(account, ledger, tz).length}
                money={money}
                today={today}
              />
            ))}
          </ul>
        </section>
      )}
    </>
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
    <li>
      <Card className="h-full gap-3" data-testid={`wallet-${account.name}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{account.name}</h3>
              {account.isDefault && (
                <Badge>
                  <Star aria-hidden="true" />
                  Default
                </Badge>
              )}
              {account.archivedAt && <Badge variant="outline">Archived</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{ACCOUNT_KIND_LABELS[account.kind]}</p>
          </div>
          <div className="text-right">
            {tracked ? (
              <>
                <p className="tabular font-semibold">{money(balance!.balancePaise!)}</p>
                <p className="text-xs text-muted-foreground">now</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Starts {formatLocalDate(account.openingBalanceDate)}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Opening balance {money(account.openingBalancePaise)} on{" "}
          {formatLocalDate(account.openingBalanceDate)}
        </p>
        {beforeOpening > 0 && (
          <p className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            {beforeOpening} {beforeOpening === 1 ? "entry is" : "entries are"} dated before the
            opening date, so {beforeOpening === 1 ? "it’s" : "they’re"} treated as already included
            in the opening balance and {beforeOpening === 1 ? "doesn’t" : "don’t"} change it. Move
            the opening date earlier if you want {beforeOpening === 1 ? "it" : "them"} counted.
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2">
          <AccountFormDialog account={account} today={today} />
          {!account.archivedAt && !account.isDefault && (
            <InlineAction
              action={makeDefaultAccount}
              fields={{ id: account.id }}
              pendingLabel="Saving…"
              aria-label={`Make ${account.name} the default wallet`}
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
            <p className="px-2 text-xs text-muted-foreground">
              Preselected in every entry form. Make another wallet the default to archive this one.
            </p>
          )}
        </div>
      </Card>
    </li>
  );
}
