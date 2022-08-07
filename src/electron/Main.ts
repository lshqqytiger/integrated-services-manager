import { app, BrowserWindow, ipcMain } from "electron";

import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

import {
  Settings,
  ServiceStatus,
  LengthLimitedArray,
  Props,
} from "../common/Utility";

const HTML_TEMPLATE = readFileSync(
  path.resolve(__dirname, "../../data/template.html"),
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
  const detachedWindows: BrowserWindow[] = Array(SETTINGS.services.length);

  class ChildProcess {
    process?: ChildProcessWithoutNullStreams;
    index: number;
    status: ServiceStatus = ServiceStatus.STOPPED;
    logs: LengthLimitedArray<string> = new LengthLimitedArray(100);
    isOpened: boolean = false;
    constructor(index: number) {
      this.index = index;
    }
    spawn(...argv: string[]) {
      const cwd = path.resolve(
        __dirname,
        "../../services",
        SETTINGS.services[this.index].name
      );
      win.webContents.send("service-started", this.index);
      this.status = $.services![this.index].status = ServiceStatus.RUNNING;
      this.process = spawn(
        `${path.resolve(
          SETTINGS.nvm,
          `v${SETTINGS.services[this.index].nodeVersion}`,
          "node"
        )}`,
        [path.resolve(cwd, SETTINGS.services[this.index].main), ...argv],
        {
          cwd,
        }
      );
      this.process.stdout.on("data", (msg) => {
        const lines = msg.toString().split(/(\r?\n)/g);
        for (let line of lines)
          if (line) {
            this.logs.push(line);
            if (this.isOpened)
              win.webContents.send("service-log", {
                index: this.index,
                data: line,
              });
          }
      });
      this.process.stderr.on("data", (msg) => {
        const lines = msg.toString().split(/(\r?\n)/g);
        for (let line of lines)
          if (line) {
            this.logs.push(line);
            if (this.isOpened)
              win.webContents.send("service-log", {
                index: this.index,
                data: line,
              });
          }
      });
      this.process.on("close", () => {
        win.webContents.send("service-stopped", this.index);
        this.status = $.services![this.index].status = ServiceStatus.STOPPED;
      });
    }
    kill(sig: any) {
      if (this.process) this.process.kill(sig || "SIGINT");
    }
  }

  const $: Partial<Props> = {};
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
    if (!SETTINGS.services[service].main)
      SETTINGS.services[service].main = pkg.main;
    processes.push(new ChildProcess(Number(service)));
  }
  $.title = "Integrated Services Manager";
  $.version = PACKAGE["version"];
  $.services = SETTINGS.services;
  $.detachedWindows = [];
  let HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
    String(eval(p2))
  );
  writeFileSync(path.resolve(__dirname, "Index.html"), HTML, "utf8");
  win.loadFile(path.resolve(__dirname, "Index.html"));

  ipcMain.on("page-move", (event, res) => {
    if (detachedWindows[res.props.index])
      return detachedWindows[res.props.index].close();
    SCRIPT = readFileSync(
      path.resolve(__dirname, `../front/public/pages/${res.pageName}.js`),
      "utf8"
    );
    PAGESTYLE = readFileSync(
      path.resolve(__dirname, `../front/public/styles/${res.pageName}.css`),
      "utf8"
    );
    Object.assign($, res.props);
    if ($.preIndex) processes[$.preIndex].isOpened = false;
    if (res.pageName === "ServiceLog") {
      $.logs = processes[res.props.index].logs;
      $.preIndex = res.props.index;
      processes[res.props.index].isOpened = true;
    }
    $.pageName = res.pageName;
    HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
      String(eval(p2))
    );
    writeFileSync(
      path.resolve(__dirname, `${res.pageName}.html`),
      HTML,
      "utf8"
    );
    win.loadFile(path.resolve(__dirname, `${res.pageName}.html`));
  });
  ipcMain.on("service-toggle", (event, res) => {
    const process = processes[res];
    if (process.status === ServiceStatus.RUNNING) process.kill(0);
    else process.spawn(...(SETTINGS.services[res].argv || []));
    if ($.pageName === "Index") renderIndex();
  });
  ipcMain.on("detach-window", (event, res) => {
    detachedWindows[res] = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.resolve(__dirname, "preload.js"),
      },
    });
    detachedWindows[res].on("closed", () => {
      delete detachedWindows[res];
      $.detachedWindows = Object.keys(detachedWindows).filter(
        (v) => !!detachedWindows[Number(v)]
      );
      if ($.pageName === "Index") renderIndex();
    });
    $.title = `${SETTINGS.services[res].name}@${SETTINGS.services[res].version}`;
    $.detachedWindows = Object.keys(detachedWindows).filter(
      (v) => !!detachedWindows[Number(v)]
    );
    HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
      String(eval(p2))
    );
    writeFileSync(path.resolve(__dirname, "ServiceLog.html"), HTML, "utf8");
    detachedWindows[res].loadFile(path.resolve(__dirname, "ServiceLog.html"));
    renderIndex();
  });
  win.on("close", () => {
    if (process.platform !== "darwin") app.exit();
  });
  function renderIndex() {
    SCRIPT = readFileSync(
      path.resolve(__dirname, "../front/public/pages/Index.js"),
      "utf8"
    );
    PAGESTYLE = readFileSync(
      path.resolve(__dirname, "../front/public/styles/Index.css"),
      "utf8"
    );
    if ($.preIndex) processes[$.preIndex].isOpened = false;
    $.title = "Integrated Services Manager";
    $.pageName = "Index";
    HTML = HTML_TEMPLATE.replace(/("?)\/\*\{(.+?)\}\*\/\1/g, (v, p1, p2) =>
      String(eval(p2))
    );
    writeFileSync(path.resolve(__dirname, "Index.html"), HTML, "utf8");
    win.loadFile(path.resolve(__dirname, "Index.html"));
  }
}
app.whenReady().then(() => {
  createWindow();
});
