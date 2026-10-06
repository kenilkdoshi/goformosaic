import { Wizard } from "@/components/wizard/Wizard";
import { TILE_MAX_COUNT, TILE_MIN_COUNT } from "@/lib/files";
import { TURNAROUND_DAYS, siteSettings } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const { turnstileSiteKey, retentionDays } = siteSettings();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Create your photo mosaic</h1>
        <p className="text-stone-600">
          Upload one main photo and {TILE_MIN_COUNT}–{TILE_MAX_COUNT} smaller photos. We&apos;ll craft your mosaic and
          email you a preview within {TURNAROUND_DAYS} days.
        </p>
      </section>
      <Wizard turnstileSiteKey={turnstileSiteKey} retentionDays={retentionDays} />
    </div>
  );
}
