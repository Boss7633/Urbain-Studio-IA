export interface FileSystemItem {
  name: string;
  content: string;
  type: 'file' | 'directory';
  path: string;
}

export interface ProjectState {
  files: Record<string, string>;
  currentFile: string | null;
  status: 'idle' | 'generating' | 'installing' | 'building' | 'running' | 'error';
  logs: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: number;
}
