import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, Mic, Sprout, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Home"
        description="Your tracked balance, today’s spending, budgets and goals at a glance."
      />
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
