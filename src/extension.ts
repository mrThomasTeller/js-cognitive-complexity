import * as vscode from 'vscode';
import calcComplexity from './calcComplexity';
import { memoizeWith, groupBy, values, sum } from 'ramda';
import * as path from 'path';
import { funcComplexityColor, detailsComplexityColor } from './constants';
import { log } from './logger';

const editorToDecorationsMap = new Map<
    vscode.TextEditor,
    Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>
>();

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
    let timeout: NodeJS.Timer | undefined = undefined;
    let activeEditor = vscode.window.activeTextEditor;
    // todo another way to detect js?
    const isJsTsFile = (fileName: string) =>
        ['.js', '.ts', '.jsx', '.tsx'].includes(path.extname(fileName));

    log('activate');

    function updateDecorations() {
        if (!activeEditor || !isJsTsFile(activeEditor.document.fileName)) {
            return;
        }

        log('start update decorations');

        const prevDecorationsMap = editorToDecorationsMap.get(activeEditor);
        if (prevDecorationsMap) {
            for (const [type, _] of prevDecorationsMap.entries()) {
                activeEditor.setDecorations(type, []);
            }
        }

        const decorationsMap = new Map<
            vscode.TextEditorDecorationType,
            vscode.DecorationOptions[]
        >();
        const addDecoration = (
            type: vscode.TextEditorDecorationType,
            options: vscode.DecorationOptions
        ) => {
            if (!decorationsMap.has(type)) {
                decorationsMap.set(type, []);
            }
            decorationsMap.get(type)!.push(options);
        };

        const text = activeEditor.document.getText();
        const minComplexity = vscode.workspace
            .getConfiguration()
            .get<number>('js-cognitive-complexity.minComplexity');

        log('before complexity data calculated');
        const complexityData = calcComplexity(
            text,
            activeEditor.document.fileName,
            minComplexity || 0
        );
        log('complexity data calculated');

        complexityData.forEach(complexity => {
            const functionComplexityDecoration: vscode.DecorationOptions = {
                range: new vscode.Range(
                    new vscode.Position(complexity.line, complexity.column),
                    new vscode.Position(complexity.endLine, complexity.endColumn)
                ),
                hoverMessage: `function complexity is ${complexity.cost}`
            };

            addDecoration(
                getFunctionComplexityDecorationType(complexity.cost),
                functionComplexityDecoration
            );

            values(groupBy(x => x.line.toString(), complexity.scores)).forEach(group => {
                const totalCost = sum(group.map(x => x.cost));
                group.forEach(details => {
                    const detailsComplexityDecoration: vscode.DecorationOptions = {
                        range: new vscode.Range(
                            new vscode.Position(details.line, details.column),
                            new vscode.Position(details.endLine, details.endColumn)
                        ),
                        hoverMessage: details.message
                    };

                    addDecoration(
                        getComplexityDetailsDecorationType(totalCost),
                        detailsComplexityDecoration
                    );
                });
            });
        });

        for (const [type, decorations] of decorationsMap.entries()) {
            activeEditor.setDecorations(type, decorations);
        }
        log('complexity data rendered');

        editorToDecorationsMap.set(activeEditor, decorationsMap);
    }

    function triggerUpdateDecorations() {
        if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
        }
        timeout = setTimeout(updateDecorations, 500);
    }

    if (activeEditor) {
        triggerUpdateDecorations();
    }

    vscode.window.onDidChangeActiveTextEditor(
        editor => {
            activeEditor = editor;
            if (editor) {
                triggerUpdateDecorations();
            }
        },
        null,
        context.subscriptions
    );

    vscode.workspace.onDidChangeTextDocument(
        event => {
            if (activeEditor && event.document === activeEditor.document) {
                triggerUpdateDecorations();
            }
        },
        null,
        context.subscriptions
    );
}

// create a decorator type that we use to decorate small numbers
const getFunctionComplexityDecorationType = memoizeWith(String, (complexity: number) =>
    vscode.window.createTextEditorDecorationType({
        gutterIconPath: path.join(
            __dirname,
            `../resources/icons/func-complexity/${Math.min(complexity, 100)}.svg`
        ),
        color: funcComplexityColor,
        textDecoration: 'underline',
        overviewRulerColor: funcComplexityColor,
        overviewRulerLane: vscode.OverviewRulerLane.Left
    })
);

// create a decorator type that we use to decorate large numbers
const getComplexityDetailsDecorationType = memoizeWith(String, (complexity: number) =>
    vscode.window.createTextEditorDecorationType({
        gutterIconPath: path.join(
            __dirname,
            `../resources/icons/details-complexity/${Math.min(complexity, 100)}.svg`
        ),
        color: detailsComplexityColor,
        textDecoration: 'underline'
    })
);
