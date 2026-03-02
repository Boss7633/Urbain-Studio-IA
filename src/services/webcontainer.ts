import { WebContainer, WebContainerProcess } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let currentProcess: WebContainerProcess | null = null;

export async function getWebContainer() {
  console.log("Checking crossOriginIsolated:", window.crossOriginIsolated);
  
  if (webcontainerInstance) return webcontainerInstance;
  
  const isChromium = !!(window as any).chrome;
  if (!isChromium) {
    throw new Error("WebContainers only work in Chromium-based browsers (Chrome, Edge, Brave).");
  }

  if (!window.crossOriginIsolated) {
    console.error("Cross-Origin Isolation is NOT active.");
    throw new Error("SharedArrayBuffer transfer requires self.crossOriginIsolated. Please ensure COOP/COEP headers are set or coi-serviceworker is active.");
  }

  console.log("Booting WebContainer...");
  try {
    webcontainerInstance = await WebContainer.boot();
    console.log("WebContainer booted successfully.");
    return webcontainerInstance;
  } catch (error) {
    console.error("WebContainer boot failed:", error);
    throw error;
  }
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
