import type { CampaignContact } from "../types/campaign.types";

function getSalutation(contact: CampaignContact) {
  if (contact.gender === "male") {
    return "Encik";
  }

  if (contact.gender === "female") {
    return "Puan";
  }

  return "Tuan/Puan";
}

export function renderCampaignTemplate(template: string, contact: CampaignContact) {
  return template
    .split("{{name}}").join(contact.name)
    .split("{{phone}}").join(contact.phone)
    .split("{{tag}}").join(contact.tag ?? "")
    .split("{{salutation}}").join(getSalutation(contact));
}

/**
 * Parse and expand spin syntax: {option1|option2|option3}
 * Supports nested groups and escaped braces: \{ and \}
 */
export function renderSpintax(text: string): string {
  const ESCAPED_OPEN = "\x00SPIN_OPEN\x00";
  const ESCAPED_CLOSE = "\x00SPIN_CLOSE\x00";
  let protectedText = text.replace(/\\\{/g, ESCAPED_OPEN).replace(/\\\}/g, ESCAPED_CLOSE);

  function expand(input: string): string {
    let result = "";
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (ch === "{" && input[i + 1] !== "{") {
        let depth = 1;
        let j = i + 1;
        while (j < input.length && depth > 0) {
          if (input[j] === "{" && input[j + 1] !== "{") depth++;
          else if (input[j] === "}") depth--;
          j++;
        }
        if (depth !== 0) {
          result += ch;
          i++;
          continue;
        }
        const groupContent = input.slice(i + 1, j - 1);
        const options: string[] = [];
        let optStart = 0;
        let splitDepth = 0;
        for (let k = 0; k < groupContent.length; k++) {
          const c = groupContent[k];
          if (c === "{" && groupContent[k + 1] !== "{") splitDepth++;
          else if (c === "}") splitDepth--;
          else if (c === "|" && splitDepth === 0) {
            options.push(groupContent.slice(optStart, k));
            optStart = k + 1;
          }
        }
        options.push(groupContent.slice(optStart));
        const validOptions = options.filter((o) => o.length > 0);
        if (validOptions.length === 0) {
          result += ch;
          i++;
          continue;
        }
        const chosen = validOptions[Math.floor(Math.random() * validOptions.length)];
        result += expand(chosen);
        i = j;
      } else {
        result += ch;
        i++;
      }
    }
    return result;
  }

  const expanded = expand(protectedText);
  return expanded.replace(new RegExp(ESCAPED_OPEN, "g"), "{").replace(new RegExp(ESCAPED_CLOSE, "g"), "}");
}

/**
 * Generate N random spin variations for preview purposes.
 */
export function generateSpinVariations(template: string, count = 3): string[] {
  const variations = new Set<string>();
  let attempts = 0;
  while (variations.size < count && attempts < count * 10) {
    variations.add(renderSpintax(template));
    attempts++;
  }
  return Array.from(variations);
}
