import React, { useCallback, useState } from "react";
import { Empty, Spin } from "antd";
import { useI18n } from "hooks";
import type { AssetItem } from "fat-notes-sdk";
import AssetCard from "./components/AssetCard/AssetCard";
import AssetDescriptionModal from "./components/AssetDescriptionModal/AssetDescriptionModal";
import AssetPreviewModal from "./components/AssetPreviewModal/AssetPreviewModal";
import styles from "./AssetList.less";

interface AssetListProps {
  assets: AssetItem[];
  loading: boolean;
  onAdd: (item: AssetItem) => void;
  onAssetsRefresh: () => void;
}

const AssetList: React.FC<AssetListProps> = ({
  assets,
  loading,
  onAdd,
  onAssetsRefresh,
}) => {
  const { text } = useI18n();
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewingAsset, setPreviewingAsset] = useState<AssetItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleEdit = useCallback((item: AssetItem) => {
    setEditingAsset(item);
    setModalOpen(true);
  }, []);

  const handleModalCancel = useCallback(() => {
    setModalOpen(false);
    setEditingAsset(null);
  }, []);

  const handleModalSaved = useCallback(() => {
    onAssetsRefresh();
  }, [onAssetsRefresh]);

  const handlePreview = useCallback((item: AssetItem) => {
    setPreviewingAsset(item);
    setPreviewOpen(true);
  }, []);

  const handlePreviewCancel = useCallback(() => {
    setPreviewOpen(false);
    setPreviewingAsset(null);
  }, []);

  if (loading) {
    return (
      <div className={styles.state}>
        <Spin size="small" />
        <span className={styles.stateText}>
          {text("cut.materials.loading")}
        </span>
      </div>
    );
  }

  if (!assets.length) {
    return (
      <div className={styles.state}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={text("cut.materials.empty")}
        />
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {assets.map((item) => (
          <AssetCard
            key={item.guid}
            item={item}
            onAdd={onAdd}
            onEdit={handleEdit}
            onPreview={handlePreview}
          />
        ))}
      </div>
      <AssetDescriptionModal
        open={modalOpen}
        asset={editingAsset}
        onSaved={handleModalSaved}
        onCancel={handleModalCancel}
      />
      <AssetPreviewModal
        open={previewOpen}
        asset={previewingAsset}
        onCancel={handlePreviewCancel}
      />
    </>
  );
};

export default AssetList;
