"use client";

import { useRef } from "react";
import { ACCEPT_ATTR, BASE_MAX_BYTES, MB, TILE_MAX_BYTES, TILE_MAX_COUNT, TILE_MIN_COUNT, formatBytes } from "@/lib/files";
import type { Kind, UploadItem, useUploads } from "./useUploads";

type Uploads = ReturnType<typeof useUploads>;

export function UploadStep({ uploads, onNext }: { uploads: Uploads; onNext: () => void }) {
  const { items, rejections, addFiles, remove, retry, busy } = uploads;
  const base = items.find((i) => i.kind === "BASE");
  const tiles = items.filter((i) => i.kind === "TILE");
  const tilesDone = tiles.filter((i) => i.status === "done").length;
  const hasErrors = items.some((i) => i.status === "error");
  const canContinue =
    base?.status === "done" && tilesDone >= TILE_MIN_COUNT && tilesDone <= TILE_MAX_COUNT && !busy && !hasErrors;

  const countColor =
    tiles.length >= TILE_MIN_COUNT ? "bg-brand-100 text-brand-800" : "bg-amber-100 text-amber-800";

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div>
          <h2 className="text-xl font-semibold">1. Base image</h2>
          <p className="text-sm text-stone-600">
            The main photo your mosaic will recreate. JPG, PNG, HEIC or WEBP, up to {BASE_MAX_BYTES / MB} MB.
          </p>
        </div>
        {base ? (
          <div className="max-w-56">
            <Tile item={base} onRemove={remove} onRetry={retry} large />
          </div>
        ) : null}
        <Picker kind="BASE" label={base ? "Replace base image" : "Choose base image"} onFiles={addFiles} />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">2. Tile photos</h2>
            <p className="text-sm text-stone-600">
              {TILE_MIN_COUNT}–{TILE_MAX_COUNT} photos, up to {TILE_MAX_BYTES / MB} MB each.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${countColor}`} aria-live="polite">
            {tiles.length} / {TILE_MAX_COUNT}
            {tiles.length < TILE_MIN_COUNT && ` · need ${TILE_MIN_COUNT - tiles.length} more`}
          </span>
        </div>
        {tiles.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {tiles.map((item) => (
              <li key={item.localId}>
                <Tile item={item} onRemove={remove} onRetry={retry} />
              </li>
            ))}
          </ul>
        )}
        {tiles.length < TILE_MAX_COUNT && <Picker kind="TILE" label="Add tile photos" multiple onFiles={addFiles} />}
      </section>

      {rejections.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          <p className="font-medium">Some files were not added:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {rejections.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" className="btn-primary w-full" disabled={!canContinue} onClick={onNext}>
          {busy ? "Uploading…" : "Next"}
        </button>
        {!canContinue && !busy && (
          <p className="mt-2 text-center text-xs text-stone-500">
            {hasErrors
              ? "Retry or remove failed uploads to continue."
              : `Add a base image and at least ${TILE_MIN_COUNT} tile photos to continue.`}
          </p>
        )}
      </div>
    </div>
  );
}

function Picker({
  kind,
  label,
  multiple,
  onFiles,
}: {
  kind: Kind;
  label: string;
  multiple?: boolean;
  onFiles: (kind: Kind, files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(kind, files);
        }}
      />
      <button type="button" className="btn-secondary w-full border-dashed" onClick={() => input.current?.click()}>
        + {label}
      </button>
    </>
  );
}

function Tile({
  item,
  onRemove,
  onRetry,
  large,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  large?: boolean;
}) {
  const pct = Math.round(item.progress * 100);
  return (
    <div className="space-y-1">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt={item.file.name} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center p-1 text-center text-[10px] text-stone-500">
            {item.thumbFailed ? item.file.name.split(".").pop()?.toUpperCase() : "…"}
          </div>
        )}

        {item.status !== "done" && item.status !== "error" && (
          <div className="absolute inset-x-0 bottom-0 bg-black/50 p-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white transition-[width]" style={{ width: `${item.status === "queued" ? 0 : pct}%` }} />
            </div>
            <div className="mt-0.5 text-center text-[10px] text-white">
              {item.status === "queued" ? "Waiting" : item.status === "verifying" ? "Checking" : `${pct}%`}
            </div>
          </div>
        )}

        {item.status === "done" && (
          <span className="absolute left-1 top-1 rounded-full bg-brand-700 px-1.5 text-xs text-white" aria-label="Uploaded">
            ✓
          </span>
        )}

        {item.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/70 p-1">
            <button
              type="button"
              onClick={() => onRetry(item.localId)}
              className="rounded bg-white px-2 py-1 text-xs font-semibold text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => onRemove(item.localId)}
          className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
          aria-label={`Remove ${item.file.name}`}
        >
          ×
        </button>
      </div>
      {(large || item.status === "error") && (
        <p className={`truncate text-xs ${item.status === "error" ? "text-red-700" : "text-stone-500"}`} title={item.error}>
          {item.status === "error" ? item.error : `${item.file.name} · ${formatBytes(item.file.size)}`}
        </p>
      )}
    </div>
  );
}
