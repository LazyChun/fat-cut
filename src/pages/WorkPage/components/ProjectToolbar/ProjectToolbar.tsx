import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import {
  editorStore,
  playbackStore,
  projectStore,
  useEditorStore,
  useProjectStore,
} from "reducers";
import { getTimelineEnd } from "utils";
import { ProjectEditModal, ExportModal, AiConfigModal } from "./components";
import styles from "./ProjectToolbar.less";

const ProjectToolbar = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { projects, selectedProjectId, loadingStatus } = useProjectStore();
  const { project, dirty } = useEditorStore();

  useEffect(() => {
    if (loadingStatus === "idle") {
      void projectStore.loadProjects(sdk);
    }
  }, [sdk, loadingStatus]);

  // 工程列表加载完成后，自动恢复上次打开的工程
  const autoLoadRef = useRef(false);
  useEffect(() => {
    if (autoLoadRef.current) return;
    if (loadingStatus !== "succeeded" || projects.length === 0) return;
    autoLoadRef.current = true;
    void (async () => {
      try {
        const conf = await sdk.config.get<{ lastProjectId?: string }>();
        const lastId = conf?.lastProjectId;
        if (!lastId) return;
        if (!projects.some((p) => p.id === lastId)) return;
        if (projectStore.getState().selectedProjectId === lastId) return;
        projectStore.selectProject(lastId);
        // 若编辑器已加载该工程（如刚创建），无需重复加载
        const already = editorStore.getState().project?.id === lastId;
        if (already) {
          const cur = editorStore.getState().project;
          if (cur) playbackStore.setDuration(getTimelineEnd(cur.tracks));
          return;
        }
        const loaded = await editorStore.loadProject(sdk, lastId);
        playbackStore.setDuration(getTimelineEnd(loaded.tracks));
        playbackStore.seek(0);
      } catch {
        // 忽略，用户可手动选择工程
      }
    })();
  }, [sdk, loadingStatus, projects]);

  const currentName = useMemo(() => {
    const selected = projects.find((p) => p.id === selectedProjectId);
    return selected?.name ?? project?.name ?? text("cut.toolbar.projectName");
  }, [projects, selectedProjectId, project, text]);

  const handleOpenModal = useCallback((editing?: Cut.ProjectItem) => {
    projectStore.setEditingProject(editing);
    projectStore.setEditModalOpen(true);
  }, []);

  const handleBackToPreview = useCallback(() => {
    editorStore.reset();
    projectStore.selectProject(undefined);
  }, []);

  const handleSelectProject = useCallback(
    async (id: string) => {
      if (id === selectedProjectId) {
        return;
      }
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

  const handleDeleteProject = useCallback(
    async (id: string, name: string) => {
      const confirmed = await sdk.ui.modal.confirm({
        title: text("cut.project.confirmDelete", { name }),
      });
      if (!confirmed) {
        return;
      }
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

  const handleSave = useCallback(async () => {
    try {
      await editorStore.saveProject(sdk);
      sdk.ui.toast.success(text("cut.toolbar.saved"));
    } catch (error) {
      sdk.ui.toast.error(
        text("cut.toolbar.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [sdk, text]);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  const handleModalSuccess = useCallback(() => {
    projectStore.setEditModalOpen(false);
    void projectStore.loadProjects(sdk);
  }, [sdk]);

  const menuItems: MenuProps["items"] = useMemo(() => {
    const projectItems: MenuProps["items"] = projects.map((p) => ({
      key: p.id,
      label: (
        <div className={styles.projectItem}>
          <span className={styles.projectItemName}>{p.name}</span>
          <span
            className={styles.projectItemDelete}
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteProject(p.id, p.name);
            }}
          >
            <Icon name="trash" size={14} />
          </span>
        </div>
      ),
      onClick: () => {
        void handleSelectProject(p.id);
      },
    }));
    return [
      ...projectItems,
      { type: "divider" as const },
      {
        key: "__new__",
        label: (
          <div className={styles.newItem}>
            <Icon name="plus" size={14} />
            <span>{text("cut.toolbar.new")}</span>
          </div>
        ),
        onClick: () => handleOpenModal(undefined),
      },
    ];
  }, [
    projects,
    text,
    handleSelectProject,
    handleDeleteProject,
    handleOpenModal,
  ]);

  const saveDisabled = !project;
  const exportDisabled = !project || getTimelineEnd(project.tracks) <= 0;
  const hasProjects = projects.length > 0;

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {selectedProjectId && (
          <Tooltip title={text("cut.toolbar.back")}>
            <Button
              type="text"
              icon={<Icon name="arrowLeft" size={16} />}
              onClick={handleBackToPreview}
            />
          </Tooltip>
        )}
        <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
          <Button type="text" className={styles.projectDropdown}>
            <Icon name="folder" size={16} />
            <span className={styles.projectName}>{currentName}</span>
          </Button>
        </Dropdown>
        {dirty && (
          <span className={styles.dirty}>{text("cut.toolbar.unsaved")}</span>
        )}
      </div>
      <div className={styles.right}>
        <Tooltip title={text("cut.toolbar.new")}>
          <Button
            type="text"
            icon={<Icon name="plus" size={16} />}
            onClick={() => handleOpenModal(undefined)}
          />
        </Tooltip>
        <Tooltip title={text("cut.toolbar.save")}>
          <Button
            type="text"
            icon={<Icon name="save" size={16} />}
            disabled={saveDisabled}
            className={dirty ? styles.dirtySave : undefined}
            onClick={() => {
              void handleSave();
            }}
          />
        </Tooltip>
        <Tooltip title={text("cut.export.button")}>
          <Button
            type="text"
            icon={<Icon name="export" size={16} />}
            disabled={exportDisabled}
            onClick={() => setExportModalOpen(true)}
          />
        </Tooltip>
        <Tooltip title={text("cut.ai.config.title")}>
          <Button
            type="text"
            icon={<Icon name="settings" size={16} />}
            onClick={() => setAiConfigOpen(true)}
          />
        </Tooltip>
      </div>
      {!hasProjects && loadingStatus === "succeeded" && (
        <span className={styles.hint}>{text("cut.timeline.empty")}</span>
      )}
      <ProjectEditModal onSuccess={handleModalSuccess} />
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
      <AiConfigModal
        open={aiConfigOpen}
        onClose={() => setAiConfigOpen(false)}
      />
    </div>
  );
};

export default ProjectToolbar;
