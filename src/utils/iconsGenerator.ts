import * as path from 'path';
import * as fs from 'fs-extra-promise';
import { funcComplexityColor, detailsComplexityColor } from '../constants';

const xOffset = -210;
const charWidth = 6;

const iconsDir = path.join(__dirname, '../../resources/icons/');
const tpl = fs.readFileSync(path.join(iconsDir, 'tpl.svg')).toString();

function makeIcon({
    index,
    folder,
    text,
    color
}: {
    index: number;
    folder: string;
    text: string;
    color: string;
}) {
    const curXOffset = xOffset - (text.length * charWidth) / 2;
    const svg = tpl
        .split('{text}')
        .join(text)
        .split('{color}')
        .join(color)
        .split('{xOffset}')
        .join(curXOffset.toFixed(2));

    fs.outputFile(path.join(iconsDir, `${folder}/${index}.svg`), svg);
}

for (let i = 1; i <= 100; ++i) {
    const text = i === 100 ? '∞' : i.toString();
    makeIcon({
        index: i,
        folder: 'func-complexity',
        text,
        color: funcComplexityColor
    });
    makeIcon({
        index: i,
        folder: 'details-complexity',
        text,
        color: detailsComplexityColor
    });
}
