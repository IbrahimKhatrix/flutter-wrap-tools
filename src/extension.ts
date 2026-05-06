import * as vscode from 'vscode';

function getSpacer(): string {
	const editor = vscode.window.activeTextEditor;
	if (editor && editor.options.insertSpaces) {
		return ' '.repeat(Number(editor.options.tabSize));
	}
	return '\t';
}


function expandSelectionToWidget(): vscode.Selection | null {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return null;

	const doc = editor.document;
	const text = doc.getText();
	const offset = doc.offsetAt(editor.selection.active);


	const wordRange = doc.getWordRangeAtPosition(
		editor.selection.active,
		/[A-Za-z_][A-Za-z0-9_]*/
	);

	if (!wordRange) return null;

	const widgetName = doc.getText(wordRange);


	if (!/^[A-Z]/.test(widgetName)) return null;


	let i = doc.offsetAt(wordRange.end);

	while (i < text.length && /\s/.test(text[i])) i++;

	if (text[i] !== '(') return null;

	const startParen = i;


	let depth = 0;
	let end = startParen;

	for (let j = startParen; j < text.length; j++) {
		if (text[j] === '(') depth++;
		if (text[j] === ')') depth--;

		if (depth === 0) {
			end = j + 1;
			break;
		}
	}

	return new vscode.Selection(
		doc.positionAt(doc.offsetAt(wordRange.start)),
		doc.positionAt(end)
	);
}

function insertSnippet(before: string, after: string, space: string) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const selection = editor.selection;
	const doc = editor.document;

	let child = doc.getText(selection)
		.trimLeft()
		.replace(/\$/g, '\\$');

	const line = doc.lineAt(selection.start);

	child = child.replace(
		new RegExp("\n\\s{" + line.firstNonWhitespaceCharacterIndex + "}", "gm"),
		"\n" + space
	);

	let replaceText = before + child + after;

	if (child.endsWith(",")) {
		replaceText += ",";
	}

	editor.insertSnippet(new vscode.SnippetString(replaceText), selection);

}

export function activate(context: vscode.ExtensionContext) {

	const wrapContainer = vscode.commands.registerCommand(
		'flutterWrap.wrapWidget',
		() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const selection = expandSelectionToWidget();
			if (!selection) return;

			editor.selection = selection;

			insertSnippet(
				"${1:Widget}(\n" + getSpacer() + "child: ",
				"\n)$0",
				getSpacer()
			);
		}
	);
	const unwrap = vscode.commands.registerCommand(
		'flutterWrap.unwrapWidget',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const doc = editor.document;

			const selection = expandSelectionToWidget();
			if (!selection) return;

			const text = doc.getText(selection);


			const match = text.match(/^[A-Za-z0-9_]+\(([\s\S]*)\)$/);

			if (!match) {
				vscode.window.showErrorMessage("Can't unwrap this widget");
				return;
			}

			const inside = match[1];

			// detect if THIS widget directly has children (not nested)
			const hasDirectChildren = hasTopLevelChildrenProperty(text);
			if (hasDirectChildren) {
				const childrenText = extractChildren(inside);

				if (childrenText) {
					const items = splitTopLevelItems(childrenText);

					if (items.length === 1) {
						await editor.edit(edit => {
							edit.replace(selection, items[0]);
						});
					} else {
						await editor.edit(edit => {
							edit.replace(selection, '');
						});
					}
					return;
				}
			}

			const inner = extractChild(match[1]);

			if (!inner) {
				vscode.window.showErrorMessage("No child found to unwrap");
				return;
			}

			await editor.edit(edit => {
				edit.replace(selection, inner);
			});
		}
	);


	const wrapStacked = vscode.commands.registerCommand(
		'flutterWrap.wrapStacked',
		() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const selection = editor.selection;
			const doc = editor.document;

			const space = getSpacer();

			let content = doc.getText(selection)
				.trim()
				.replace(/\$/g, '\\$');

			// fix indentation inside selection
			const line = doc.lineAt(selection.start);

			content = content.replace(
				new RegExp("\n\\s{" + line.firstNonWhitespaceCharacterIndex + "}", "gm"),
				"\n" + space + space
			);

			// 			const snippet =
			// 				`Column(
			// ${space}children: [
			// ${space}${space}${content}
			// ${space}]
			// )$0`;

			insertSnippet(
				"${1:Column}(\n" +
				getSpacer() + "children: [\n" +
				getSpacer() + getSpacer(),
				"\n" + getSpacer() + "]\n)$0",
				getSpacer()
			);
		}
	);


	context.subscriptions.push(wrapContainer, unwrap, wrapStacked);
}

export function deactivate() { }

function extractChild(text: string): string | null {
	const childIndex = text.indexOf('child:');
	if (childIndex === -1) return null;

	let i = childIndex + 'child:'.length;

	// skip spaces
	while (i < text.length && /\s/.test(text[i])) i++;

	let start = i;
	let depth = 0;
	let inString = false;

	for (; i < text.length; i++) {
		const char = text[i];

		// handle strings (basic)
		if (char === "'" || char === '"') {
			inString = !inString;
		}

		if (inString) continue;

		if (char === '(') depth++;
		if (char === ')') {
			if (depth === 0) break;
			depth--;
		}

		// stop at comma ONLY if not nested
		if (char === ',' && depth === 0) {
			break;
		}
	}

	let result = text.slice(start, i).trim();

	// remove trailing comma
	if (result.endsWith(',')) {
		result = result.slice(0, -1);
	}

	return result;
}

function splitTopLevelItems(text: string): string[] {
	const items: string[] = [];
	let current = '';

	let paren = 0;
	let bracket = 0;
	let inString = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (char === "'" || char === '"') {
			inString = !inString;
		}

		if (inString) {
			current += char;
			continue;
		}

		if (char === '(') paren++;
		if (char === ')') paren--;
		if (char === '[') bracket++;
		if (char === ']') bracket--;

		if (char === ',' && paren === 0 && bracket === 0) {
			if (current.trim()) items.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	if (current.trim()) items.push(current.trim());

	return items;
}
function extractChildren(text: string): string | null {
	const keyIndex = text.indexOf('children:');
	if (keyIndex === -1) return null;

	let i = keyIndex + 'children:'.length;

	// skip spaces
	while (i < text.length && /\s/.test(text[i])) i++;

	// must start with [
	if (text[i] !== '[') return null;

	i++; // skip '['
	const start = i;

	let depth = 1;
	let paren = 0;
	let inString = false;

	for (; i < text.length; i++) {
		const char = text[i];

		// basic string handling
		if (char === '"' || char === "'") {
			inString = !inString;
		}

		if (inString) continue;

		// track nested structures
		if (char === '[') depth++;
		if (char === ']') depth--;

		if (char === '(') paren++;
		if (char === ')') paren--;

		// stop when closing main list
		if (depth === 0 && paren === 0) {
			break;
		}
	}

	let result = text.slice(start, i).trim();

	return result || null;
}

function hasTopLevelChildrenProperty(text: string): boolean {
	let depth = 0;
	let inString = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];

		if (c === '"' || c === "'") {
			inString = !inString;
		}

		if (inString) continue;

		if (c === '(') depth++;
		if (c === ')') depth--;

		// only check at top-level inside widget
		if (depth === 1) {
			if (
				text.slice(i, i + 9) === 'children:'
			) {
				return true;
			}
		}
	}

	return false;
}