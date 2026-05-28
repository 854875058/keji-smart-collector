#!/usr/bin/env python3
"""测试 Native Host 的 get_vault_path 功能"""
import json
import struct
import subprocess
import sys

def send_and_receive(proc, message):
    encoded = json.dumps(message, ensure_ascii=False).encode('utf-8')
    proc.stdin.write(struct.pack('=I', len(encoded)))
    proc.stdin.write(encoded)
    proc.stdin.flush()

    raw_len = proc.stdout.read(4)
    if not raw_len:
        return None
    length = struct.unpack('=I', raw_len)[0]
    data = proc.stdout.read(length).decode('utf-8')
    return json.loads(data)

proc = subprocess.Popen(
    [sys.executable, 'host.py'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd=r'E:\工作\国信\AI数据集项目\测试文件夹\可记-智能收藏助手\native-host'
)

# 测试 get_vault_path
result = send_and_receive(proc, {'action': 'get_vault_path', 'payload': {}})
print(f'get_vault_path: {json.dumps(result, ensure_ascii=False, indent=2)}')

# 测试 list_vault_folders
result2 = send_and_receive(proc, {'action': 'list_vault_folders', 'payload': {'path': 'E:\\文档'}})
if result2 and result2.get('success'):
    folders = result2['data']['folders']
    print(f'\nlist_vault_folders: 找到 {len(folders)} 个文件夹')
    for f in folders:
        print(f'  - {f["name"]} ({f["mdCount"]} 篇)')
else:
    print(f'\nlist_vault_folders: {json.dumps(result2, ensure_ascii=False)}')

proc.terminate()
