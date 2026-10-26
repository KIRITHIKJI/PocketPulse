import type { Metadata } from "next";
import { Settings2, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";
import { QuickAdd } from "@/components/transactions/quick-add";
import { TileEditor } from "@/components/transactions/tile-editor";
import { Card } from "@/components/ui/card";
import { categoryLabel, formatMoney, resolveCategoryChoice } from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { getLedger, getQuickAddPresets } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { presetIcon, shortcutEntries, tileEntries } from "@/lib/quick-entries";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage() {
  const [kit, presets, ledger] = await Promise.all([
    loadEntryKit(),
    getQuickAddPresets(),
    getLedger(),
  ]);
  const tiles = tileEntries(presets, kit.categories);
  const shortcuts = shortcutEntries(ledger, kit.categories, requestNow());
  const byId = new Map(kit.categories.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Quick add"
        description="Tap a tile, check the amount, save. Built for ₹10 teas and ₹20 bus rides."
      />
      <SectionTabs section="record" />

      {tiles.length > 0 ? (
        <QuickAdd kit={kit} tiles={tiles} shortcuts={shortcuts} />
      ) : (
        <StatePanel
          icon={Zap}
          title="All tiles are hidden"
          description="Show a tile again or add your own below."
        />
      )}

      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Customise tiles</h2>
            <p className="text-sm text-muted-foreground">
              Set a usual amount and default category for each tile. Tiles start without amounts —
              the first amount you save can become the usual one.
            </p>
          </div>
        </div>
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
      </Card>
    </>
  );
}
