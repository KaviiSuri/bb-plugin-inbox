// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import { useChildCompletions } from "./useChildCompletions.js";

const { list, sdk } = vi.hoisted(() => {
  const list = vi.fn();
  return { list, sdk: { threads: { events: { list } } } };
});
vi.mock("@get-bb/plugin-sdk/app", () => ({ useSdk: () => sdk }));
beforeEach(() => list.mockReset());
afterEach(cleanup);
const child = makeSidebarThread({ id: "child", parentThreadId: "owner", latestAttentionAt: 10, updatedAt: 30 });
const event = (at: number) => [{ type: "turn/completed", createdAt: at }];

it("refreshes completion on a new stopped version even when sidebar attention is unchanged", async () => {
  list.mockResolvedValueOnce(event(29)).mockResolvedValueOnce(event(49));
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  await waitFor(() => expect(hook.result.current.child).toBe(29));
  hook.rerender({ threads: [{ ...child, status: "active", updatedAt: 40 }] });
  expect(hook.result.current.child).toBeUndefined();
  hook.rerender({ threads: [{ ...child, updatedAt: 50 }] });
  await waitFor(() => expect(hook.result.current.child).toBe(49));
  expect(list).toHaveBeenCalledTimes(2);
});

it("withholds cached finish A while finish B loads, then exposes only B's completion", async () => {
  let resolveB!: (events: unknown[]) => void;
  const pendingB = new Promise<unknown[]>((resolve) => { resolveB = resolve; });
  list.mockResolvedValueOnce(event(29)).mockReturnValueOnce(pendingB);
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  await waitFor(() => expect(hook.result.current.child).toBe(29));

  // The sidebar can deliver the next stopped version without an intervening
  // running snapshot. A's cached timestamp must not describe B's finish.
  hook.rerender({ threads: [{ ...child, updatedAt: 50 }] });
  expect(list).toHaveBeenCalledTimes(2);
  expect(hook.result.current.child).toBeNull();
  await act(async () => { resolveB(event(49)); await pendingB; });
  expect(hook.result.current.child).toBe(49);
});

it("does not fall back to cached finish A when the read for finish B fails", async () => {
  let rejectB!: (error: Error) => void;
  const pendingB = new Promise<unknown[]>((_, reject) => { rejectB = reject; });
  list.mockResolvedValueOnce(event(29)).mockReturnValueOnce(pendingB);
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  await waitFor(() => expect(hook.result.current.child).toBe(29));

  hook.rerender({ threads: [{ ...child, updatedAt: 50 }] });
  expect(hook.result.current.child).toBeNull();
  await act(async () => {
    rejectB(new Error("offline"));
    await pendingB.catch(() => undefined);
  });
  expect(hook.result.current.child).toBeNull();
});

it("a metadata edit refetches the event but does not invent a new completion", async () => {
  list.mockResolvedValue(event(29));
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  await waitFor(() => expect(hook.result.current.child).toBe(29));
  hook.rerender({ threads: [{ ...child, title: "Renamed", updatedAt: 900 }] });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(hook.result.current.child).toBe(29));
});

it("missing or failed completion reads stay unknown, never falling back to updatedAt", async () => {
  list.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"));
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  expect(hook.result.current.child).toBeNull();
  hook.rerender({ threads: [{ ...child, updatedAt: 50 }] });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(hook.result.current.child).toBeNull();
});

it("holds an unresolved read unknown and ignores its stale response after a newer stopped version", async () => {
  let resolveOld!: (events: unknown[]) => void;
  const oldRead = new Promise<unknown[]>((resolve) => { resolveOld = resolve; });
  list.mockReturnValueOnce(oldRead).mockResolvedValueOnce(event(49));
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  expect(hook.result.current.child).toBeNull();
  const firstSignal = list.mock.calls[0]![0].signal as AbortSignal;
  hook.rerender({ threads: [{ ...child, updatedAt: 50 }] });
  expect(firstSignal.aborted).toBe(true);
  await waitFor(() => expect(hook.result.current.child).toBe(49));
  await act(async () => { resolveOld(event(29)); await oldRead; });
  expect(hook.result.current.child).toBe(49);
});

it("discards an in-flight completion when the child starts another turn", async () => {
  let finish!: (events: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => { finish = resolve; });
  list.mockReturnValueOnce(pending);
  const hook = renderHook(({ threads }) => useChildCompletions(threads), { initialProps: { threads: [child] } });
  hook.rerender({ threads: [{ ...child, status: "active", updatedAt: 40 }] });
  await act(async () => { finish(event(29)); await pending; });
  expect(hook.result.current.child).toBeUndefined();
});

it("does not read top-level, running, hidden or archived threads", () => {
  renderHook(() => useChildCompletions([
    { ...child, parentThreadId: null },
    { ...child, id: "running", status: "active" },
    { ...child, id: "hidden", isHidden: true },
    { ...child, id: "archived", isArchived: true },
  ]));
  expect(list).not.toHaveBeenCalled();
});
