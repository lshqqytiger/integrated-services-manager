import React, { PureComponent } from "react";
import { IpcRenderer } from "electron";

import Bind from "../ReactBootstrap";

import { Service, ServiceStatus } from "../../common/types";

import ServiceOverall from "../@components/ServiceOverall";

interface Props {
  ipcRenderer: IpcRenderer;
  services: Service[];
}
interface State {
  services: Service[];
}

export default class Index extends PureComponent<Props, State> {
  state: State = { services: [] };
  constructor(props: Props) {
    super(props);

    this.props.ipcRenderer.on("service-started", (event, res) => {
      let services = [...this.state.services];
      services[res] = { ...services[res], status: ServiceStatus.RUNNING };
      this.setState({
        services,
      });
    });
    this.props.ipcRenderer.on("service-stopped", (event, res) => {
      let services = [...this.state.services];
      services[res] = { ...services[res], status: ServiceStatus.STOPPED };
      this.setState({
        services,
      });
    });
  }
  componentDidMount() {
    this.setState({ services: this.props.services });
  }
  render(): React.ReactNode {
    return (
      <article>
        <ol>
          {this.state.services.map((v, i) => (
            <li>
              <ServiceOverall
                {...v}
                index={i}
                ipcRenderer={this.props.ipcRenderer}
              />
            </li>
          ))}
        </ol>
      </article>
    );
  }
}

Bind(Index);
