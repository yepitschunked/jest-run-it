import * as vscode from 'vscode';
import * as micromatch from 'micromatch';
import { JestFileResults, NamedBlock, parse, ParsedNode, TestResult } from 'jest-editor-support';

import { getConfig, ConfigOption } from './config';
import { DEFAULT_TEST_FILE_PATTERNS } from './constants';
import { TestableNode } from './types';


export class TestsExplorerDataProvider
  implements vscode.TreeDataProvider<Testable> {

  static treeDataEventEmitter: vscode.EventEmitter<
    Testable | undefined
  > = new vscode.EventEmitter<Testable | undefined>();

  static currentTestResults?: JestFileResults[];

  private _onDidChangeTreeData: vscode.EventEmitter<
    Testable | undefined
  > = TestsExplorerDataProvider.treeDataEventEmitter;

  readonly onDidChangeTreeData: vscode.Event<Testable | undefined> = this
    ._onDidChangeTreeData.event;

  static receiveTestData(data: any) {
    TestsExplorerDataProvider.currentTestResults = data;
    TestsExplorerDataProvider.treeDataEventEmitter.fire();
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
    this._onDidChangeTreeData.fire();
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
      TestsExplorerDataProvider.currentTestResults = undefined;
      vscode.commands.executeCommand(
        'setContext',
        'jestRunItActive',
        false
      );
    }
  }

  getTreeItem(element: Testable): vscode.TreeItem {
    if (TestsExplorerDataProvider.currentTestResults) {
      const resultsForFile = TestsExplorerDataProvider.currentTestResults.find(res => res.name === element.file);
      if (element.collapsibleState === vscode.TreeItemCollapsibleState.None) {
        // Leaf node, must match one of our assertions
        const assertionResults = resultsForFile?.assertionResults.find(res => res.title === element.label);
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
          label: `${icon}${element.label}`,
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
            child.children,
            child.type === 'it'
              ? vscode.TreeItemCollapsibleState.None
              : vscode.TreeItemCollapsibleState.Expanded,
            {
              command: 'editor.action.goToLocations',
              title: 'open test',
              arguments: [
                vscode.window.activeTextEditor?.document.uri,
                vscode.window.activeTextEditor?.selection.active,
                [new vscode.Location(vscode.Uri.file(child.file), new vscode.Position(child.start.line, child.start.column))],
                'goto',
                'never',
              ]
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
            child.children ?? [],
            child.type === 'it'
              ? vscode.TreeItemCollapsibleState.None
              : vscode.TreeItemCollapsibleState.Expanded,
            {
              command: 'editor.action.goToLocations',
              title: 'open test',
              arguments: [
                vscode.window.activeTextEditor?.document.uri,
                vscode.window.activeTextEditor?.selection.active,
                [new vscode.Location(vscode.Uri.file(child.file), new vscode.Position(child.start.line, child.start.column))],
                'goto',
                'never',
              ]
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
    public readonly children: Array<NamedBlock> | undefined,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
  }

  contextValue = 'testable';
}
