import { useContext } from "react";
import { SdkContext } from "contexts";
import type { FatNotesPluginSDK } from "fat-notes-sdk";

export const useSdk = (): FatNotesPluginSDK => {
  const { sdk } = useContext(SdkContext);
  if (!sdk) {
    throw new Error("SDK is not available. Ensure InitSdk wraps this component.");
  }
  return sdk;
};
