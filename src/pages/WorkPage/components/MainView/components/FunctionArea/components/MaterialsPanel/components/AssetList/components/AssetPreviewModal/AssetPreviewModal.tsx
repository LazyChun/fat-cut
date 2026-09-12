import React, { useRef } from "react";
import { Modal } from "antd";
import { useI18n, useSdk } from "hooks";
import type { AssetItem } from "fat-notes-sdk";
import styles from "./AssetPreviewModal.less";

interface AssetPreviewModalProps {
  open: boolean;
  asset: AssetItem | null;
  onCancel: () => void;
}

const AssetPreviewModal: React.FC<AssetPreviewModalProps> = ({
  open,
  asset,
  onCancel,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const stopMedia = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  const handleCancel = () => {
    stopMedia();
    onCancel();
  };

  if (!asset) {
    return (
      <Modal
        open={open}
        onCancel={handleCancel}
        footer={null}
        title={text("cut.materials.preview")}
      />
    );
  }

  const previewUrl = sdk.asset.previewUrl(asset.file_path);
  const isImage = asset.file_type.startsWith("image/");
  const isAudio = asset.file_type.startsWith("audio/");
  const width = isAudio ? 480 : 800;

  return (
    <Modal
      destroyOnHidden={true}
      open={open}
      title={asset.file_name}
      onCancel={handleCancel}
      footer={null}
      width={width}
    >
      <div className={styles.preview}>
        {isImage && (
          <img
            className={styles.image}
            src={previewUrl}
            alt={asset.file_name}
          />
        )}
        {!isImage && !isAudio && (
          <video
            ref={videoRef}
            className={styles.video}
            src={previewUrl}
            controls
            autoPlay
            playsInline
          />
        )}
        {isAudio && (
          <div className={styles.audioWrap}>
            <div className={styles.audioIcon}>
              <svg
                width={64}
                height={64}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
            <audio
              ref={audioRef}
              className={styles.audio}
              src={previewUrl}
              controls
              autoPlay
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AssetPreviewModal;
