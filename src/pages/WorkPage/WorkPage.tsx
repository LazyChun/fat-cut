import React, { useCallback, useState } from "react";
import { InitSdk } from "components";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import type { AssetItem } from "fat-notes-sdk";
import styles from "./WorkPage.less";
import "../../styles/effects.less";
import {
  MainView,
  Bottom,
  ProjectToolbar,
  ProjectPreview,
  EmptyState,
} from "./components";
import { Splitter } from "antd";
import AiArrangementDrawer from "./components/MainView/components/FunctionArea/components/MaterialsPanel/components/AiArrangementDrawer/AiArrangementDrawer";
import { useProjectStore } from "reducers";

interface WorkPageProps {
  sdk: FatNotesPluginSDK;
}

// 工作页面
const _WorkPage = () => {
  const { projects, selectedProjectId, loadingStatus } = useProjectStore();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const showEditor = !!selectedProjectId;
  const showPreview =
    !showEditor && loadingStatus === "succeeded" && projects.length > 0;
  const showEmpty =
    !showEditor && loadingStatus === "succeeded" && projects.length === 0;
  const handleOpenAiDrawer = useCallback(() => {
    setAiDrawerOpen(true);
  }, []);

  const handleCloseAiDrawer = useCallback(() => {
    setAiDrawerOpen(false);
  }, []);

  return (
    <div className={styles.container}>
      <ProjectToolbar />
      {showEmpty ? (
        <div className={styles.emptyWrap}>
          <EmptyState />
        </div>
      ) : showPreview ? (
        <ProjectPreview />
      ) : (
        <div className={styles.workArea}>
          <Splitter vertical>
            <Splitter.Panel>
              <MainView assets={assets} onAssetsChange={setAssets} />
            </Splitter.Panel>
            <Splitter.Panel>
              <Bottom onOpenAiDrawer={handleOpenAiDrawer} />
            </Splitter.Panel>
          </Splitter>
          <AiArrangementDrawer
            open={aiDrawerOpen}
            onClose={handleCloseAiDrawer}
            assets={assets}
          />
        </div>
      )}
    </div>
  );
};

const WorkPage = ({ sdk }: WorkPageProps) => {
  return (
    <InitSdk sdk={sdk}>
      <_WorkPage />
    </InitSdk>
  );
};

export default WorkPage;
