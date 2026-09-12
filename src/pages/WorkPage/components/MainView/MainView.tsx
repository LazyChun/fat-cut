import React from "react";
import type { AssetItem } from "fat-notes-sdk";
import styles from "./MainView.less";
import { Splitter } from "antd";
import { PreviewWindow, OptionPanel, FunctionArea } from "./components";

interface MainViewProps {
  assets: AssetItem[];
  onAssetsChange: (assets: AssetItem[]) => void;
}

const MainView: React.FC<MainViewProps> = ({ assets, onAssetsChange }) => {
  return (
    <div className={styles.container}>
      <Splitter>
        <Splitter.Panel>
          <FunctionArea assets={assets} onAssetsChange={onAssetsChange} />
        </Splitter.Panel>
        <Splitter.Panel>
          <PreviewWindow />
        </Splitter.Panel>
        <Splitter.Panel>
          <OptionPanel />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default MainView;
