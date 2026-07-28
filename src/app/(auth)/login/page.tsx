'use client'

import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'

type LoginValues = {
  email: string
  password: string
}

function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get('next')

  if (next?.startsWith('/') && !next.startsWith('//')) return next

  return '/'
}

export default function LoginPage() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin(values: LoginValues) {
    setIsSubmitting(true)
    setErrorMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    router.replace(getSafeNextPath())
    router.refresh()
  }

  return (
    <Card className="shadow-xl shadow-slate-200/70" styles={{ body: { padding: 32 } }}>
      <Typography.Title level={2} className="!mb-2">
        欢迎回来
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        登录后即可访问你的音乐数据。
      </Typography.Paragraph>

      {errorMessage ? (
        <Alert className="mb-5" type="error" showIcon message={errorMessage} />
      ) : null}

      <Form<LoginValues> layout="vertical" className="mt-7" onFinish={handleLogin}>
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
          rules={[{ required: true, message: '请输入密码。' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="输入密码"
            autoComplete="current-password"
          />
        </Form.Item>
        <Button block type="primary" size="large" htmlType="submit" loading={isSubmitting}>
          登录
        </Button>
      </Form>

      <Typography.Paragraph type="secondary" className="!mb-0 !mt-6 !text-center">
        还没有账号？<Link className="text-violet-600" href="/register">去注册</Link>
      </Typography.Paragraph>
    </Card>
  )
}
