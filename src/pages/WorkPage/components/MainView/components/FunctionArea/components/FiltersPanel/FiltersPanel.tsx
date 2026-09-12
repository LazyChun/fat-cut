import React, { useCallback, useMemo, useState } from "react";
import { Input, Tabs, Tooltip } from "antd";
import { useI18n, useSdk } from "hooks";
import { editorStore } from "reducers";
import { FILTER_CATEGORIES, setFilterPayload } from "utils";
import type { FilterDefinition } from "utils";
import styles from "./FiltersPanel.less";

const FiltersPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [keyword, setKeyword] = useState("");

  const handleApply = useCallback(
    (filter: FilterDefinition) => {
      const fid = editorStore.addFilterClip(filter.id);
      if (fid) {
        sdk.ui.toast.success(text("cut.filters.added"));
      }
    },
    [sdk, text],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, filter: FilterDefinition) => {
      setFilterPayload(e, { filterTypeId: filter.id });
    },
    [],
  );

  const tabItems = useMemo(
    () =>
      FILTER_CATEGORIES.map((category) => ({
        key: category.id,
        label: text(category.nameKey),
        children: (
          <div className={styles.grid}>
            {category.filters
              .filter((f) =>
                !keyword ||
                text(f.nameKey).toLowerCase().includes(keyword.toLowerCase()),
              )
              .map((f) => (
                <Tooltip
                  key={f.id}
                  title={text("cut.filters.dragHint")}
                  mouseEnterDelay={0.6}
                >
                  <div
                    className={styles.cell}
                    draggable
                    onDragStart={(e) => handleDragStart(e, f)}
                    onClick={() => handleApply(f)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.thumbnail} style={f.thumbnailStyle} />
                    <div className={styles.name}>{text(f.nameKey)}</div>
                  </div>
                </Tooltip>
              ))}
          </div>
        ),
      })),
    [keyword, text, handleApply, handleDragStart],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.hint}>{text("cut.filters.hint")}</div>
      <div className={styles.search}>
        <Input.Search
          size="small"
          allowClear
          placeholder={text("cut.filters.searchPlaceholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <Tabs
        className={styles.tabs}
        defaultActiveKey={FILTER_CATEGORIES[0].id}
        items={tabItems}
        size="small"
        tabPosition="left"
      />
    </div>
  );
};

export default FiltersPanel;
