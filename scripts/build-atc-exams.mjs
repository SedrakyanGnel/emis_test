import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pdfDir = path.join(root, "tmp/pdfs/atc");
const outputPath = path.join(root, "official-exams.js");
const pageImageDir = path.join(root, "assets/atc-pages");

const sets = [
  {
    id: "2024-june",
    year: 2024,
    phase: "Հունիսյան փուլ",
    files: [1, 2, 3, 4].map((variant) => `2024_june_${variant}.pdf`),
    key: "2024_june_key.pdf",
    baseUrl: "http://www.atc.am/files/MIASNAKAN2024/hunis/kensab/",
    sourceNames: [1, 2, 3, 4].map((variant) => `kensab_${variant}.pdf`),
    keyName: "kensab_pat.pdf",
  },
  {
    id: "2025-january",
    year: 2025,
    phase: "Հունվար-փետրվարյան փուլ",
    files: [1, 2, 3, 4].map((variant) => `2025_january_${variant}.pdf`),
    key: "2025_january_key.pdf",
    baseUrl: "http://www.atc.am/files/Miasnakan_2025/kensab/",
    sourceNames: [1, 2, 3, 4].map((variant) => `kensab_test${variant}_hunv_25.pdf`),
    keyName: "kensab_pat_hunv_25.pdf",
  },
  {
    id: "2025-june",
    year: 2025,
    phase: "Հունիսյան փուլ",
    files: [1, 2, 3, 4].map((variant) => `2025_june_${variant}.pdf`),
    key: "2025_june_key.pdf",
    baseUrl: "http://www.atc.am/files/Miasnakan_2025/hunis/kensab/",
    sourceNames: [1, 2, 3, 4].map((variant) => `kensab_test_${variant}_${variant === 2 ? "hunsi" : "hunis"}_25.pdf`),
    keyName: "kensab_pat_hunis_25.pdf",
  },
  {
    id: "2025-third",
    year: 2025,
    phase: "Երրորդ փուլ",
    files: [1, 2, 3, 4].map((variant) => `2025_third_${variant}.pdf`),
    key: "2025_third_key.pdf",
    baseUrl: "http://www.atc.am/files/Miasnakan_2025/III_phul/",
    sourceNames: [1, 2, 3, 4].map((variant) => `kensab_${variant}_IIIphul_25.pdf`),
    keyName: "kensab_pat_IIIphul_25.pdf",
  },
  {
    id: "2025-third-tavush",
    year: 2025,
    phase: "Երրորդ փուլ · Տավուշ",
    files: [1, 2, 3, 4].map((variant) => `2025_third_tavush_${variant}.pdf`),
    key: "2025_third_tavush_key.pdf",
    baseUrl: "http://www.atc.am/files/Miasnakan_2025/III_phul/",
    sourceNames: [1, 2, 3, 4].map((variant) => `kensab_${variant}_IIIphul_Tavush_25.pdf`),
    keyName: "kensab_pat_IIIphul_Tavush_25.pdf",
  },
];

function legacyArmenianToUnicode(input) {
  const special = new Map([
    [168, 0x587], [183, 1379], [8226, 1379], [956, 1378], [39, 0x55a],
    [176, 0x55b], [175, 0x55c], [170, 0x55d], [177, 0x55e], [163, 0x589],
    [173, 0x58a], [167, 0xab], [166, 0xbb], [171, 0x2c], [169, 0x2e],
    [174, 0x2026], [165, 0x28], [254, 0x55d], [0xf061, 0x3b1], [0xf062, 0x3b2],
  ]);
  let output = "";
  for (const character of input) {
    const code = character.charCodeAt(0);
    let target = code;
    if (code >= 178 && code <= 253) {
      target = code % 2 === 0 ? 1328 + (code - 176) / 2 : 1376 + (code - 176) / 2;
    }
    if (special.has(code)) target = special.get(code);
    output += String.fromCharCode(target);
  }
  return output;
}

