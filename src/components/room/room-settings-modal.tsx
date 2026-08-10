'use client'

import { Alert, Button, Divider, Form, Input, InputNumber, Modal, Popconfirm, Radio } from 'antd'
import type { FormInstance } from 'antd'
import type { RoomSettingsPayload, RoomSocketSnapshot } from '@/types/room'

// 用于控制房主设置弹窗的打开状态、当前房间配置和保存结果。
type RoomSettingsModalProps = {
  open: boolean
  room: RoomSocketSnapshot['room'] | null
  form: FormInstance<RoomSettingsPayload>
  confirmLoading?: boolean
  dissolveLoading?: boolean
  error?: string | null
  onClose: () => void
  onSave: (values: RoomSettingsPayload) => void | Promise<void>
  onDissolve: () => void
}

export function RoomSettingsModal({
  open,
  room,
  form,
  confirmLoading = false,
  dissolveLoading = false,
  error,
  onClose,
  onSave,
  onDissolve,
}: RoomSettingsModalProps) {
  const passwordAction = Form.useWatch('passwordAction', form)

  function fillRoomSettings() {
    if (!room) return
    form.setFieldsValue({
      name: room.name,
      tag: room.tag,
      maxMembers: room.maxMembers,
      maxStageMembers: room.maxStageMembers,
      passwordAction: 'keep',
      password: undefined,
    })
  }

  return (
    <Modal
      open={open}
      title="房间设置"
      okText="保存设置"
      cancelText="取消"
      confirmLoading={confirmLoading}
      destroyOnHidden
      okButtonProps={{ htmlType: 'submit', disabled: dissolveLoading }}
      cancelButtonProps={{ disabled: confirmLoading || dissolveLoading }}
      onCancel={() => {
        if (!confirmLoading && !dissolveLoading) onClose()
      }}
      afterOpenChange={opened => {
        if (opened) fillRoomSettings()
      }}
      modalRender={dom => (
        <Form<RoomSettingsPayload>
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={onSave}
        >
          {dom}
        </Form>
      )}
    >
      <Form.Item
        label="房间名称"
        name="name"
        rules={[
          { required: true, message: '请输入房间名称。' },
          { min: 2, max: 20, message: '房间名称应为 2 到 20 个字符。' },
        ]}
      >
        <Input maxLength={20} />
      </Form.Item>

      <Form.Item
        label="房间标签"
        name="tag"
        rules={[
          { required: true, message: '请输入房间标签。' },
          { min: 2, max: 12, message: '房间标签应为 2 到 12 个字符。' },
        ]}
      >
        <Input maxLength={12} />
      </Form.Item>

      <div className="grid grid-cols-2 gap-4">
        <Form.Item
          label="最大在线人数"
          name="maxMembers"
          rules={[{ required: true, message: '请输入最大在线人数。' }]}
        >
          <InputNumber className="!w-full" min={2} max={50} precision={0} />
        </Form.Item>
        <Form.Item
          label="最大上台人数"
          name="maxStageMembers"
          dependencies={['maxMembers']}
          rules={[
            { required: true, message: '请输入最大上台人数。' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (typeof value === 'number' && value > getFieldValue('maxMembers')) {
                  return Promise.reject(new Error('最大上台人数不能超过最大人数。'))
                }
                return Promise.resolve()
              },
            }),
          ]}
        >
          <InputNumber className="!w-full" min={1} max={30} precision={0} />
        </Form.Item>
      </div>

      <Form.Item label="密码设置" name="passwordAction">
        <Radio.Group
          options={[
            { label: '保持不变', value: 'keep' },
            { label: '设置新密码', value: 'set' },
            { label: '取消密码', value: 'remove' },
          ]}
        />
      </Form.Item>

      {passwordAction === 'set' ? (
        <Form.Item
          label="新密码"
          name="password"
          rules={[
            { required: true, message: '请输入新密码。' },
            { min: 6, max: 64, message: '密码应为 6 到 64 个字符。' },
          ]}
        >
          <Input.Password maxLength={64} autoComplete="new-password" />
        </Form.Item>
      ) : null}

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <Divider className="!my-5" />
      <section aria-label="解散房间">
        <Popconfirm
          title="确定解散该房间？"
          description="此操作不可恢复。"
          okText="确认解散"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: dissolveLoading }}
          disabled={confirmLoading || dissolveLoading}
          onConfirm={onDissolve}
        >
          <Button danger loading={dissolveLoading} disabled={confirmLoading}>
            解散房间
          </Button>
        </Popconfirm>
      </section>
    </Modal>
  )
}
