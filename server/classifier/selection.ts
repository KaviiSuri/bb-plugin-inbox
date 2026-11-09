import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The provider, model and reasoning level the helper thread runs on, held in
// one plugin setting as JSON. Empty (the default) means no provider: the
// heuristic decides and no tokens are spent. The settings page sets it with
// bb's provider/model picker (app/classifier/ClassifierSettingsSection.tsx);
// `bb plugin config inbox set turnEndClassifier ""` turns it off.

export const SELECTION_SETTING = "turnEndClassifier";

export const selectionSchema = z
  .object({
    providerId: z.string().min(1),
    model: z.string().min(1),
    reasoningLevel: z.string().min(1),
    serviceTier: z.string().min(1).optional(),
  })
  .strict();

export type ClassifierSelection = z.infer<typeof selectionSchema>;

export function parseSelection(raw: string): ClassifierSelection | null {
  if (raw.trim() === "") return null;
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeSelection(selection: ClassifierSelection | null): string {
  return selection === null ? "" : JSON.stringify(selection);
}

export function defineSelectionSetting(bb: BbPluginApi) {
  const settings = bb.settings.define({
    [SELECTION_SETTING]: {
      type: "string",
      label: "Turn-end classifier",
      description:
        "Set with the picker below. The provider and model that read how a turn ended (a question for you, or a report). Empty means a plain rule decides and no tokens are spent.",
      default: "",
      experimental_schema: z
        .string()
        .refine(
          (value) => value.trim() === "" || parseSelection(value) !== null,
          "Must be empty, or JSON with providerId, model and reasoningLevel",
        ),
    },
  });

  return {
    async get(): Promise<ClassifierSelection | null> {
      const values = await settings.get();
      return parseSelection(values[SELECTION_SETTING]);
    },
    async set(selection: ClassifierSelection | null): Promise<void> {
      await settings.experimental_set({
        [SELECTION_SETTING]: serializeSelection(selection),
      });
    },
  };
}

export type SelectionSetting = ReturnType<typeof defineSelectionSetting>;
