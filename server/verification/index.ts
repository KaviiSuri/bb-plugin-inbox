// Verifications and Laters on the bb server (ADR 0007): keyed reads per
// thread, and writes that refresh those reads in every client.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  signOffTag,
  verificationRpcContract,
} from "../../shared/inbox-verification.js";
import { readCoveredWork } from "./diff-base.js";
import { createSignOffStore } from "./store.js";

export function registerVerification(bb: BbPluginApi): void {
  const store = createSignOffStore(bb);
  bb.rpc.register(verificationRpcContract, {
    verifications({ keys }) {
      return store.readVerifications(keys);
    },
    laters({ keys }) {
      return store.readLaters(keys);
    },
    async verify({ threadId, client }) {
      const covered = await readCoveredWork(bb, threadId);
      const verification = {
        threadId,
        verifiedAt: Date.now(),
        client,
        ...covered,
      };
      store.writeVerification(verification);
      bb.rpc.experimental_invalidate([signOffTag(threadId)]);
      return verification;
    },
    later({ threadId, client }) {
      const later = { threadId, laterAt: Date.now(), client };
      store.writeLater(later);
      bb.rpc.experimental_invalidate([signOffTag(threadId)]);
      return later;
    },
  });
}
