import { createSyncedPreferenceAtom } from "../preferences/synced-preference-atom.js";

/** The sidebar tab shown, synced like the list's other preferences. */
export const activeTabAtom = createSyncedPreferenceAtom("activeTab");
