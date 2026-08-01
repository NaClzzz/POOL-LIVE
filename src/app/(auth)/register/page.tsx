'use client'

import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'

type RegisterValues = {
  displayName: string
  email: string
  password: string
}

export default function RegisterPage() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleRegister(values: RegisterValues) {
    setIsSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    const displayName = values.displayName.trim()
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    if (data.session && data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )

      if (profileError) {
        setErrorMessage('账号已创建，但个人资料初始化失败，请稍后重新登录。')
        setIsSubmitting(false)
        return
      }

      router.replace('/')
      router.refresh()
      return
    }

    setSuccessMessage('注册成功，请前往邮箱点击验证链接后再登录。')
    setIsSubmitting(false)
  }

  return (
    <Card styles={{ body: { padding: 36 } }}>
      <Typography.Text className="!text-xs !font-semibold !tracking-[0.18em] !text-[#1e88e5]">
        CREATE ACCOUNT
      </Typography.Text>
      <Typography.Title level={2} className="!mb-2 !mt-3 !tracking-[-0.03em]">
        创建账号
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        使用邮箱和密码保存属于你的音乐数据。
      </Typography.Paragraph>

      {errorMessage ? (
        <Alert className="mb-5" type="error" showIcon message={errorMessage} />
      ) : null}
      {successMessage ? (
        <Alert className="mb-5" type="success" showIcon message={successMessage} />
      ) : null}

      <Form<RegisterValues> layout="vertical" className="mt-7" onFinish={handleRegister}>
        <Form.Item
          label="昵称"
          name="displayName"
          rules={[
            { required: true, message: '请输入昵称。' },
            { min: 2, max: 20, message: '昵称长度应为 2 到 20 个字符。' },
          ]}
        >
          <Input prefix={<UserOutlined />} placeholder="你的昵称" autoComplete="nickname" />
        </Form.Item>
        <Form.Item
          label="邮箱"
          name="email"
          rules={[{ required: true, type: 'email', message: '请输入正确的邮箱地址。' }]}
        >
          <Input prefix={<MailOutlined />} placeholder="name@example.com" autoComplete="email" />
        </Form.Item>
        <Form.Item
          label="密码"
          name="password"
          rules={[
            { required: true, message: '请输入密码。' },
            { min: 6, message: '密码至少需要 6 位。' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="至少 6 位密码"
            autoComplete="new-password"
          />
        </Form.Item>
        <Button block type="primary" size="large" htmlType="submit" loading={isSubmitting}>
          注册
        </Button>
      </Form>

      <Typography.Paragraph type="secondary" className="!mb-0 !mt-6 !text-center">
        已有账号？<Link className="text-[#1e88e5]" href="/login">去登录</Link>
      </Typography.Paragraph>
    </Card>
  )
}
