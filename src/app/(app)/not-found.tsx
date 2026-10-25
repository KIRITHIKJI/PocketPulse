import Link from "next/link";
import { ScanSearch } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <StatePanel
      icon={ScanSearch}
      title="We couldn’t find that"
      description="It may have been deleted, or the link is incorrect."
      actions={
        <Button asChild>
          <Link href="/home">Back to home</Link>
        </Button>
      }
    />
  );
}
