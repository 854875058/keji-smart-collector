import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Quote, Code,
  Highlighter, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, RemoveFormatting,
} from 'lucide-react'

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB

interface Props {
  initialHtml?: string
  onChange?: (data: { html: string; text: string }) => void
  minHeightClassName?: string
  toolbarStickyTopClassName?: string
}

export function RichTextEditor({
  initialHtml = '',
  onChange,
  minHeightClassName = 'min-h-[400px]',
  toolbarStickyTopClassName = 'top-0',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageToast, setImageToast] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Image,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none dark:prose-invert ${minHeightClassName} px-4 py-3`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.({
        html: editor.getHTML(),
        text: editor.getText(),
      })
    },
  })

  useEffect(() => {
    if (editor && initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml, false)
    }
  }, [initialHtml])

  const insertImageFromFile = useCallback((file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      setImageToast(`图片大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 2MB 限制`)
      setTimeout(() => setImageToast(null), 3000)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      editor?.chain().focus().setImage({ src: dataUrl }).run()
    }
    reader.readAsDataURL(file)
  }, [editor])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        event.preventDefault()
        const file = item.getAsFile()
        if (file) insertImageFromFile(file)
        return
      }
    }
  }, [insertImageFromFile])

  const handleImageAction = useCallback(() => {
    const choice = window.confirm('点击"确定"从本地上传图片，点击"取消"输入图片 URL')
    if (choice) {
      fileInputRef.current?.click()
    } else {
      const url = window.prompt('输入图片 URL:')
      if (url) editor?.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  if (!editor) return null

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white dark:border-slate-700 dark:bg-slate-800">
      {/* 图片大小提示 */}
      {imageToast && (
        <div className="px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
          {imageToast}
        </div>
      )}

      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) insertImageFromFile(file)
          e.target.value = ''
        }}
      />

      {/* 工具栏 */}
      <div className={`sticky ${toolbarStickyTopClassName} z-20 flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95`}>
        <ToolbarBtn
          icon={<Bold className="h-4 w-4" />}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="粗体"
        />
        <ToolbarBtn
          icon={<Italic className="h-4 w-4" />}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        />
        <ToolbarBtn
          icon={<UnderlineIcon className="h-4 w-4" />}
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        />
        <ToolbarBtn
          icon={<Strikethrough className="h-4 w-4" />}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 dark:bg-slate-600" />

        <ToolbarBtn
          icon={<Heading1 className="h-4 w-4" />}
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="标题 1"
        />
        <ToolbarBtn
          icon={<Heading2 className="h-4 w-4" />}
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="标题 2"
        />
        <ToolbarBtn
          icon={<Heading3 className="h-4 w-4" />}
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="标题 3"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 dark:bg-slate-600" />

        <ToolbarBtn
          icon={<List className="h-4 w-4" />}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        />
        <ToolbarBtn
          icon={<ListOrdered className="h-4 w-4" />}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        />
        <ToolbarBtn
          icon={<Quote className="h-4 w-4" />}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用"
        />
        <ToolbarBtn
          icon={<Code className="h-4 w-4" />}
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="代码块"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 dark:bg-slate-600" />

        <ToolbarBtn
          icon={<AlignLeft className="h-4 w-4" />}
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="左对齐"
        />
        <ToolbarBtn
          icon={<AlignCenter className="h-4 w-4" />}
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="居中"
        />
        <ToolbarBtn
          icon={<AlignRight className="h-4 w-4" />}
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="右对齐"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 dark:bg-slate-600" />

        <ToolbarBtn
          icon={<Highlighter className="h-4 w-4" />}
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="高亮"
        />
        <ToolbarBtn
          icon={<LinkIcon className="h-4 w-4" />}
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('输入链接 URL:')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          title="插入链接"
        />
        <ToolbarBtn
          icon={<ImageIcon className="h-4 w-4" />}
          onClick={handleImageAction}
          title="插入图片（本地上传或输入URL）"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 dark:bg-slate-600" />

        <ToolbarBtn
          icon={<RemoveFormatting className="h-4 w-4" />}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="清除格式"
        />
        <ToolbarBtn
          icon={<Undo className="h-4 w-4" />}
          onClick={() => editor.chain().focus().undo().run()}
          title="撤销"
          disabled={!editor.can().undo()}
        />
        <ToolbarBtn
          icon={<Redo className="h-4 w-4" />}
          onClick={() => editor.chain().focus().redo().run()}
          title="重做"
          disabled={!editor.can().redo()}
        />
      </div>

      {/* 编辑区 */}
      <div onPaste={handlePaste}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarBtn({
  icon, active, onClick, title, disabled,
}: {
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
    </button>
  )
}
