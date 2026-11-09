import {
  definePluginApp,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { CompactViewportOverrideProvider } from "@/components/ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClassifierSettingsSection } from "./app/classifier/ClassifierSettingsSection.js";
import { PreferencesSync } from "./app/preferences/PreferencesSync.js";
import { ProjectList } from "./app/list/ProjectList.js";
import { useSidebarThreadReveal } from "./app/list/useSidebarThreadReveal.js";
import { moveThreadAction } from "./app/rows/moveThreadAction.js";
import { ThreadSelectionProvider } from "./app/selection/threadSelection.js";

function ThreadList({
  activeThreadId,
  isCompactViewport,
  onNavigate,
}: PluginThreadListProps) {
  useSidebarThreadReveal();
  return (
    <CompactViewportOverrideProvider isCompactViewport={isCompactViewport}>
      <TooltipProvider>
        <PreferencesSync />
        <ThreadSelectionProvider activeThreadId={activeThreadId}>
          <ProjectList
            activeThreadId={activeThreadId}
            onProjectSelect={onNavigate}
          />
        </ThreadSelectionProvider>
      </TooltipProvider>
    </CompactViewportOverrideProvider>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "inbox",
    title: "Inbox",
    description:
      "bb's thread list with an Inbox tab: pinned threads, custom sections, projects, machines, and nested threads.",
    component: ThreadList,
  });
  app.slots.experimental_threadAction(moveThreadAction);
  app.slots.settingsSection({
    id: "turn-end-classifier",
    title: "Turn-end classifier",
    description: "Which model reads whether a turn ended with a question for you.",
    component: ClassifierSettingsSection,
  });
});
