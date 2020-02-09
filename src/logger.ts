import * as vscode from 'vscode';

const debug = true;
const chanel = debug ? vscode.window.createOutputChannel('JS cognitive complexity') : null;

export function log(message: string) {
    if (debug) chanel!.appendLine(message);
    // vscode.window.showInformationMessage('jscc: ' + message);
}
