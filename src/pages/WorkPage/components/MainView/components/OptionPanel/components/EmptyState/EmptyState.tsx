import React from "react";
import { useI18n } from "hooks";
import styles from "./EmptyState.less";

const EmptyState: React.FC = () => {
  const { text } = useI18n();
  return (
    <div className={styles.container}>
      <div className={styles.title}>{text("cut.option.empty")}</div>
      <div className={styles.hint}>{text("cut.option.emptyHint")}</div>
    </div>
  );
};

export default EmptyState;
