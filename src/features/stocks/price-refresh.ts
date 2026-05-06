export function isStalePrice(
  updatedAt: string | Date | null,
  thresholdHours = 48
): boolean {
  if (updatedAt == null) {
    return true;
  }

  const updatedTime =
    typeof updatedAt === "string" ? new Date(updatedAt).getTime() : updatedAt.getTime();

  if (Number.isNaN(updatedTime)) {
    return true;
  }

  const now = Date.now();
  const thresholdMs = thresholdHours * 60 * 60 * 1000;

  return now - updatedTime > thresholdMs;
}

export interface RefreshLogEntry {
  status: "success" | "failure";
}

export function hasThreeConsecutiveFailures(
  logs: RefreshLogEntry[]
): boolean {
  if (logs.length < 3) {
    return false;
  }
  return logs.slice(0, 3).every((log) => log.status === "failure");
}
