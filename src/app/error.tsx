"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="画面を表示できません"
      description={error.message}
      actionLabel="再試行"
      onAction={reset}
    />
  );
}
