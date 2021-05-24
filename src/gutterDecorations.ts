import * as vscode from 'vscode';
import { JestFileResults, JestTotalResults, NamedBlock, parse, ParsedNode, TestResult } from 'jest-editor-support';


export default class GutterDecorations {
  context: vscode.ExtensionContext;

  passingDecoration: vscode.TextEditorDecorationType;
  failingDecoration: vscode.TextEditorDecorationType;


  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.passingDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.context.asAbsolutePath('./resources/icons/green.svg').toString(),
      isWholeLine: true,
    })
    this.failingDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.context.asAbsolutePath('./resources/icons/red.svg').toString(),
      isWholeLine: true,
    })
  }

  decorate(totalResults?: JestTotalResults) {
    const filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const result = totalResults?.testResults.find(res => res.name === filePath);
    if (!result || !filePath) {
      return;
    }
    // TODO: don't reparse files redundantly here and in explorer
    const parsed = parse(filePath);

    const passedDecorations: vscode.DecorationOptions[] = [];
    const failedDecorations: vscode.DecorationOptions[] = [];

    parsed.itBlocks.forEach((itBlock) => {
      const resultForBlock = result.assertionResults.find(res => res.title === itBlock.name);
      const range = new vscode.Range(
        new vscode.Position(itBlock.start.line, itBlock.start.column),
        new vscode.Position(itBlock.end.line, itBlock.end.column)
      )
      if (resultForBlock?.status === 'passed') {
        passedDecorations.push({ range });
      } else if (resultForBlock?.status === 'failed') {
        failedDecorations.push({ range });
      }
    });

    vscode.window.activeTextEditor?.setDecorations(this.passingDecoration, passedDecorations);
    vscode.window.activeTextEditor?.setDecorations(this.failingDecoration, failedDecorations);
  }

  reset() {
    vscode.window.activeTextEditor?.setDecorations(this.passingDecoration, []);
    vscode.window.activeTextEditor?.setDecorations(this.failingDecoration, []);
  }
}