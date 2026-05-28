#!/usr/bin/env python3
"""
可记 Obsidian Native Messaging Host

Chrome 扩展通过 Native Messaging API 与此脚本通信，
将笔记导出为 Markdown 文件到 Obsidian Vault。

通信协议：
- 输入：从 stdin 读取 JSON（4 字节长度前缀 + JSON body）
- 输出：向 stdout 写入 JSON（同样格式）
"""

import sys
import json
import struct
import os
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
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def ensure_directory(path):
    """确保目录存在"""
    os.makedirs(os.path.dirname(path), exist_ok=True)


def export_snippet(payload):
    """导出单条笔记到 Markdown 文件"""
    snippet = payload.get('snippet', {})
    file_path = payload.get('path', '')

    if not file_path:
        return {'success': False, 'error': '未指定文件路径'}

    # 生成 Markdown 内容
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

    # 图片
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


def check_exists(payload):
    """检查文件是否存在"""
    path = payload.get('path', '')
    return {
        'success': True,
        'data': {'exists': os.path.exists(path)}
    }


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


def handle_message(message):
    """处理接收到的消息"""
    action = message.get('action', '')
    payload = message.get('payload', {})

    if action == 'export':
        return export_snippet(payload)
    elif action == 'export_batch':
        results = []
        for snippet in payload.get('snippets', []):
            vault_path = payload.get('path', '')
            folder = snippet.get('folder', '可记')
            filename = snippet.get('title', '未命名').replace('/', '_') + '.md'
            file_path = os.path.join(vault_path, folder, filename)
            results.append(export_snippet({'snippet': snippet, 'path': file_path}))
        return {'success': True, 'data': {'results': results}}
    elif action == 'check_exists':
        return check_exists(payload)
    elif action == 'get_vault_path':
        return get_vault_path()
    else:
        return {'success': False, 'error': f'未知操作: {action}'}


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
