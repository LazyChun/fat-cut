import React, { useEffect } from "react";
import {
  Button,
  ColorPicker,
  Input,
  InputNumber,
  Segmented,
  Select,
  Switch,
} from "antd";
import { FatForm } from "components";
import { editorStore } from "reducers";
import { useI18n } from "hooks";
import styles from "./TextProperties.less";

interface TextFormValues {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  backgroundColor: string;
}

interface TextPropertiesProps {
  clipId: string;
  config: Cut.TextConfig;
}

const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Microsoft YaHei", value: '"Microsoft YaHei", sans-serif' },
];

interface ColorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  allowClear?: boolean;
}

const ColorField: React.FC<ColorFieldProps> = ({
  value,
  onChange,
  allowClear,
}) => {
  const { text } = useI18n();
  return (
    <div className={styles.colorField}>
      <ColorPicker
        size="small"
        value={value || "#000000"}
        onChange={(c) => onChange?.(c.toHexString())}
        showText
        format="hex"
      />
      {allowClear && (
        <Button
          size="small"
          type="text"
          disabled={!value}
          onClick={() => onChange?.("")}
          className={styles.clearBtn}
        >
          {text("cut.text.clear")}
        </Button>
      )}
    </div>
  );
};

const TextProperties: React.FC<TextPropertiesProps> = ({
  clipId,
  config,
}) => {
  const { text } = useI18n();
  const [form] = FatForm.useForm<TextFormValues>();

  useEffect(() => {
    form.setFieldsValue({
      content: config.content,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      color: config.color,
      bold: config.bold,
      italic: config.italic,
      align: config.align,
      strokeColor: config.strokeColor ?? "#000000",
      strokeWidth: config.strokeWidth ?? 0,
      shadow: config.shadow ?? false,
      backgroundColor: config.backgroundColor ?? "",
    });
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleValuesChange = (
    _changed: Partial<TextFormValues>,
    all: TextFormValues,
  ) => {
    const next: Cut.TextConfig = {
      content: all.content,
      fontFamily: all.fontFamily,
      fontSize: all.fontSize,
      color: all.color || "#ffffff",
      bold: all.bold,
      italic: all.italic,
      align: all.align,
      strokeColor:
        all.strokeWidth > 0 ? all.strokeColor || "#000000" : undefined,
      strokeWidth: all.strokeWidth > 0 ? all.strokeWidth : undefined,
      shadow: all.shadow || undefined,
      backgroundColor: all.backgroundColor || undefined,
    };
    editorStore.updateClip(clipId, { text: next });
  };

  return (
    <div className={styles.container}>
      <div className={styles.sectionTitle}>
        {text("cut.text.properties")}
      </div>
      <FatForm<TextFormValues>
        form={form}
        onValuesChange={handleValuesChange}
        layout="vertical"
      >
        <FatForm.Item label={text("cut.text.content")} name="content">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </FatForm.Item>
        <FatForm.Item label={text("cut.text.fontFamily")} name="fontFamily">
          <Select options={FONT_OPTIONS} size="small" />
        </FatForm.Item>
        <FatForm.Item label={text("cut.text.fontSize")} name="fontSize">
          <InputNumber min={8} max={200} step={1} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item
          label={text("cut.text.color")}
          name="color"
        >
          <ColorField />
        </FatForm.Item>
        <FatForm.Item label={text("cut.text.align")} name="align">
          <Segmented
            size="small"
            block
            options={[
              { label: text("cut.text.alignLeft"), value: "left" },
              { label: text("cut.text.alignCenter"), value: "center" },
              { label: text("cut.text.alignRight"), value: "right" },
            ]}
          />
        </FatForm.Item>
        <div className={styles.row}>
          <FatForm.Item
            label={text("cut.text.bold")}
            name="bold"
            valuePropName="checked"
          >
            <Switch size="small" />
          </FatForm.Item>
          <FatForm.Item
            label={text("cut.text.italic")}
            name="italic"
            valuePropName="checked"
          >
            <Switch size="small" />
          </FatForm.Item>
          <FatForm.Item
            label={text("cut.text.shadow")}
            name="shadow"
            valuePropName="checked"
          >
            <Switch size="small" />
          </FatForm.Item>
        </div>
        <div className={styles.sectionTitle}>
          {text("cut.text.strokeSection")}
        </div>
        <div className={styles.row}>
          <FatForm.Item
            label={text("cut.text.strokeColor")}
            name="strokeColor"
          >
            <ColorField allowClear />
          </FatForm.Item>
          <FatForm.Item
            label={text("cut.text.strokeWidth")}
            name="strokeWidth"
          >
            <InputNumber
              min={0}
              max={10}
              step={0.5}
              size="small"
              style={{ width: "100%" }}
            />
          </FatForm.Item>
        </div>
        <FatForm.Item
          label={text("cut.text.backgroundColor")}
          name="backgroundColor"
        >
          <ColorField allowClear />
        </FatForm.Item>
      </FatForm>
    </div>
  );
};

export default TextProperties;
