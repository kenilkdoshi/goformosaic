export type Session = { id: string; token: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { session?: Session } = {}): Promise<T> {
  const { session, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...rest.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong. Please try again.", res.status);
  return body;
}

/** PUT a file straight to Blob Storage via SAS, reporting progress. */
export function putBlob(
  url: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Please retry.`));
    xhr.onerror = () => reject(new Error("Network error — check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.timeout = 10 * 60 * 1000;
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry."));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
