import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export class BailianConfigurationError extends Error {
  constructor() {
    super('AI 赏析服务尚未配置，请检查服务端环境变量。')
    this.name = 'BailianConfigurationError'
  }
}

export function createBailianModel() {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseURL = process.env.DASHSCOPE_BASE_URL
  const modelId = process.env.DASHSCOPE_MODEL

  if (!apiKey || !baseURL || !modelId) {
    throw new BailianConfigurationError()
  }

  try {
    const url = new URL(baseURL)

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Unsupported protocol')
    }
  } catch {
    throw new BailianConfigurationError()
  }

  const bailian = createOpenAICompatible<string, string, string, string>({
    name: 'bailian',
    apiKey,
    baseURL,
  })

  return bailian(modelId)
}
