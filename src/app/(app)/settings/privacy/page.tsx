import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacySettingsPage() {
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
        <Link href="/settings">
          <ArrowLeft aria-hidden="true" />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Privacy"
        description="Your financial data is private to your account. Nothing is shared with parents or third parties without your action."
      />
      <StatePanel
        icon={ShieldCheck}
        title="No privacy settings to review yet"
        description="PocketPulse never sends your expenses to external AI services and never sends reports automatically."
      />
    </>
  );
}
