import { WebContainer, WebContainerProcess } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let currentProcess: WebContainerProcess | null = null;

export async function getWebContainer() {
  if (webcontainerInstance) return webcontainerInstance;
  
  if (!window.crossOriginIsolated) {
    throw new Error("SharedArrayBuffer transfer requires self.crossOriginIsolated. Please ensure COOP/COEP headers are set or coi-serviceworker is active.");
  }

  webcontainerInstance = await WebContainer.boot();
  return webcontainerInstance;
}

export async function mountFiles(webcontainer: WebContainer, files: Record<string, string>) {
  const fileSystemTree: any = {};

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/');
    let current = fileSystemTree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = {
          file: {
            contents: content,
          },
        };
      } else {
        if (!current[part]) {
          current[part] = {
            directory: {},
          };
        }
        current = current[part].directory;
      }
    }
  }

  await webcontainer.mount(fileSystemTree);
}

export async function runCommand(webcontainer: WebContainer, command: string, args: string[], onData: (data: string) => void) {
  if (currentProcess) {
    currentProcess.kill();
  }
  
  currentProcess = await webcontainer.spawn(command, args);
  currentProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        onData(data);
      },
    })
  );
  return currentProcess.exit;
}
