/**
 * Feature spec literal parser.
 *
 * TypeScript 7 no longer exposes the legacy `ts.createSourceFile` Compiler API
 * from the public `typescript` package entry. The feature specs have a narrow,
 * declarative shape, so this parser extracts only the top-level exported array
 * and the literal metadata fields used for planning.
 */

export function parseSpecSource(source, fileName = 'spec.ts') {
  const exportedArray = findExportedArray(source);

  if (!exportedArray) {
    throw new Error(`[featurePlanPlugin] No 'export const NAME = [ ... ]' array in ${fileName}`);
  }

  const entries = [];
  for (const element of splitTopLevelObjectLiterals(exportedArray.arraySource)) {
    const entry = extractFeatureEntry(element);
    if (entry && entry.name && entry.phase) entries.push(entry);
  }

  return { exportName: exportedArray.exportName, entries };
}

function findExportedArray(source) {
  const exportPattern = /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  for (let match = exportPattern.exec(source); match; match = exportPattern.exec(source)) {
    if (isInsideTriviaOrLiteral(source, match.index)) continue;

    const arrayStart = skipExpressionWrappers(source, exportPattern.lastIndex);
    if (source[arrayStart] !== '[') continue;

    const arrayEnd = findMatchingDelimiter(source, arrayStart, '[', ']');
    return {
      exportName: match[1],
      arraySource: source.slice(arrayStart + 1, arrayEnd),
    };
  }
  return undefined;
}

function skipExpressionWrappers(source, index) {
  let current = skipWhitespaceAndComments(source, index);
  while (source[current] === '(') {
    current = skipWhitespaceAndComments(source, current + 1);
  }
  return current;
}

function splitTopLevelObjectLiterals(arraySource) {
  const objects = [];
  let index = 0;
  while (index < arraySource.length) {
    index = skipWhitespaceAndComments(arraySource, index);
    if (arraySource[index] !== '{') {
      index += 1;
      continue;
    }
    const end = findMatchingDelimiter(arraySource, index, '{', '}');
    objects.push(arraySource.slice(index + 1, end));
    index = end + 1;
  }
  return objects;
}

function extractFeatureEntry(objLiteralSource) {
  const result = {};
  for (const prop of splitTopLevelProperties(objLiteralSource)) {
    const parsed = parseProperty(prop);
    if (!parsed) continue;

    switch (parsed.key) {
      case 'name':
      case 'phase':
      case 'description': {
        const literal = stringLiteralValue(parsed.value);
        if (literal !== undefined) result[parsed.key] = literal;
        break;
      }
      case 'required': {
        if (parsed.value.trim() === 'true') result.required = true;
        else if (parsed.value.trim() === 'false') result.required = false;
        break;
      }
      case 'dependencies': {
        const deps = stringArrayValue(parsed.value);
        if (deps) result.dependencies = deps;
        break;
      }
      default:
        break;
    }
  }
  return result;
}

function splitTopLevelProperties(source) {
  const properties = [];
  let start = 0;
  let index = 0;
  while (index < source.length) {
    index = skipTriviaAndLiterals(source, index);
    const char = source[index];
    if (char === '{' || char === '[' || char === '(') {
      index = findMatchingDelimiter(source, index, char, matchingDelimiter(char)) + 1;
      continue;
    }
    if (char === ',') {
      properties.push(source.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  properties.push(source.slice(start));
  return properties;
}

function parseProperty(source) {
  let index = skipWhitespaceAndComments(source, 0);
  const key = parsePropertyKey(source, index);
  if (!key) return undefined;

  index = skipWhitespaceAndComments(source, key.end);
  if (source[index] !== ':') return undefined;
  return { key: key.name, value: source.slice(index + 1).trim() };
}

function parsePropertyKey(source, index) {
  const identifier = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
  if (identifier) {
    return { name: identifier[0], end: index + identifier[0].length };
  }

  const literal = readStringLiteral(source, index);
  if (literal) return { name: literal.value, end: literal.end };

  return undefined;
}

function stringLiteralValue(source) {
  return readStringLiteral(source.trim(), 0)?.value;
}

function stringArrayValue(source) {
  const trimmed = source.trim();
  if (trimmed[0] !== '[') return undefined;

  const arrayEnd = findMatchingDelimiter(trimmed, 0, '[', ']');
  const elements = splitTopLevelProperties(trimmed.slice(1, arrayEnd));
  const values = [];
  for (const element of elements) {
    const value = stringLiteralValue(element);
    if (value !== undefined) values.push(value);
  }
  return values;
}

function readStringLiteral(source, index) {
  const quote = source[index];
  if (quote !== '\'' && quote !== '"' && quote !== '`') return undefined;

  let value = '';
  for (let current = index + 1; current < source.length; current += 1) {
    const char = source[current];
    if (char === '\\') {
      value += source[current + 1] || '';
      current += 1;
      continue;
    }
    if (char === quote) {
      return { value, end: current + 1 };
    }
    value += char;
  }
  return undefined;
}

function findMatchingDelimiter(source, start, open, close) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    index = skipTriviaAndLiterals(source, index);
    const char = source[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`[featurePlanPlugin] Unclosed '${open}' while parsing feature spec`);
}

function matchingDelimiter(open) {
  if (open === '{') return '}';
  if (open === '[') return ']';
  return ')';
}

function skipWhitespaceAndComments(source, index) {
  let current = index;
  while (current < source.length) {
    if (/\s/.test(source[current])) {
      current += 1;
      continue;
    }
    if (source.startsWith('//', current)) {
      const end = source.indexOf('\n', current + 2);
      current = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', current)) {
      const end = source.indexOf('*/', current + 2);
      current = end === -1 ? source.length : end + 2;
      continue;
    }
    return current;
  }
  return current;
}

function skipTriviaAndLiterals(source, index) {
  if (source.startsWith('//', index)) {
    const end = source.indexOf('\n', index + 2);
    return end === -1 ? source.length : end;
  }
  if (source.startsWith('/*', index)) {
    const end = source.indexOf('*/', index + 2);
    return end === -1 ? source.length : end + 1;
  }
  if (source[index] === '\'' || source[index] === '"' || source[index] === '`') {
    const literal = readStringLiteral(source, index);
    return literal ? literal.end - 1 : source.length;
  }
  return index;
}

function isInsideTriviaOrLiteral(source, targetIndex) {
  for (let index = 0; index < targetIndex; index += 1) {
    const skipped = skipTriviaAndLiterals(source, index);
    if (skipped >= targetIndex) return true;
    index = skipped;
  }
  return false;
}
