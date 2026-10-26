import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, MessageSquareText, Mic, Sprout, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const profile = await getProfile();
  return (
    <>
      <PageHeader
        title="Home"
        description="Your tracked balance, today’s spending, budgets and goals at a glance."
      />
      {!profile.onboardingCompletedAt && (
        <Card className="flex-row flex-wrap items-center gap-3" data-testid="finish-setup">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ListChecks className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-semibold">Finish setting up</h2>
            <p className="text-sm text-muted-foreground">
              Add your opening balance so your tracked balance starts from the right number.
            </p>
          </div>
          <Button asChild>
            <Link href="/onboarding">Continue setup</Link>
          </Button>
        </Card>
      )}
      <StatePanel
        icon={Sprout}
        title="Your money picture starts with one entry"
        description="Balances and insights here are calculated only from what you record. Nothing is estimated or pre-filled."
        actions={
          <>
            <Button asChild>
              <Link href="/add">
                <Zap aria-hidden="true" />
                Quick add
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/add/text">
                <MessageSquareText aria-hidden="true" />
                Type it
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/add/voice">
                <Mic aria-hidden="true" />
                Say it
              </Link>
            </Button>
          </>
        }
      />
    </>
  );
}
