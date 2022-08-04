import React, { PureComponent } from "react";

import Bind from "../ReactBootstrap";

interface Props {}
interface State {}

export default class Index extends PureComponent<Props, State> {
  render(): React.ReactNode {
    return <div>TEST</div>;
  }
}

Bind(Index);
