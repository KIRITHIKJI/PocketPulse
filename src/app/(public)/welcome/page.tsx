import type { Metadata } from "next";
import Link from "next/link";
import { ChartPie, PiggyBank, ShieldCheck, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Welcome" };

const PILLARS = [
  {
    icon: Zap,
    title: "Record in seconds",
    body: "One-tap tiles for tea, bus and snacks. Or type “tea 15, bus 20” and confirm.",
  },
  {
    icon: ChartPie,
    title: "Understand honestly",
    body: "Category trends and repeated small purchases, each backed by your actual entries.",
  },
  {
    icon: PiggyBank,
    title: "Save on purpose",
    body: "Earmark money for goals and see what’s safe to spend until your next allowance.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Nothing is shared with parents or anyone else unless you export it yourself.",
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-12 py-8 lg:py-16">
      <section className="flex max-w-3xl flex-col gap-6">
        <p className="w-fit rounded-full border bg-card/60 px-3 py-1 text-sm text-muted-foreground">
          Track. Understand. <span className="text-positive">Save.</span>
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Know where every <span className="text-primary">₹10</span> goes.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          PocketPulse makes logging tiny expenses effortless, shows you patterns without judgement,
          and helps your pocket money last.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/register">Create account</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
      <p className="max-w-2xl text-sm text-muted-foreground">
        PocketPulse reports only what you enter. Your tracked balance is not a verified bank
        balance, and no bank connection is required.
      </p>
    </div>
  );
}
