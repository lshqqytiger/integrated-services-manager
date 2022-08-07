import React from "react";
import ReactDOM from "react-dom";
import { IpcRenderer } from "electron";

declare global {
  interface Window {
    ipcRenderer: IpcRenderer;
  }
}

interface Props {
  children: React.ReactNode;
}
interface State {
  ipcRenderer: IpcRenderer;
}

const PROPS = eval("window['__PROPS']") || {};

export default function Bind(TargetClass: any) {
  const $root = document.getElementById("stage");
  PROPS.ipcRenderer = window.ipcRenderer;

  ReactDOM.render(
    React.createElement(Root, PROPS, React.createElement(TargetClass, PROPS)),
    $root
  );
}
export class Root extends React.PureComponent<Props, State> {
  render() {
    return <>{this.props.children}</>;
  }
}
