import { app, BrowserWindow, ipcMain, ipcRenderer } from "electron";

import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

import { Settings, Service, ServiceStatus } from "../common/types";

class LengthLimitedArray extends Array {
  maxLength: number;
  constructor(maxLength: number) {
    super();

    this.maxLength = maxLength;
  }
  push(...args: any[]) {
    if (this.length >= this.maxLength) this.shift();

    return super.push(...args);
  }
}

const HTML_TEMPLATE = readFileSync(
  path.resolve(__dirname, "../../data/template.html"),
  "utf8"
);
const FA = readFileSync(
  path.resolve(__dirname, "../front/public/libs/font-awesome/css/all.min.css"),
  "utf8"
);
const STYLE = readFileSync(
  path.resolve(__dirname, "../front/public/styles/style.css"),
  "utf8"
);
const REACT = readFileSync(
  path.resolve(__dirname, "../front/public/libs/react/react.production.min.js"),
  "utf8"
);
const REACTDOM = readFileSync(
  path.resolve(
    __dirname,
    "../front/public/libs/react-dom/react-dom.production.min.js"
  ),
  "utf8"
);
const PACKAGE = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
);
const SETTINGS: Settings = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../data/settings.json"), "utf8")
);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.resolve(__dirname, "preload.js"),
    },
  });
  const processes: ChildProcess[] = [];

  class ChildProcess {
    process?: ChildProcessWithoutNullStreams;
    index: number;
    logs = new LengthLimitedArray(20);
    status: ServiceStatus = ServiceStatus.STOPPED;
    constructor(index: number) {
      this.index = index;
    }
    spawn() {
      const cwd = path.resolve(
        __dirname,
        "../../services",
        SETTINGS.services[this.index].name
      );
      win.webContents.send("service-started", this.index);
      this.status = ServiceStatus.RUNNING;
      this.process = spawn(
        `${path.resolve(
          SETTINGS.nvm,
          `v${SETTINGS.services[this.index].nodeVersion}`,
          "node"
        )}`,
        [path.resolve(cwd, SETTINGS.services[this.index].main)],
        {
          cwd,
        }
      );
      this.process.stdout.on("data", (msg) => {
        const lines = msg.toString().split(/(\r?\n)/g);
        for (let i of lines) if (i) this.logs.push(i);
      });
      this.process.stderr.on("data", (msg) => {
        const lines = msg.toString().split(/(\r?\n)/g);
        for (let i of lines) if (i) this.logs.push(i);
      });
      this.process.on("close", () => {
        win.webContents.send("service-stopped", this.index);
        this.status = ServiceStatus.STOPPED;
      });
    }
    kill(sig: any) {
      if (this.process) this.process.kill(sig || "SIGINT");
    }
  }

  const $: any = {};
  //const REACT_SUFFIX = "production.min";
  const CLIENT_SETTINGS = {};
  let SCRIPT = readFileSync(
    path.resolve(__dirname, "../front/public/pages/Index.js"),
    "utf8"
  );
  let PAGESTYLE = readFileSync(
    path.resolve(__dirname, "../front/public/styles/Index.css"),
    "utf8"
  );
  for (const service in SETTINGS.services) {
    const pkg = JSON.parse(
      readFileSync(
        path.resolve(
          __dirname,
          "../../services",
          SETTINGS.services[service].name,
          "package.json"
        ),
        "utf8"
      )
    );
    SETTINGS.services[service].version = pkg.version;
    SETTINGS.services[service].status = ServiceStatus.STOPPED;
    processes.push(new ChildProcess(Number(service)));
  }
  $.title = "Integrated Services Manager";
  $.version = PACKAGE["version"];
  $.services = SETTINGS.services;
  let HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
    String(eval(p2))
  );
  writeFileSync(path.resolve(__dirname, "index.html"), HTML, "utf8");
  win.loadFile(path.resolve(__dirname, "index.html"));

  ipcMain.on("page-move", (event, res) => {
    SCRIPT = readFileSync(
      path.resolve(__dirname, `../front/public/pages/${res}.js`),
      "utf8"
    );
    PAGESTYLE = readFileSync(
      path.resolve(__dirname, `../front/public/styles/${res}.css`),
      "utf8"
    );
    HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
      String(eval(p2))
    );
    writeFileSync(path.resolve(__dirname, "index.html"), HTML, "utf8");
    win.loadFile(path.resolve(__dirname, "index.html"));
  });
  ipcMain.on("service-toggle", (event, res) => {
    const process = processes[res];
    if (process.status === ServiceStatus.RUNNING) process.kill(0);
    else process.spawn();
  });
}
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
