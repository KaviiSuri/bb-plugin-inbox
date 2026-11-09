// The Inbox's own synced preferences. Spread into upstream's
// `preferenceDefinitions` (shared/preferences.ts), so they share its server
// KV, realtime channel, localStorage mirror and `bb inbox prefs` CLI.
import { z } from "zod";

export const sidebarTabSchema = z.enum(["threads", "inbox"]);
export type SidebarTab = z.infer<typeof sidebarTabSchema>;

export const inboxPreferenceDefinitions = {
  activeTab: {
    schema: sidebarTabSchema,
    defaultValue: "threads" as SidebarTab,
    description:
      "The sidebar tab shown: threads (the thread list) or inbox (the Inbox).",
    legacyKey: null,
  },
} as const;
