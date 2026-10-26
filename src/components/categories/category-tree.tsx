"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronRight, GitMerge } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { CategoryFormDialog, type EditableCategory } from "@/components/categories/category-form";
import { SelectField } from "@/components/forms/form-parts";
import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CategoryKind } from "@/domain";
import { mergeCategory, moveCategory, setCategoryArchived } from "@/lib/actions/categories";

export type TreeCategory = EditableCategory & { usage: number; isDefault: boolean };
export type TreeNode = TreeCategory & { subcategories: TreeCategory[] };
export type InactiveCategory = {
  id: string;
  name: string;
  parentName: string | null;
  mergedIntoLabel: string | null;
  icon: string | null;
  color: string | null;
};

const uses = (n: number) => (n === 0 ? "No entries yet" : `${n} ${n === 1 ? "entry" : "entries"}`);

function MoveButtons({ item, index, count }: { item: TreeCategory; index: number; count: number }) {
  return (
    <>
      {index > 0 && (
        <InlineAction
          action={moveCategory}
          fields={{ id: item.id, direction: "up" }}
          pendingLabel=""
          size="icon-sm"
          aria-label={`Move ${item.name} up`}
        >
          <ArrowUp aria-hidden="true" />
        </InlineAction>
      )}
      {index < count - 1 && (
        <InlineAction
          action={moveCategory}
          fields={{ id: item.id, direction: "down" }}
          pendingLabel=""
          size="icon-sm"
          aria-label={`Move ${item.name} down`}
        >
          <ArrowDown aria-hidden="true" />
        </InlineAction>
      )}
    </>
  );
}

function MergeAction({
  item,
  targets,
  isSub,
}: {
  item: TreeCategory;
  targets: { value: string; label: string }[];
  isSub: boolean;
}) {
  if (targets.length === 0) return null;
  return (
    <ConfirmAction
      action={mergeCategory}
      fields={{ sourceId: item.id }}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Merge ${item.name} into another category`}
        >
          <GitMerge aria-hidden="true" />
        </Button>
      }
      title={`Merge ${item.name}`}
      description={
        <>
          <p>
            Every entry, budget, rule and quick-add tile that uses {item.name} moves to the category
            you choose, so its totals move with it and no history is lost (
            {uses(item.usage).toLowerCase()}).
          </p>
          {!isSub && (
            <p>
              Its subcategories move too; one with the same name as a subcategory there is merged
              into it.
            </p>
          )}
          <p>{item.name} is then archived as merged. This can’t be undone automatically.</p>
        </>
      }
      confirmLabel="Merge"
      pendingLabel="Merging…"
    >
      <SelectField id={`merge-${item.id}`} name="targetId" label="Merge into" defaultValue="">
        <option value="">Choose a category</option>
        {targets.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </SelectField>
    </ConfirmAction>
  );
}

function ArchiveAction({ item, isSub }: { item: TreeCategory; isSub: boolean }) {
  return (
    <ConfirmAction
      action={setCategoryArchived}
      fields={{ id: item.id, archive: "true" }}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Archive ${item.name}`}>
          <Archive aria-hidden="true" />
        </Button>
      }
      title={`Archive ${item.name}?`}
      description={
        <>
          <p>
            It’s hidden from pickers and suggestions{isSub ? "" : ", along with its subcategories"}.
            Nothing is deleted: {uses(item.usage).toLowerCase()} keep showing it, and totals don’t
            change.
          </p>
          <p>To move its entries somewhere else instead, use Merge.</p>
        </>
      }
      confirmLabel="Archive"
      pendingLabel="Archiving…"
    />
  );
}

/** Active categories of one kind with their subcategories, plus archived/merged ones. */
export function CategoryTree({
  kind,
  nodes,
  inactive,
}: {
  kind: CategoryKind;
  nodes: TreeNode[];
  inactive: InactiveCategory[];
}) {
  const mainTargets = (id: string) =>
    nodes.filter((n) => n.id !== id).map((n) => ({ value: n.id, label: n.name }));
  const subTargets = (id: string) =>
    nodes.flatMap((n) => [
      { value: n.id, label: `${n.name} (no subcategory)` },
      ...n.subcategories
        .filter((s) => s.id !== id)
        .map((s) => ({ value: s.id, label: `${n.name} › ${s.name}` })),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {kind === "expense"
            ? "Savings and transfers between your own wallets aren’t spending, so they never use these."
            : "Where money comes from. Refunds aren’t income: they reduce the spending they refund."}
        </p>
        <CategoryFormDialog kind={kind} />
      </div>

      <ul className="flex flex-col gap-2">
        {nodes.map((node, index) => (
          <li key={node.id} className="rounded-2xl border bg-card">
            <details className="group" data-testid={`category-${node.name}`}>
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                <CategoryBadge icon={node.icon} color={node.color} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{node.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {node.subcategories.length > 0
                      ? `${node.subcategories.length} subcategories · `
                      : ""}
                    {uses(node.usage)}
                  </span>
                </span>
              </summary>
              <div className="flex flex-col gap-2 border-t px-3 pt-2 pb-3">
                <div className="flex flex-wrap items-center gap-1">
                  <CategoryFormDialog kind={kind} category={node} />
                  <MoveButtons item={node} index={index} count={nodes.length} />
                  <MergeAction item={node} targets={mainTargets(node.id)} isSub={false} />
                  <ArchiveAction item={node} isSub={false} />
                  {kind === "expense" && (
                    <span className="ml-auto">
                      <CategoryFormDialog kind={kind} parent={node} />
                    </span>
                  )}
                </div>
                {node.subcategories.length > 0 && (
                  <ul className="flex flex-col divide-y rounded-xl border">
                    {node.subcategories.map((sub, subIndex) => (
                      <li key={sub.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <CategoryBadge
                          icon={sub.icon ?? node.icon}
                          color={sub.color ?? node.color}
                          size="sm"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{sub.name}</span>
                          <span className="text-xs text-muted-foreground">{uses(sub.usage)}</span>
                        </span>
                        <span className="flex items-center">
                          <CategoryFormDialog kind={kind} category={sub} parent={node} />
                          <MoveButtons
                            item={sub}
                            index={subIndex}
                            count={node.subcategories.length}
                          />
                          <MergeAction item={sub} targets={subTargets(sub.id)} isSub />
                          <ArchiveAction item={sub} isSub />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {inactive.length > 0 && (
        <section aria-label="Archived and merged" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Archived and merged</h3>
          <ul className="flex flex-col divide-y rounded-2xl border bg-card/60">
            {inactive.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <CategoryBadge icon={item.icon} color={item.color} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {item.parentName ? `${item.parentName} › ${item.name}` : item.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.mergedIntoLabel
                      ? `Merged into ${item.mergedIntoLabel} — its entries live there now`
                      : "Archived — hidden from pickers; its entries still show it"}
                  </span>
                </span>
                {item.mergedIntoLabel ? (
                  <Badge variant="outline">Merged</Badge>
                ) : (
                  <InlineAction
                    action={setCategoryArchived}
                    fields={{ id: item.id, archive: "false" }}
                    pendingLabel="Restoring…"
                  >
                    <ArchiveRestore aria-hidden="true" />
                    Restore
                  </InlineAction>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
