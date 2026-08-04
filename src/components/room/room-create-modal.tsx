'use client'

import { Form, Input, InputNumber, Modal, Switch } from 'antd'
import type { FormInstance } from 'antd'

type CreateRoomFormValues = {
  name: string
  tag: string
  isPasswordProtected: boolean
  maxMembers: number
  maxStageMembers: number
}

type RoomCreateModalProps = {
  form: FormInstance<CreateRoomFormValues>
  open: boolean
  onClose: () => void
  onCreate: (values: CreateRoomFormValues) => void
}

export type { CreateRoomFormValues }

export function RoomCreateModal({ form, open, onClose, onCreate }: RoomCreateModalProps) {
  return (
    <Modal
      open={open}
      title="创建一起听房间"
      okText="创建并进入"
      cancelText="取消"
      destroyOnHidden
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form<CreateRoomFormValues>
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          name: '',
          tag: '',
          isPasswordProtected: false,
          maxMembers: 8,
          maxStageMembers: 10,
        }}
        onFinish={onCreate}
      >
        <Form.Item
          label="房间名称"
          name="name"
          rules={[
            { required: true, message: '请输入房间名称。' },
            { min: 2, max: 20, message: '房间名称应为 2 到 20 个字符。' },
          ]}
        >
          <Input maxLength={20} placeholder="例如：深夜慢放局" />
        </Form.Item>
        <Form.Item
          label="房间标签"
          name="tag"
          rules={[
            { required: true, message: '请输入一个房间标签。' },
            { min: 2, max: 12, message: '标签应为 2 到 12 个字符。' },
          ]}
        >
          <Input maxLength={12} placeholder="例如：深夜、流行、氛围" />
        </Form.Item>
        <Form.Item label="房间是否有密码" name="isPasswordProtected" valuePropName="checked">
          <Switch checkedChildren="有密码" unCheckedChildren="无密码" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            label="最大人数"
            name="maxMembers"
            rules={[{ required: true, message: '请设置最大人数。' }]}
          >
            <InputNumber className="!w-full" min={2} max={50} precision={0} />
          </Form.Item>
          <Form.Item
            label="最大上台人数"
            name="maxStageMembers"
            rules={[{ required: true, message: '请设置最大上台人数。' }]}
          >
            <InputNumber className="!w-full" min={1} max={30} precision={0} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  )
}
