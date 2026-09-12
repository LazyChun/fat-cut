import React, { useCallback } from "react";
import { Button, Select, Tooltip } from "antd";
import { Icon } from "components";
import { useI18n } from "hooks";
import { usePlaybackStore, playbackStore } from "reducers";
import { formatTime } from "utils";
import styles from "./PreviewControls.less";

const RATE_OPTIONS = [0.5, 1, 1.5, 2];

const PreviewControls: React.FC = () => {
  const { isPlaying, currentTime, duration, rate } = usePlaybackStore();
  const { text } = useI18n();

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      playbackStore.pause();
    } else {
      playbackStore.play();
    }
  }, [isPlaying]);

  const handleRateChange = useCallback((value: number) => {
    playbackStore.setRate(value);
  }, []);

  return (
    <div className={styles.controls}>
      <Tooltip title={text(isPlaying ? "cut.preview.pause" : "cut.preview.play")}>
        <Button
          type="text"
          size="small"
          icon={<Icon name={isPlaying ? "pause" : "play"} size={16} />}
          onClick={handleToggle}
        />
      </Tooltip>
      <span className={styles.time}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <div className={styles.right}>
        <Select
          size="small"
          variant="borderless"
          value={rate}
          options={RATE_OPTIONS.map((r) => ({ label: `${r}x`, value: r }))}
          onChange={handleRateChange}
          style={{ width: 64 }}
        />
      </div>
    </div>
  );
};

export default PreviewControls;
