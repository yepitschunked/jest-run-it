import { TestResultsAndOutput } from '../commands';
import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import type { Testable } from '../testsExplorerDataProvider';
type vsCodeApi = <State>() => ({
  postMessage(message: any): void;
  getState<State>(): any;
  setState(state: State): void;
})
declare var acquireVsCodeApi: vsCodeApi;

const vscode = acquireVsCodeApi();

const Main = () => {
  const [testResults, updateTestResults] = useState<TestResultsAndOutput | null>(null);
  const [focusedTest, updateFocusedTest] = useState<Testable | null>(null);
  useEffect(() => {
    // Handle messages sent from the extension to the webview
    const callback = (event: any) => {
      const message = event.data; // The json data that the extension sent
      switch (message.type) {
        case 'testResults':
          {
            updateTestResults(message.data);
            break;
          }
        case 'focusTest':
          {
            updateFocusedTest(message.data);
            break;
          }
      }
    }
    window.addEventListener('message', callback);

    return () => window.removeEventListener('message', callback)
  }, [])

  const focusedAssertions = focusedTest &&
    testResults?.result
      .testResults
      .find(r => r.name === focusedTest.file)?.assertionResults
      // @ts-expect-error ancestorTitles exists. stfu
      .filter(r => r.status !== 'pending' && r.fullName.includes(focusedTest.id!));

  // @ts-expect-error snapshot isn't in the types of course
  const canUpdateSnapshot = !!testResults?.result.snapshot?.failure;

  const onUpdateSnapshotClick = useCallback(() => {
    vscode.postMessage({
      type: 'updateSnapshots',
      filePath: testResults?.params.filePath,
      testName: testResults?.params.testName,
    });
  }, [testResults])

  return <div>
    <h3>
      {testResults?.params.filePath} {testResults?.params.testName}
    </h3>
    {(!focusedTest || focusedTest?.ancestors.length === 0) && testResults?.output &&
      <pre>
        {testResults.output}
      </pre>
    }
    {(focusedAssertions?.length || 0) > 0 &&
      <pre>{
        focusedAssertions!.map(
          (ass) => ass.status === 'failed' ?
            ass.failureMessages.join('\n') :
            `${ass.status} ${ass.fullName}`
        ).join('\n')
      }</pre>}
    {canUpdateSnapshot &&
      <a onClick={onUpdateSnapshotClick}>Update snapshots</a>}
  </div>;
}

ReactDOM.render(<Main />, document.getElementById('root'));
