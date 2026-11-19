/**
 * The subset of the Chrome DevTools Protocol this project uses, typed so
 * every `send()` call checks its params and result.
 * Reference: https://chromedevtools.github.io/devtools-protocol/
 */
export type ResourceType = "Document" | "Stylesheet" | "Image" | "Media" | "Font" | "Script" | "XHR" | "Fetch" | "Other" | string;

export interface TargetInfo {
  targetId: string;
  type: "page" | "browser" | "iframe" | "worker" | string;
  url: string;
}

export interface RemoteObject {
  type: string;
  value?: unknown;
}

export interface ExceptionDetails {
  text: string;
  exception?: { description?: string };
}

export interface UserAgentBrandVersion {
  brand: string;
  version: string;
}

export interface CdpCommands {
  "Browser.getVersion": { params: Record<string, never>; result: { product: string; userAgent: string } };
  "Target.getTargets": { params: Record<string, never>; result: { targetInfos: TargetInfo[] } };
  "Target.createTarget": { params: { url: string }; result: { targetId: string } };
  "Target.attachToTarget": { params: { targetId: string; flatten: true }; result: { sessionId: string } };
  "Page.navigate": { params: { url: string }; result: { frameId: string; errorText?: string } };
  "Runtime.evaluate": {
    params: { expression: string; awaitPromise: boolean; returnByValue: boolean };
    result: { result: RemoteObject; exceptionDetails?: ExceptionDetails };
  };
  "Emulation.setUserAgentOverride": {
    params: {
      userAgent: string;
      acceptLanguage: string;
      platform: string;
      userAgentMetadata: {
        brands: UserAgentBrandVersion[];
        fullVersionList: UserAgentBrandVersion[];
        fullVersion: string;
        platform: string;
        platformVersion: string;
        architecture: string;
        model: string;
        mobile: boolean;
      };
    };
    result: Record<string, never>;
  };
  "Fetch.enable": { params: { handleAuthRequests: boolean; patterns: { urlPattern: string }[] }; result: Record<string, never> };
  "Fetch.continueRequest": { params: { requestId: string }; result: Record<string, never> };
  "Fetch.failRequest": { params: { requestId: string; errorReason: "BlockedByClient" }; result: Record<string, never> };
  "Fetch.continueWithAuth": {
    params: {
      requestId: string;
      authChallengeResponse:
        | { response: "ProvideCredentials"; username: string; password: string }
        | { response: "CancelAuth" | "Default" };
    };
    result: Record<string, never>;
  };
}

export interface CdpEvents {
  "Fetch.requestPaused": { requestId: string; resourceType: ResourceType; request: { url: string } };
  "Fetch.authRequired": { requestId: string; authChallenge: { source?: "Server" | "Proxy"; origin: string } };
}

export type CdpMethod = keyof CdpCommands;
export type CdpEvent = keyof CdpEvents;
