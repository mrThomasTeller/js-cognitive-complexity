import * as eslint from 'eslint';
import * as path from 'path';
import { log } from './logger';
const rule: eslint.Rule.RuleModule = require('eslint-plugin-sonarjs/lib/rules/cognitive-complexity.js');

type IComplexityDetails = {
    cost: number;
    message: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
};

type IFunctionComplexity = IComplexityDetails & {
    scores: IComplexityDetails[];
};

let minComplexity_ = 0;
let functionsComplexity: IFunctionComplexity[] = [];
const oldCreate = rule.create;
rule.create = context => {
    const newContext = {
        report: ({ loc, message }: any) => {
            const data = JSON.parse(message);
            if (data.cost >= minComplexity_) {
                functionsComplexity.push({
                    line: loc.start.line - 1,
                    column: loc.start.column,
                    endLine: loc.end.line - 1,
                    endColumn: loc.end.column,
                    cost: data.cost,
                    message: data.message,
                    scores: (data.secondaryLocations as any[]).map(
                        ({ line, column, endLine, endColumn, message }: any) => ({
                            line: line - 1,
                            column,
                            endLine: endLine - 1,
                            endColumn,
                            cost: +(message as string).split(' ')[0].slice(1),
                            message
                        })
                    )
                });
            }
        }
    };
    Object.setPrototypeOf(newContext, context);
    return oldCreate(newContext as any);
};

const cli = new eslint.CLIEngine({
    cwd: __dirname,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: path.join(__dirname, '../resources/tsconfig.json'),
        sourceType: 'module',
        createDefaultProgram: true
    },
    useEslintrc: false,
    plugins: ['sonarjs'],
    rules: {
        'sonarjs/cognitive-complexity': ['error', 0, 'sonar-runtime']
    }
});
log('eslint cli created from ' + __dirname);

export default function calcComplexity(source: string, fileName: string, minComplexity: number) {
    minComplexity_ = minComplexity;
    functionsComplexity = [];
    try {
        cli.executeOnText(source, fileName);
    } catch (e) {
        log('error message: ' + e.message);
    }
    return functionsComplexity;
}
