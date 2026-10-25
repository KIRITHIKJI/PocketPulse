import type { Metadata } from "next";
import { Tags } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise spending your way: rename, reorder, add subcategories and set auto-categorisation rules."
      />
      <StatePanel
        icon={Tags}
        title="No categories loaded"
        description="The default set — Food & Drinks, College, Transport, Personal, Entertainment, Bills, Health and Other — is created with your account."
      />
    </>
  );
}
