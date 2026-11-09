import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The provider, model and reasoning level the helper thread runs on. Kept in
// the plugin's KV rather than a bb setting, so the settings page shows only
// bb's model picker and no raw JSON field (the user's call on #20). Unset
// (the default) means no provider: the heuristic decides and no tokens are
// spent. The settings page sets it (app/classifier/ClassifierSettingsSection.tsx)
// through the `setTurnEndClassifier` rpc.

const SELECTION_KV_KEY = "classifier:selection";

export const SELECTION_CHANGED_CHANNEL = "turn-end-classifier";

export const selectionSchema = z
  .object({
    providerId: z.string().min(1),
    model: z.string().min(1),
    reasoningLevel: z.string().min(1),
    serviceTier: z.string().min(1).optional(),
  })
  .strict();

export type ClassifierSelection = z.infer<typeof selectionSchema>;

export function createSelectionStore(bb: BbPluginApi) {
  return {
    async get(): Promise<ClassifierSelection | null> {
      const parsed = selectionSchema.safeParse(
        await bb.storage.kv.get<unknown>(SELECTION_KV_KEY),
      );
      return parsed.success ? parsed.data : null;
    },
    async set(selection: ClassifierSelection | null): Promise<void> {
      if (selection === null) await bb.storage.kv.delete(SELECTION_KV_KEY);
      else await bb.storage.kv.set(SELECTION_KV_KEY, selection);
      bb.realtime.publish(SELECTION_CHANGED_CHANNEL, { selection });
    },
  };
}
