import { useSyncExternalStore } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";

type LoadingStatus = "idle" | "loading" | "succeeded" | "failed";

interface ProjectState {
  projects: Cut.ProjectItem[];
  selectedProjectId?: string;
  loadingStatus: LoadingStatus;
  isEditModalOpen: boolean;
  editingProject?: Cut.ProjectItem;
}

const initialState: ProjectState = {
  projects: [],
  selectedProjectId: undefined,
  loadingStatus: "idle",
  isEditModalOpen: false,
  editingProject: undefined,
};

let state = initialState;
let loadingPromise: Promise<Cut.ProjectItem[]> | null = null;
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setState = (updater: (prev: ProjectState) => ProjectState) => {
  const next = updater(state);
  if (next === state) {
    return;
  }
  state = next;
  emitChange();
};

const setLoadingStatus = (loadingStatus: LoadingStatus) => {
  setState((prev) =>
    prev.loadingStatus === loadingStatus ? prev : { ...prev, loadingStatus },
  );
};

const setProjects = (projects: Cut.ProjectItem[]) => {
  setState((prev) => {
    const hasSelected = prev.selectedProjectId
      ? projects.some((p) => p.id === prev.selectedProjectId)
      : false;
    return {
      ...prev,
      projects,
      selectedProjectId: hasSelected ? prev.selectedProjectId : undefined,
    };
  });
};

const selectProject = (selectedProjectId?: string) => {
  setState((prev) =>
    prev.selectedProjectId === selectedProjectId
      ? prev
      : { ...prev, selectedProjectId },
  );
};

const setEditModalOpen = (isOpen: boolean) => {
  setState((prev) =>
    prev.isEditModalOpen === isOpen
      ? prev
      : {
          ...prev,
          isEditModalOpen: isOpen,
          editingProject: isOpen ? prev.editingProject : undefined,
        },
  );
};

const setEditingProject = (project?: Cut.ProjectItem) => {
  setState((prev) => ({ ...prev, editingProject: project }));
};

const loadProjects = async (
  sdk: FatNotesPluginSDK,
): Promise<Cut.ProjectItem[]> => {
  if (loadingPromise) {
    return loadingPromise;
  }
  setLoadingStatus("loading");
  loadingPromise = sdk.backend
    .invoke<Cut.ProjectListResponse>("listProjects")
    .then((result) => {
      const items = result?.items || [];
      setProjects(items);
      setLoadingStatus("succeeded");
      return items;
    })
    .catch((error) => {
      setProjects([]);
      setLoadingStatus("failed");
      throw error;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const projectStore = {
  getState: getSnapshot,
  loadProjects,
  selectProject,
  setProjects,
  setLoadingStatus,
  setEditModalOpen,
  setEditingProject,
  subscribe,
};

const useProjectStore = () => useSyncExternalStore(subscribe, getSnapshot);

export type { LoadingStatus, ProjectState };
export { projectStore, useProjectStore };
