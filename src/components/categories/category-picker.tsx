"use client";

import * as React from "react";

import { SelectField } from "@/components/forms/form-parts";

export type PickerNode = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

const encode = (categoryId: string, subcategoryId: string | null) =>
  `${categoryId}|${subcategoryId ?? ""}`;

/**
 * One native select for "category, optionally a subcategory" (grouped by category). Submits
 * `categoryId` and `subcategoryId` as separate fields, which is what the server validates.
 */
export function CategoryPicker({
  id,
  label,
  tree,
  defaultCategoryId,
  defaultSubcategoryId,
  error,
  hint,
  placeholder = "Choose a category",
  onChange,
}: {
  id: string;
  label: string;
  tree: readonly PickerNode[];
  defaultCategoryId?: string | null;
  defaultSubcategoryId?: string | null;
  error?: string | undefined;
  hint?: React.ReactNode;
  placeholder?: string;
  onChange?: (choice: { categoryId: string; subcategoryId: string | null } | null) => void;
}) {
  const [value, setValue] = React.useState(
    defaultCategoryId ? encode(defaultCategoryId, defaultSubcategoryId ?? null) : "",
  );
  const [categoryId = "", subcategoryId = ""] = value.split("|");

  return (
    <>
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="subcategoryId" value={subcategoryId} />
      <SelectField
        id={id}
        name={`${id}-choice`}
        label={label}
        value={value}
        error={error}
        hint={hint}
        onChange={(event) => {
          setValue(event.target.value);
          const [c, s] = event.target.value.split("|");
          onChange?.(c ? { categoryId: c, subcategoryId: s || null } : null);
        }}
      >
        <option value="">{placeholder}</option>
        {tree.map((node) => (
          <optgroup key={node.id} label={node.name}>
            <option value={encode(node.id, null)}>{node.name}</option>
            {node.subcategories.map((sub) => (
              <option key={sub.id} value={encode(node.id, sub.id)}>
                {node.name} › {sub.name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
    </>
  );
}
