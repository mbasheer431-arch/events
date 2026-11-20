import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return <img src={BRAND.logo} alt={BRAND.name} className={cn("h-9 w-auto", className)} />;
}
