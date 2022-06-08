import { useEffect, useState } from 'react';

import type Monaco from 'monaco-editor';
import type { RuleDetails } from '../types';
import type {
  createTypeScriptSandbox,
  SandboxConfig,
} from '../../vendor/sandbox';

import { WebLinter } from '../linter/WebLinter';
import { sandboxSingleton } from './loadSandbox';
import { editorEmbedId } from './EditorEmbed';
import { useColorMode } from '@docusaurus/theme-common';
import { createCompilerOptions } from '@site/src/components/editor/config';

export interface SandboxServicesProps {
  readonly jsx?: boolean;
  readonly onLoaded: (
    ruleDetails: RuleDetails[],
    tsVersions: readonly string[],
  ) => void;
  readonly ts: string;
}

export type SandboxInstance = ReturnType<typeof createTypeScriptSandbox>;

export interface SandboxServices {
  main: typeof Monaco;
  sandboxInstance: SandboxInstance;
  webLinter: WebLinter;
}

export const useSandboxServices = (
  props: SandboxServicesProps,
): Error | SandboxServices | undefined => {
  const [services, setServices] = useState<Error | SandboxServices>();
  const [loadedTs, setLoadedTs] = useState<string>(props.ts);
  const { colorMode } = useColorMode();

  useEffect(() => {
    if (props.ts !== loadedTs) {
      window.location.reload();
    }
  }, [props.ts, loadedTs]);

  useEffect(() => {
    let sandboxInstance: SandboxInstance | undefined;
    setLoadedTs(props.ts);

    sandboxSingleton(props.ts)
      .then(async ({ main, sandboxFactory, ts, lintUtils }) => {
        const compilerOptions = createCompilerOptions(props.jsx);

        const sandboxConfig: Partial<SandboxConfig> = {
          text: '',
          monacoSettings: {
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            autoIndent: 'full',
            formatOnPaste: true,
            formatOnType: true,
            wrappingIndent: 'same',
          },
          acquireTypes: false,
          compilerOptions: compilerOptions,
          domID: editorEmbedId,
        };

        sandboxInstance = sandboxFactory.createTypeScriptSandbox(
          sandboxConfig,
          main,
          ts,
        );
        sandboxInstance.monaco.editor.setTheme(
          colorMode === 'dark' ? 'vs-dark' : 'vs-light',
        );

        let libEntries: Map<string, string> | undefined;
        const worker = await sandboxInstance.getWorkerProcess();
        if (worker.getLibFiles) {
          libEntries = new Map(
            Object.entries((await worker.getLibFiles()) ?? {}),
          );
        } else {
          // for some older version of playground we do not have definitions available
          libEntries = await sandboxInstance.tsvfs.createDefaultMapFromCDN(
            {
              lib: ['es6', 'dom'],
            },
            props.ts,
            true,
            window.ts,
          );
          libEntries.forEach((value, path) => {
            sandboxInstance!.monaco.languages.typescript.typescriptDefaults.addExtraLib(
              value,
              path,
            );
          });
        }

        const system = sandboxInstance.tsvfs.createSystem(new Map(libEntries));

        const webLinter = new WebLinter(system, compilerOptions, lintUtils);

        props.onLoaded(webLinter.ruleNames, sandboxInstance.supportedVersions);

        setServices({
          main,
          sandboxInstance,
          webLinter,
        });
      })
      .catch(setServices);

    return (): void => {
      if (!sandboxInstance) {
        return;
      }

      const editorModel = sandboxInstance.editor.getModel()!;
      sandboxInstance.monaco.editor.setModelMarkers(
        editorModel,
        sandboxInstance.editor.getId(),
        [],
      );
      sandboxInstance.editor.dispose();
      editorModel.dispose();
      const models = sandboxInstance.monaco.editor.getModels();
      for (const model of models) {
        model.dispose();
      }
    };
  }, [props.ts]);

  return services;
};
