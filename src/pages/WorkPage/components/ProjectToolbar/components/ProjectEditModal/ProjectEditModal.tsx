import React, { useCallback, useEffect, useState } from "react";
import { Input, Modal } from "antd";
import { FatForm } from "components";
import { useI18n, useSdk } from "hooks";
import { editorStore, useProjectStore } from "reducers";

interface ProjectFormValues {
  name: string;
  description?: string;
}

interface ProjectEditModalProps {
  onSuccess: () => void;
}

const ProjectEditModal: React.FC<ProjectEditModalProps> = ({ onSuccess }) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { isEditModalOpen, editingProject } = useProjectStore();
  const [submitting, setSubmitting] = useState(false);
  const [form] = FatForm.useForm<ProjectFormValues>();

  useEffect(() => {
    if (!isEditModalOpen) {
      form.resetFields();
      return;
    }
    if (editingProject) {
      form.setFieldsValue({
        name: editingProject.name,
        description: editingProject.description,
      });
    } else {
      form.setFieldsValue({ name: "", description: "" });
    }
  }, [form, isEditModalOpen, editingProject]);

  const handleCancel = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const description = values.description || "";
      setSubmitting(true);
      if (editingProject) {
        await sdk.backend.invoke("updateProject", {
          id: editingProject.id,
          name: values.name,
          description,
        });
        sdk.ui.toast.success(text("cut.project.modal.edit.success"));
      } else {
        const created = await sdk.backend.invoke<Cut.ProjectItem>(
          "createProject",
          { name: values.name, description },
        );
        sdk.ui.toast.success(text("cut.project.modal.create.success"));
        if (created?.id) {
          await editorStore.loadProject(sdk, created.id);
        }
      }
      form.resetFields();
      onSuccess();
    } catch (error) {
      if (typeof error === "object" && error && "errorFields" in error) {
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      sdk.ui.toast.error(
        text(
          editingProject
            ? "cut.project.modal.edit.failed"
            : "cut.project.modal.create.failed",
          { message: errorMessage },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }, [form, onSuccess, sdk, text, editingProject]);

  return (
    <Modal
      destroyOnHidden={true}
      open={isEditModalOpen}
      title={text(
        editingProject ? "cut.project.editTitle" : "cut.project.createTitle",
      )}
      okText={text("cut.project.modal.ok")}
      cancelText={text("cut.project.modal.cancel")}
      confirmLoading={submitting}
      onCancel={handleCancel}
      onOk={() => {
        void handleSubmit();
      }}
    >
      <FatForm<ProjectFormValues> style={{ marginTop: 24 }} form={form}>
        <FatForm.Item<ProjectFormValues>
          label={text("cut.project.form.name.label")}
          name="name"
          rules={[
            {
              required: true,
              message: text("cut.project.form.name.required"),
            },
          ]}
        >
          <Input
            maxLength={60}
            placeholder={text("cut.project.form.name.placeholder")}
          />
        </FatForm.Item>
        <FatForm.Item<ProjectFormValues>
          label={text("cut.project.form.description.label")}
          name="description"
        >
          <Input.TextArea
            rows={4}
            maxLength={200}
            placeholder={text("cut.project.form.description.placeholder")}
          />
        </FatForm.Item>
      </FatForm>
    </Modal>
  );
};

export default ProjectEditModal;
