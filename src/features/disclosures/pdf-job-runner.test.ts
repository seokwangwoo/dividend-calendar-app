import { describe, expect, it } from "vitest";
import {
  buildDisclosureStoragePath,
  computeRetryRunAfter,
  executeDownloadDisclosurePdf,
  isPdfPayload,
  JobHandlerError,
  processRunnableJobs,
  type JobRow,
  type ProcessJobsClient
} from "../../../supabase/functions/_shared/process-jobs";

const NOW = new Date("2026-05-10T12:00:00.000Z");

describe("process-jobs runner", () => {
  it("claims pending jobs, dispatches known handlers, and completes successful work", async () => {
    const store = createJobStore([
      createJob({ id: "job-1", type: "download_disclosure_pdf" })
    ]);

    const result = await processRunnableJobs({
      client: store.client,
      handlers: {
        download_disclosure_pdf: {
          execute: async () => {}
        }
      },
      batchSize: 10,
      now: NOW
    });

    expect(result).toMatchObject({ claimed: 1, completed: 1, retried: 0, failed: 0 });
    expect(store.jobs[0]).toMatchObject({
      status: "completed",
      attempts: 1,
      last_error: null
    });
  });

  it("does not process a job that another runner already claimed", async () => {
    const store = createJobStore([
      createJob({ id: "job-1", type: "download_disclosure_pdf" })
    ]);
    store.claimJobOverride = async () => null;

    const result = await processRunnableJobs({
      client: store.client,
      handlers: {
        download_disclosure_pdf: {
          execute: async () => {
            throw new Error("should not execute");
          }
        }
      },
      batchSize: 10,
      now: NOW
    });

    expect(result).toMatchObject({ claimed: 0, skipped: 1 });
    expect(store.jobs[0]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("retries transient handler failures with backoff before max attempts", async () => {
    const store = createJobStore([
      createJob({ id: "job-1", type: "download_disclosure_pdf", attempts: 1, max_attempts: 3 })
    ]);

    const result = await processRunnableJobs({
      client: store.client,
      handlers: {
        download_disclosure_pdf: {
          execute: async () => {
            throw new JobHandlerError("download_failed:http_503");
          }
        }
      },
      batchSize: 10,
      now: NOW
    });

    expect(result).toMatchObject({ claimed: 1, retried: 1, failed: 0 });
    expect(store.jobs[0]).toMatchObject({
      status: "pending",
      attempts: 2,
      last_error: "download_failed:http_503",
      run_after: "2026-05-10T12:02:00.000Z"
    });
  });

  it("marks final failures and calls the handler final-failure hook", async () => {
    const store = createJobStore([
      createJob({ id: "job-1", type: "download_disclosure_pdf", attempts: 2, max_attempts: 3 })
    ]);
    const finalFailures: string[] = [];

    const result = await processRunnableJobs({
      client: store.client,
      handlers: {
        download_disclosure_pdf: {
          execute: async () => {
            throw new JobHandlerError("download_failed:empty_body");
          },
          onFinalFailure: async (job) => {
            finalFailures.push(job.id);
          }
        }
      },
      batchSize: 10,
      now: NOW
    });

    expect(result).toMatchObject({ claimed: 1, failed: 1 });
    expect(finalFailures).toEqual(["job-1"]);
    expect(store.jobs[0]).toMatchObject({
      status: "failed",
      attempts: 3,
      last_error: "download_failed:empty_body"
    });
  });

  it("rejects unsupported job types without retrying", async () => {
    const store = createJobStore([
      createJob({ id: "job-1", type: "parse_disclosure_pdf_ai" })
    ]);

    const result = await processRunnableJobs({
      client: store.client,
      handlers: {},
      batchSize: 10,
      now: NOW
    });

    expect(result).toMatchObject({ claimed: 1, failed: 1, retried: 0 });
    expect(store.jobs[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "unsupported_job_type:parse_disclosure_pdf_ai"
    });
  });
});

describe("download PDF helpers", () => {
  it("builds sanitized private disclosure storage paths", () => {
    expect(
      buildDisclosureStoragePath({
        id: "fallback-id",
        external_id: "tdnet:2026/05/10 001",
        document_url: "https://example.com/file.pdf",
        published_at: "2026-05-10T06:30:00.000Z",
        storage_path: null,
        raw_payload: { ticker: "130A" }
      })
    ).toBe("disclosures/130A/2026-05-10/tdnet-2026-05-10-001.pdf");
  });

  it("falls back to unknown ticker and disclosure id when source fields are missing", () => {
    expect(
      buildDisclosureStoragePath({
        id: "disclosure-id",
        external_id: null,
        document_url: "https://example.com/file.pdf",
        published_at: null,
        storage_path: null,
        raw_payload: {}
      })
    ).toBe("disclosures/unknown/unknown-date/disclosure-id.pdf");
  });

  it("accepts PDF content type or PDF file signature", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const htmlBytes = new TextEncoder().encode("<html></html>");

    expect(isPdfPayload(new Headers({ "content-type": "application/pdf" }), htmlBytes)).toBe(true);
    expect(isPdfPayload(new Headers({ "content-type": "text/plain" }), pdfBytes)).toBe(true);
    expect(isPdfPayload(new Headers({ "content-type": "text/html" }), htmlBytes)).toBe(false);
  });

  it("caps exponential backoff at one hour", () => {
    expect(computeRetryRunAfter(1, NOW).toISOString()).toBe("2026-05-10T12:01:00.000Z");
    expect(computeRetryRunAfter(8, NOW).toISOString()).toBe("2026-05-10T13:00:00.000Z");
  });
});

describe("download_disclosure_pdf handler", () => {
  it("downloads a PDF, uploads it idempotently, marks the disclosure downloaded, and enqueues parse once", async () => {
    const calls = createDownloadCalls();
    const storagePath = await executeDownloadDisclosurePdf(
      createJob({ id: "job-1", payload: { disclosureId: "disclosure-1" } }),
      {
        fetchDisclosure: async () => ({
          id: "disclosure-1",
          external_id: "external-1",
          document_url: "https://example.com/disclosure.pdf",
          published_at: "2026-05-10T06:30:00.000Z",
          storage_path: null,
          raw_payload: { ticker: "9433" }
        }),
        fetchDocument: async () => pdfResponse(),
        uploadPdf: async (path, bytes) => calls.uploads.push({ path, bytes }),
        updateDisclosureDownloaded: async (id, path) => calls.downloaded.push({ id, path }),
        ensureParseJob: async (id) => {
          if (!calls.parseJobs.includes(id)) calls.parseJobs.push(id);
        }
      }
    );

    expect(storagePath).toBe("disclosures/9433/2026-05-10/external-1.pdf");
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]?.path).toBe(storagePath);
    expect(calls.downloaded).toEqual([{ id: "disclosure-1", path: storagePath }]);
    expect(calls.parseJobs).toEqual(["disclosure-1"]);
  });

  it("uses an existing storage path on duplicate upload attempts", async () => {
    const calls = createDownloadCalls();
    const storagePath = await executeDownloadDisclosurePdf(
      createJob({ id: "job-1", payload: { disclosureId: "disclosure-1" } }),
      {
        fetchDisclosure: async () => ({
          id: "disclosure-1",
          external_id: "external-1",
          document_url: "https://example.com/disclosure.pdf",
          published_at: "2026-05-10T06:30:00.000Z",
          storage_path: "disclosures/9433/2026-05-10/external-1.pdf",
          raw_payload: { ticker: "9433" }
        }),
        fetchDocument: async () => pdfResponse(),
        uploadPdf: async (path, bytes) => calls.uploads.push({ path, bytes }),
        updateDisclosureDownloaded: async (id, path) => calls.downloaded.push({ id, path }),
        ensureParseJob: async (id) => {
          if (!calls.parseJobs.includes(id)) calls.parseJobs.push(id);
        }
      }
    );

    expect(storagePath).toBe("disclosures/9433/2026-05-10/external-1.pdf");
    expect(calls.uploads[0]?.path).toBe(storagePath);
    expect(calls.parseJobs).toEqual(["disclosure-1"]);
  });

  it("treats a missing document URL as invalid enqueue state", async () => {
    await expect(
      executeDownloadDisclosurePdf(createJob({ id: "job-1", payload: { disclosureId: "d1" } }), {
        fetchDisclosure: async () => ({
          id: "d1",
          external_id: "e1",
          document_url: null,
          published_at: null,
          storage_path: null,
          raw_payload: {}
        }),
        fetchDocument: async () => pdfResponse(),
        uploadPdf: async () => {},
        updateDisclosureDownloaded: async () => {},
        ensureParseJob: async () => {}
      })
    ).rejects.toMatchObject({
      message: "invalid_enqueue_state:missing_document_url",
      retryable: false
    });
  });

  it("rejects non-PDF responses without retrying", async () => {
    await expect(
      executeDownloadDisclosurePdf(createJob({ id: "job-1", payload: { disclosureId: "d1" } }), {
        fetchDisclosure: async () => fixtureDisclosure(),
        fetchDocument: async () =>
          new Response("<html></html>", { headers: { "content-type": "text/html" } }),
        uploadPdf: async () => {},
        updateDisclosureDownloaded: async () => {},
        ensureParseJob: async () => {}
      })
    ).rejects.toMatchObject({
      message: "download_failed:non_pdf_response",
      retryable: false
    });
  });

  it("classifies 404 responses as final and 503 responses as retryable", async () => {
    await expect(
      executeDownloadDisclosurePdf(createJob({ id: "job-1", payload: { disclosureId: "d1" } }), {
        fetchDisclosure: async () => fixtureDisclosure(),
        fetchDocument: async () => new Response("not found", { status: 404 }),
        uploadPdf: async () => {},
        updateDisclosureDownloaded: async () => {},
        ensureParseJob: async () => {}
      })
    ).rejects.toMatchObject({ message: "download_failed:http_404", retryable: false });

    await expect(
      executeDownloadDisclosurePdf(createJob({ id: "job-1", payload: { disclosureId: "d1" } }), {
        fetchDisclosure: async () => fixtureDisclosure(),
        fetchDocument: async () => new Response("unavailable", { status: 503 }),
        uploadPdf: async () => {},
        updateDisclosureDownloaded: async () => {},
        ensureParseJob: async () => {}
      })
    ).rejects.toMatchObject({ message: "download_failed:http_503", retryable: true });
  });
});

