import type { MessageTemplateVariable } from "../types/template.types";

const variablePattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateVariables(content: string) {
  const variables = new Set<string>();
  let match = variablePattern.exec(content);

  while (match) {
    variables.add(match[1]);
    match = variablePattern.exec(content);
  }

  return Array.from(variables);
}

export function getInvalidTemplateVariables(content: string, availableVariables: MessageTemplateVariable[]) {
  const availableKeys = new Set(availableVariables.map((variable) => variable.key));
  return extractTemplateVariables(content).filter((variable) => !availableKeys.has(variable));
}

export function renderTemplateSample(content: string, availableVariables: MessageTemplateVariable[]) {
  const samples = new Map(availableVariables.map((variable) => [variable.key, variable.sampleValue]));

  return content.replace(variablePattern, (_match, key: string) => samples.get(key) ?? `{{${key}}}`);
}

export function insertVariableAtCursor(value: string, variableKey: string, selectionStart: number | null, selectionEnd: number | null) {
  const token = `{{${variableKey}}}`;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? value.length;

  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    cursorPosition: start + token.length
  };
}
