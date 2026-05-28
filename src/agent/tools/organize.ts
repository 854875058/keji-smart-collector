import type { Snippet } from '../../lib/types'

/** 自动打标签 */
export function autoTag(snippet: Snippet): string[] {
  const text = `${snippet.title} ${snippet.question} ${snippet.answer}`.toLowerCase()
  const tags: string[] = []

  const tagPatterns: [RegExp, string][] = [
    [/\b(docker|container|镜像)\b/i, 'Docker'],
    [/\b(kubernetes|k8s)\b/i, 'Kubernetes'],
    [/\b(react|vue|angular|前端)\b/i, '前端'],
    [/\b(python|java|go|rust|c\+\+)\b/i, '编程'],
    [/\b(sql|数据库|mysql|postgres|mongodb)\b/i, '数据库'],
    [/\b(api|接口|rest|graphql)\b/i, 'API'],
    [/\b(部署|deploy|ci\/cd|devops)\b/i, 'DevOps'],
    [/\b(安全|security|加密|认证)\b/i, '安全'],
    [/\b(ai|机器学习|深度学习|llm|gpt)\b/i, 'AI'],
    [/\b(设计|ui|ux|css|样式)\b/i, '设计'],
    [/\b(测试|test|单元测试)\b/i, '测试'],
    [/\b(linux|ubuntu|centos|shell)\b/i, 'Linux'],
    [/\b(git|github|版本控制)\b/i, 'Git'],
  ]

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  return tags
}

/** 自动分类到笔记本 */
export function autoCategorize(
  snippet: Snippet,
  existingFolders: string[]
): string | null {
  const text = `${snippet.title} ${snippet.question} ${snippet.answer}`.toLowerCase()

  const categoryPatterns: [RegExp, string][] = [
    [/\b(编程|代码|开发|bug|函数|变量)\b/i, '开发'],
    [/\b(ai|机器学习|深度学习|llm|prompt)\b/i, 'AI 学习'],
    [/\b(工作|会议|项目|需求)\b/i, '工作'],
    [/\b(学习|教程|笔记|知识)\b/i, '学习'],
    [/\b(工具|软件|插件|扩展)\b/i, '工具'],
  ]

  for (const [pattern, category] of categoryPatterns) {
    if (pattern.test(text)) {
      // 优先使用已存在的同名文件夹
      const existing = existingFolders.find(
        (f) => f.toLowerCase() === category.toLowerCase()
      )
      return existing || category
    }
  }

  return null
}
