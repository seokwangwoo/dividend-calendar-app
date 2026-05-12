import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  markAllNotificationsRead,
  markNotificationRead
} from "@/features/notifications/actions";
import {
  INVESTMENT_NEUTRAL_DISCLAIMER,
  NOTIFICATION_FILTERS,
  type NotificationFilter
} from "@/features/notifications/constants";
import {
  getNotifications,
  type NotificationWithStock
} from "@/features/notifications/queries";
import { cn } from "@/lib/utils/cn";

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

function getFilter(value: string | undefined): NotificationFilter {
  return NOTIFICATION_FILTERS.some((filter) => filter.value === value)
    ? (value as NotificationFilter)
    : "all";
}

function getGroup(createdAt: string): "today" | "thisWeek" | "older" {
  const created = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 6);

  if (created >= startOfToday) {
    return "today";
  }
  if (created >= startOfWeek) {
    return "thisWeek";
  }
  return "older";
}

function groupNotifications(notifications: NotificationWithStock[]) {
  return {
    today: notifications.filter((item) => getGroup(item.created_at) === "today"),
    thisWeek: notifications.filter((item) => getGroup(item.created_at) === "thisWeek"),
    older: notifications.filter((item) => getGroup(item.created_at) === "older")
  };
}

function NotificationCard({ notification }: { notification: NotificationWithStock }) {
  const summary = notification.body.split("\n").slice(0, 2).join(" ");

  return (
    <div
      className={cn(
        "space-y-3 p-4",
        notification.status === "unread" && "bg-brand/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{notification.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{summary}</p>
          {notification.stocks ? (
            <p className="mt-2 text-xs text-muted">
              {notification.stocks.ticker} · {notification.stocks.name}
            </p>
          ) : null}
        </div>
        <Badge variant={notification.status === "unread" ? "warning" : "neutral"}>
          {notification.status === "unread" ? "未読" : "既読"}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <time className="text-xs text-muted">
          {new Date(notification.created_at).toLocaleString("ja-JP", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })}
        </time>
        {notification.status === "unread" ? (
          <form action={markNotificationRead}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <Button type="submit" variant="secondary" className="h-9">
              既読にする
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filter = getFilter(params.filter);
  const notifications = await getNotifications(filter);
  const grouped = groupNotifications(notifications);
  const hasUnread = notifications.some((item) => item.status === "unread");

  return (
    <div className="space-y-5">
      <PageHeader title="通知" />

      <div className="flex rounded-lg border border-line bg-white p-1">
        {NOTIFICATION_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={
              option.value === "all"
                ? "/app/notifications"
                : `/app/notifications?filter=${option.value}`
            }
            className={cn(
              "flex h-9 flex-1 items-center justify-center rounded-md text-center text-sm font-medium text-muted",
              filter === option.value && "bg-paper text-ink"
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {hasUnread ? (
        <form action={markAllNotificationsRead}>
          <Button type="submit" variant="secondary" className="w-full">
            すべて既読にする
          </Button>
        </form>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          title="通知はありません"
          description="目標利回りや配当情報の更新があるとここに表示されます。"
          actionHref="/app/stocks/search"
          actionLabel="알림을 설정할 종목 찾기"
        />
      ) : (
        <div className="space-y-5">
          {[
            ["today", "今日", grouped.today],
            ["thisWeek", "今週", grouped.thisWeek],
            ["older", "以前", grouped.older]
          ].map(([key, label, items]) =>
            (items as NotificationWithStock[]).length > 0 ? (
              <section key={key as string} className="space-y-3">
                <h2 className="text-lg font-semibold">{label as string}</h2>
                <Card className="divide-y divide-line">
                  {(items as NotificationWithStock[]).map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                    />
                  ))}
                </Card>
              </section>
            ) : null
          )}
        </div>
      )}

      <p className="whitespace-pre-line rounded-md bg-paper p-3 text-sm leading-6 text-muted">
        {INVESTMENT_NEUTRAL_DISCLAIMER}
      </p>
    </div>
  );
}
