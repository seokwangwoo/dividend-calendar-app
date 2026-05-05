export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function requireRemoteTests(): void {
  if (process.env.RUN_REMOTE_TESTS !== "1") {
    throw new Error(
      "Set RUN_REMOTE_TESTS=1 to run remote integration tests.\n" +
        "  Example: RUN_REMOTE_TESTS=1 npm run test:integration"
    );
  }
}
