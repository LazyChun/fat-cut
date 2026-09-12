import React, { useEffect } from "react";
import { InputNumber, Input } from "antd";
import { FatForm } from "components";
import { useEditorStore, editorStore } from "reducers";
import { useI18n } from "hooks";
import styles from "./ProjectProperties.less";

interface ProjectFormValues {
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
}

const FPS_OPTIONS = [24, 25, 30, 50, 60];

const ProjectProperties: React.FC = () => {
  const { project } = useEditorStore();
  const { text } = useI18n();
  const [form] = FatForm.useForm<ProjectFormValues>();

  useEffect(() => {
    if (!project) return;
    form.setFieldsValue({
      fps: project.fps,
      width: project.width,
      height: project.height,
      backgroundColor: project.backgroundColor,
    });
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return null;

  const handleValuesChange = (
    _changed: Partial<ProjectFormValues>,
    all: ProjectFormValues,
  ) => {
    editorStore.updateProject(all);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>{text("cut.option.project")}</div>
      <FatForm<ProjectFormValues>
        form={form}
        onValuesChange={handleValuesChange}
        layout="vertical"
      >
        <FatForm.Item label={text("cut.option.fps")} name="fps">
          <InputNumber min={1} max={120} step={1} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.width")} name="width">
          <InputNumber min={1} max={7680} step={2} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.heightProject")} name="height">
          <InputNumber min={1} max={4320} step={2} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.backgroundColor")} name="backgroundColor">
          <Input maxLength={20} />
        </FatForm.Item>
      </FatForm>
      <div className={styles.fpsHint}>
        {FPS_OPTIONS.map((f) => f).join(" / ")}
      </div>
    </div>
  );
};

export default ProjectProperties;
