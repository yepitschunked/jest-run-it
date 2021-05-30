import * as vscode from 'vscode';

import {
  TestsExplorerDataProvider,
  Testable,
} from './testsExplorerDataProvider';
import { DEFAULT_TEST_FILE_PATTERNS } from './constants';
import { getConfig, ConfigOption } from './config';
import { JestDoItCodeLensProvider } from './jestDoItCodeLensProvider';
import { runTest, debugTest, TestResultsAndOutput } from './commands';
import { ArgumentQuotesMode } from './types';
import GutterDecorations from './gutterDecorations';
import TestResultsViewProvider from './testResultsViewProvider';
import { NamedBlock } from 'jest-editor-support';

export const quoteArgument = (argumentToQuote: string, quotesToUse?: ArgumentQuotesMode): string => {
  // Decide which quotes to use
  if (quotesToUse === undefined) {
    quotesToUse = (getConfig(ConfigOption.ArgumentQuotesToUse) as ArgumentQuotesMode) || 'auto';
  }
  if (quotesToUse === 'auto') {
    // Note: maybe we should not quote argument if it does not contain spaces?
    quotesToUse = process.platform === 'win32' ? 'double' : 'single';
  }

  switch (quotesToUse) {
    case 'double':
      return `"${argumentToQuote.replace(/"/g, '\\"')}"`;
    case 'single':
      return `'${argumentToQuote.replace(/'/g, '\\\'')}'`;
    default:
      return argumentToQuote;
  }
};

export const quoteTestName = (testName: string, quotesToUse?: ArgumentQuotesMode) => {
  // We pass test name exactly as it typed in the source code, but jest expects a regex pattern to match.
  // We must escape characters having a special meaning in regex, otherwise jest will not match the test.
  // For example, jest -t 'My test (snapshot)' will simply not match corresponding test (because of parens).
  // The correct command would be jest -t 'My test \(snapshot\)'
  const escapedTestName = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return quoteArgument(escapedTestName, quotesToUse);
};

export const getTerminal = (terminalName: string) => {
  return vscode.window.terminals.find(t => t.name === terminalName);
};

const runTestFromExplorer = (testable: Testable) => {
  const fullName = [...testable.ancestors.map(t => t.label), testable.label].join(' ');
  runTest(testable.file, fullName);
};

const debugTestFromExplorer = (testable: Testable) => {
  debugTest(testable.file, testable.label);
};

const runTestFromEditor = (uri: vscode.Uri) => {
  const filePath = uri.fsPath;
  runTest(filePath);
};

const debugTestFromEditor = (uri: vscode.Uri) => {
  const filePath = uri.fsPath;
  debugTest(filePath);
};

export const activate = (context: vscode.ExtensionContext) => {
  const testsExplorerDataProvider = new TestsExplorerDataProvider(context);
  const gutterDecorationsProvider = new GutterDecorations(context);
  const testResultsViewProvider = new TestResultsViewProvider(context);
  const handle = vscode.window.registerWebviewViewProvider('jestRunItTestResultsView', testResultsViewProvider, { webviewOptions: { retainContextWhenHidden: true } });
  context.subscriptions.push(handle);
  const treeView = vscode.window.createTreeView('jestRunItTestsExplorer', {
    treeDataProvider: testsExplorerDataProvider
  });

  const runTestCommand = vscode.commands.registerCommand(
    'jestRunItCodeLens.runTest',
    runTest
  );
  context.subscriptions.push(runTestCommand);

  const debugTestCommand = vscode.commands.registerCommand(
    'jestRunItCodeLens.debugTest',
    debugTest
  );
  context.subscriptions.push(debugTestCommand);

  const updateSnapshotFromExplorerCommand = vscode.commands.registerCommand(
    'jestRunItCodeLens.updateSnapshots',
    (filePath: string, testName?: string) => runTest(filePath, testName, /*updateSnapshots*/true)
  );
  context.subscriptions.push(updateSnapshotFromExplorerCommand);

  const runTestFromExplorerCommand = vscode.commands.registerCommand(
    'jestRunItTestsExplorer.runTest',
    (testable: Testable) => {
      runTestFromExplorer(testable);
    }
  );
  context.subscriptions.push(runTestFromExplorerCommand);

  const testStartedCommand = vscode.commands.registerCommand(
    'jestRunIt.testStarted',
    (file: string, fullName: string) => {
      testsExplorerDataProvider.testStarted(file, fullName);
    }
  );
  context.subscriptions.push(runTestFromExplorerCommand);

  const debugTestFromExplorerCommand = vscode.commands.registerCommand(
    'jestRunItTestsExplorer.debugTest',
    debugTestFromExplorer
  );
  context.subscriptions.push(debugTestFromExplorerCommand);

  const runTestFromEditorCommand = vscode.commands.registerCommand(
    'jestRunItTestsEditor.runTest',
    runTestFromEditor
  );
  context.subscriptions.push(runTestFromEditorCommand);

  const debugTestFromEditorCommand = vscode.commands.registerCommand(
    'jestRunItTestsEditor.debugTest',
    debugTestFromEditor
  );
  context.subscriptions.push(debugTestFromEditorCommand);

  const receiveResults = vscode.commands.registerCommand(
    'jestRunIt.receiveTestResults',
    (resultAndOutput: TestResultsAndOutput) => {
      testsExplorerDataProvider.receiveTestData(resultAndOutput?.result?.testResults);
      gutterDecorationsProvider.decorate(resultAndOutput?.result);
      testResultsViewProvider.receiveTestResults(resultAndOutput);
      vscode.commands.executeCommand('jestRunIt.focusTest', undefined)
    }
  );
  context.subscriptions.push(receiveResults);

  const focusTest = vscode.commands.registerCommand(
    'jestRunIt.focusTest',
    (test?: Testable) => {
      if (test) {
        vscode.commands.executeCommand('editor.action.goToLocations',
          vscode.window.activeTextEditor?.document.uri,
          vscode.window.activeTextEditor?.selection.active,
          [test.location],
          'goto',
          'never',
        );
        treeView.reveal(test);
      } else if (testsExplorerDataProvider.root) {
        treeView.reveal(testsExplorerDataProvider.root)
      }
      testResultsViewProvider.focusTest(test);
    }
  );
  context.subscriptions.push(focusTest);

  const clearDecorationsCommand = vscode.commands.registerCommand(
    'jestRunIt.clearDecorations',
    () => gutterDecorationsProvider.reset()
  );
  context.subscriptions.push(clearDecorationsCommand);

  let patterns = [];
  const testMatchPatternsConfig = getConfig(
    ConfigOption.TestMatchPatterns
  ) as Array<string>;
  if (Array.isArray(testMatchPatternsConfig)) {
    patterns = testMatchPatternsConfig.map(tm => ({
      pattern: tm,
      scheme: 'file',
    }));
  } else {
    // Default patterns
    patterns = DEFAULT_TEST_FILE_PATTERNS.map(tm => ({
      pattern: tm,
      scheme: 'file',
    }));
  }

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
    patterns,
    new JestDoItCodeLensProvider()
  );
  context.subscriptions.push(codeLensProviderDisposable);
};

// this method is called when your extension is deactivated
export function deactivate() { }
