import React from "react";
import { Input, Select, Space, Tooltip } from "antd";
import { useI18n } from "hooks";
import type { AssetCategory } from "fat-notes-sdk";
import type { FileTypeFilter } from "../../MaterialsPanel";
import styles from "./CategoryFilter.less";

interface CategoryFilterProps {
  categories: AssetCategory[];
  selectedCategoryId?: string;
  keyword: string;
  fileType: FileTypeFilter;
  onChange: (
    categoryId: string | undefined,
    keyword: string,
    fileType: FileTypeFilter,
  ) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategoryId,
  keyword,
  fileType,
  onChange,
}) => {
  const { text } = useI18n();

  const categoryOptions = [
    {
      label: text("cut.materials.allCategories"),
      value: "",
    },
    ...categories.map((c) => ({ label: c.name, value: c.id })),
  ];

  const fileTypeOptions = [
    {
      label: text("cut.materials.video"),
      value: "video",
    },
    {
      label: text("cut.materials.image"),
      value: "image",
    },
    {
      label: text("cut.materials.audio"),
      value: "audio",
    },
  ];

  return (
    <div className={styles.filter}>
      <div className={styles.row}>
        <Space.Compact style={{ flex: 1 }}>
          <Select
            className={styles.category}
            value={selectedCategoryId ?? ""}
            onChange={(value) =>
              onChange(value || undefined, keyword, fileType)
            }
            options={categoryOptions}
            size="small"
            showSearch
            optionFilterProp="label"
          />
          <Select
            className={styles.fileType}
            value={fileType}
            onChange={(value) => onChange(selectedCategoryId, keyword, value)}
            options={fileTypeOptions}
            size="small"
            mode="multiple"
            maxTagCount={"responsive"}
            maxTagPlaceholder={
              <Tooltip
                title={fileType
                  .map((v) => fileTypeOptions.find((o) => o.value === v)?.label)
                  .join(", ")}
              >
                {fileType.length}...
              </Tooltip>
            }
            allowClear
            placeholder={text("cut.materials.allTypes")}
          />
        </Space.Compact>
      </div>
      <Input.Search
        className={styles.search}
        size="small"
        allowClear
        placeholder={text("cut.materials.searchPlaceholder")}
        value={keyword}
        onChange={(e) => onChange(selectedCategoryId, e.target.value, fileType)}
        onSearch={(value) => onChange(selectedCategoryId, value, fileType)}
      />
    </div>
  );
};

export default CategoryFilter;
