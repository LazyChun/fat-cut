import React from "react";
import { useEditorStore } from "reducers";
import { findClip, findTrack } from "utils";
import {
  EmptyState,
  ClipProperties,
  TrackProperties,
  ProjectProperties,
  FilterProperties,
} from "./components";
import styles from "./OptionPanel.less";

const OptionPanel: React.FC = () => {
  const {
    project,
    selectedClipId,
    selectedTrackId,
    selectedFilterClipId,
  } = useEditorStore();

  let content: React.ReactNode;
  if (!project) {
    content = <EmptyState />;
  } else if (
    selectedFilterClipId &&
    project.filterClips?.some((f) => f.id === selectedFilterClipId)
  ) {
    content = <FilterProperties />;
  } else if (
    selectedClipId &&
    findClip(project.tracks, selectedClipId)
  ) {
    content = <ClipProperties />;
  } else if (
    selectedTrackId &&
    findTrack(project.tracks, selectedTrackId)
  ) {
    content = <TrackProperties />;
  } else {
    content = <ProjectProperties />;
  }

  return <div className={styles.container}>{content}</div>;
};

export default OptionPanel;
