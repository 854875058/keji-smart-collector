#!/usr/bin/env python3
"""
可记 Obsidian Native Messaging Host

Chrome 扩展通过 Native Messaging API 与此脚本通信，
将笔记导出为 Markdown 文件到 Obsidian Vault，或从 Vault 导入笔记。

通信协议：
- 输入：从 stdin 读取 JSON（4 字节长度前缀 + JSON body）
- 输出：向 stdout 写入 JSON（同样格式）
"""

import sys
import json
import struct
import os
import re
import hashlib
from pathlib import Path


def read_message():
    """从 stdin 读取一条 Native Messaging 消息"""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack('=I', raw_length)[0]
    data = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(data)


def send_message(message):
    """向 stdout 写入一条 Native Messaging 消息"""
    encoded = json.dumps(message, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def ensure_directory(path):
    """确保目录存在"""
    os.makedirs(os.path.dirname(path), exist_ok=True)


# ── 导出功能 ──────────────────────────────────────────

def export_snippet(payload):
    """导出单条笔记到 Markdown 文件"""
    snippet = payload.get('snippet', {})
    file_path = payload.get('path', '')

    if not file_path:
        return {'success': False, 'error': '未指定文件路径'}

    markdown = generate_markdown(snippet)

    try:
        ensure_directory(file_path)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(markdown)
        return {'success': True, 'data': {'path': file_path}}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def generate_markdown(snippet):
    """生成 Obsidian 兼容的 Markdown"""
    lines = []
    lines.append('---')
    lines.append(f'title: "{escape_yaml(snippet.get("title", ""))}"')
    lines.append(f'source: {snippet.get("source", "Unknown")}')
    lines.append(f'url: "{snippet.get("url", "")}"')
    lines.append(f'created: {snippet.get("timestamp", "")}')

    tags = snippet.get('tags', [])
    if tags:
        tag_str = ', '.join(f'"{t}"' for t in tags)
        lines.append(f'tags: [{tag_str}]')

    folder = snippet.get('folder', '')
    if folder:
        lines.append(f'folder: "{escape_yaml(folder)}"')

    lines.append(f'keji_id: "{snippet.get("id", "")}"')

    if snippet.get('isFavourite'):
        lines.append('favourite: true')

    lines.append('---')
    lines.append('')
    lines.append(f'## 问题')
    lines.append(snippet.get('question', ''))
    lines.append('')
    lines.append(f'## 回答')
    lines.append(snippet.get('answer', ''))
    lines.append('')

    media = snippet.get('media', {})
    images = media.get('images', [])
    if images:
        lines.append('## 图片')
        for img in images:
            alt = img.get('alt', 'image')
            src = img.get('src', '')
            lines.append(f'![{alt}]({src})')
        lines.append('')

    lines.append('---')
    lines.append('*由可记智能收藏助手导出*')

    return '\n'.join(lines)


def escape_yaml(s):
    """转义 YAML 字符串"""
    return s.replace('"', '\\"').replace('\n', ' ')


# ── 导入功能 ──────────────────────────────────────────

def parse_frontmatter(content):
    """解析 YAML frontmatter"""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return {}, content

    fm_text = match.group(1)
    body = content[match.end():]
    meta = {}

    for line in fm_text.split('\n'):
        line = line.strip()
        if ':' in line:
            key, _, value = line.partition(':')
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            # 解析数组 [a, b, c]
            if value.startswith('[') and value.endswith(']'):
                items = value[1:-1].split(',')
                value = [item.strip().strip('"').strip("'") for item in items if item.strip()]

            # 解析布尔值
            if value == 'true':
                value = True
            elif value == 'false':
                value = False

            meta[key] = value

    return meta, body.strip()


def md_file_to_snippet(file_path, vault_path):
    """将 Markdown 文件转换为 snippet 对象"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return None

    meta, body = parse_frontmatter(content)

    # 计算相对路径作为文件夹名
    rel_path = os.path.relpath(file_path, vault_path)
    parts = Path(rel_path).parts
    folder = parts[0] if len(parts) > 1 else ''

    # 如果 frontmatter 里有 folder 字段，优先使用
    if 'folder' in meta:
        folder = meta['folder']

    # 生成稳定 ID（基于文件路径的 hash）
    file_hash = hashlib.md5(rel_path.encode('utf-8')).hexdigest()[:12]

    # 从 body 提取问题和回答
    question = meta.get('question', '')
    answer = body

    # 尝试从 body 中提取 ## 问题 和 ## 回答 结构
    q_match = re.search(r'##\s*问题\s*\n(.*?)(?=\n##|\Z)', body, re.DOTALL)
    a_match = re.search(r'##\s*回答\s*\n(.*?)(?=\n##|\Z)', body, re.DOTALL)
    if q_match:
        question = q_match.group(1).strip()
    if a_match:
        answer = a_match.group(1).strip()

    # 提取标签
    tags = meta.get('tags', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(',')]

    # 文件名作为标题
    title = meta.get('title', Path(file_path).stem)

    return {
        'id': f'obsidian-{file_hash}',
        'title': title,
        'question': question or 'Obsidian 导入',
        'answer': answer,
        'contentHtml': '',
        'source': meta.get('source', 'Obsidian'),
        'folder': folder,
        'tags': tags,
        'timestamp': meta.get('created', meta.get('date', '')) or get_file_timestamp(file_path),
        'url': meta.get('url', ''),
        'isFavourite': bool(meta.get('favourite', False)),
        'cloudStatus': 'none',
        'media': {'images': [], 'tables': []},
    }


def get_file_timestamp(file_path):
    """获取文件修改时间"""
    import datetime
    mtime = os.path.getmtime(file_path)
    return datetime.datetime.fromtimestamp(mtime).isoformat()


def import_vault(payload):
    """扫描 Vault 目录，导入所有 Markdown 文件"""
    vault_path = payload.get('path', '')
    subfolder = payload.get('subfolder', '')

    if not vault_path or not os.path.isdir(vault_path):
        return {'success': False, 'error': f'Vault 路径不存在: {vault_path}'}

    scan_path = os.path.join(vault_path, subfolder) if subfolder else vault_path

    snippets = []
    errors = []

    for root, dirs, files in os.walk(scan_path):
        # 跳过隐藏目录和附件目录
        dirs[:] = [d for d in dirs if not d.startswith('.') and d.lower() not in ('attachments', '.obsidian', '.trash')]

        for filename in files:
            if not filename.endswith('.md'):
                continue

            file_path = os.path.join(root, filename)
            snippet = md_file_to_snippet(file_path, vault_path)
            if snippet:
                snippets.append(snippet)
            else:
                errors.append(f'解析失败: {file_path}')

    return {
        'success': True,
        'data': {
            'snippets': snippets,
            'total': len(snippets),
            'errors': errors,
        }
    }


def list_vault_folders(payload):
    """列出 Vault 下的子文件夹"""
    vault_path = payload.get('path', '')
    if not vault_path or not os.path.isdir(vault_path):
        return {'success': False, 'error': f'Vault 路径不存在: {vault_path}'}

    folders = []
    for item in os.listdir(vault_path):
        item_path = os.path.join(vault_path, item)
        if os.path.isdir(item_path) and not item.startswith('.') and item.lower() not in ('attachments', '.obsidian', '.trash'):
            # 统计 md 文件数
            md_count = sum(1 for f in os.listdir(item_path) if f.endswith('.md'))
            folders.append({'name': item, 'mdCount': md_count})

    return {'success': True, 'data': {'folders': folders}}


# ── 其他功能 ──────────────────────────────────────────

def check_exists(payload):
    """检查文件是否存在"""
    path = payload.get('path', '')
    return {'success': True, 'data': {'exists': os.path.exists(path)}}


def get_vault_path():
    """获取配置的 Vault 路径"""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            path = config.get('vaultPath', '')
            if path and os.path.isdir(path):
                return {'success': True, 'data': {'path': path}}
    return {'success': False, 'error': '未配置 Vault 路径'}


def set_vault_path(payload):
    """设置 Vault 路径"""
    path = payload.get('path', '')
    if not path or not os.path.isdir(path):
        return {'success': False, 'error': f'路径不存在: {path}'}

    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

    config['vaultPath'] = path
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    return {'success': True, 'data': {'path': path}}


# ── 消息路由 ──────────────────────────────────────────

def handle_message(message):
    """处理接收到的消息"""
    action = message.get('action', '')
    payload = message.get('payload', {})

    handlers = {
        'export': lambda: export_snippet(payload),
        'export_batch': lambda: export_batch(payload),
        'import_vault': lambda: import_vault(payload),
        'list_vault_folders': lambda: list_vault_folders(payload),
        'check_exists': lambda: check_exists(payload),
        'get_vault_path': lambda: get_vault_path(),
        'set_vault_path': lambda: set_vault_path(payload),
    }

    handler = handlers.get(action)
    if handler:
        return handler()
    return {'success': False, 'error': f'未知操作: {action}'}


def export_batch(payload):
    """批量导出"""
    results = []
    for snippet in payload.get('snippets', []):
        vault_path = payload.get('path', '')
        folder = snippet.get('folder', '可记')
        filename = snippet.get('title', '未命名').replace('/', '_') + '.md'
        file_path = os.path.join(vault_path, folder, filename)
        results.append(export_snippet({'snippet': snippet, 'path': file_path}))
    return {'success': True, 'data': {'results': results}}


def main():
    """主循环：持续监听消息"""
    while True:
        message = read_message()
        if message is None:
            break
        response = handle_message(message)
        send_message(response)


if __name__ == '__main__':
    main()
