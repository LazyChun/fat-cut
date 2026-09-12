import { useMemo } from "react";
import { useEditorStore, usePlaybackCurrentTime } from "reducers";
import { getActiveClip, getActiveVideoClips, getActiveAudioClips } from "utils";

export const useActiveClip = () => {
  const { project } = useEditorStore();
  const currentTime = usePlaybackCurrentTime();

  return useMemo(() => {
    if (!project) {
      return undefined;
    }
    return getActiveClip(project.tracks, currentTime);
  }, [project, currentTime]);
};

export const useActiveVideoClips = () => {
  const { project } = useEditorStore();
  const currentTime = usePlaybackCurrentTime();

  return useMemo(() => {
    if (!project) return [];
    return getActiveVideoClips(project.tracks, currentTime);
  }, [project, currentTime]);
};

export const useActiveAudioClips = () => {
  const { project } = useEditorStore();
  const currentTime = usePlaybackCurrentTime();

  return useMemo(() => {
    if (!project) return [];
    return getActiveAudioClips(project.tracks, currentTime);
  }, [project, currentTime]);
};
