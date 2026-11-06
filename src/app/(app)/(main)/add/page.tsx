import type { Metadata } from "next";
import Link from "next/link";
import { Check, Settings2, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";
import { QuickAdd } from "@/components/transactions/quick-add";
import { TileEditor } from "@/components/transactions/tile-editor";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { categoryLabel, formatMoney, frequentExpensesSince, resolveCategoryChoice } from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { getLatestExpense, getLedgerSince, getQuickAddPresets } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { mergeLedger } from "@/lib/data/slices";
import { presetIcon, shortcutEntries, tileEntries } from "@/lib/quick-entries";

export const metadata: Metadata = { title: "Quick add" };

/**
 * Quick add: the tiles, or (`?tab=edit`) the tile editor, kept apart so the tiles stay one short
 * screen on a phone.
 */
export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const editing = (await searchParams).tab === "edit";
  const now = requestNow();
  // Shortcuts need only the "frequent" look-back and the expense recorded last.
  const [kit, presets, recent, latestExpense] = await Promise.all([
    loadEntryKit(),
    getQuickAddPresets(),
    editing
      ? Promise.resolve([])
      : getLedgerSince(new Date(frequentExpensesSince(now)).toISOString()),
    editing ? Promise.resolve([]) : getLatestExpense(),
  ]);
  const tiles = tileEntries(presets, kit.categories);
  const byId = new Map(kit.categories.map((c) => [c.id, c]));

  if (editing) {
    return (
      <>
        <PageHeader
          title="Edit tiles"
          description="Set each tile’s usual amount and category, reorder them, or hide the ones you don’t use."
          actions={
            <Button asChild>
              <Link href="/add">
                <Check aria-hidden="true" />
                Done
              </Link>
            </Button>
          }
        />
        <Surface>
          <SurfaceHeader
            title="Your tiles"
            meta="Drag the grip or use the arrows to reorder. A tile with an amount and a category saves in one tap."
          />
          <TileEditor
            tree={kit.expenseTree}
            tiles={presets.map((p) => {
              const choice = resolveCategoryChoice(p, byId, "expense");
              const main = choice ? byId.get(choice.categoryId) : undefined;
              const sub = choice?.subcategoryId ? byId.get(choice.subcategoryId) : undefined;
              return {
                id: p.id,
                label: p.label,
                icon: presetIcon(p.icon) ?? sub?.icon ?? main?.icon ?? null,
                ownIcon: presetIcon(p.icon),
                color: sub?.color ?? main?.color ?? null,
                amountPaise: p.amountPaise,
                amountLabel:
                  p.amountPaise === null
                    ? null
                    : formatMoney(p.amountPaise, { currency: kit.currency }),
                categoryId: choice?.categoryId ?? null,
                subcategoryId: choice?.subcategoryId ?? null,
                categoryLabel: choice ? categoryLabel(choice, byId) : null,
                archived: p.archived,
              };
            })}
          />
        </Surface>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Quick add"
        description="A tile with a usual amount saves in one tap. Its pencil enters a different amount."
        actions={
          <Button variant="outline" asChild>
            <Link href="/add?tab=edit">
              <Settings2 aria-hidden="true" />
              Edit tiles
            </Link>
          </Button>
        }
      />
      <SectionTabs section="record" />

      {tiles.length > 0 ? (
        <QuickAdd
          kit={kit}
          tiles={tiles}
          shortcuts={shortcutEntries(mergeLedger(recent, latestExpense), kit.categories, now)}
        />
      ) : (
        <StatePanel
          icon={Zap}
          title="All tiles are hidden"
          description="Show a tile again or add your own."
          actions={
            <Button asChild>
              <Link href="/add?tab=edit">Edit tiles</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
