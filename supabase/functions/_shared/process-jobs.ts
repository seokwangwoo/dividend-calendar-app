export type JsonRecord = Record<string, unknown>;

export type JobRow = {
  id: string;
  type: string;
  status: string;
  payload: JsonRecord;
  run_after: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  priority: number;
};

export type DisclosureForDownload = {
  id: string;
  external_id: string | null;
  document_url: string | null;
  published_at: string | null;
  storage_path: string | null;
  disclosure_type?: string | null;
  raw_payload: JsonRecord | null;
  stocks?: { ticker: string | null } | { ticker: string | null }[] | null;
};

export type ProcessJobsClient = {
  listRunnableJobs(params: { batchSize: number; now: Date }): Promise<JobRow[]>;
  claimJob(job: JobRow, params: { now: Date }): Promise<JobRow | null>;
  completeJob(job: JobRow): Promise<void>;
  retryJob(job: JobRow, params: { error: string; runAfter: Date }): Promise<void>;
  failJob(job: JobRow, params: { error: string }): Promise<void>;
};

export type JobHandler = {
  execute(job: JobRow): Promise<void>;
  onFinalFailure?: (job: JobRow, error: Error) => Promise<void>;
};

export type DownloadDisclosurePdfDependencies = {
  fetchDisclosure(disclosureId: string): Promise<DisclosureForDownload>;
  fetchDocument(documentUrl: string): Promise<Response>;
  uploadPdf(storagePath: string, pdfBytes: Uint8Array): Promise<void>;
  updateDisclosureDownloaded(disclosureId: string, storagePath: string): Promise<void>;
  ensureParseJob(disclosureId: string): Promise<void>;
};

export type ProcessJobsResult = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  skipped: number;
  results: Array<{
    jobId: string;
    type: string;
    status: "completed" | "retried" | "failed" | "skipped";
    attempts: number;
    error?: string;
    runAfter?: string;
  }>;
};

export class JobHandlerError extends Error {
  retryable: boolean;

  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = "JobHandlerError";
    this.retryable = options.retryable ?? true;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function parseBatchSize(value: unknown, fallback = 5): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 25);
}

export function computeRetryRunAfter(attempts: number, now = new Date()): Date {
  const delaySeconds = Math.min(60 * 2 ** Math.max(attempts - 1, 0), 60 * 60);
  return new Date(now.getTime() + delaySeconds * 1000);
}

export async function processRunnableJobs(params: {
  client: ProcessJobsClient;
  handlers: Record<string, JobHandler>;
  batchSize: number;
  now?: Date;
}): Promise<ProcessJobsResult> {
  const now = params.now ?? new Date();
  const jobs = await params.client.listRunnableJobs({ batchSize: params.batchSize, now });
  const summary: ProcessJobsResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    results: []
  };

  for (const job of jobs) {
    const claimed = await params.client.claimJob(job, { now });
    if (!claimed) {
      summary.skipped += 1;
      summary.results.push({
        jobId: job.id,
        type: job.type,
        status: "skipped",
        attempts: job.attempts
      });
      continue;
    }

    summary.claimed += 1;
    const handler = params.handlers[claimed.type];

    try {
      if (!handler) {
        throw new JobHandlerError(`unsupported_job_type:${claimed.type}`, { retryable: false });
      }

      await handler.execute(claimed);
      await params.client.completeJob(claimed);
      summary.completed += 1;
      summary.results.push({
        jobId: claimed.id,
        type: claimed.type,
        status: "completed",
        attempts: claimed.attempts
      });
    } catch (error) {
      const normalized = normalizeJobError(error);
      const finalFailure = !normalized.retryable || claimed.attempts >= claimed.max_attempts;

      if (finalFailure) {
        if (handler?.onFinalFailure) {
          await handler.onFinalFailure(claimed, normalized.error);
        }
        await params.client.failJob(claimed, { error: normalized.message });
        summary.failed += 1;
        summary.results.push({
          jobId: claimed.id,
          type: claimed.type,
          status: "failed",
          attempts: claimed.attempts,
          error: normalized.message
        });
        continue;
      }

      const runAfter = computeRetryRunAfter(claimed.attempts, now);
      await params.client.retryJob(claimed, { error: normalized.message, runAfter });
      summary.retried += 1;
      summary.results.push({
        jobId: claimed.id,
        type: claimed.type,
        status: "retried",
        attempts: claimed.attempts,
        error: normalized.message,
        runAfter: runAfter.toISOString()
      });
    }
  }

  return summary;
}

