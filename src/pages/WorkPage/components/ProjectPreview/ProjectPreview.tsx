import React, { useCallback } from "react";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import {
  editorStore,
  playbackStore,
  projectStore,
  useProjectStore,
} from "reducers";
import { getTimelineEnd } from "utils";
import { ProjectCard } from "./components";
import styles from "./ProjectPreview.less";

const ProjectPreview = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { projects, selectedProjectId } = useProjectStore();

  const handleOpen = useCallback(
    async (id: string) => {
      if (id === selectedProjectId) return;
      editorStore.reset();
      projectStore.selectProject(id);
      try {
        const loaded = await editorStore.loadProject(sdk, id);
        playbackStore.setDuration(getTimelineEnd(loaded.tracks));
        playbackStore.seek(0);
      } catch (error) {
        sdk.ui.toast.error(
          text("cut.project.modal.edit.failed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [sdk, selectedProjectId, text],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      const confirmed = await sdk.ui.modal.confirm({
        title: text("cut.project.confirmDelete", { name }),
      });
      if (!confirmed) return;
      try {
        await sdk.backend.invoke("deleteProject", { id });
        if (id === selectedProjectId) {
          editorStore.reset();
          projectStore.selectProject(undefined);
          void sdk.config.set({ lastProjectId: undefined }, { merge: true });
        }
        await projectStore.loadProjects(sdk);
      } catch (error) {
        sdk.ui.toast.error(
          text("cut.project.modal.edit.failed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [sdk, selectedProjectId, text],
  );

  const handleNew = useCallback(() => {
    projectStore.setEditingProject(undefined);
    projectStore.setEditModalOpen(true);
  }, []);

  return (
    <div className={styles.preview}>
      <div className={styles.grid}>
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onOpen={handleOpen}
            onDelete={handleDelete}
          />
        ))}
        <div
          className={styles.newCard}
          onClick={handleNew}
          role="button"
          tabIndex={0}
        >
          <Icon name="plus" size={28} />
          <span>{text("cut.toolbar.new")}</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectPreview;
