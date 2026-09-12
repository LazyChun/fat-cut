import React, { useCallback, useEffect, useState } from "react";
import { useI18n, useSdk } from "hooks";
import { editorStore, playbackStore } from "reducers";
import { getTimelineEnd } from "utils";
import type { AssetCategory, AssetItem } from "fat-notes-sdk";
import CategoryFilter from "./components/CategoryFilter/CategoryFilter";
import AssetList from "./components/AssetList/AssetList";
import styles from "./MaterialsPanel.less";

export type FileTypeFilter = ("image" | "video" | "audio")[];

interface MaterialsPanelProps {
  assets: AssetItem[];
  onAssetsChange: (assets: AssetItem[]) => void;
}

const MaterialsPanel: React.FC<MaterialsPanelProps> = ({
  assets,
  onAssetsChange,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    string | undefined
  >(undefined);
  const [keyword, setKeyword] = useState("");
  const [fileType, setFileType] = useState<FileTypeFilter>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void sdk.asset
      .listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [sdk]);

  const getFileTypePrefixes = (types: FileTypeFilter): string[] | undefined => {
    if (types.length === 0) {
      return undefined;
    }
    const prefixes: string[] = [];
    if (types.includes("image")) {
      prefixes.push("image/");
    }
    if (types.includes("video")) {
      prefixes.push("video/");
    }
    if (types.includes("audio")) {
      prefixes.push("audio/");
    }
    return prefixes;
  };

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sdk.asset.list({
        file_type: getFileTypePrefixes(fileType),
        category_id: selectedCategoryId,
        keyword: keyword || undefined,
        page: 1,
        page_size: 50,
      });
      onAssetsChange(result?.list || []);
    } catch {
      onAssetsChange([]);
    } finally {
      setLoading(false);
    }
  }, [fileType, keyword, onAssetsChange, sdk, selectedCategoryId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const handleFilterChange = useCallback(
    (categoryId: string | undefined, kw: string, ft: FileTypeFilter) => {
      setSelectedCategoryId(categoryId);
      setKeyword(kw);
      setFileType(ft);
    },
    [],
  );

  const getClipType = (fileType: string): Cut.ClipType => {
    if (fileType.startsWith("image/")) {
      return "image";
    }
    if (fileType.startsWith("audio/")) {
      return "audio";
    }
    return "video";
  };

  const handleAdd = useCallback(
    async (item: AssetItem) => {
      try {
        const clipType = getClipType(item.file_type);
        let probed: Cut.ProbeAssetResult | undefined;
        try {
          probed = await sdk.backend.invoke<Cut.ProbeAssetResult>(
            "probeAsset",
            {
              filePath: item.file_path,
            },
          );
        } catch (error) {
          if (clipType !== "image") {
            throw error;
          }
        }
        const duration =
          clipType === "image"
            ? (probed?.duration ?? 0) > 0
              ? probed!.duration
              : 5
            : probed?.duration || 5;
        const assetRef: Cut.AssetRef = {
          guid: item.guid,
          filePath: item.file_path,
          fileName: item.file_name,
          fileType: item.file_type,
          duration,
          width: probed?.width || undefined,
          height: probed?.height || undefined,
        };
        const clipId = editorStore.addClip({ type: clipType, assetRef });
        if (clipId) {
          const project = editorStore.getState().project;
          if (project) {
            playbackStore.setDuration(getTimelineEnd(project.tracks));
          }
          sdk.ui.toast.success(text("cut.materials.add"));
        } else {
          sdk.ui.toast.warn(text("cut.timeline.empty"));
        }
      } catch (error) {
        sdk.ui.toast.error(
          text("cut.materials.loadFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [sdk, text],
  );

  return (
    <div className={styles.panel}>
      <CategoryFilter
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        keyword={keyword}
        fileType={fileType}
        onChange={handleFilterChange}
      />
      <AssetList
        assets={assets}
        loading={loading}
        onAdd={handleAdd}
        onAssetsRefresh={() => void loadAssets()}
      />
    </div>
  );
};

export default MaterialsPanel;
