import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pdfDir = path.join(root, "tmp/pdfs/teacher-attestation");
const outputPath = path.join(root, "voluntary-attestation.js");
const pageImageDir = path.join(root, "assets/voluntary-pages");

const sets = [
  {
    id: "2022",
    year: 2022,
    files: [1, 2, 3, 4].map((variant) => `2022_${variant}.pdf`),
    key: "2022_key.pdf",
    sourceUrls: [1, 2, 3, 4].map((variant) => encodeURI(`http://www.atc.am/files/Usuchchi atestacia _2022/Թեստեր/25․09․22/Կենսաբանություն թեստ ${variant}.pdf`)),
    answerKeyUrl: encodeURI("http://www.atc.am/files/Usuchchi atestacia _2022/Թեստեր/25․09․22/Կենսաբանություն պատասխաններ.pdf"),
    pageUrl: "http://www.atc.am/level0_.php?cat_=1&id=145",
  },
  {
    id: "2023",
    year: 2023,
    files: [1, 2, 3, 4].map((variant) => `2023_${variant}.pdf`),
    key: "2023_key.pdf",
    sourceUrls: [1, 2, 3, 4].map((variant) => `http://www.atc.am/files/Usuchchi%20atestacia_2023/Test/Bio/7_${variant}.pdf`),
    answerKeyUrl: "http://www.atc.am/files/Usuchchi%20atestacia_2023/Pat/Bio.pdf",
    pageUrl: "http://www.atc.am/level1_.php?id_2=280&id=153&cat_=1",
  },
  {
    id: "2024",
    year: 2024,
    files: ["2024_1.pdf"],
    key: "2024_key.pdf",
    sourceUrls: ["http://www.atc.am/files/usucichneri%20atestavorum%202024/test/Kensab_usucich_24.pdf"],
    answerKeyUrl: "http://www.atc.am/files/usucichneri%20atestavorum%202024/patasx_hokt/Kensab_usucich_24.pdf",
    pageUrl: "http://www.atc.am/level1_.php?id_2=293&id=158&cat_=1",
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
  if (/^(?:Կենսաբանություն|ԿԵՆՍԱԲԱՆՈՒԹՅՈՒՆ)$/i.test(value)) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,։:;?.])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1");
}

function cleanBlock(text) {
  return text.split(/\r?\n/).map(cleanLine).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function parseAnswerKey(file, variantCount) {
  const answers = Array.from({ length: variantCount }, () => new Map());
  for (const line of pdfText(file).split(/\r?\n/)) {
    const cells = line.trim().split(/\s{2,}/).filter(Boolean);
    if (variantCount === 4 && cells.length >= 5 && /^\d+$/.test(cells[0])) {
      const number = Number(cells[0]);
      if (number >= 1 && number <= 60) {
        for (let variant = 0; variant < 4; variant += 1) answers[variant].set(number, cells[variant + 1]);
      }
      continue;
    }
    if (variantCount === 1) {
      for (let index = 0; index + 1 < cells.length; index += 2) {
        if (/^\d+$/.test(cells[index])) {
          const number = Number(cells[index]);
          if (number >= 1 && number <= 60) answers[0].set(number, cells[index + 1]);
        }
      }
    }
  }
  answers.forEach((answerMap, index) => {
    const missing = Array.from({ length: 60 }, (_, questionIndex) => questionIndex + 1).filter((number) => !answerMap.has(number));
    if (missing.length) throw new Error(`${file}, variant ${index + 1}: missing answers ${missing.join(", ")}`);
  });
  return answers;
}

function locateRoots(text) {
  return [...text.matchAll(/^[ \t]*(\d{1,2})(?:[ \t]+(?=\S)|[ \t]*$)/gm)]
    .map((match) => ({ number: Number(match[1]), index: match.index, bodyStart: match.index + match[0].length }))
    .filter((rootItem) => rootItem.number >= 1 && rootItem.number <= 60);
}

function extractOptions(block, minimum = 4) {
  const markers = [...block.matchAll(/^[ \t]+([1-9])(?:\)|\.)[ \t]+/gm)];
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
  const filename = `${assetId}-p${page}.webp`;
  const destination = path.join(pageImageDir, filename);
  if (!fs.existsSync(destination)) {
    const temporaryPrefix = destination.slice(0, -5);
    execFileSync("pdftoppm", [
      "-f", String(page), "-l", String(page), "-singlefile", "-r", "105", "-jpeg", "-jpegopt", "quality=82",
      path.join(pdfDir, file), temporaryPrefix,
    ], { stdio: "ignore" });
    execFileSync("cwebp", ["-quiet", "-q", "78", `${temporaryPrefix}.jpg`, "-o", destination]);
    fs.unlinkSync(`${temporaryPrefix}.jpg`);
  }
  return `./assets/voluntary-pages/${filename}`;
}

