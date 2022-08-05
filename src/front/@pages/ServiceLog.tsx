import React, { PureComponent } from "react";
import { IpcRenderer } from "electron";
import Convert from "ansi-to-html";

import Bind from "../ReactBootstrap";

import {
  Service,
  ServiceStatus,
  STDResponse,
  LengthLimitedArray,
} from "../../common/Utility";

interface Props {
  ipcRenderer: IpcRenderer;
  service: Service;
  index: number;
  logs: LengthLimitedArray;
}
interface State {
  service: Service;
  logs: LengthLimitedArray;
}

const ansi2html = new Convert();

export default class ServiceLog extends PureComponent<Props, State> {
  logBox: React.RefObject<HTMLDivElement>;
  state: State = {
    service: this.props.service,
    logs: new LengthLimitedArray(100),
  };
  constructor(props: Props) {
    super(props);

    this.logBox = React.createRef();
  }
  componentDidMount() {
    const logs = new LengthLimitedArray(100);
    logs.push(...this.props.logs);
    this.setState({ logs });
    this.props.ipcRenderer.on("service-started", (event, res: number) => {
      if (res !== this.props.index) return;
      this.setState({
        service: { ...this.state.service, status: ServiceStatus.RUNNING },
      });
    });
    this.props.ipcRenderer.on("service-stopped", (event, res: number) => {
      if (res !== this.props.index) return;
      this.setState({
        service: { ...this.state.service, status: ServiceStatus.STOPPED },
      });
    });
    this.props.ipcRenderer.on("service-log", (event, res: STDResponse) => {
      if (res.index !== this.props.index) return;
      const logs = this.state.logs.copy();
      logs.push(res.data);
      if (this.logBox.current) this.logBox.current.scrollTop = 99999999;
      this.setState({ logs });
    });
  }
  render(): React.ReactNode {
    return (
      <article>
        <div className="service-title">
          <i
            className="icon fas fa-fw fa-arrow-left"
            onClick={() => {
              this.props.ipcRenderer.send("page-move", {
                pageName: "Index",
                props: { index: this.props.index },
              });
            }}
          />
          <a
            className={`service-status${this.state.service.status}`}
            onClick={() => {
              if (
                this.state.service.status === ServiceStatus.STOPPED ||
                (this.state.service.status === ServiceStatus.RUNNING &&
                  confirm(
                    `프로세스 ${this.state.service.name}을(를) 종료할까요?`
                  ))
              )
                this.props.ipcRenderer.send("service-toggle", this.props.index);
            }}
          >
            ●
          </a>
          {this.state.service.name}@{this.state.service.version}
        </div>
        <div className="service-log" ref={this.logBox}>
          {this.state.logs.map((v) => (
            <div
              className="log-item"
              dangerouslySetInnerHTML={{
                __html: ansi2html.toHtml(
                  v.replace(/</g, "&lt;").replace(/&/g, "&amp;")
                ),
              }}
            />
          ))}
        </div>
      </article>
    );
  }
}

Bind(ServiceLog);
