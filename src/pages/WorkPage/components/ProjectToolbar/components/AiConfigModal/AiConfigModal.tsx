import React, { useCallback, useEffect, useState } from "react";
import { Modal, Select, Tag } from "antd";
import { FatForm } from "components";
import { useI18n, useSdk } from "hooks";
import type { AiModelItem } from "fat-notes-sdk";
import styles from "./AiConfigModal.less";

interface AiConfigModalProps {
  open: boolean;
  onClose: () => void;
}

interface AiConfigFormValues {
  recognitionModelId?: string;
  aiModelId?: string;
}

const AiConfigModal: React.FC<AiConfigModalProps> = ({ open, onClose }) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [models, setModels] = useState<AiModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recognitionModelId, setRecognitionModelId] = useState<
    string | undefined
  >(undefined);
  const [arrangementModelId, setArrangementModelId] = useState<
    string | undefined
  >(undefined);

  const imageModels = models.filter((m) => m.supportImages === true);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [modelList, config] = await Promise.all([
          sdk.ai.getModels(),
          sdk.config.get<Cut.AiConfig>(),
        ]);
        if (cancelled) {
          return;
        }
        setModels(modelList);
        setRecognitionModelId(config?.recognitionModelId);
        setArrangementModelId(config?.aiModelId);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        sdk.ui.toast.error(text("cut.ai.config.loadModelsFailed", { message }));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sdk, text]);

  const handleOk = useCallback(async () => {
    setSubmitting(true);
    try {
      const next: Cut.AiConfig = {
        recognitionModelId,
        aiModelId: arrangementModelId,
      };
      await sdk.config.set(next, { merge: true });
      sdk.ui.toast.success(text("cut.ai.config.saveSuccess"));
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sdk.ui.toast.error(text("cut.ai.config.saveFailed", { message }));
    } finally {
      setSubmitting(false);
    }
  }, [recognitionModelId, arrangementModelId, sdk, text, onClose]);

  const renderModelLabel = (model: AiModelItem) => {
    return (
      <span className={styles.modelTags}>
        <span>{model.name}</span>
        {model.supportImages && (
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            {text("cut.ai.config.modelImageSupported")}
          </Tag>
        )}
        {model.isDefault && (
          <Tag color="green" style={{ marginInlineEnd: 0 }}>
            {text("cut.ai.config.modelDefault")}
          </Tag>
        )}
      </span>
    );
  };

  return (
    <Modal
      destroyOnHidden={true}
      open={open}
      title={text("cut.ai.config.title")}
      okText={text("cut.project.modal.ok")}
      cancelText={text("cut.project.modal.cancel")}
      confirmLoading={submitting}
      onCancel={onClose}
      onOk={() => {
        void handleOk();
      }}
      width={520}
    >
      <FatForm<AiConfigFormValues> layout="vertical">
        <div className={styles.container}>
          <div className={styles.description}>
            {text("cut.ai.config.description")}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>
                {text("cut.ai.config.recognitionModel")}
              </span>
            </div>
            <div className={styles.hint}>
              {text("cut.ai.config.recognitionModelHint")}
            </div>
            {imageModels.length === 0 && !loading ? (
              <div className={styles.emptyHint}>
                {text("cut.ai.config.noImageModels")}
              </div>
            ) : (
              <Select<string>
                loading={loading}
                value={recognitionModelId}
                placeholder={text("cut.ai.config.recognitionModelPlaceholder")}
                optionFilterProp="label"
                options={imageModels.map((m) => ({
                  value: m.id,
                  label: m.name,
                  model: m,
                }))}
                optionRender={(option) =>
                  option.data.model
                    ? renderModelLabel(option.data.model)
                    : option.label
                }
                onChange={(value: string) => setRecognitionModelId(value)}
                allowClear
              />
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>
                {text("cut.ai.config.arrangementModel")}
              </span>
            </div>
            <div className={styles.hint}>
              {text("cut.ai.config.arrangementModelHint")}
            </div>
            {models.length === 0 && !loading ? (
              <div className={styles.emptyHint}>
                {text("cut.ai.config.noModels")}
              </div>
            ) : (
              <Select<string>
                loading={loading}
                value={arrangementModelId}
                placeholder={text("cut.ai.config.arrangementModelPlaceholder")}
                optionFilterProp="label"
                options={models.map((m) => ({
                  value: m.id,
                  label: m.name,
                  model: m,
                }))}
                optionRender={(option) =>
                  option.data.model
                    ? renderModelLabel(option.data.model)
                    : option.label
                }
                onChange={(value: string) => setArrangementModelId(value)}
                allowClear
              />
            )}
          </div>
        </div>
      </FatForm>
    </Modal>
  );
};

export default AiConfigModal;
