import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Progress, Select, Tooltip } from "antd";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import { useEditorStore } from "reducers";
import { getTimelineEnd } from "utils";
import styles from "./ExportModal.less";

type ExportPhase = "form" | "exporting" | "completed" | "failed";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: Cut.ExportFormat; labelKey: string }[] = [
  { value: "mp4", labelKey: "cut.export.formatMp4" },
  { value: "mov", labelKey: "cut.export.formatMov" },
  { value: "webm", labelKey: "cut.export.formatWebm" },
];

const replaceExtension = (path: string, format: Cut.ExportFormat): string => {
  const ext = format === "mp4" ? "mp4" : format === "mov" ? "mov" : "webm";
  // 替换已有扩展名,若无则追加
  const lastDot = path.lastIndexOf(".");
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastDot > lastSep) {
    return path.slice(0, lastDot + 1) + ext;
  }
  return path + "." + ext;
};

const ExportModal: React.FC<ExportModalProps> = ({ open, onClose }) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { project, dirty, canvasSize } = useEditorStore();

  const [phase, setPhase] = useState<ExportPhase>("form");
  const [outputPath, setOutputPath] = useState("");
  const [format, setFormat] = useState<Cut.ExportFormat>("mp4");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [exportId, setExportId] = useState<string>("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exportIdRef = useRef<string>("");

  // 打开时获取默认输出路径
  useEffect(() => {
    if (!open || !project) return;
    setPhase("form");
    setProgress(0);
    setErrorMessage("");
    setExportId("");
    exportIdRef.current = "";
    void (async () => {
      try {
        const result = await sdk.backend.invoke<Cut.DefaultExportPathResult>(
          "getDefaultExportPath",
          { projectName: project.name },
        );
        setOutputPath(result?.outputPath ?? "");
      } catch {
        // 获取默认路径失败时给一个空值,用户可手动输入
        setOutputPath("");
      }
    })();
  }, [open, project, sdk]);

  // 清理轮询
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // 轮询进度
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const result = await sdk.backend.invoke<Cut.ExportProgress>(
            "getExportProgress",
            { exportId: id },
          );
          setProgress(result.progress ?? 0);
          if (result.status === "completed") {
            stopPolling();
            setPhase("completed");
          } else if (result.status === "failed") {
            stopPolling();
            setPhase("failed");
            setErrorMessage(result.message ?? "Unknown error");
          }
        } catch {
          // 轮询失败时静默,等下一轮
        }
      }, 500);
    },
    [sdk, stopPolling],
  );

  const timelineEmpty = project ? getTimelineEnd(project.tracks) <= 0 : true;

  const handleStartExport = useCallback(async () => {
    if (!project || !outputPath) return;
    setPhase("exporting");
    setProgress(0);
    setErrorMessage("");
    try {
      const finalPath = replaceExtension(outputPath, format);
      const result = await sdk.backend.invoke<Cut.ExportResult>(
        "exportProject",
        { project, outputPath: finalPath, canvasSize },
      );
      if (result?.exportId) {
        setExportId(result.exportId);
        exportIdRef.current = result.exportId;
        setOutputPath(result.outputPath);
        startPolling(result.exportId);
      } else {
        throw new Error("No exportId returned");
      }
    } catch (error) {
      setPhase("failed");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [project, outputPath, format, startPolling, sdk, canvasSize]);

  const handleRetry = useCallback(() => {
    setPhase("form");
    setProgress(0);
    setErrorMessage("");
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      await sdk.backend.invoke("openFolder", { path: outputPath });
    } catch {
      // 静默
    }
  }, [sdk, outputPath]);

  const handleSelectFolder = useCallback(async () => {
    if (!project) return;
    const ext = format === "mp4" ? "mp4" : format === "mov" ? "mov" : "webm";
    const safeName = (project.name ?? "export").replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `${safeName}.${ext}`;
    try {
      const result = await sdk.backend.invoke<{
        folder: string;
        outputPath: string;
      }>("selectFolder", { initialDir: outputPath, fileName });
      if (result?.outputPath) {
        setOutputPath(result.outputPath);
      }
    } catch {
      // 静默
    }
  }, [sdk, outputPath, format, project]);

  const handleClose = useCallback(() => {
    // 导出中不允许直接关闭
    if (phase === "exporting") return;
    // 清理导出任务记录
    if (exportIdRef.current) {
      void sdk.backend.invoke("clearExportJob", {
        exportId: exportIdRef.current,
      });
      exportIdRef.current = "";
    }
    stopPolling();
    onClose();
  }, [phase, sdk, stopPolling, onClose]);

  const handleFormatChange = useCallback(
    (next: Cut.ExportFormat) => {
      setFormat(next);
      if (outputPath) {
        setOutputPath(replaceExtension(outputPath, next));
      }
    },
    [outputPath],
  );

  const width = project?.width ?? 1920;
  const height = project?.height ?? 1080;
  const fps = project?.fps ?? 30;
  const duration = project ? getTimelineEnd(project.tracks) : 0;

  const footer = (() => {
    if (phase === "exporting") {
      return null;
    }
    if (phase === "completed") {
      return (
        <div className={styles.footer}>
          <Button onClick={handleClose}>{text("cut.export.close")}</Button>
          <Button
            type="primary"
            icon={<Icon name="folderOpen" size={14} />}
            onClick={handleOpenFolder}
          >
            {text("cut.export.openFolder")}
          </Button>
        </div>
      );
    }
    if (phase === "failed") {
      return (
        <div className={styles.footer}>
          <Button onClick={handleClose}>{text("cut.export.close")}</Button>
          <Button type="primary" onClick={handleRetry}>
            {text("cut.export.retry")}
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.footer}>
        <Button onClick={handleClose}>
          {text("cut.project.modal.cancel")}
        </Button>
        <Button
          type="primary"
          icon={<Icon name="export" size={14} />}
          disabled={timelineEmpty || !outputPath}
          onClick={() => void handleStartExport()}
        >
          {text("cut.export.start")}
        </Button>
      </div>
    );
  })();

  return (
    <Modal
      destroyOnHidden={true}
      open={open}
      title={text("cut.export.title")}
      footer={footer}
      maskClosable={phase !== "exporting"}
      closable={phase !== "exporting"}
      onCancel={handleClose}
      width={560}
    >
      {phase === "form" && (
        <div className={styles.form}>
          {dirty && (
            <div className={styles.warnHint}>
              {text("cut.export.unsavedHint")}
            </div>
          )}
          {timelineEmpty && (
            <div className={styles.errorHint}>{text("cut.export.noClips")}</div>
          )}
          <div className={styles.field}>
            <label className={styles.label}>
              {text("cut.export.outputPath")}
            </label>
            <div className={styles.pathRow}>
              <Input
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder={text("cut.export.outputPathPlaceholder")}
                className={styles.pathInput}
              />
              <Tooltip title={text("cut.export.selectFolder")}>
                <Button
                  icon={<Icon name="folderOpen" size={14} />}
                  onClick={() => void handleSelectFolder()}
                />
              </Tooltip>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>
                {text("cut.export.format")}
              </label>
              <Select
                value={format}
                onChange={handleFormatChange}
                className={styles.select}
                options={FORMAT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: text(o.labelKey),
                }))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                {text("cut.export.resolution")}
              </label>
              <div className={styles.resolution}>
                {width} × {height} @ {fps}fps
              </div>
            </div>
          </div>
          {duration > 0 && (
            <div className={styles.durationInfo}>
              {text("cut.option.duration")}: {duration.toFixed(1)}{" "}
              {text("cut.common.seconds")}
            </div>
          )}
        </div>
      )}

      {phase === "exporting" && (
        <div className={styles.exporting}>
          <div className={styles.exportingHint}>
            {text("cut.export.exportingHint")}
          </div>
          <Progress percent={progress} status="active" />
          <div className={styles.pathDisplay}>{outputPath}</div>
        </div>
      )}

      {phase === "completed" && (
        <div className={styles.completed}>
          <div className={styles.successIcon}>
            <Icon name="save" size={32} />
          </div>
          <div className={styles.successTitle}>
            {text("cut.export.success")}
          </div>
          <div className={styles.successHint}>
            {text("cut.export.successHint")}
          </div>
          <div className={styles.pathDisplay}>{outputPath}</div>
        </div>
      )}

      {phase === "failed" && (
        <div className={styles.failed}>
          <div className={styles.errorTitle}>{text("cut.export.failed")}</div>
          <pre className={styles.errorDetail}>{errorMessage}</pre>
        </div>
      )}
    </Modal>
  );
};

export default ExportModal;
