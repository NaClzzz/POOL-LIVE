'use client'

import { EditOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import type { User } from '@supabase/supabase-js'
import { Alert, Avatar, Button, Card, Descriptions, Form, Input, Spin, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/profile'

type ProfileFormValues = {
  displayName: string
}

function getDefaultDisplayName(user: User) {
  if (typeof user.user_metadata.display_name === 'string') {
    return user.user_metadata.display_name
  }

  return user.email?.split('@')[0] ?? '新用户'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ProfilePage() {
  const router = useRouter()
  const [form] = Form.useForm<ProfileFormValues>()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        router.replace('/login')
        return
      }

      setUser(currentUser)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, created_at, updated_at')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (error) {
        setErrorMessage('无法读取个人资料，请确认已执行 Supabase 的建表 SQL。')
        setIsLoading(false)
        return
      }

      let nextProfile = data as Profile | null

      if (!nextProfile) {
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: currentUser.id,
              display_name: getDefaultDisplayName(currentUser),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
          .select('id, display_name, created_at, updated_at')
          .single()

        if (createError) {
          setErrorMessage('无法初始化个人资料，请确认已执行 Supabase 的建表 SQL。')
          setIsLoading(false)
          return
        }

        nextProfile = createdProfile as Profile
      }

      setProfile(nextProfile)
      form.setFieldsValue({ displayName: nextProfile.display_name })
      setIsLoading(false)
    }

    void loadProfile()
  }, [form, router])

  async function handleSave(values: ProfileFormValues) {
    if (!user) return

    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: values.displayName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setErrorMessage('保存失败，请稍后再试。')
      setIsSaving(false)
      return
    }

    setProfile(current =>
      current
        ? {
            ...current,
            display_name: values.displayName.trim(),
            updated_at: new Date().toISOString(),
          }
        : current,
    )
    setSuccessMessage('昵称已保存。')
    setIsSaving(false)
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  if (isLoading) {
    return (
      <main className="flex min-h-80 items-center justify-center">
        <Spin size="large" />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <PageHeading
        eyebrow="账号设置"
        title="个人中心"
        description="管理你的站内昵称和登录账号。"
      />
      <Card className="shadow-sm">
        <div className="mb-8 flex items-center gap-4">
          <Avatar size={72} icon={<UserOutlined />} className="!bg-violet-500">
            {profile?.display_name.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Title level={3} className="!mb-1">
              {profile?.display_name ?? '音乐用户'}
            </Typography.Title>
            <Typography.Text type="secondary">{user?.email}</Typography.Text>
          </div>
        </div>

        {errorMessage ? (
          <Alert className="mb-5" type="error" showIcon message={errorMessage} />
        ) : null}
        {successMessage ? (
          <Alert className="mb-5" type="success" showIcon message={successMessage} />
        ) : null}

        <Descriptions
          column={1}
          className="mb-6"
          items={[
            { key: 'email', label: '邮箱', children: user?.email },
            {
              key: 'createdAt',
              label: '注册时间',
              children: user?.created_at ? formatDate(user.created_at) : '—',
            },
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
            <Button
              type="primary"
              htmlType="submit"
              icon={<EditOutlined />}
              loading={isSaving}
            >
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
