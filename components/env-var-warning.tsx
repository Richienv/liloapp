import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EnvVarWarning() {
  return (
    <div className="flex flex-nowrap items-center gap-4">
      <Badge className="border-caution-line bg-caution-tint font-normal text-caution">
        Environment variable Supabase belum diisi
      </Badge>
      <div className="flex flex-nowrap gap-2">
        <Button
          asChild
          variant="quiet"
          size="action-compact"
          disabled
          className="pointer-events-none opacity-75"
        >
          <Link href="/sign-in">Masuk</Link>
        </Button>
        <Button
          asChild
          variant="brand"
          size="action-compact"
          disabled
          className="pointer-events-none opacity-75"
        >
          <Link href="/sign-up">Daftar</Link>
        </Button>
      </div>
    </div>
  );
}