function pdfText(file) {
  const source = path.join(pdfDir, file);
  if (!fs.existsSync(source)) throw new Error(`Missing source PDF: ${source}`);
  return legacyArmenianToUnicode(execFileSync("pdftotext", ["-layout", source, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }))
    .replace(/^[ \t]*\d{1,2}[ \t]*\r?\n(?=\f)/gm, "")
    .replace(/\f/g, "\n\f\n")
    .replace(/\u00ad/g, "")
    .replace(/[·]/g, "⋅")
    .replace(/[‐‑–—]/g, "-");
}

function cleanLine(line) {
  const value = line.replace(/\u00a0/g, " ").trim();
  if (!value || value === "\f") return "";
  if (/^(?:Կենսաբանություն|ՄԻԱՍՆԱԿԱՆ ՔՆՆՈՒԹՅՈՒՆ|ԹԵՍՏ \d)$/i.test(value)) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,։:;?.])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1");
}

function cleanBlock(text) {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAnswerKey(file) {
  const answers = Array.from({ length: 4 }, () => new Map());
  const accepted = Array.from({ length: 4 }, () => new Set());
  for (const line of pdfText(file).split(/\r?\n/)) {
    const cells = line.trim().split(/\s{2,}/).filter(Boolean);
    if (cells.length < 5 || !/^\d+$/.test(cells[0])) continue;

    if (cells.length >= 5 && Number(cells[0]) >= 1 && Number(cells[0]) <= 40) {
      for (let variant = 0; variant < 4; variant += 1) answers[variant].set(cells[0], cells[variant + 1].replaceAll("*", ""));
    }

    const rightIndex = cells.findIndex((cell, index) => index >= 5 && /^\*?(?:4[1-9]|5\d|6\d|70)(?:\.\d)?$/.test(cell));
    if (rightIndex === -1 || cells.length < rightIndex + 5) continue;
    const questionId = cells[rightIndex].replaceAll("*", "");
    for (let variant = 0; variant < 4; variant += 1) {
      const raw = cells[rightIndex + variant + 1];
      answers[variant].set(questionId, raw.replaceAll("*", "").trim());
      if (raw.includes("*")) accepted[variant].add(questionId);
    }
  }
  for (let variant = 0; variant < 4; variant += 1) {
    const missing = [
      ...Array.from({ length: 68 }, (_, index) => String(index + 1)),
      ...[69, 70].flatMap((number) => Array.from({ length: 6 }, (_, index) => `${number}.${index + 1}`)),
    ].filter((id) => !answers[variant].has(id));
    if (missing.length) throw new Error(`${file}, variant ${variant + 1}: missing answers ${missing.join(", ")}`);
  }
  return { answers, accepted };
}

function locateRoots(text) {
  return [...text.matchAll(/^[ \t]*(\d{1,2})(?:[ \t]+(?=\S)|[ \t]*$)/gm)]
    .map((match) => ({ number: Number(match[1]), index: match.index, bodyStart: match.index + match[0].length }))
    .filter((root) => root.number >= 1 && root.number <= 70);
}

function extractOptions(block, minimum = 4, parenthesizedOnly = false) {
  const pattern = parenthesizedOnly
    ? /^[ \t]+([1-9])\)[ \t]+/gm
    : /^[ \t]+([1-9])(?:\)|\.)[ \t]+/gm;
  const markers = [...block.matchAll(pattern)];
  const ordered = [];
  for (const marker of markers) {
    const expected = ordered.length + 1;
    if (Number(marker[1]) === expected) ordered.push(marker);
    else if (ordered.length) break;
  }
  if (ordered.length < minimum) return null;
  const prompt = cleanBlock(block.slice(0, ordered[0].index));
  const options = ordered.map((marker, index) => cleanBlock(block.slice(
    marker.index + marker[0].length,
    ordered[index + 1]?.index ?? block.length,
  )));
  if (!prompt || options.some((option) => !option)) return null;
  return { prompt, options };
}

