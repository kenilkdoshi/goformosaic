// Local stand-in for the Azure Functions host: polls the Azurite queue and calls the real
// processImage handler with the same retry semantics (5 attempts, then the handler marks FAILED).
import path from "node:path";
import { QueueClient } from "@azure/storage-queue";

const MAX_DEQUEUE = 5; // matches functions/host.json
const log = (msg) => console.log(`\x1b[35m[worker]\x1b[0m ${msg}`);

export async function startWorker(distDir) {
  const { processImage } = await import(path.join(distDir, "functions", "processImage.js"));
  const queue = new QueueClient(process.env.STORAGE_CONNECTION_STRING, process.env.PROCESSING_QUEUE);
  const context = (dequeueCount) => ({
    log: () => {},
    error: (...args) => log(`error: ${args.map(String).join(" ")}`),
    triggerMetadata: { dequeueCount },
  });

  log("Compression worker listening on queue 'image-processing'");
  for (;;) {
    try {
      const { receivedMessageItems: items } = await queue.receiveMessages({ numberOfMessages: 4, visibilityTimeout: 30 });
      for (const m of items) {
        if (m.dequeueCount > MAX_DEQUEUE) {
          await queue.deleteMessage(m.messageId, m.popReceipt); // Azure would move it to the poison queue
          continue;
        }
        const body = JSON.parse(Buffer.from(m.messageText, "base64").toString());
        try {
          await processImage(body, context(m.dequeueCount));
          await queue.deleteMessage(m.messageId, m.popReceipt);
          log(`processed file ${body.fileId}`);
        } catch {
          // Left on the queue; becomes visible again after the timeout, like Azure.
        }
      }
      if (!items.length) await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      log(`queue poll failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
