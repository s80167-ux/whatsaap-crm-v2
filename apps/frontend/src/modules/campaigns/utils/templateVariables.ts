import type { AudienceTemplateVariableKey } from "../audience-groups/types/audienceGroup.types";

export function extractTemplateVariables(template: string) {
  const found = new Set<string>();

  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const normalizedKey = key.trim();

    if (normalizedKey) {
      found.add(normalizedKey);
    }

    return _match;
  });

  return Array.from(found);
}

export function formatVariableToken(key: string) {
  return `{{${key}}}`;
}

export function findInvalidTemplateVariables(
  template: string,
  availableVariableKeys: ReadonlyArray<AudienceTemplateVariableKey>
) {
  const available = new Set<string>(availableVariableKeys);
  return extractTemplateVariables(template).filter((key) => !available.has(key));
}

export function insertVariableIntoTemplate(
  value: string,
  token: string,
  selectionStart: number,
  selectionEnd: number
) {
  const safeStart = Math.max(0, Math.min(selectionStart, value.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length));
  const nextValue = `${value.slice(0, safeStart)}${token}${value.slice(safeEnd)}`;
  const nextCursorPosition = safeStart + token.length;

  return {
    nextValue,
    nextCursorPosition
  };
}