function createJob(overrides: Partial<JobRow>): JobRow {
  return {
    id: "job",
    type: "download_disclosure_pdf",
    status: "pending",
    payload: {},
    run_after: NOW.toISOString(),
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    ...overrides
  };
}

function fixtureDisclosure() {
  return {
    id: "d1",
    external_id: "e1",
    document_url: "https://example.com/disclosure.pdf",
    published_at: "2026-05-10T06:30:00.000Z",
    storage_path: null,
    raw_payload: { ticker: "9433" }
  };
}

function pdfResponse(): Response {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
    headers: { "content-type": "application/pdf" }
  });
}

function createDownloadCalls(): {
  uploads: Array<{ path: string; bytes: Uint8Array }>;
  downloaded: Array<{ id: string; path: string }>;
  parseJobs: string[];
} {
  return { uploads: [], downloaded: [], parseJobs: [] };
}

function createJobStore(initialJobs: JobRow[]): {
  jobs: JobRow[];
  claimJobOverride: ProcessJobsClient["claimJob"] | null;
  client: ProcessJobsClient;
} {
  const store = {
    jobs: initialJobs.map((job) => ({ ...job })),
    claimJobOverride: null as ProcessJobsClient["claimJob"] | null,
    client: null as unknown as ProcessJobsClient
  };

  store.client = {
    async listRunnableJobs({ batchSize, now }) {
      return store.jobs
        .filter((job) => job.status === "pending" && new Date(job.run_after) <= now)
        .slice(0, batchSize)
        .map((job) => ({ ...job }));
    },
    async claimJob(job) {
      if (store.claimJobOverride) return store.claimJobOverride(job, { now: NOW });
      const stored = store.jobs.find((candidate) => candidate.id === job.id);
      if (!stored || stored.status !== "pending") return null;
      stored.status = "processing";
      stored.attempts += 1;
      stored.last_error = null;
      return { ...stored };
    },
    async completeJob(job) {
      const stored = store.jobs.find((candidate) => candidate.id === job.id);
      if (!stored) throw new Error("missing job");
      stored.status = "completed";
      stored.last_error = null;
    },
    async retryJob(job, { error, runAfter }) {
      const stored = store.jobs.find((candidate) => candidate.id === job.id);
      if (!stored) throw new Error("missing job");
      stored.status = "pending";
      stored.last_error = error;
      stored.run_after = runAfter.toISOString();
    },
    async failJob(job, { error }) {
      const stored = store.jobs.find((candidate) => candidate.id === job.id);
      if (!stored) throw new Error("missing job");
      stored.status = "failed";
      stored.last_error = error;
    }
  };

  return store;
}
