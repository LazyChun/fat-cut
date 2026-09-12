import React from "react";
import { Form, FormItemProps, type FormProps } from "antd";
import { useMemo, ReactNode, useEffect } from "react";
import { useMount, useSafeState } from "ahooks";
import styles from "./FatForm.less";
import { isEmpty, max as _max } from "lodash";

export interface FatFormProps<T> extends FormProps<T> {}

const FatForm = <T,>(props: FatFormProps<T>) => {
  const formId = useMemo(() => {
    return props?.id || "fatFormId" + Math.random();
  }, []);
  const [visible, setVisible] = useSafeState(true);
  const [maxWidth, setMaxWidth] = useSafeState(0);

  const updateWidth = () => {
    const formEle = document.getElementById(formId);
    if (formEle) {
      if (formEle.offsetWidth === 0 && formEle.offsetHeight === 0) {
        return;
      }
      const labelEles = formEle.getElementsByClassName("ant-form-item-label");

      for (let i = 0; i < labelEles.length; i++) {
        const labelEle = labelEles.item(i) as HTMLElement;
        if (labelEle) {
          labelEle.style.width = "auto";
        }
      }

      let max = 0;
      for (let i = 0; i < labelEles.length; i++) {
        const labelEleItem = labelEles.item(i);

        const labelEle = labelEleItem?.getElementsByClassName(
          "ant-form-item-no-colon",
        )?.[0];
        const labelWidth = labelEle?.clientWidth || 0;
        const textEle = labelEle?.children?.[0];
        const textWidth = textEle?.clientWidth || 0;
        const lWidth = _max([textWidth, labelWidth]);
        if (lWidth && lWidth > max) {
          if (textWidth >= labelWidth) {
            max = lWidth + 16;
          } else {
            max = lWidth;
          }
        }
      }

      for (let i = 0; i < labelEles.length; i++) {
        const labelEle = labelEles.item(i) as HTMLElement;
        if (labelEle && max) {
          labelEle.style.width = max + "px";
        }
      }

      const controlEles = formEle.getElementsByClassName(
        "ant-form-item-control",
      );
      for (let i = 0; i < controlEles.length; i++) {
        const controlEle = controlEles.item(i) as HTMLElement;
        if (controlEle && max) {
          if (
            controlEle.previousElementSibling?.classList?.contains(
              "ant-form-item-label",
            )
          ) {
            controlEle.style.maxWidth = `calc(100% - ${max}px)`;
          }
        }
      }
      if (!visible) {
        setVisible(true);
      }
      if (maxWidth != max) {
        setMaxWidth(max);
      }
    }
  };

  const [resizeObserver, ob] = useMemo(() => {
    let resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    let ob = new MutationObserver(() => {
      updateWidth();
    });
    return [resizeObserver, ob];
  }, []);

  useMount(() => {
    const formEle = document.getElementById(formId);
    const labelEles = formEle?.getElementsByClassName("ant-form-item-label");
    if (formEle && labelEles) {
      resizeObserver.observe(formEle);
      ob.observe(formEle, { childList: true, subtree: true });
    }
  });

  useEffect(() => {
    return () => {
      resizeObserver.disconnect();
      ob.disconnect();
    };
  }, []);

  // @ts-ignore
  return (
    <>
      {/* @ts-ignore */}
      <Form<T>
        {...props}
        style={{ ...props.style, visibility: visible ? undefined : "hidden" }}
        id={formId}
        labelAlign={"left"}
      />
    </>
  );
};

interface FatFormItemProps<T> extends FormItemProps<T> {
  errors?: string[];
  children?: ReactNode;
}

const FItem = <Values,>(props: FatFormItemProps<Values>) => {
  const { children, errors, ...others } = props;
  const help = isEmpty(errors) ? undefined : (
    <Form.ErrorList className={styles.errors} errors={errors} />
  );
  return (
    <Form.Item
      colon={false}
      {...others}
      label={props.label ? <div>{props.label}</div> : undefined}
      validateStatus={isEmpty(errors) ? undefined : "error"}
      help={help}
    >
      {children}
    </Form.Item>
  );
};
FItem.useStatus = Form.Item.useStatus;

FatForm.useForm = Form.useForm;
FatForm.Item = FItem;
FatForm.List = Form.List;
FatForm.ErrorList = Form.ErrorList;
FatForm.Provider = Form.Provider;
export default FatForm;
