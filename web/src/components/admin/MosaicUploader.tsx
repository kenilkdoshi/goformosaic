"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ACCEPT_ATTR } from "@/lib/files";
import { putBlob } from "@/components/wizard/api";

export function MosaicUploader({ submissionId, hasMosaic }: { submissionId: string; hasMosaic: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api/admin/requests/${submissionId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as T;
  }

  async function upload(file: File) {
    setError("");
    setProgress(0);
    setStage("Uploading");
    try {
      const { uploadUrl, path, contentType } = await post<{ uploadUrl: string; path: string; contentType: string }>(
        "mosaic",
        { name: file.name, size: file.size, type: file.type },
      );
      await putBlob(uploadUrl, file, contentType, setProgress).promise;
      setStage("Creating watermarked preview");
      await post("mosaic/complete", { path });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
      setStage("");
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        aria-label="Upload mosaic"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <button type="button" className="btn-primary" disabled={progress !== null} onClick={() => input.current?.click()}>
        {progress !== null ? `${stage}${stage === "Uploading" ? ` ${Math.round(progress * 100)}%` : "…"}` : hasMosaic ? "Replace mosaic" : "Upload mosaic"}
      </button>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
