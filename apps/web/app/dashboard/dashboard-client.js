"use client";

import { useMemo, useState } from "react";

const FILTERS = ["all", "pending", "ready", "applied"];
const PAGE_SIZE = 10;

function badgeColor(status) {
  if (status === "applied") return "#0b6b2d";
  if (status === "ready") return "#0f4da8";
  return "#8a6400";
}

function toastStyle(type) {
  if (type === "success") {
    return {
      background: "#eaf8ef",
      border: "1px solid #9cd9b0",
      color: "#0d5c2a"
    };
  }

  if (type === "error") {
    return {
      background: "#fdecec",
      border: "1px solid #f2b1b1",
      color: "#8b1d1d"
    };
  }

  return {
    background: "#f5f5f5",
    border: "1px solid #ddd",
    color: "#333"
  };
}

function buildPageHref(filter, page) {
  const params = new URLSearchParams();
  if (filter && filter !== "all") {
    params.set("status", filter);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default function DashboardClient({ initialJobs, initialFilter, initialPage }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [processing, setProcessing] = useState(false);
  const [markingJobId, setMarkingJobId] = useState(null);
  const [toast, setToast] = useState(null);

  const normalizedFilter = FILTERS.includes(initialFilter) ? initialFilter : "all";
  const safePage = Math.max(1, Number(initialPage || 1));

  const filteredJobs = useMemo(() => {
    if (normalizedFilter === "all") return jobs;
    return jobs.filter((job) => job.status === normalizedFilter);
  }, [jobs, normalizedFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginatedJobs = filteredJobs.slice(start, start + PAGE_SIZE);

  async function onProcessJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const jobUrl = String(formData.get("jobUrl") || "").trim();

    if (!jobUrl) {
      setToast({ type: "error", message: "Job URL is required." });
      return;
    }

    setProcessing(true);
    setToast(null);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl, formFields: [] })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to process job.");
      }

      if (payload?.job) {
        setJobs((prev) => [payload.job, ...prev.filter((item) => item.id !== payload.job.id)]);
      }
      form.reset();
      setToast({ type: "success", message: "Job processed successfully." });
    } catch (error) {
      setToast({
        type: "error",
        message: error?.message || "Unexpected error while processing job."
      });
    } finally {
      setProcessing(false);
    }
  }

  async function onMarkApplied(jobId) {
    setMarkingJobId(jobId);
    setToast(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "PATCH"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to mark job as applied.");
      }

      if (payload?.job) {
        setJobs((prev) =>
          prev.map((job) => (job.id === payload.job.id ? payload.job : job))
        );
      }
      setToast({ type: "success", message: "Job marked as applied." });
    } catch (error) {
      setToast({
        type: "error",
        message: error?.message || "Unexpected error while updating job."
      });
    } finally {
      setMarkingJobId(null);
    }
  }

  return (
    <>
      <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Process a job URL</h2>
        <p style={{ marginTop: 0, color: "#444" }}>
          Paste a job URL and run profile-aware mapping directly.
        </p>
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              ...toastStyle(toast.type),
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 10
            }}
          >
            {toast.message}
          </div>
        ) : null}
        <form onSubmit={onProcessJob} style={{ display: "grid", gap: 10 }}>
          <input
            name="jobUrl"
            type="url"
            required
            placeholder="https://www.linkedin.com/jobs/view/..."
            style={{ padding: "0.6rem 0.75rem" }}
          />
          <button
            type="submit"
            disabled={processing}
            style={{ width: "fit-content", padding: "0.5rem 0.9rem" }}
          >
            {processing ? "Processing..." : "Process Job"}
          </button>
        </form>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Your jobs</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {FILTERS.map((filter) => {
            const active = normalizedFilter === filter;
            return (
              <a
                key={filter}
                href={buildPageHref(filter, 1)}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 999,
                  padding: "4px 10px",
                  textDecoration: "none",
                  backgroundColor: active ? "#111" : "white",
                  color: active ? "white" : "#222",
                  textTransform: "capitalize",
                  fontSize: 13
                }}
              >
                {filter}
              </a>
            );
          })}
        </div>

        {paginatedJobs.length === 0 ? (
          <p>No jobs found for this filter.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">URL</th>
                  <th align="left">Status</th>
                  <th align="left">Match score</th>
                  <th align="left">Created</th>
                  <th align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.map((job) => (
                  <tr key={job.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "8px 0" }}>
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.url}
                      </a>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      <span
                        style={{
                          color: "white",
                          backgroundColor: badgeColor(job.status),
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 12,
                          textTransform: "capitalize"
                        }}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px 0" }}>{job.matchScore ?? 0}%</td>
                    <td style={{ padding: "8px 0" }}>
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      {job.status === "applied" ? (
                        <span style={{ color: "#666", fontSize: 13 }}>Already applied</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onMarkApplied(job.id)}
                          disabled={markingJobId === job.id}
                          style={{ padding: "0.3rem 0.55rem" }}
                        >
                          {markingJobId === job.id ? "Saving..." : "Mark as applied"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <a
            href={buildPageHref(normalizedFilter, Math.max(1, currentPage - 1))}
            aria-disabled={currentPage <= 1}
            style={{
              opacity: currentPage <= 1 ? 0.4 : 1,
              pointerEvents: currentPage <= 1 ? "none" : "auto"
            }}
          >
            Previous
          </a>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <a
            href={buildPageHref(normalizedFilter, Math.min(totalPages, currentPage + 1))}
            aria-disabled={currentPage >= totalPages}
            style={{
              opacity: currentPage >= totalPages ? 0.4 : 1,
              pointerEvents: currentPage >= totalPages ? "none" : "auto"
            }}
          >
            Next
          </a>
        </div>
      </section>
    </>
  );
}
