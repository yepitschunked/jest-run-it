import * as vscode from 'vscode';
import * as micromatch from 'micromatch';
import { JestFileResults, JestTotalResults, NamedBlock, parse, ParsedNode, TestResult } from 'jest-editor-support';

import { getConfig, ConfigOption } from './config';
import { DEFAULT_TEST_FILE_PATTERNS } from './constants';
import { TestableNode } from './types';


export class TestsExplorerDataProvider
  implements vscode.TreeDataProvider<Testable> {

  static treeDataEventEmitter: vscode.EventEmitter<
    Testable | undefined
  > = new vscode.EventEmitter<Testable | undefined>();

  private _onDidChangeTreeData: vscode.EventEmitter<
    Testable | undefined
  > = TestsExplorerDataProvider.treeDataEventEmitter;

  readonly onDidChangeTreeData: vscode.Event<Testable | undefined> = this
    ._onDidChangeTreeData.event;

  currentTestResults: JestFileResults[] | undefined;

  receiveTestData(data: JestFileResults[]) {
    this.currentTestResults = data;
    this.refresh();
  }

  constructor() {
    vscode.window.onDidChangeActiveTextEditor(() =>
      this.onActiveEditorChanged()
    );
    vscode.workspace.onDidSaveTextDocument(() => {
      const editor = vscode.window.activeTextEditor;
      const filePath = editor?.document.uri.fsPath;
      const testMatchPatternsConfig = getConfig(
        ConfigOption.TestMatchPatterns
      ) as Array<string>;

      const patterns = Array.isArray(testMatchPatternsConfig)
        ? testMatchPatternsConfig
        : DEFAULT_TEST_FILE_PATTERNS;
      if (filePath) {
        const jestRunItActive = micromatch.isMatch(filePath, patterns);
        if (jestRunItActive) {
          this.refresh();
        }
      }
    });
    // Call the first time
    this.onActiveEditorChanged();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  onActiveEditorChanged(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (editor.document.uri.scheme === 'file') {
        const filePath = editor.document.uri.fsPath;
        const testMatchPatternsConfig = getConfig(
          ConfigOption.TestMatchPatterns
        ) as Array<string>;

        const patterns = Array.isArray(testMatchPatternsConfig)
          ? testMatchPatternsConfig
          : DEFAULT_TEST_FILE_PATTERNS;

        const jestRunItActive = micromatch.isMatch(filePath, patterns);

        vscode.commands.executeCommand(
          'setContext',
          'jestRunItActive',
          jestRunItActive
        );
        if (jestRunItActive) {
          this.refresh();
        }
      }
    } else {
      this.currentTestResults = undefined;
      vscode.commands.executeCommand(
        'setContext',
        'jestRunItActive',
        false
      );
    }
  }

  getTreeItem(element: Testable): vscode.TreeItem {
    if (this.currentTestResults) {
      const resultsForFile = this.currentTestResults.find(res => res.name === element.file);
      if (element.collapsibleState === vscode.TreeItemCollapsibleState.None) {
        // Leaf node, must match one of our assertions
        // @ts-expect-error handle pending tests wtf
        const assertionResults = resultsForFile?.assertionResults.find(res => res.title === element.label && res.status !== 'pending');
        let icon: string = '';
        switch (assertionResults?.status) {
          case 'passed':
            icon = '✅ ';
            break;
          case 'failed':
            icon = '❌ ';
            break;
          default:
            icon = '⚠️ ';
        }
        return {
          ...element,
          label: `${icon}${element.label} wtf`,
        };
      }
    }
    return element;
  }

  getChildren(element?: Testable): Thenable<Testable[]> | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    let elements: Testable[] = [];

    if (element) {
      if (element.children) {
        elements = element.children.map(child => {
          return new Testable(
            child.name,
            child.file,
            [...element.ancestors, element],
            // @ts-expect-error typedefs are broken
            child.children,
            child.type === 'it'
              ? vscode.TreeItemCollapsibleState.None
              : vscode.TreeItemCollapsibleState.Expanded,
            {
              command: 'jestRunIt.focusTest',
              title: 'focus test',
              arguments: [child]
            },
          );
        });
      }
    } else {
      const filePath = editor.document.uri.fsPath;
      const parsed = parse(filePath);
      const children = (parsed.root.children as unknown) as Array<NamedBlock>;

      if (children) {
        elements = children.map(child => {
          return new Testable(
            child.name ?? child.file,
            child.file,
            [],
            // @ts-expect-error typedefs are broken
            child.children ?? [],
            child.type === 'it'
              ? vscode.TreeItemCollapsibleState.None
              : vscode.TreeItemCollapsibleState.Expanded,
            {
              command: 'jestRunIt.focusTest',
              title: 'focus test',
              arguments: [child]
            },
          );
        });
      }
    }

    return elements.length > 0 ? Promise.resolve(elements) : null;
  }
}

export class Testable extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly file: string,
    public readonly ancestors: Array<Testable>,
    public readonly children: Array<NamedBlock> | undefined,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
  }

  contextValue = 'testable';
}
