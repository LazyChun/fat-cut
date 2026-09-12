import React from "react";
import { Button } from "antd";
import { Icon } from "components";
import { useI18n } from "hooks";
import { projectStore } from "reducers";
import styles from "./EmptyState.less";

const EmptyState = () => {
  const { text } = useI18n();
  return (
    <div className={styles.heroCard}>
      <div className={styles.heroIcon}>
        <Icon name="scissors" size={30} />
      </div>
      <span className={styles.heroBadge}>{text("cut.title")}</span>
      <div className={styles.heroTitle}>{text("cut.empty.heroTitle")}</div>
      <div className={styles.heroDescription}>
        {text("cut.empty.heroSubtitle")}
      </div>
      <Button
        type="primary"
        size="large"
        icon={<Icon name="plus" size={16} />}
        className={styles.heroButton}
        onClick={() => {
          projectStore.setEditingProject(undefined);
          projectStore.setEditModalOpen(true);
        }}
      >
        {text("cut.toolbar.new")}
      </Button>
      <div className={styles.heroFeatures}>
        <div className={styles.heroFeature}>
          <span className={styles.heroFeatureIcon}>
            <Icon name="video" size={16} />
          </span>
          <span>{text("cut.empty.feature.materials")}</span>
        </div>
        <div className={styles.heroFeature}>
          <span className={styles.heroFeatureIcon}>
            <Icon name="scissors" size={16} />
          </span>
          <span>{text("cut.empty.feature.timeline")}</span>
        </div>
        <div className={styles.heroFeature}>
          <span className={styles.heroFeatureIcon}>
            <Icon name="play" size={16} />
          </span>
          <span>{text("cut.empty.feature.preview")}</span>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
