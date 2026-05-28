/** File System Access API 类型声明 */
interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory'
  values(): AsyncIterableIterator<FileSystemHandle>
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>
  getFileHandle(name: string): Promise<FileSystemFileHandle>
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>
  close(): Promise<void>
}

interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  showOpenFilePicker(options?: any): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(options?: any): Promise<FileSystemFileHandle>
}