function ensurePageImage(file, assetId, page) {
  fs.mkdirSync(pageImageDir, { recursive: true });
  const filename = `${assetId}-p${page}.png`;
  const destination = path.join(pageImageDir, filename);
  if (!fs.existsSync(destination)) {
    execFileSync("pdftoppm", [
      "-f", String(page), "-l", String(page), "-singlefile", "-r", "110", "-png",
      path.join(pdfDir, file), destination.slice(0, -4),
    ], { stdio: "ignore" });
  }
  return `./assets/atc-pages/${filename}`;
}

function parseExam(file, answerMap, acceptedSet, source) {
  const text = pdfText(file);
  const allRoots = locateRoots(text);
  const roots = [];
  let expectedRoot = 1;
  for (const root of allRoots) {
    if (root.number === expectedRoot) {
      roots.push(root);
      expectedRoot += 1;
    }
  }
  if (roots.length !== 70 || roots.some((root, index) => root.number !== index + 1)) {
    throw new Error(`${file}: expected roots 1-70, found ${roots.map((root) => root.number).join(",")}`);
  }

  const rangeMarkers = [...text.matchAll(/^[ \t]*\((\d{1,2})-(\d{1,2})\)[ \t]*/gm)].map((match) => ({
    from: Number(match[1]),
    to: Number(match[2]),
    index: match.index,
  }));
  const contexts = new Map();
  for (const marker of rangeMarkers) {
    const firstRoot = roots.find((root) => root.number === marker.from && root.index > marker.index);
    if (!firstRoot) continue;
    const context = cleanBlock(text.slice(marker.index, firstRoot.index)).replace(/^\(\d{1,2}-\d{1,2}\)\s*/, "");
    if (context) {
      for (let number = marker.from; number <= marker.to; number += 1) contexts.set(number, context);
    }
  }

  const questions = [];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    let end = roots[index + 1]?.index ?? text.length;
    const embeddedRange = rangeMarkers.find((marker) => marker.index > root.bodyStart && marker.index < end);
    if (embeddedRange) end = embeddedRange.index;
    const block = text.slice(root.bodyStart, end);
    const base = {
      id: root.number,
      source: { ...source, question: String(root.number) },
      ...(contexts.has(root.number) ? { context: contexts.get(root.number) } : {}),
      ...(source.visualPages ? {
        image: ensurePageImage(file, source.assetId, (text.slice(0, root.index).match(/\f/g) || []).length + 1),
      } : {}),
    };

    if (root.number <= 40) {
      const parsed = extractOptions(block, 4, true);
      if (!parsed || parsed.options.length !== 4) {
        if (!source.visualPages) throw new Error(`${file}: cannot parse choice ${root.number}: ${JSON.stringify(parsed)}`);
        const fallbackOptions = ["Տարբերակ 1", "Տարբերակ 2", "Տարբերակ 3", "Տարբերակ 4"];
        questions.push({
          ...base,
          type: "choice",
          prompt: cleanBlock(block) || "Ընտրեք նկարում ներկայացված ճիշտ տարբերակը։",
          options: fallbackOptions,
          correct: fallbackOptions[Number(answerMap.get(String(root.number))) - 1],
        });
        continue;
      }
      questions.push({
        ...base,
        type: "choice",
        prompt: parsed.prompt,
        options: parsed.options,
        correct: parsed.options[Number(answerMap.get(String(root.number))) - 1],
      });
      continue;
    }

    if (root.number <= 58) {
      const parsed = extractOptions(block, 2);
      const answer = answerMap.get(String(root.number));
      const isMultiple = /Նշել (?:մարդու օրգանիզմի վերաբերյալ )?բոլոր (?:ճիշտ|սխալ) պնդումները/i.test(cleanBlock(block));
      if (isMultiple) {
        if (!parsed) throw new Error(`${file}: cannot parse multiple selection ${root.number}`);
        const selected = answer.split(",").map(Number);
        questions.push({
          ...base,
          type: "multiple",
          prompt: parsed.prompt,
          options: parsed.options,
          correct: selected.map((position) => parsed.options[position - 1]),
        });
      } else {
        const answerMode = root.number >= 53 ? "set" : "sequence";
        questions.push({
          ...base,
          type: "short",
          prompt: cleanBlock(block),
          correct: answer,
          answerMode,
          placeholder: answerMode === "set"
            ? "Գրեք բոլոր ճիշտ համարները՝ բաժանելով ստորակետով"
            : "Գրեք համարները ճիշտ հերթականությամբ՝ բաժանելով ստորակետով",
        });
      }
      continue;
    }

    if (root.number <= 68) {
      questions.push({
        ...base,
        type: "short",
        prompt: cleanBlock(block),
        correct: answerMap.get(String(root.number)),
        answerMode: "sequence",
        placeholder: "Գրեք միայն թվային պատասխանը",
      });
      continue;
    }

    const statementMarkers = [...block.matchAll(/^[ \t]+([1-6])\.[ \t]+/gm)];
    if (statementMarkers.length !== 6) throw new Error(`${file}: cannot parse true/false block ${root.number}`);
    const context = cleanBlock(block.slice(0, statementMarkers[0].index));
    for (let statementIndex = 0; statementIndex < 6; statementIndex += 1) {
      const questionId = `${root.number}.${statementIndex + 1}`;
      const marker = statementMarkers[statementIndex];
      const prompt = cleanBlock(block.slice(marker.index + marker[0].length, statementMarkers[statementIndex + 1]?.index ?? block.length));
      const truthOptions = ["Ճիշտ է", "Սխալ է", "Չգիտեմ"];
      const keyedAnswer = answerMap.get(questionId);
      questions.push({
        id: questionId,
        type: "choice",
        prompt,
        context,
        options: truthOptions,
        correct: truthOptions.find((option) => option.toLocaleLowerCase("hy-AM") === keyedAnswer.toLocaleLowerCase("hy-AM")) || keyedAnswer,
        ...(acceptedSet.has(questionId) ? { acceptAny: true } : {}),
        source: { ...source, question: questionId },
      });
    }
  }
  if (questions.length !== 80) throw new Error(`${file}: expected 80 scored items, found ${questions.length}`);
  return questions;
}

