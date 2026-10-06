import "server-only";
import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  generateBlobSASQueryParameters,
  type UserDelegationKey,
} from "@azure/storage-blob";
import { QueueClient } from "@azure/storage-queue";
import { config } from "./config";

// Production authenticates with the App Service managed identity and issues *user delegation*
// SAS tokens (no account keys exist — shared key access is disabled on the account).
// STORAGE_CONNECTION_STRING is only for local development against Azurite.

const credential = new DefaultAzureCredential();
let blobServiceClient: BlobServiceClient | undefined;
let delegationKey: { key: UserDelegationKey; expiresOn: Date } | undefined;

function devConnectionString() {
  return process.env.STORAGE_CONNECTION_STRING;
}

export function blobService(): BlobServiceClient {
  if (!blobServiceClient) {
    const cs = devConnectionString();
    blobServiceClient = cs
      ? BlobServiceClient.fromConnectionString(cs)
      : new BlobServiceClient(config.storageBlobEndpoint, credential);
  }
  return blobServiceClient;
}

export function uploadsContainer() {
  return blobService().getContainerClient(config.uploadsContainer);
}

async function getDelegationKey(): Promise<UserDelegationKey> {
  const now = Date.now();
  if (delegationKey && delegationKey.expiresOn.getTime() - now > 60 * 60 * 1000) return delegationKey.key;
  const startsOn = new Date(now - 5 * 60 * 1000);
  const expiresOn = new Date(now + 24 * 60 * 60 * 1000);
  const key = await blobService().getUserDelegationKey(startsOn, expiresOn);
  delegationKey = { key, expiresOn };
  return key;
}

type SasOptions = {
  permissions: "cw" | "r";
  ttlMinutes: number;
  contentDisposition?: string;
};

async function sasUrl(blobPath: string, opts: SasOptions): Promise<string> {
  const blob = uploadsContainer().getBlockBlobClient(blobPath);
  const startsOn = new Date(Date.now() - 2 * 60 * 1000);
  const expiresOn = new Date(Date.now() + opts.ttlMinutes * 60 * 1000);
  const permissions = BlobSASPermissions.parse(opts.permissions);

  if (devConnectionString()) {
    return blob.generateSasUrl({ permissions, startsOn, expiresOn, contentDisposition: opts.contentDisposition });
  }
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.uploadsContainer,
      blobName: blobPath,
      permissions,
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      contentDisposition: opts.contentDisposition,
    },
    await getDelegationKey(),
    config.storageAccountName,
  );
  return `${blob.url}?${sas.toString()}`;
}

/** Create/write-only SAS scoped to one blob path, used by the browser to PUT an upload. */
export function uploadSasUrl(blobPath: string) {
  return sasUrl(blobPath, { permissions: "cw", ttlMinutes: 30 });
}

/** Short-lived read-only SAS for admin viewing/downloading. */
export function readSasUrl(blobPath: string, downloadName?: string) {
  return sasUrl(blobPath, {
    permissions: "r",
    ttlMinutes: 15,
    contentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/["\\]/g, "")}"` : undefined,
  });
}

export async function readBlobHead(blobPath: string, bytes = 32): Promise<{ size: number; head: Uint8Array } | null> {
  const blob = uploadsContainer().getBlobClient(blobPath);
  try {
    const props = await blob.getProperties();
    const res = await blob.download(0, Math.min(bytes, props.contentLength ?? bytes));
    const chunks: Buffer[] = [];
    for await (const chunk of res.readableStreamBody!) chunks.push(Buffer.from(chunk));
    return { size: props.contentLength ?? 0, head: new Uint8Array(Buffer.concat(chunks)) };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

export async function downloadBlob(blobPath: string): Promise<Buffer> {
  return uploadsContainer().getBlobClient(blobPath).downloadToBuffer();
}

export async function uploadBuffer(blobPath: string, data: Buffer, contentType: string) {
  await uploadsContainer()
    .getBlockBlobClient(blobPath)
    .uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
}

export async function deleteBlob(blobPath: string) {
  await uploadsContainer().getBlobClient(blobPath).deleteIfExists({ deleteSnapshots: "include" });
}

/** Delete every blob belonging to a submission across all prefixes. */
export async function deleteSubmissionBlobs(submissionId: string): Promise<number> {
  const container = uploadsContainer();
  let count = 0;
  for (const prefix of ["raw", "processed", "thumbs", "mosaics", "previews"]) {
    for await (const item of container.listBlobsFlat({ prefix: `${prefix}/${submissionId}/` })) {
      await container.getBlobClient(item.name).deleteIfExists({ deleteSnapshots: "include" });
      count++;
    }
  }
  return count;
}

export const paths = {
  raw: (submissionId: string, fileId: string, ext: string) => `raw/${submissionId}/${fileId}.${ext}`,
  mosaic: (submissionId: string, ext: string) => `mosaics/${submissionId}/mosaic-${Date.now()}.${ext}`,
  preview: (submissionId: string) => `previews/${submissionId}/preview-${Date.now()}.jpg`,
};

let queueClient: QueueClient | undefined;

function processingQueue(): QueueClient {
  if (!queueClient) {
    const cs = devConnectionString();
    queueClient = cs
      ? new QueueClient(cs, config.processingQueue)
      : new QueueClient(`${config.storageQueueEndpoint}/${config.processingQueue}`, credential);
  }
  return queueClient;
}

export type ProcessingMessage = { submissionId: string; fileId: string };

/** Azure Functions queue triggers expect base64-encoded message bodies. */
export async function enqueueProcessing(messages: ProcessingMessage[]) {
  const queue = processingQueue();
  for (const msg of messages) {
    await queue.sendMessage(Buffer.from(JSON.stringify(msg)).toString("base64"));
  }
}
