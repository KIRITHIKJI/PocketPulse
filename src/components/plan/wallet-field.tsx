"use client";

import * as React from "react";

import { SelectField } from "@/components/forms/form-parts";
import type { EntryKit } from "@/lib/data/entry-kit";

export function WalletField({
  id,
  kit,
  value,
}: {
  id: string;
  kit: EntryKit;
  value: string | null;
}) {
  return (
    <SelectField
      id={id}
      name="accountId"
      label="Wallet"
      defaultValue={value ?? kit.defaultAccountId}
    >
      {kit.accounts
        .filter((a) => !a.archivedAt)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.isDefault ? " (default)" : ""}
          </option>
        ))}
    </SelectField>
  );
}

/** A planned one-off bill. Nothing is spent until it's paid. */
