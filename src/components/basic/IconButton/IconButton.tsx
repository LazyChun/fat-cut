import React, { ReactNode } from "react";
import classNames from "classnames";
import styles from "./IconButton.less";
import { Switch, Case, Default } from "react-if";
import { Spin } from "antd";

interface IconButtonProps {
  selected?: boolean;
  children?: ReactNode;
  bgColor?: string;
  onClick?: () => void;
  type?: "border" | "icon"; // icon
  width?: number;
  height?: number;
  size?: number;
  // 加载状态
  loading?: boolean;
  danger?: boolean;
}

const IconButton = (props: IconButtonProps) => {
  const {
    selected,
    children,
    bgColor = "#ffffff",
    onClick,
    type = "border",
    size = 32,
    width,
    height,
    loading = false,
    danger = false,
  } = props;
  const w = width || size;
  const h = height || size;
  return (
    <Switch>
      <Case condition={type === "icon"}>
        <div
          onClick={() => onClick?.()}
          className={classNames(styles.icon, {
            [styles.danger]: danger,
          })}
          style={{
            width: w,
            height: h,
          }}
        >
          <Spin size={"small"} spinning={loading}>
            {children}
          </Spin>
        </div>
      </Case>
      <Default>
        <div
          onClick={() => onClick?.()}
          className={classNames(styles.container, {
            [styles.selected]: selected,
            [styles.danger]: danger,
          })}
          style={{
            backgroundColor: bgColor,
            width: w,
            height: h,
          }}
        >
          <Spin size={"small"} spinning={loading}>
            {children}
          </Spin>
        </div>
      </Default>
    </Switch>
  );
};

export default IconButton;
