import React, { useEffect } from "react";
import { Input, InputNumber, Switch } from "antd";
import { FatForm } from "components";
import { useEditorStore, editorStore } from "reducers";
import { findTrack } from "utils";
import { useI18n } from "hooks";
import styles from "./TrackProperties.less";

interface TrackFormValues {
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  height: number;
}

const TrackProperties: React.FC = () => {
  const { project, selectedTrackId } = useEditorStore();
  const { text } = useI18n();
  const [form] = FatForm.useForm<TrackFormValues>();

  const track =
    project && selectedTrackId
      ? findTrack(project.tracks, selectedTrackId)
      : undefined;

  useEffect(() => {
    if (!track) return;
    form.setFieldsValue({
      name: track.name,
      muted: track.muted,
      locked: track.locked,
      hidden: track.hidden,
      height: track.height,
    });
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) return null;

  const handleValuesChange = (
    _changed: Partial<TrackFormValues>,
    all: TrackFormValues,
  ) => {
    editorStore.updateTrack(track.id, all);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>{text("cut.option.track")}</div>
      <FatForm<TrackFormValues>
        form={form}
        onValuesChange={handleValuesChange}
        layout="vertical"
      >
        <FatForm.Item label={text("cut.option.trackName")} name="name">
          <Input maxLength={40} />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.muted")} name="muted" valuePropName="checked">
          <Switch />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.locked")} name="locked" valuePropName="checked">
          <Switch />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.hidden")} name="hidden" valuePropName="checked">
          <Switch />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.height")} name="height">
          <InputNumber min={40} max={200} step={4} style={{ width: "100%" }} />
        </FatForm.Item>
      </FatForm>
    </div>
  );
};

export default TrackProperties;
