import type { Metadata } from "next";
import { Inbox, ListTree, TrendingUp, WandSparkles } from "lucide-react";

import type { PickerNode } from "@/components/categories/category-picker";
import {
  CategoryTree,
  type InactiveCategory,
  type TreeNode,
} from "@/components/categories/category-tree";
import { RulesPanel } from "@/components/categories/rules-panel";
import { type QueueItem, UncategorizedQueue } from "@/components/categories/uncategorized-queue";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type Category,
  type CategoryKind,
  type Transaction,
  categoryLabel,
  categoryTree,
  formatMoney,
  isCategoryActive,
  suggestCategory,
  toLocalDate,
  uncategorizedQueue,
} from "@/domain";
import {
  getCategories,
  getCategoryRules,
  getLedger,
  getLedgerVersions,
  getProfile,
} from "@/lib/data/queries";
import { formatLocalDate } from "@/lib/format";

export const metadata: Metadata = { title: "Categories" };

function usageCounts(ledger: readonly Transaction[]) {
  const counts = new Map<string, number>();
  for (const tx of ledger) {
    if (!("categoryId" in tx)) continue;
    for (const id of new Set([tx.categoryId, tx.subcategoryId])) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function treeFor(categories: Category[], kind: CategoryKind, usage: Map<string, number>) {
  const toItem = (c: Category) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    isDefault: c.isDefault,
    usage: usage.get(c.id) ?? 0,
  });
  const nodes: TreeNode[] = categoryTree(categories, kind).map((n) => ({
    ...toItem(n.category),
    subcategories: n.subcategories.map(toItem),
  }));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const inactive: InactiveCategory[] = categories
    .filter((c) => c.kind === kind && !isCategoryActive(c))
    .map((c) => {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      const target = c.mergedIntoId ? byId.get(c.mergedIntoId) : undefined;
      const targetParent = target?.parentId ? byId.get(target.parentId) : undefined;
      return {
        id: c.id,
        name: c.name,
        parentName: parent?.name ?? null,
        mergedIntoLabel: target
          ? targetParent
            ? `${targetParent.name} › ${target.name}`
            : target.name
          : null,
        icon: c.icon ?? parent?.icon ?? null,
        color: c.color ?? parent?.color ?? null,
      };
    });
  const picker: PickerNode[] = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    subcategories: n.subcategories.map((s) => ({ id: s.id, name: s.name })),
  }));
  return { nodes, inactive, picker };
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, profile, categories, rules, ledger, versions] = await Promise.all([
    searchParams,
    getProfile(),
    getCategories(),
    getCategoryRules(),
    getLedger(),
    getLedgerVersions(),
  ]);
  const usage = usageCounts(ledger);
  const expense = treeFor(categories, "expense", usage);
  const income = treeFor(categories, "income", usage);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const queue: QueueItem[] = uncategorizedQueue(ledger).map((tx) => {
    const suggestion = suggestCategory(
      { description: tx.description, merchant: tx.merchant, kind: "expense" },
      { categories, rules, history: ledger },
    );
    return {
      id: tx.id,
      version: versions.get(tx.id) ?? 1,
      amountLabel: formatMoney(tx.amountPaise, { currency: tx.currency }),
      dateLabel: formatLocalDate(toLocalDate(Date.parse(tx.occurredAt), profile.timeZone)),
      description: tx.description,
      merchant: tx.merchant,
      suggestion: suggestion
        ? {
            categoryId: suggestion.categoryId,
            subcategoryId: suggestion.subcategoryId,
            label: categoryLabel(suggestion, byId) ?? "",
            reason: suggestion.reason,
          }
        : null,
    };
  });

  const tabs = ["spending", "income", "rules", "uncategorized"];
  const initial = tab && tabs.includes(tab) ? tab : queue.length > 0 ? "uncategorized" : "spending";

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise spending your way: rename, reorder, add subcategories, merge, and set rules that categorise for you."
      />
      <Tabs defaultValue={initial} className="flex flex-col gap-4">
        <TabsList aria-label="Category sections" className="self-start">
          <TabsTrigger value="spending">
            <ListTree aria-hidden="true" />
            Spending
          </TabsTrigger>
          <TabsTrigger value="income">
            <TrendingUp aria-hidden="true" />
            Income
          </TabsTrigger>
          <TabsTrigger value="rules">
            <WandSparkles aria-hidden="true" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="uncategorized">
            <Inbox aria-hidden="true" />
            Uncategorized
            {queue.length > 0 && <Badge>{queue.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="spending">
          <CategoryTree kind="expense" nodes={expense.nodes} inactive={expense.inactive} />
        </TabsContent>
        <TabsContent value="income">
          <CategoryTree kind="income" nodes={income.nodes} inactive={income.inactive} />
        </TabsContent>
        <TabsContent value="rules">
          <RulesPanel
            rules={rules}
            categories={categories}
            tree={[
              ...expense.picker,
              ...income.picker.map((n) => ({ ...n, name: `Income · ${n.name}` })),
            ]}
          />
        </TabsContent>
        <TabsContent value="uncategorized">
          <UncategorizedQueue items={queue} tree={expense.picker} />
        </TabsContent>
      </Tabs>
    </>
  );
}
