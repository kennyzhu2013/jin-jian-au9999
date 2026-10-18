import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const manifest = {
  name: "金鉴 · Au9999 纸黄金参谋",
  short_name: "金鉴",
  description: "个人 Au99.99 / 纸黄金行情、状态切换与买卖参考。信号仅供复盘，不连接交易。",
  start_url: "/",
  scope: "/",
  display: "standalone" as const,
  orientation: "portrait" as const,
  background_color: "#0e0c0a",
  theme_color: "#0e0c0a",
  lang: "zh-CN",
  categories: ["finance"],
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png",
        "icons/apple-touch-icon.png",
        "sample-feed.json",
      ],
      manifest,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".json"),
            handler: "NetworkFirst",
            options: {
              cacheName: "jinjian-quotes",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 43124,
    strictPort: true,
  },
});