const tests = [];
for (const set of sets) {
  const { answers, accepted } = parseAnswerKey(set.key);
  for (let variant = 1; variant <= 4; variant += 1) {
    const sourceUrl = `${set.baseUrl}${set.sourceNames[variant - 1]}`;
    const answerKeyUrl = `${set.baseUrl}${set.keyName}`;
    const source = {
      kind: "atc",
      year: set.year,
      phase: set.phase,
      variant,
      sourceUrl,
      answerKeyUrl,
      assetId: `${set.id}-${variant}`,
      visualPages: set.id.includes("tavush"),
    };
    const questions = parseExam(set.files[variant - 1], answers[variant - 1], accepted[variant - 1], source);
    tests.push({
      id: `atc-${set.id}-${variant}`,
      group: "atc",
      title: `${set.year} · ${set.phase} · Թեստ ${variant}`,
      shortTitle: `${set.year} · ${set.phase.replace("Հունվար-փետրվարյան փուլ", "Հունվար").replace("Հունիսյան փուլ", "Հունիս")} · ${variant}`,
      subtitle: "ԳԹԿ պաշտոնական քննություն · 70 առաջադրանք · 80 գնահատվող պատասխան",
      year: set.year,
      phase: set.phase,
      variant,
      sourceUrl,
      answerKeyUrl,
      questions,
    });
  }
}

const stats = {
  tests: tests.length,
  years: [...new Set(tests.map((test) => test.year))],
  scoredItems: tests.reduce((sum, test) => sum + test.questions.length, 0),
  sourcePdfs: sets.reduce((sum, set) => sum + set.files.length + 1, 0),
};

fs.writeFileSync(outputPath, `/* Generated only from direct ԳԹԿ (atc.am) exam papers and final answer keys. */\nwindow.BIOLOGY_ATC_STATS = ${JSON.stringify(stats, null, 2)};\nwindow.BIOLOGY_ATC_TESTS = ${JSON.stringify(tests, null, 2)};\n`);
console.log(JSON.stringify(stats, null, 2));
