import {
  experimental_ProviderModelPicker as ProviderModelPicker,
  experimental_useProviders,
  useRealtime,
  useRpc,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { turnEndRpcContract } from "../../server/classifier/index.js";
import {
  SELECTION_CHANGED_CHANNEL,
  type ClassifierSelection,
} from "../../server/classifier/selection.js";

// Settings → Inbox: pick the provider and model that read turn endings
// (ADR 0009). Nothing is chosen by default, and only the Save button writes
// the setting: the host picker emits a value on its own when it reconciles a
// seed against the live catalog, and that must never start spending tokens.

export function ClassifierSettingsSection() {
  const rpc = useRpc<typeof turnEndRpcContract>();
  const providers = experimental_useProviders();
  // undefined while loading; null when off.
  const [saved, setSaved] = useState<ClassifierSelection | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExperimentalProviderModelPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const load = useCallback(async () => {
    try {
      setSaved((await rpcRef.current.call("getTurnEndClassifier", null)).selection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(SELECTION_CHANGED_CHANNEL, () => void load());

  async function save(selection: ClassifierSelection | null) {
    setSaving(true);
    setError(null);
    try {
      setSaved((await rpc.call("setTurnEndClassifier", { selection })).selection);
      setDraft(null);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (saved === undefined) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  const firstProvider = providers.providers.find((provider) => provider.available);
  const pickerValue: ExperimentalProviderModelPickerValue | null =
    draft ??
    (saved
      ? { ...saved }
      : firstProvider
        ? { providerId: firstProvider.id, model: "", reasoningLevel: "low" }
        : null);
  const candidate = draft && draft.model.trim() !== "" ? toSelection(draft) : null;
  const changed =
    candidate !== null && JSON.stringify(candidate) !== JSON.stringify(saved);
  const showPicker = saved !== null || editing;

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="inbox-classifier-settings">
      <p className="text-muted-foreground">
        {saved
          ? "On: a hidden thread on this model reads how each turn ended, a question for you or a report. It uses the provider's existing login."
          : "Off: a plain rule decides whether a turn ended with a question, and no tokens are spent."}
      </p>
      {showPicker && pickerValue ? (
        <div className="min-h-10">
          <ProviderModelPicker value={pickerValue} onChange={setDraft} disabled={saving} />
        </div>
      ) : null}
      {showPicker && !pickerValue ? (
        <p className="text-muted-foreground">No provider is available on this machine.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {showPicker ? (
          <Button
            type="button"
            className="h-10"
            disabled={saving || !changed}
            onClick={() => void save(candidate)}
          >
            Save
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setEditing(true)}
          >
            Choose a model
          </Button>
        )}
        {saved ? (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={saving}
            onClick={() => void save(null)}
          >
            Turn off
          </Button>
        ) : editing ? (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => {
              setDraft(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}

function toSelection(value: ExperimentalProviderModelPickerValue): ClassifierSelection {
  return {
    providerId: value.providerId,
    model: value.model,
    reasoningLevel: value.reasoningLevel,
    ...(value.serviceTier ? { serviceTier: value.serviceTier } : {}),
  };
}