function parseExam(file, answerMap, source) {
  const text = pdfText(file);
  const allRoots = locateRoots(text);
  const roots = [];
  let expected = 1;
  for (const rootItem of allRoots) {
    if (rootItem.number === expected) {
      roots.push(rootItem);
      expected += 1;
    }
  }
  if (roots.length !== 60) throw new Error(`${file}: expected roots 1-60, found ${roots.map((item) => item.number).join(",")}`);

  return roots.map((rootItem, index) => {
    const block = text.slice(rootItem.bodyStart, roots[index + 1]?.index ?? text.length);
    const page = (text.slice(0, rootItem.index).match(/\f/g) || []).length + 1;
    const base = {
      id: rootItem.number,
      source: { ...source, question: String(rootItem.number), visualPages: true },
      image: ensurePageImage(file, source.assetId, page),
    };
    const keyedAnswer = answerMap.get(rootItem.number);

    if (rootItem.number <= 30) {
      const parsed = extractOptions(block, 4);
      const fallbackOptions = ["Տարբերակ 1", "Տարբերակ 2", "Տարբերակ 3", "Տարբերակ 4"];
      const options = parsed?.options.length === 4 ? parsed.options : fallbackOptions;
      return {
        ...base,
        type: "choice",
        prompt: parsed?.prompt || cleanBlock(block) || "Ընտրեք քննաթերթի նկարում ներկայացված ճիշտ տարբերակը։",
        options,
        correct: options[Number(keyedAnswer) - 1],
      };
    }

    if (rootItem.number >= 45 && rootItem.number <= 49) {
      const parsed = extractOptions(block, 2);
      if (!parsed) throw new Error(`${file}: cannot parse multiple selection ${rootItem.number}`);
      const selected = keyedAnswer.split(",").map(Number);
      return {
        ...base,
        type: "multiple",
        prompt: parsed.prompt,
        options: parsed.options,
        correct: selected.map((position) => parsed.options[position - 1]),
      };
    }

    const answerMode = rootItem.number >= 45 ? "sequence" : "sequence";
    return {
      ...base,
      type: "short",
      prompt: cleanBlock(block),
      correct: keyedAnswer,
      answerMode,
      placeholder: rootItem.number >= 50
        ? "Գրեք միայն թվային պատասխանը"
        : "Գրեք համարները նշված հերթականությամբ՝ բաժանելով ստորակետով",
    };
  });
}

const tests = [];
for (const set of sets) {
  const answers = parseAnswerKey(set.key, set.files.length);
  for (let index = 0; index < set.files.length; index += 1) {
    const variant = index + 1;
    const source = {
      kind: "voluntary",
      year: set.year,
      phase: "Կամավոր ատեստավորում",
      variant,
      sourceUrl: set.sourceUrls[index],
      answerKeyUrl: set.answerKeyUrl,
      pageUrl: set.pageUrl,
      assetId: `${set.id}-${variant}`,
    };
    const questions = parseExam(set.files[index], answers[index], source);
    tests.push({
      id: `voluntary-${set.id}-${variant}`,
      group: "voluntary",
      title: `${set.year} · Կամավոր ատեստավորում · Թեստ ${variant}`,
      shortTitle: `${set.year} · ${variant}`,
      subtitle: "Ուսուցիչների կամավոր ատեստավորում · 60 առաջադրանք",
      year: set.year,
      phase: "Կամավոր ատեստավորում",
      variant,
      sourceUrl: set.sourceUrls[index],
      answerKeyUrl: set.answerKeyUrl,
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

fs.writeFileSync(outputPath, `/* Generated from official ԳԹԿ voluntary teacher-attestation papers and final answer keys. */\nwindow.BIOLOGY_VOLUNTARY_STATS = ${JSON.stringify(stats, null, 2)};\nwindow.BIOLOGY_VOLUNTARY_TESTS = ${JSON.stringify(tests, null, 2)};\n`);
console.log(JSON.stringify(stats, null, 2));
