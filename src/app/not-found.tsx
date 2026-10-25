import Link from "next/link";
import { ScanSearch } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-4">
      <Logo className="self-center" />
      <StatePanel
        icon={ScanSearch}
        title="Page not found"
        description="This page doesn’t exist. Check the address or go back home."
        actions={
          <Button asChild>
            <Link href="/home">Go home</Link>
          </Button>
        }
      />
    </main>
  );
}
