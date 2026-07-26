import { ArrowRight, Bot, Check, Download, Search, Shield, ShieldCheck, Sparkles, FileText } from 'lucide-react'

const PROOF_POINTS = [
  'ChatGPT、Claude、Gemini 回答一键收藏',
  '按文件夹、标签与来源整理知识片段',
  '网页端查看、搜索、编辑完整笔记',
  '登录后云端同步，换设备也能继续用',
]

const WORKFLOW = [
  { title: '收集', copy: '看到有价值的 AI 回答或网页段落，直接保存到可记。' },
  { title: '整理', copy: '用文件夹、标签、收藏和置顶把材料归位。' },
  { title: '追问', copy: '对已保存的笔记生成思维导图，继续让 AI 帮你提炼。' },
]

const FEATURES = [
  {
    icon: FileText,
    title: '保留上下文',
    copy: '保存标题、正文、来源、时间和链接，让每条知识都有来处。',
  },
  {
    icon: Search,
    title: '快速找回',
    copy: '从网页笔记中心检索历史收藏，适合论文、调研、课程和产品资料。',
  },
  {
    icon: Bot,
    title: '笔记 AI 助手',
    copy: '通过你的服务器代理调用 AI，不在插件源码和发布包里暴露密钥。',
  },
  {
    icon: Shield,
    title: '账号同步',
    copy: '登录后同步到云端，每日 AI 免费额度跟账号绑定。',
  },
]

/** 官网落地页：独立设计体系，不依赖 Tailwind，样式见 site.css */
export default function SiteApp() {
  return (
    <main className="site-shell">
      <nav className="site-nav" aria-label="主导航">
        <a className="brand" href="#top" aria-label="可记首页">
          <img src="/app-icon.svg" alt="" />
          <span>可记</span>
        </a>
        <div className="nav-links">
          <a href="#features">能力</a>
          <a href="#privacy">安全</a>
          <a href="#install">安装</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI 时代的知识收藏夹</p>
          <h1>可记</h1>
          <p className="hero-lede">
            把散落在 AI 对话、网页资料和研究过程里的好内容，保存成能搜索、能整理、能继续追问的个人知识库。
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#install">
              <Download size={18} />
              获取插件
            </a>
            <a className="secondary-action" href="#features">
              查看能力
              <ArrowRight size={18} />
            </a>
          </div>
        </div>

        <div className="hero-board" aria-label="可记产品预览">
          <div className="capture-strip">
            <span>Gemini 回答</span>
            <span>保存到：论文调研</span>
          </div>
          <div className="note-card main-note">
            <div className="note-kicker">已保存片段</div>
            <h2>城市化经济与知识溢出</h2>
            <p>跨行业聚集带来互补性，咖啡馆里的工程师交流也可能成为新技术灵感。</p>
            <div className="tag-row">
              <span>城市经济</span>
              <span>研究素材</span>
              <span>Gemini</span>
            </div>
          </div>
          <div className="ai-card">
            <Sparkles size={18} />
            <span>生成思维导图</span>
            <strong>今日 3 / 10</strong>
          </div>
          <div className="search-card">
            <Search size={17} />
            <span>搜索：聚合效应</span>
          </div>
        </div>
      </section>

      <section className="proof-band">
        {PROOF_POINTS.map((item) => (
          <div className="proof-item" key={item}>
            <Check size={16} />
            <span>{item}</span>
          </div>
        ))}
      </section>

      <section className="workflow-section">
        <div>
          <p className="section-label">工作流</p>
          <h2>从“看到好内容”到“真正用起来”</h2>
        </div>
        <div className="workflow-grid">
          {WORKFLOW.map((step, index) => (
            <article className="workflow-card" key={step.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section" id="features">
        <div className="feature-heading">
          <p className="section-label">能力</p>
          <h2>为反复使用而设计，而不是只保存一次</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <article className="feature-card" key={feature.title}>
                <Icon size={22} />
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="security-section" id="privacy">
        <div className="security-mark">
          <ShieldCheck size={38} />
        </div>
        <div>
          <p className="section-label">安全</p>
          <h2>AI 密钥只放在你的服务器</h2>
          <p>
            可记插件通过 <strong>https://keji.asia/api</strong> 请求你的服务器代理。真实 AI API Key 只保存在服务器
            <strong> .env </strong> 里，不进入插件源码，也不进入可分发的 <strong>dist</strong> 包。
          </p>
        </div>
      </section>

      <section className="install-section" id="install">
        <p className="section-label">安装</p>
        <h2>当前版本准备通过浏览器扩展包分发</h2>
        <p>
          备案完成后，下一步是配好 HTTPS、部署产品主页，并完成 AI 代理链路联调。插件发布包会从项目的
          <strong> dist </strong> 目录生成。
        </p>
        <a className="primary-action" href="mailto:hello@keji.asia">
          联系获取
          <ArrowRight size={18} />
        </a>
      </section>
    </main>
  )
}
