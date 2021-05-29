import * as vscode from 'vscode';
import { runTest, TestResultsAndOutput } from './commands';
import * as path from 'path';
import { JestTotalResults, NamedBlock } from 'jest-editor-support';
import { Testable } from './testsExplorerDataProvider';

interface TestResultsUpdateSnapshotViewMessage {
  type: 'updateSnapshots';
  filePath: string;
  testName?: string;
};

type TestResultsViewMessage = TestResultsUpdateSnapshotViewMessage;

export default class TestResultsViewProvider implements vscode.WebviewViewProvider {

  public static readonly viewType = 'jestRunItTestResultsView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
  ) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [
        vscode.Uri.file(this._extensionContext.extensionPath)
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data: TestResultsViewMessage) => {
      switch (data.type) {
        case 'updateSnapshots':
          {
            runTest(data.filePath, data.testName, true);
            break;
          }
      }
    });
  }

  receiveTestResults(results?: TestResultsAndOutput) {
    this._view?.webview.postMessage({ type: 'testResults', data: results });
  }

  focusTest(test: Testable) {
    const { command, ...serializableTest } = test;
    this._view?.webview.postMessage({ type: 'focusTest', data: serializableTest });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionContext.extensionPath, 'resources', 'webview', 'main.js')));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <!--
          Use a content security policy to only allow loading images from https or from our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <title>Jest Test Results</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}