import React, { PureComponent } from "react";
import { IpcRenderer } from "electron";

import { Service } from "../../common/types";

interface Props extends Service {
  ipcRenderer: IpcRenderer;
  index: number;
}

export default class ServiceOverall extends PureComponent<Props> {
  render(): React.ReactNode {
    return (
      <div className="service-overall">
        <div className="service-title">
          <a
            className={`service-status${this.props.status}`}
            onClick={() => {
              this.props.ipcRenderer.send("service-toggle", this.props.index);
            }}
          >
            ●
          </a>
          <br />
          {this.props.name}
          <br />
          {this.props.version}
        </div>
      </div>
    );
  }
}
