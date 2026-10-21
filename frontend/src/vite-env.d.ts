/// <reference types="vite/client" />

/** 构建期注入的全局变量（vite.config.ts 的 define） */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** 后端 API 基地址（构建期兜底值；部署后可用 public/config.js 覆盖） */
  readonly VITE_API_BASE_URL: string;
  /** 应用标题（构建期兜底值） */
  readonly VITE_APP_TITLE: string;
  /** 前端路由基路径（部署到子目录时使用，如 /mes/） */
  readonly VITE_BASE_PATH: string;
  /** 开发期 Vite 代理目标（默认 http://127.0.0.1:3000） */
  readonly VITE_DEV_PROXY_TARGET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
