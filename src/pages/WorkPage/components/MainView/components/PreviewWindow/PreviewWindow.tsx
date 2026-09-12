import React from "react";
import { PreviewVideo, PreviewControls } from "./components";
import styles from "./PreviewWindow.less";

const PreviewWindow = () => {
  return (
    <div className={styles.container}>
      <div className={styles.videoWrap}>
        <PreviewVideo />
      </div>
      <PreviewControls />
    </div>
  );
};

export default PreviewWindow;
