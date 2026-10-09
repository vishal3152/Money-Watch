import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveAppLayout,
  resolveChildProcessEnv,
  resolveNodeBinary
} from "./app-paths.cjs";

describe("resolveAppLayout", () => {
  it("points unpackaged builds at the repo root and next CLI", () => {
    const layout = resolveAppLayout({
      isPackaged: false,
      isDev: false,
      electronDir: "/app/electron",
      resourcesPath: "/unused",
      platform: "darwin"
    });

    expect(layout.projectRoot).toBe(path.join("/app"));
    expect(layout.nextCwd).toBe(path.join("/app"));
    expect(layout.nextEntryArgs).toEqual([
      path.join("/app", "node_modules", "next", "dist", "bin", "next"),
      "start"
    ]);
    expect(layout.prepareScript).toBe(path.join("/app", "scripts", "prepare-database.ts"));
    expect(layout.prepareUsesTsx).toBe(true);
    expect(layout.passHostPortFlags).toBe(true);
    expect(layout.migrationsFolder).toBe(path.join("/app", "drizzle"));
    expect(layout.useElectronAsNode).toBe(false);
  });

  it("uses next dev when unpackaged and ELECTRON_DEV is on", () => {
    const layout = resolveAppLayout({
      isPackaged: false,
      isDev: true,
      electronDir: "/app/electron",
      resourcesPath: "/unused",
      platform: "darwin"
    });

    expect(layout.nextEntryArgs[1]).toBe("dev");
  });

  it("points packaged builds at extraResources next + bundled prepare script", () => {
    const layout = resolveAppLayout({
      isPackaged: true,
      isDev: false,
      electronDir: "/Applications/Paisa-Watch.app/Contents/Resources/app.asar/electron",
      resourcesPath: "/Applications/Paisa-Watch.app/Contents/Resources",
      platform: "darwin"
    });

    expect(layout.projectRoot).toBe(
      path.join("/Applications/Paisa-Watch.app/Contents/Resources", "next")
    );
    expect(layout.nextEntryArgs).toEqual([
      path.join("/Applications/Paisa-Watch.app/Contents/Resources", "next", "server.js")
    ]);
    expect(layout.prepareScript).toBe(
      path.join(
        "/Applications/Paisa-Watch.app/Contents/Resources",
        "next",
        "scripts",
        "prepare-database.cjs"
      )
    );
    expect(layout.prepareUsesTsx).toBe(false);
    expect(layout.passHostPortFlags).toBe(false);
    expect(layout.migrationsFolder).toBe(
      path.join("/Applications/Paisa-Watch.app/Contents/Resources", "drizzle")
    );
    expect(layout.useElectronAsNode).toBe(true);
    expect(layout.nodeBinaryRelativeToResources).toBeNull();
  });
});

describe("resolveNodeBinary", () => {
  it("uses env or PATH node when unpackaged", () => {
    expect(
      resolveNodeBinary({
        isPackaged: false,
        resourcesPath: "/unused",
        layout: resolveAppLayout({
          isPackaged: false,
          isDev: false,
          electronDir: "/app/electron",
          resourcesPath: "/unused",
          platform: "darwin"
        }),
        envNodeBinary: "/usr/local/bin/node",
        electronExecPath: "/unused/Electron"
      })
    ).toBe("/usr/local/bin/node");
  });

  it("uses the Electron executable as Node when packaged", () => {
    const resourcesPath = "/Applications/Paisa-Watch.app/Contents/Resources";
    const layout = resolveAppLayout({
      isPackaged: true,
      isDev: false,
      electronDir: "/unused",
      resourcesPath,
      platform: "darwin"
    });
    const electronExecPath =
      "/Applications/Paisa-Watch.app/Contents/MacOS/Paisa-Watch";

    expect(
      resolveNodeBinary({
        isPackaged: true,
        resourcesPath,
        layout,
        envNodeBinary: undefined,
        electronExecPath
      })
    ).toBe(electronExecPath);
  });
});

describe("resolveChildProcessEnv", () => {
  it("sets ELECTRON_RUN_AS_NODE for packaged Electron-as-Node children", () => {
    expect(
      resolveChildProcessEnv(
        { PATH: "/usr/bin", DEPLOYMENT_MODE: "local" },
        { useElectronAsNode: true }
      )
    ).toEqual({
      PATH: "/usr/bin",
      DEPLOYMENT_MODE: "local",
      ELECTRON_RUN_AS_NODE: "1"
    });
  });

  it("strips inherited ELECTRON_RUN_AS_NODE for system Node children", () => {
    expect(
      resolveChildProcessEnv(
        { PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1" },
        { useElectronAsNode: false }
      )
    ).toEqual({ PATH: "/usr/bin" });
  });
});
