import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import {
  extractJsonPayload,
  hasAssetDescription,
  isVideoOrAudio,
  parseAssetDescription,
  pickRecognitionModel,
  serializeAssetDescription,
} from "utils";
import type { AssetItem } from "fat-notes-sdk";
import styles from "./AssetDescriptionModal.less";

interface AssetDescriptionModalProps {
  open: boolean;
  asset: AssetItem | null;
  onSaved: (guid: string) => void;
  onCancel: () => void;
}

const genClipId = () =>
  `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface ClipRow extends Cut.AssetClipInfo {
  _id: string;
}

const toClipRows = (clips?: Cut.AssetClipInfo[]): ClipRow[] =>
  (clips ?? []).map((clip) => ({ ...clip, _id: genClipId() }));

const AssetDescriptionModal: React.FC<AssetDescriptionModalProps> = ({
  open,
  asset,
  onSaved,
  onCancel,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [description, setDescription] = useState("");
  const [clipRows, setClipRows] = useState<ClipRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [recognizing, setRecognizing] = useState(false);

  const showClipInfos = asset ? isVideoOrAudio(asset.file_type) : false;

  const handleRecognize = useCallback(async () => {
    if (!asset) {
      return;
    }
    setRecognizing(true);
    try {
      const config = await sdk.config.get<Cut.AiConfig>();
      const models = await sdk.ai.getModels();
      const model = pickRecognitionModel(models, config?.recognitionModelId);
      if (!model) {
        sdk.ui.toast.warn(text("cut.ai.recognizeNoModel"));
        return;
      }
      const isImage = asset.file_type.startsWith("image/");
      const payload: Record<string, unknown> = {
        fileName: asset.file_name,
        fileType: asset.file_type,
        filePath: asset.file_path,
      };
      if (!isImage) {
        payload.note =
          "This is a video/audio asset. Describe its likely content based on the file name and type.";
      }
      const sysPrompt = isImage
        ? "你是 fat-cut 的素材识别助手。请根据图片内容生成结构化的素材描述，返回严格 JSON，不要 markdown。格式为 {\"description\":string}。description 字段用中文描述图片的画面内容、主体、场景、氛围等关键信息，便于后续 AI 剪辑使用。"
        : "你是 fat-cut 的素材识别助手。请根据素材文件名与类型推断其内容，返回严格 JSON，不要 markdown。格式为 {\"description\":string}。description 字段用中文描述素材的推测内容、适用场景等，便于后续 AI 剪辑使用。";
      const aiResult = await sdk.ai.chat({
        modelId: model.id,
        messages: [
          {
            role: "user",
            content: JSON.stringify(payload, null, 2),
          },
        ],
        sysPrompt,
        maxIterations: 1,
      });
      const parsed = extractJsonPayload(aiResult.content) as
        | { description?: string }
        | null;
      if (parsed?.description) {
        setDescription(parsed.description);
        sdk.ui.toast.success(text("cut.ai.recognizeSuccess"));
      } else {
        setDescription(aiResult.content);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sdk.ui.toast.error(text("cut.ai.recognizeFailed", { message }));
    } finally {
      setRecognizing(false);
    }
  }, [asset, sdk, text]);

  useEffect(() => {
    if (!open || !asset) {
      return;
    }
    const parsed = parseAssetDescription(asset.description);
    setDescription(parsed.description);
    setClipRows(toClipRows(parsed.clipInfos));
  }, [open, asset]);

  const handleAddClip = useCallback(() => {
    setClipRows((prev) => [
      ...prev,
      {
        _id: genClipId(),
        startTime: 0,
        endTime: 0,
        content: "",
        usage: "",
      },
    ]);
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    setClipRows((prev) => prev.filter((row) => row._id !== id));
  }, []);

  const handleClipChange = useCallback(
    (id: string, patch: Partial<ClipRow>) => {
      setClipRows((prev) =>
        prev.map((row) => (row._id === id ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!asset) {
      return;
    }
    setSubmitting(true);
    try {
      const data: Cut.AssetDescriptionData = {
        description: description.trim(),
        clipInfos: showClipInfos
          ? clipRows.map((row) => ({
              startTime: row.startTime,
              endTime: row.endTime,
              content: row.content,
              usage: row.usage,
            }))
          : undefined,
      };
      const serialized = serializeAssetDescription(data);
      await sdk.asset.update(asset.guid, { description: serialized });
      sdk.ui.toast.success(text("cut.materials.description.saveSuccess"));
      onSaved(asset.guid);
      onCancel();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sdk.ui.toast.error(
        text("cut.materials.description.saveFailed", { message }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [asset, clipRows, description, onCancel, onSaved, sdk, showClipInfos, text]);

  const previewData: Cut.AssetDescriptionData = {
    description,
    clipInfos: showClipInfos ? clipRows : undefined,
  };
  const hasContent = hasAssetDescription(previewData);

  return (
    <Modal
      destroyOnHidden={true}
      open={open}
      title={text("cut.materials.description.title")}
      okText={text("cut.project.modal.ok")}
      cancelText={text("cut.project.modal.cancel")}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !hasContent }}
      onCancel={onCancel}
      onOk={() => {
        void handleSubmit();
      }}
      width={640}
    >
      {asset && (
        <div className={styles.container}>
          <Typography.Text className={styles.assetName} strong>
            {asset.file_name}
          </Typography.Text>
          <div className={styles.section}>
            <div className={styles.descHeader}>
              <div className={styles.sectionLabel}>
                {text("cut.materials.description.label")}
              </div>
              <Button
                size="small"
                type="primary"
                ghost
                loading={recognizing}
                icon={<Icon name="sparkles" size={14} />}
                onClick={() => void handleRecognize()}
              >
                {text("cut.ai.recognize")}
              </Button>
            </div>
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={description}
              placeholder={text("cut.materials.description.placeholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {showClipInfos && (
            <div className={styles.section}>
              <div className={styles.clipHeader}>
                <div>
                  <div className={styles.sectionLabel}>
                    {text("cut.materials.clipInfos.title")}
                  </div>
                  <Typography.Text className={styles.hint} type="secondary">
                    {text("cut.materials.clipInfos.hint")}
                  </Typography.Text>
                </div>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<PlusOutlined />}
                  onClick={handleAddClip}
                >
                  {text("cut.materials.clipInfos.add")}
                </Button>
              </div>
              {clipRows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={text("cut.materials.clipInfos.empty")}
                />
              ) : (
                <div className={styles.clipList}>
                  {clipRows.map((row) => (
                    <div key={row._id} className={styles.clipRow}>
                      <div className={styles.clipTimes}>
                        <div className={styles.timeField}>
                          <span className={styles.timeLabel}>
                            {text("cut.materials.clipInfos.startTime")}
                          </span>
                          <InputNumber
                            size="small"
                            min={0}
                            step={0.1}
                            value={row.startTime}
                            onChange={(value) =>
                              handleClipChange(row._id, {
                                startTime: Number(value ?? 0),
                              })
                            }
                          />
                        </div>
                        <div className={styles.timeField}>
                          <span className={styles.timeLabel}>
                            {text("cut.materials.clipInfos.endTime")}
                          </span>
                          <InputNumber
                            size="small"
                            min={row.startTime}
                            step={0.1}
                            value={row.endTime}
                            onChange={(value) =>
                              handleClipChange(row._id, {
                                endTime: Number(value ?? row.startTime),
                              })
                            }
                          />
                        </div>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveClip(row._id)}
                        />
                      </div>
                      <Input.TextArea
                        rows={2}
                        className={styles.clipContent}
                        value={row.content}
                        placeholder={text(
                          "cut.materials.clipInfos.contentPlaceholder",
                        )}
                        onChange={(event) =>
                          handleClipChange(row._id, {
                            content: event.target.value,
                          })
                        }
                      />
                      <Input
                        className={styles.clipUsage}
                        value={row.usage ?? ""}
                        placeholder={text(
                          "cut.materials.clipInfos.usagePlaceholder",
                        )}
                        onChange={(event) =>
                          handleClipChange(row._id, {
                            usage: event.target.value,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default AssetDescriptionModal;
