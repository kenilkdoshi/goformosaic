// Prepares Azurite for local development: uploads container, processing queue and blob CORS.
// Usage: node scripts/dev-setup.mjs   (after `docker compose up -d`)
import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";

const cs = process.env.STORAGE_CONNECTION_STRING || "UseDevelopmentStorage=true";
const blob = BlobServiceClient.fromConnectionString(cs);
const queue = QueueServiceClient.fromConnectionString(cs);

await blob.setProperties({
  cors: [
    {
      allowedOrigins: process.env.CORS_ORIGINS || "http://localhost:3000",
      allowedMethods: "PUT,GET,HEAD,OPTIONS",
      allowedHeaders: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 3600,
    },
  ],
});
await blob.getContainerClient(process.env.UPLOADS_CONTAINER || "uploads").createIfNotExists();
await queue.getQueueClient(process.env.PROCESSING_QUEUE || "image-processing").createIfNotExists();
console.log("Azurite ready: container, queue and CORS configured.");
