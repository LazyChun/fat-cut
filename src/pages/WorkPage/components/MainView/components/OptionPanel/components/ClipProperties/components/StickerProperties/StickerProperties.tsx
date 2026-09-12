import React, { useEffect } from "react";
import { Input, InputNumber } from "antd";
import { FatForm } from "components";
import { editorStore } from "reducers";
import { useI18n } from "hooks";
import styles from "./StickerProperties.less";

interface StickerFormValues {
  content: string;
  size: number;
}

interface StickerPropertiesProps {
  clipId: string;
  config: Cut.StickerConfig;
}

const StickerProperties: React.FC<StickerPropertiesProps> = ({
  clipId,
  config,
}) => {
  const { text } = useI18n();
  const [form] = FatForm.useForm<StickerFormValues>();

  useEffect(() => {
    form.setFieldsValue({
      content: config.content,
      size: config.size,
    });
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleValuesChange = (
    _changed: Partial<StickerFormValues>,
    all: StickerFormValues,
  ) => {
    const next: Cut.StickerConfig = {
      ...config,
      content: all.content,
      size: all.size,
    };
    editorStore.updateClip(clipId, { sticker: next });
  };

  return (
    <div className={styles.container}>
      <div className={styles.sectionTitle}>
        {text("cut.stickers.properties")}
      </div>
      <FatForm<StickerFormValues>
        form={form}
        onValuesChange={handleValuesChange}
        layout="vertical"
      >
        <FatForm.Item label={text("cut.stickers.content")} name="content">
          <Input />
        </FatForm.Item>
        <FatForm.Item label={text("cut.stickers.size")} name="size">
          <InputNumber
            min={16}
            max={400}
            step={4}
            style={{ width: "100%" }}
          />
        </FatForm.Item>
      </FatForm>
    </div>
  );
};

export default StickerProperties;
