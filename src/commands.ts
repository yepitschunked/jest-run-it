import * as vscode from 'vscode';

import {
  DEFAULT_JEST_PATH,
  DEFAULT_JEST_DEBUG_PATH_WINDOWS,
} from './constants';
import { getConfig, ConfigOption } from './config';
import { quoteTestName } from './extension';
import { JestTotalResults, Runner } from 'jest-editor-support';
// @ts-expect-error typedefs are broken
import { createProjectWorkspace } from 'jest-editor-support/build/project_workspace';

const convertEnvVariablesToObj = (env: string) => {
  const obj = (env.split(' ') as string[])
    .filter((v: string) => !!v)
    .reduce((acc, v) => {
      const [key, val] = v.split('=');
      acc[key] = val;
      return acc;
    }, {} as { [key: string]: string });

  return obj;
};

export interface TestResultsAndOutput {
  result: JestTotalResults;
  output: string;
  params: {
    testName?: string;
    filePath: string;
  }
}

const outputChannel = vscode.window.createOutputChannel('jest');
export const runTest = (
  filePath: string,
  testName?: string,
  updateSnapshots = false
) => {
  vscode.commands.executeCommand('jestRunIt.clearDecorations');
  const jestPath = getConfig(ConfigOption.JestPath) || DEFAULT_JEST_PATH;
  const jestConfigPath = getConfig(ConfigOption.JestConfigPath);
  const runOptions = getConfig(ConfigOption.JestCLIOptions) as string[];
  const environmentVariables = getConfig(
    ConfigOption.EnvironmentVariables
  ) as string;

  vscode.commands.executeCommand('jestRunIt.receiveTestResults', null)
  vscode.commands.executeCommand('jestRunIt.testStarted', filePath, testName);

  const runner = new Runner(createProjectWorkspace({
    jestCommandLine: `${environmentVariables} ${jestPath}`,
    pathToConfig: jestConfigPath as string,
    rootPath: vscode.workspace.rootPath,
    localJestMajorVersion: 27,
  }), {
    testNamePattern: testName ? quoteTestName(testName) : undefined,
    //testFileNamePattern: quoteTestName(filePath),
    args: { args: [...runOptions, updateSnapshots ? '-u' : '', '--ci=false', '--runTestsByPath', filePath] },
  });

  let testResults: JestTotalResults;
  let testOutput: string[] = []

  runner.on('executableJSON', (data) => {
    testResults = data;
    outputChannel.append(JSON.stringify(data));
  });

  runner.on('executableOutput', (data) => {
    outputChannel.append(String(data))
    testOutput.push(data);
  });
  runner.on('executableStdErr', (data) => {
    outputChannel.append(String(data));
    testOutput.push(data);
  });
  runner.on('processExit', () => {
    vscode.commands.executeCommand('jestRunIt.receiveTestResults', {
      result: testResults,
      output: testOutput.join('\n'),
      params: {
        testName,
        filePath
      }
    })
  });

  runner.start(false, false);
};
export const debugTest = (filePath: string, testName?: string) => {
  const editor = vscode.window.activeTextEditor;
  const jestPath =
    getConfig(ConfigOption.JestPath) ||
    (process.platform === 'win32'
      ? DEFAULT_JEST_DEBUG_PATH_WINDOWS
      : DEFAULT_JEST_PATH);
  const jestConfigPath = getConfig(ConfigOption.JestConfigPath);
  const jestCLIOptions = getConfig(ConfigOption.JestCLIOptions) as string[];
  const environmentVarialbes = getConfig(
    ConfigOption.EnvironmentVariables
  ) as string;
  const args = [filePath];
  if (testName) {
    args.push('-t', quoteTestName(testName, 'none'));
  }
  if (jestConfigPath) {
    args.push('-c', jestConfigPath as string);
  }
  if (jestCLIOptions) {
    jestCLIOptions.forEach((option) => {
      args.push(option);
    });
  }
  args.push('--runInBand');
  const debugConfig: vscode.DebugConfiguration = {
    console: 'integratedTerminal',
    internalConsoleOptions: 'neverOpen',
    name: 'JestRunIt',
    program: '${workspaceFolder}/' + jestPath,
    request: 'launch',
    type: 'node',
    args,
    env: convertEnvVariablesToObj(environmentVarialbes),
  };
  vscode.debug.startDebugging(
    vscode.workspace.getWorkspaceFolder(editor!.document.uri),
    debugConfig
  );
};
