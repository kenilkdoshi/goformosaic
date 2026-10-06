import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

let container: ContainerClient | undefined;

/** Managed identity in Azure; STORAGE_CONNECTION_STRING only for local Azurite. */
export function uploads(): ContainerClient {
  if (!container) {
    const cs = process.env.STORAGE_CONNECTION_STRING;
    const service = cs
      ? BlobServiceClient.fromConnectionString(cs)
      : new BlobServiceClient(`https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, new DefaultAzureCredential());
    container = service.getContainerClient(process.env.UPLOADS_CONTAINER || "uploads");
  }
  return container;
}

export async function deletePrefix(prefix: string): Promise<number> {
  let count = 0;
  for await (const blob of uploads().listBlobsFlat({ prefix })) {
    await uploads().getBlobClient(blob.name).deleteIfExists({ deleteSnapshots: "include" });
    count++;
  }
  return count;
}

export const PREFIXES = ["raw", "processed", "thumbs", "mosaics", "previews"] as const;
