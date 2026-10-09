import path from "node:path";
import type { NextConfig } from "next";

import {
  cloudSqliteTranspilePackages,
  shouldStubBetterSqlite3
} from "./src/db/cloud-sqlite-webpack";

const electronPackage = process.env.ELECTRON_PACKAGE === "1";
/** Vercel sets VERCEL=1; local cloud builds set DEPLOYMENT_MODE=cloud. */
const cloudBuildWithoutSqlite =
  !electronPackage &&
  (process.env.VERCEL === "1" || process.env.DEPLOYMENT_MODE === "cloud");

const sqliteCloudStub = path.join(__dirname, "src/db/better-sqlite3-cloud-stub.ts");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Opt better-sqlite3 out of Next's default serverExternalPackages list so
  // resolve.alias can replace it with the cloud stub (native addon is NFT-excluded).
  transpilePackages: cloudSqliteTranspilePackages(cloudBuildWithoutSqlite),
  // Electron packages need a self-contained server tree under extraResources.
  // Packaged Next runs under Electron-as-Node; skip sharp (Node ABI) image opts.
  ...(electronPackage
    ? {
        output: "standalone" as const,
        images: { unoptimized: true },
        // images.unoptimized skips the optimizer route entirely, and the
        // desktop server never runs `next build`/type-checking — keep those
        // build-only deps out of the packaged tree (~24MB unpacked).
        outputFileTracingExcludes: {
          "*": [
            "**/node_modules/typescript/**",
            "**/node_modules/sharp/**",
            "**/node_modules/@img/**"
          ]
        }
      }
    : {
        // Cloud/Vercel never uses SQLite or Electron — keep them out of serverless traces.
        outputFileTracingExcludes: {
          "*": [
            "**/node_modules/better-sqlite3/**",
            "**/node_modules/electron/**",
            "**/node_modules/electron-builder/**",
            "**/node_modules/@electron/**",
            "**/node_modules/electron-publish/**",
            "**/node_modules/app-builder-bin/**",
            "**/node_modules/app-builder-lib/**",
            "**/*.db",
            "**/*.db-journal"
          ]
        }
      }),
  webpack: (config, { isServer, nextRuntime }) => {
    if (
      !shouldStubBetterSqlite3({
        cloudBuildWithoutSqlite,
        isServer,
        nextRuntime
      })
    ) {
      return config;
    }

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "better-sqlite3$": sqliteCloudStub,
      "better-sqlite3": sqliteCloudStub
    };

    return config;
  }
};

export default nextConfig;
