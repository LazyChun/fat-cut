import React from "react";
import { Button, Tag, Tooltip } from "antd";
import { EditOutlined, EyeOutlined } from "@ant-design/icons";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import { hasAssetDescription, parseAssetDescription } from "utils";
import { useEditorStore } from "reducers";
import type { AssetItem } from "fat-notes-sdk";
import styles from "./AssetCard.less";

interface AssetCardProps {
  item: AssetItem;
  onAdd: (item: AssetItem) => void;
  onEdit: (item: AssetItem) => void;
  onPreview: (item: AssetItem) => void;
  adding?: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({
  item,
  onAdd,
  onEdit,
  onPreview,
  adding,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { project } = useEditorStore();
  const previewUrl = sdk.asset.previewUrl(item.file_path);
  const disabled = !project;

  const isImage = item.file_type.startsWith("image/");
  const isAudio = item.file_type.startsWith("audio/");

  const parsedDescription = parseAssetDescription(item.description);
  const hasDesc = hasAssetDescription(parsedDescription);
  const clipCount = parsedDescription.clipInfos?.length ?? 0;

  return (
    <div className={styles.card}>
      <div className={styles.thumb}>
        {isImage && (
          <img className={styles.image} src={previewUrl} alt={item.file_name} />
        )}
        {!isImage && !isAudio && (
          <video
            className={styles.video}
            src={`${previewUrl}#t=0.1`}
            muted
            preload="metadata"
            playsInline
          />
        )}
        {isAudio && (
          <div className={styles.audioPlaceholder}>
            <Icon name="audio" size={24} />
          </div>
        )}
        {hasDesc && (
          <Tag className={styles.descTag} color="blue">
            {text("cut.materials.description.hasContent")}
            {clipCount > 0 ? ` · ${clipCount}` : ""}
          </Tag>
        )}
        <div className={styles.actions}>
          <Tooltip title={text("cut.materials.preview")}>
            <Button
              size="small"
              type="text"
              className={styles.actionBtn}
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onPreview(item);
              }}
            />
          </Tooltip>
          <Tooltip title={text("cut.materials.editDescription")}>
            <Button
              size="small"
              type="text"
              className={styles.actionBtn}
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
            />
          </Tooltip>
          <Tooltip
            title={
              disabled ? text("cut.timeline.empty") : text("cut.materials.add")
            }
          >
            <Button
              size="small"
              type="primary"
              ghost
              className={styles.actionBtn}
              icon={<Icon name="plus" size={14} />}
              loading={adding}
              disabled={disabled}
              onClick={() => onAdd(item)}
            />
          </Tooltip>
        </div>
      </div>
      <div className={styles.info}>
        <span className={styles.name} title={item.file_name}>
          {item.file_name}
        </span>
      </div>
    </div>
  );
};

export default AssetCard;
