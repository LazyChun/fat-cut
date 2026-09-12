import React from "react";
import { useI18n } from "hooks";
import styles from "./PlaceholderPanel.less";

interface PlaceholderPanelProps {
  textKey?: string;
}

const PlaceholderPanel: React.FC<PlaceholderPanelProps> = ({
  textKey = "cut.placeholder.comingSoon",
}) => {
  const { text } = useI18n();
  return <div className={styles.panel}>{text(textKey)}</div>;
};

export default PlaceholderPanel;