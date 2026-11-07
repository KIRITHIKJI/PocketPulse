"use client";

import * as React from "react";
import { Pencil, Plus, Trash2, WandSparkles } from "lucide-react";

import { CategoryPicker, type PickerNode } from "@/components/categories/category-picker";
import {
  ActionForm,
  Field,
  FormMessage,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { ConfirmAction } from "@/components/forms/inline-action";
import { useDialogAction } from "@/components/forms/use-dialog-action";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type Category, type CategoryRule, categoryLabel, suggestCategory } from "@/domain";
import { deleteRule, saveRule } from "@/lib/actions/categories";

function RuleFormDialog({ rule, tree }: { rule?: CategoryRule; tree: PickerNode[] }) {
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(saveRule);
  const err = state.fieldErrors ?? {};
  const prefix = `rule-${rule?.id ?? "new"}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {rule ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit rule “${rule.matchText}”`}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus aria-hidden="true" />
            Add rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            When an entry’s text contains these words, PocketPulse suggests this category. You can
            always pick something else for a single entry.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          {rule && <input type="hidden" name="id" value={rule.id} />}
          <FormMessage state={state} />
          <Field
            id={`${prefix}-text`}
            name="matchText"
            label="When the text contains"
            placeholder="e.g. chai"
            defaultValue={rule?.matchText ?? ""}
            maxLength={80}
            autoComplete="off"
            hint="Whole words, any capitalisation: “chai” matches “Masala chai”, not “chaitanya”."
            error={err.matchText}
          />
          <SelectField
            id={`${prefix}-field`}
            name="matchField"
            label="Look in"
            defaultValue={rule?.matchField ?? "description"}
          >
            <option value="description">Description</option>
            <option value="merchant">Merchant / shop</option>
          </SelectField>
          <CategoryPicker
            id={`${prefix}-category`}
            label="Suggest"
            tree={tree}
            defaultCategoryId={rule?.categoryId}
            defaultSubcategoryId={rule?.subcategoryId}
            error={err.categoryId}
          />
          <Field
            id={`${prefix}-priority`}
            name="priority"
            label="Priority"
            type="number"
            inputMode="numeric"
            min={-100}
            max={100}
            defaultValue={String(rule?.priority ?? 0)}
            hint="When several rules match, the highest priority wins (then the longest phrase)."
            error={err.priority}
          />
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            Save rule
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Type a description and see what would be suggested, and why. */
function SuggestionTester({
  categories,
  rules,
}: {
  categories: Category[];
  rules: CategoryRule[];
}) {
  const [text, setText] = React.useState("");
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const suggestion = text.trim()
    ? suggestCategory({ description: text, kind: "expense" }, { categories, rules })
    : null;
  return (
    <Surface className="min-w-0 lg:col-span-5">
      <div className="flex items-center gap-2">
        <WandSparkles className="size-4 text-primary" aria-hidden="true" />
        <h2 className="type-heading">Try a description</h2>
      </div>
      <Field
        id="rule-tester"
        name="tester"
        label="Description"
        placeholder="e.g. masala chai near hostel"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      <p className="type-body" aria-live="polite">
        {!text.trim() ? (
          <span className="text-muted-foreground">
            Suggestions use your rules first, then what you chose before, then common words.
          </span>
        ) : suggestion ? (
          <>
            <span className="font-medium">{categoryLabel(suggestion, byId)}</span>
            <span className="text-muted-foreground"> — {suggestion.reason}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            No suggestion — it would go to the Uncategorized queue.
          </span>
        )}
      </p>
      <p className="type-caption text-muted-foreground">
        This preview checks rules and common words only; entry forms also learn from your past
        choices.
      </p>
    </Surface>
  );
}

export function RulesPanel({
  rules,
  categories,
  tree,
}: {
  rules: CategoryRule[];
  categories: Category[];
  tree: PickerNode[];
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Surface className="min-w-0 lg:col-span-7">
        <SurfaceHeader
          title="Your rules"
          meta="Rules make categorising automatic, e.g. “chai” → Food & Drinks › Tea."
          action={rules.length > 0 ? <RuleFormDialog tree={tree} /> : undefined}
        />
        {rules.length === 0 ? (
          <StatePanel
            size="section"
            icon={WandSparkles}
            title="No rules yet"
            description="Add one, or tick “Remember” when you categorise an entry."
            actions={<RuleFormDialog tree={tree} />}
          />
        ) : (
          <ul className="-my-1 flex flex-col divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="flex min-h-14 flex-wrap items-center gap-2 py-2">
                <p className="min-w-0 flex-1 type-body">
                  <span className="text-muted-foreground">
                    {rule.matchField === "merchant" ? "Merchant" : "Description"} has
                  </span>{" "}
                  <span className="font-medium">“{rule.matchText}”</span>{" "}
                  <span className="text-muted-foreground">→</span>{" "}
                  <span className="font-medium">
                    {categoryLabel(rule, byId) ?? "a category that no longer exists"}
                  </span>
                  {rule.priority !== 0 && (
                    <span className="text-muted-foreground"> · priority {rule.priority}</span>
                  )}
                </p>
                <span className="flex items-center">
                  <RuleFormDialog rule={rule} tree={tree} />
                  <ConfirmAction
                    action={deleteRule}
                    fields={{ id: rule.id }}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete rule “${rule.matchText}”`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                    title="Delete this rule?"
                    description={<p>Entries it already categorised keep their category.</p>}
                    confirmLabel="Delete rule"
                    pendingLabel="Deleting…"
                    destructive
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      <SuggestionTester categories={categories} rules={rules} />
    </div>
  );
}
