'use client'

import { EditOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Card, Descriptions, Form, Input, Spin, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { authClient, useSession } from '@/lib/auth-client'

type ProfileFormValues = {
  displayName: string
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ProfilePage() {
  const router = useRouter()
  const [form] = Form.useForm<ProfileFormValues>()
  const { data: session, error: sessionError, isPending, refetch } = useSession()
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const user = session?.user

  useEffect(() => {
    if (user) {
      form.setFieldsValue({ displayName: user.name })
    }
  }, [form, user])

  useEffect(() => {
    if (!isPending && !user) {
      router.replace('/login')
    }
  }, [isPending, router, user])

  async function handleSave(values: ProfileFormValues) {
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { error } = await authClient.updateUser({ name: values.displayName.trim() })

      if (error) {
        setErrorMessage(error.message ?? '保存失败，请稍后重试。')
        return
      }

      await refetch()
      setSuccessMessage('昵称已保存。')
    } catch {
      setErrorMessage('保存失败，请稍后重试。')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    setErrorMessage('')

    try {
      const { error } = await authClient.signOut()

      if (error) {
        setErrorMessage(error.message ?? '退出登录失败，请稍后重试。')
        return
      }

      router.replace('/login')
      router.refresh()
    } catch {
      setErrorMessage('退出登录失败，请稍后重试。')
    } finally {
      setIsSigningOut(false)
    }
  }

  if (isPending) {
    return (
      <main className="desktop-page desktop-page--narrow flex min-h-80 items-center justify-center">
        <Spin size="large" />
      </main>
    )
  }

  if (!user) return null

  return (
    <main className="desktop-page desktop-page--narrow">
      <PageHeading
        eyebrow="账号设置"
        title="个人中心"
        description="管理你的站内昵称和登录账号。"
      />
      <Card styles={{ body: { padding: 32 } }}>
        <div className="mb-8 flex items-center gap-4">
          <Avatar size={72} icon={<UserOutlined />} className="!bg-[#42a5f5]">
            {user.name.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Title level={3} className="!mb-1">
              {user.name}
            </Typography.Title>
            <Typography.Text type="secondary">{user.email}</Typography.Text>
          </div>
        </div>

        {sessionError || errorMessage ? (
          <Alert
            className="mb-5"
            type="error"
            showIcon
            message={errorMessage || '无法读取当前登录状态，请刷新页面后重试。'}
          />
        ) : null}
        {successMessage ? (
          <Alert className="mb-5" type="success" showIcon message={successMessage} />
        ) : null}

        <Descriptions
          column={1}
          className="mb-6"
          items={[
            { key: 'email', label: '邮箱', children: user.email },
            { key: 'createdAt', label: '注册时间', children: formatDate(user.createdAt) },
          ]}
        />

        <Form<ProfileFormValues> form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            label="昵称"
            name="displayName"
            rules={[
              { required: true, message: '请输入昵称。' },
              { min: 2, max: 20, message: '昵称长度应为 2 到 20 个字符。' },
            ]}
          >
            <Input maxLength={20} />
          </Form.Item>
          <div className="flex flex-wrap gap-3">
            <Button type="primary" htmlType="submit" icon={<EditOutlined />} loading={isSaving}>
              保存昵称
            </Button>
            <Button danger icon={<LogoutOutlined />} loading={isSigningOut} onClick={handleSignOut}>
              退出登录
            </Button>
          </div>
        </Form>
      </Card>
    </main>
  )
}
