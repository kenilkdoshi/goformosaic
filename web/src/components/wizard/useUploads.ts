"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TILE_MAX_COUNT, checkFileMeta, sniffImage } from "@/lib/files";
import { api, putBlob, type Session } from "./api";

export type Kind = "BASE" | "TILE";
export type UploadStatus = "queued" | "uploading" | "verifying" | "done" | "error";

export type UploadItem = {
  localId: string;
  kind: Kind;
  file: File;
  thumbUrl: string | null;
  thumbFailed: boolean;
  status: UploadStatus;
  progress: number;
  error?: string;
  fileId?: string;
};

const CONCURRENCY = 3;
const THUMB_PX = 240;

/**
 * Downscale to a small object URL so 40 full-size phone photos don't sit decoded in memory.
 * Returns null for formats the browser can't decode (e.g. HEIC outside Safari).
 */
function makeThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, THUMB_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/jpeg", 0.7);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      resolve(null);
    };
    img.src = src;
  });
}

async function validateLocal(kind: Kind, file: File): Promise<string | null> {
  const meta = checkFileMeta(kind, file.name, file.size, file.type);
  if (!meta.ok) return meta.error;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImage(head)) return "This file isn't a valid JPG, PNG, HEIC or WEBP image.";
  return null;
}

let counter = 0;
const nextId = () => `u${Date.now().toString(36)}${(counter++).toString(36)}`;

export function useUploads(session: Session | null) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const started = useRef(new Set<string>());
  const aborts = useRef(new Map<string, () => void>());
  const thumbQueue = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((localId: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...changes } : i)));
  }, []);

  const run = useCallback(
    async (item: UploadItem) => {
      if (!session) return;
      patch(item.localId, { status: "uploading", progress: 0, error: undefined });
      try {
        const reg = await api<{ fileId: string; uploadUrl: string; contentType: string }>(
          `/api/submissions/${session.id}/files`,
          {
            method: "POST",
            session,
            body: JSON.stringify({ kind: item.kind, name: item.file.name, size: item.file.size, type: item.file.type }),
          },
        );
        patch(item.localId, { fileId: reg.fileId });
        const put = putBlob(reg.uploadUrl, item.file, reg.contentType, (progress) => patch(item.localId, { progress }));
        aborts.current.set(item.localId, put.abort);
        await put.promise;
        aborts.current.delete(item.localId);
        patch(item.localId, { status: "verifying", progress: 1 });
        await api(`/api/submissions/${session.id}/files/${reg.fileId}/complete`, { method: "POST", session });
        patch(item.localId, { status: "done" });
      } catch (err) {
        aborts.current.delete(item.localId);
        if (err instanceof DOMException && err.name === "AbortError") return;
        patch(item.localId, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
      }
    },
    [session, patch],
  );

  // Scheduler: keep up to CONCURRENCY uploads in flight.
  useEffect(() => {
    const inFlight = items.filter(
      (i) => started.current.has(i.localId) && i.status !== "done" && i.status !== "error",
    ).length;
    const next = items.filter((i) => i.status === "queued" && !started.current.has(i.localId));
    for (const item of next.slice(0, Math.max(0, CONCURRENCY - inFlight))) {
      started.current.add(item.localId);
      void run(item);
    }
  }, [items, run]);

  const deleteRemote = useCallback(
    (fileId?: string) => {
      if (!session || !fileId) return;
      void api(`/api/submissions/${session.id}/files/${fileId}`, { method: "DELETE", session }).catch(() => {});
    },
    [session],
  );

  const remove = useCallback(
    (localId: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.localId === localId);
        if (item) {
          aborts.current.get(localId)?.();
          aborts.current.delete(localId);
          started.current.delete(localId);
          deleteRemote(item.fileId);
          if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
        }
        return prev.filter((i) => i.localId !== localId);
      });
    },
    [deleteRemote],
  );

  const retry = useCallback(
    (localId: string) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.localId !== localId) return i;
          deleteRemote(i.fileId);
          started.current.delete(localId);
          return { ...i, status: "queued", progress: 0, error: undefined, fileId: undefined };
        }),
      );
    },
    [deleteRemote],
  );

  const addFiles = useCallback(
    async (kind: Kind, files: File[]) => {
      const errors: string[] = [];
      const accepted: UploadItem[] = [];
      const currentTiles = items.filter((i) => i.kind === "TILE").length;
      const room = kind === "BASE" ? 1 : TILE_MAX_COUNT - currentTiles;

      for (const file of files) {
        const error = await validateLocal(kind, file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
          continue;
        }
        if (accepted.length >= room) {
          errors.push(
            kind === "BASE"
              ? "Only one base image can be used — the first valid file was kept."
              : `Tile limit is ${TILE_MAX_COUNT}. ${files.length - accepted.length} extra photo(s) were skipped.`,
          );
          break;
        }
        accepted.push({ localId: nextId(), kind, file, thumbUrl: null, thumbFailed: false, status: "queued", progress: 0 });
      }
      setRejections(errors);
      if (!accepted.length) return;

      if (kind === "BASE") {
        for (const old of items.filter((i) => i.kind === "BASE")) remove(old.localId);
      }
      setItems((prev) => [...prev, ...accepted]);

      // Generate thumbnails one at a time to keep mobile memory low.
      for (const item of accepted) {
        thumbQueue.current = thumbQueue.current.then(async () => {
          const url = await makeThumbnail(item.file);
          patch(item.localId, url ? { thumbUrl: url } : { thumbFailed: true });
        });
      }
    },
    [items, remove, patch],
  );

  const busy = items.some((i) => i.status === "queued" || i.status === "uploading" || i.status === "verifying");

  // Warn before leaving mid-upload.
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  return { items, rejections, addFiles, remove, retry, busy };
}
