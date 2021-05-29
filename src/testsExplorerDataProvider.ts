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
  testingElement?: Testable;

  receiveTestData(data: JestFileResults[]) {
    this.currentTestResults = data;
    this.testingElement = undefined;
    this.refresh();
  }

  context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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

  testStarted(element: Testable) {
    this.testingElement = element;
    this.refresh();
  }

  getTreeItem(element: Testable): vscode.TreeItem {
    const augmentedTreeItem = {
      ...element,
      command: {
        command: 'jestRunIt.focusTest',
        title: 'focus test',
        arguments: [element]
      }
    };
    if (this.currentTestResults) {
      const resultsForFile = this.currentTestResults.find(res => res.name === element.file);
      if (element.collapsibleState === vscode.TreeItemCollapsibleState.None) {
        // Leaf node, must match one of our assertions
        const assertionResults = resultsForFile?.assertionResults.find(res => {
          // @ts-expect-error handle pending tests wtf
          return (element.id === res.fullName) && (res.status !== 'pending')
        });
        let icon: string = '';
        switch (assertionResults?.status) {
          case 'passed':
            icon = '✅';
            break;
          case 'failed':
            icon = '❌';
            break;
          default:
            icon = '⚠️';
        }
        augmentedTreeItem.label = `${icon} ${augmentedTreeItem.label}`;
      }
    }
    const testingElementTitle = this.testingElement ? [...(this.testingElement.ancestors.map(a => a.label)), this.testingElement.label].join(' ') : undefined;
    if (testingElementTitle && element.id!.includes(testingElementTitle)) {
      augmentedTreeItem.iconPath = this.context.asAbsolutePath('resources/icons/spinner.png');
    }

    return augmentedTreeItem;
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
            new vscode.Location(vscode.Uri.file(child.file), new vscode.Position(child.start.line, child.start.column))
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
            new vscode.Location(vscode.Uri.file(child.file), new vscode.Position(child.start.line, child.start.column))
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
    public readonly location: vscode.Location,
    public command?: vscode.Command,
    public readonly iconPath?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.iconPath = iconPath;
    this.id = [...ancestors.map(a => a.label), label].join(' ');
  }

  contextValue = 'testable';
}
