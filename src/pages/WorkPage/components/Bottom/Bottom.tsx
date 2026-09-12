import React from "react";
import styles from "./Bottom.less";
import { TimelinePanel } from "./components";

interface BottomProps {
  onOpenAiDrawer: () => void;
}

const Bottom: React.FC<BottomProps> = ({ onOpenAiDrawer }) => {
  return (
    <div className={styles.container}>
      <TimelinePanel onOpenAiDrawer={onOpenAiDrawer} />
    </div>
  );
};

export default Bottom;
