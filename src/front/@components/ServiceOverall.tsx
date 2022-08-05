import React, { PureComponent } from "react";
import { IpcRenderer } from "electron";

import { Service, ServiceStatus } from "../../common/Utility";

interface Props {
  service: Service;
  ipcRenderer: IpcRenderer;
  index: number;
}

export default class ServiceOverall extends PureComponent<Props> {
  render(): React.ReactNode {
    return (
      <div className="service-overall">
        <div className="service-title">
          <a
            className={`service-status${this.props.service.status}`}
            onClick={() => {
              if (
                this.props.service.status === ServiceStatus.STOPPED ||
                (this.props.service.status === ServiceStatus.RUNNING &&
                  confirm(
                    `프로세스 ${this.props.service.name}을(를) 종료할까요?`
                  ))
              )
                this.props.ipcRenderer.send("service-toggle", this.props.index);
            }}
          >
            ●
          </a>
          <br />
          {this.props.service.name}
          <br />
          {this.props.service.version}
          <button
            onClick={() => {
              this.props.ipcRenderer.send("page-move", {
                pageName: "ServiceLog",
                props: { index: this.props.index, service: this.props.service },
              });
            }}
          >
            자세히
          </button>
        </div>
      </div>
    );
  }
}