export function normalizeJobError(error: unknown): {
  error: Error;
  message: string;
  retryable: boolean;
} {
  if (error instanceof JobHandlerError) {
    return { error, message: error.message, retryable: error.retryable };
  }
  if (error instanceof Error) {
    return { error, message: error.message, retryable: true };
  }
  return { error: new Error(String(error)), message: String(error), retryable: true };
}

export function buildDisclosureStoragePath(disclosure: DisclosureForDownload): string {
  const ticker = sanitizePathSegment(resolveDisclosureTicker(disclosure) ?? "unknown");
  const publishedDate = sanitizePathSegment(
    disclosure.published_at ? disclosure.published_at.slice(0, 10) : "unknown-date"
  );
  const externalId = sanitizePathSegment(disclosure.external_id ?? disclosure.id);
  return `disclosures/${ticker}/${publishedDate}/${externalId}.pdf`;
}

export function isPdfPayload(headers: Headers, bytes: Uint8Array): boolean {
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  const hasPdfContentType = contentType.includes("application/pdf") || contentType.includes("binary/octet-stream");
  const hasPdfSignature =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
  return hasPdfContentType || hasPdfSignature;
}

export function resolvePayloadString(payload: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export async function executeDownloadDisclosurePdf(
  job: JobRow,
  dependencies: DownloadDisclosurePdfDependencies
): Promise<string> {
  const disclosureId = resolvePayloadString(job.payload, "disclosureId", "disclosure_id");
  if (!disclosureId) {
    throw new JobHandlerError("invalid_payload:missing_disclosure_id", { retryable: false });
  }

  const disclosure = await dependencies.fetchDisclosure(disclosureId);
  const documentUrl =
    resolvePayloadString(job.payload, "documentUrl", "document_url") ?? disclosure.document_url;
  if (!documentUrl) {
    throw new JobHandlerError("invalid_enqueue_state:missing_document_url", {
      retryable: false
    });
  }

  let response: Response;
  try {
    response = await dependencies.fetchDocument(documentUrl);
  } catch (error) {
    throw new JobHandlerError("download_failed:network_or_timeout", { cause: error });
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new JobHandlerError(`download_failed:http_${response.status}`, { retryable });
  }

  const pdfBytes = new Uint8Array(await response.arrayBuffer());
  if (pdfBytes.length === 0) {
    throw new JobHandlerError("download_failed:empty_body");
  }
  if (!isPdfPayload(response.headers, pdfBytes)) {
    throw new JobHandlerError("download_failed:non_pdf_response", { retryable: false });
  }

  const storagePath = disclosure.storage_path ?? buildDisclosureStoragePath(disclosure);
  await dependencies.uploadPdf(storagePath, pdfBytes);
  await dependencies.updateDisclosureDownloaded(disclosure.id, storagePath);

  if (shouldEnqueueParseJob(disclosure)) {
    await dependencies.ensureParseJob(disclosure.id);
  }

  return storagePath;
}

export function shouldEnqueueParseJob(disclosure: DisclosureForDownload): boolean {
  return disclosure.document_url != null;
}

function resolveDisclosureTicker(disclosure: DisclosureForDownload): string | null {
  const embeddedStock = Array.isArray(disclosure.stocks) ? disclosure.stocks[0] : disclosure.stocks;
  if (embeddedStock?.ticker) return embeddedStock.ticker;
  const rawTicker = disclosure.raw_payload?.ticker;
  return typeof rawTicker === "string" && rawTicker.trim().length > 0 ? rawTicker : null;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "unknown";
}
