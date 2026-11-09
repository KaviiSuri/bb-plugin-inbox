// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it } from "vitest";

const app = await loadPluginApp(() => import("../../app"));
const section = app.settingsSections.find(
  (registration) => registration.id === "turn-end-classifier",
)!;

afterEach(cleanup);

const SELECTION = {
  providerId: "claude-code",
  model: "claude-haiku-5-5",
  reasoningLevel: "low",
};

function render(saved: string) {
  const calls: unknown[] = [];
  const slot = renderSlot(section, {}, {
    settings: { turnEndClassifier: saved },
    providers: {
      status: "ready",
      providers: [{ id: "claude-code", available: true, displayName: "Claude Code" }] as never,
    },
    rpc: {
      setTurnEndClassifier: (input: unknown) => {
        calls.push(input);
        return input;
      },
    },
  });
  return { slot, calls };
}

describe("turn-end classifier settings section", () => {
  it("is registered on the plugin's settings page", () => {
    expect(section).toMatchObject({ title: "Turn-end classifier" });
  });

  it("is off by default and shows no picker until the user asks for one", async () => {
    const { slot } = render("");
    await slot.findByText(/no tokens are spent/u);
    expect(slot.queryByTestId("bb-provider-model-picker")).toBeNull();
    expect(slot.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("saves nothing when the picker emits a value; only Save writes the setting", async () => {
    const { slot, calls } = render("");
    fireEvent.click(await slot.findByRole("button", { name: "Choose a model" }));
    fireEvent.change(slot.getByLabelText("Model"), {
      target: { value: "claude-haiku-5-5" },
    });
    fireEvent.click(slot.getByRole("button", { name: "Apply execution selection" }));
    expect(calls).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toEqual([{ selection: SELECTION }]));
  });

  it("can't save a pick with no model", async () => {
    const { slot } = render("");
    fireEvent.click(await slot.findByRole("button", { name: "Choose a model" }));
    fireEvent.click(slot.getByRole("button", { name: "Apply execution selection" }));
    expect((slot.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the saved model and turns it off", async () => {
    const { slot, calls } = render(JSON.stringify(SELECTION));
    expect(((await slot.findByLabelText("Model")) as HTMLInputElement).value).toBe(
      "claude-haiku-5-5",
    );
    fireEvent.click(slot.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(calls).toEqual([{ selection: null }]));
  });
});
