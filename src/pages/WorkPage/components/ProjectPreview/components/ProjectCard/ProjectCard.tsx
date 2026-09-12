import React from "react";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import styles from "./ProjectCard.less";

interface ProjectCardProps {
  project: Cut.ProjectItem;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

const VIDEO_EXTS = ["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"];

const isVideoFile = (filePath: string) => {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.includes(ext);
};

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpen,
  onDelete,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const thumbPath = project.thumbnail;
  const previewUrl = thumbPath ? sdk.asset.previewUrl(thumbPath) : undefined;
  const isVideo = thumbPath ? isVideoFile(thumbPath) : false;

  return (
    <div
      className={styles.card}
      onClick={() => onOpen(project.id)}
      role="button"
      tabIndex={0}
    >
      <div className={styles.thumb}>
        {previewUrl && isVideo && (
          <video
            className={styles.media}
            src={`${previewUrl}#t=0.1`}
            muted
            preload="metadata"
            playsInline
          />
        )}
        {previewUrl && !isVideo && (
          <img className={styles.media} src={previewUrl} alt={project.name} />
        )}
        {!previewUrl && (
          <div className={styles.placeholder}>
            <Icon name="video" size={32} />
            <span>{text("cut.preview.noThumbnail")}</span>
          </div>
        )}
        <span
          className={styles.delete}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id, project.name);
          }}
        >
          <Icon name="trash" size={14} />
        </span>
      </div>
      <div className={styles.info}>
        <div className={styles.name} title={project.name}>
          {project.name}
        </div>
        {project.description && (
          <div className={styles.desc} title={project.description}>
            {project.description}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
