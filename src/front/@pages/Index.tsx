import React, { PureComponent } from "react";
import { IpcRenderer } from "electron";

import Bind from "../ReactBootstrap";

import {
  Service,
  STDResponse,
  ServiceStatus,
  LengthLimitedArray,
} from "../../common/Utility";

import ServiceOverall from "../@components/ServiceOverall";

interface Props {
  ipcRenderer: IpcRenderer;
  services: Service[];
  detachedWindows: string[];
}
interface State {
  services: Service[];
}

export default class Index extends PureComponent<Props, State> {
  state: State = { services: this.props.services };
  constructor(props: Props) {
    super(props);
  }
  componentDidMount() {
    this.props.ipcRenderer.on("service-started", (event, res: number) => {
      const services = [...this.state.services];
      services[res] = { ...services[res], status: ServiceStatus.RUNNING };
      this.setState({
        services,
      });
    });
    this.props.ipcRenderer.on("service-stopped", (event, res: number) => {
      const services = [...this.state.services];
      services[res] = { ...services[res], status: ServiceStatus.STOPPED };
      this.setState({
        services,
      });
    });
  }
  render(): React.ReactNode {
    return (
      <article>
        <div className="service-list">
          {this.state.services.map((v, i) => (
            <ServiceOverall
              service={v}
              index={i}
              ipcRenderer={this.props.ipcRenderer}
              detachedWindows={this.props.detachedWindows}
            />
          ))}
        </div>
      </article>
    );
  }
}

Bind(Index);
