// @vitest-environment jsdom
// The interaction reads behind Blocked on you (#24): when each ask arrived,
// and which waiting threads the model must show without a time.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import { usePendingInteractions } from "./useInboxView.js";

const { list, sdk } = vi.hoisted(() => {
  const list = vi.fn();
  return { list, sdk: { threads: { interactions: { list } } } };
});
vi.mock("@get-bb/plugin-sdk/app", () => ({ useSdk: () => sdk }));
beforeEach(() => {
  list.mockReset();
});
afterEach(cleanup);

const waiting = makeSidebarThread({ id: "thr_q", hasPendingInteraction: true, updatedAt: 10 });
const ask = (createdAt: number) => ({
  createdAt,
  id: `int_${createdAt}`,
  status: "pending",
  threadId: "thr_q",
  payload: { kind: "user_question", questions: [{ id: "q1", prompt: "Which?" }] },
});

it("dates the summary by when the ask arrived", async () => {
  list.mockResolvedValueOnce([ask(60)]);
  const hook = renderHook(() => usePendingInteractions([waiting]));
  await waitFor(() => expect(hook.result.current.interactions.thr_q?.askedAt).toBe(60));
  expect(hook.result.current.interactionsMissing).toEqual({});
});

it("reports a failed read as missing, so the item still shows", async () => {
  list.mockRejectedValueOnce(new Error("offline"));
  const hook = renderHook(() => usePendingInteractions([waiting]));
  await waitFor(() => expect(hook.result.current.interactionsMissing).toEqual({ thr_q: true }));
  expect(hook.result.current.interactions).toEqual({});
});

it("reports a read that finds nothing pending as missing", async () => {
  list.mockResolvedValueOnce([]);
  const hook = renderHook(() => usePendingInteractions([waiting]));
  await waitFor(() => expect(hook.result.current.interactionsMissing).toEqual({ thr_q: true }));
});

it("forgets an answered ask, so the next one loads instead of taking its time", async () => {
  list.mockResolvedValueOnce([ask(30)]).mockReturnValueOnce(new Promise(() => {}));
  const hook = renderHook(({ threads }) => usePendingInteractions(threads), {
    initialProps: { threads: [waiting] },
  });
  await waitFor(() => expect(hook.result.current.interactions.thr_q?.askedAt).toBe(30));
  hook.rerender({ threads: [{ ...waiting, hasPendingInteraction: false, updatedAt: 20 }] });
  hook.rerender({ threads: [{ ...waiting, updatedAt: 30 }] });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(hook.result.current.interactions).toEqual({});
  expect(hook.result.current.interactionsMissing).toEqual({});
});

it("keeps when it started waiting on an open read across re-renders, so the grace isn't reset", async () => {
  list.mockReturnValue(new Promise(() => {}));
  vi.useFakeTimers({ toFake: ["Date"], now: 1_000 });
  try {
    const hook = renderHook(({ threads }) => usePendingInteractions(threads), {
      initialProps: { threads: [waiting] },
    });
    expect(hook.result.current.interactionsWaitingSince).toEqual({ thr_q: 1_000 });
    vi.setSystemTime(4_000);
    const other = makeSidebarThread({ id: "thr_other", hasPendingInteraction: true });
    hook.rerender({ threads: [waiting, other] });
    expect(hook.result.current.interactionsWaitingSince).toEqual({ thr_q: 1_000, thr_other: 4_000 });
  } finally {
    vi.useRealTimers();
  }
});
