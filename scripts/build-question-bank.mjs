import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pdfDir = path.join(root, "tmp/pdfs/shtemaran");
const outputPath = path.join(root, "question-bank.js");

const volumes = [
  { part: 1, starts: [5, 35, 111, 168, 235, 272], answers: 306, pages: 320 },
  { part: 2, starts: [5, 38, 98, 145, 203, 241], answers: 286, pages: 296 },
  { part: 3, starts: [5, 62, 125, 192, 263, 296], answers: 362, pages: 384 },
  { part: 4, starts: [5, 44, 116, 184, 269, 312], answers: 374, pages: 392 },
];

const topicNames = [
  "Կենդանի օրգանիզմների բազմազանությունը",
  "Մարդ",
  "Բջջի կառուցվածքը և նյութափոխանակությունը",
  "Բազմացում, զարգացում և ժառանգականություն",
  "Էվոլյուցիա, էկոլոգիա և կենսոլորտ",
  "Խնդիրներ",
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

function pdfText(pdf, firstPage, lastPage) {
  const text = execFileSync("pdftotext", ["-f", String(firstPage), "-l", String(lastPage), "-layout", pdf, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return legacyArmenianToUnicode(text)
    .replace(/^(?:\s*(?:w{1,3}|tc|\.a)\s*)+(?=\d{1,3}(?:\.\d)?\.)/gm, "")
    .replace(/(?:^|\s)(?:w{1,3}|tc|\.a)(?:\s+[1-6])?(?=\s|$)/g, " ");
}

function cleanLine(line) {
  const trimmed = line.replace(/\u00a0/g, " ").trim();
  if (!trimmed) return "";
  if (/^(?:w{1,3}|\.a|tc|m|tc\s*\.a|\.a\s*m)$/i.test(trimmed)) return "";
  if (/^\d{1,3}$/.test(trimmed)) return "";
  return trimmed
    .replace(/\s+/g, " ")
    .replace(/\s+([,։:;])/g, "$1")
    .replace(/([(`])\s+/g, "$1")
    .replace(/\s+([)`])/g, "$1");
}

function cleanBlock(text) {
  return text
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,։:;?.])/g, "$1")
    .trim();
}

function parseAnswerSections(text) {
  const markers = [...text.matchAll(/(?:^|\f)\s*([1-6])\.\s+([Ա-Ֆ][^\n]*)/gm)];
  const sections = new Map();
  for (let index = 0; index < markers.length; index += 1) {
    const chapter = Number(markers[index][1]);
    const start = markers[index].index;
    const end = markers[index + 1]?.index ?? text.length;
    sections.set(chapter, text.slice(start, end));
  }
  return sections;
}

function parseSingleChoiceAnswers(section = "") {
  const answers = new Map();
  for (const match of section.matchAll(/(?:^|\s)(\d{1,3})\s*-\s*([1-4])(?=\s|$)/g)) {
    answers.set(Number(match[1]), Number(match[2]));
  }
  return answers;
}

function locateRootQuestions(text) {
  return [...text.matchAll(/^\s*(\d{1,3})\.\s+(?!\d)/gm)].map((match) => ({
    number: Number(match[1]),
    index: match.index,
    bodyStart: match.index + match[0].length,
  }));
}

function parseChoiceQuestion(block, number, correctIndex, source) {
  const optionMatches = [...block.matchAll(/^\s*([1-4])\)\s*/gm)];
  if (optionMatches.length !== 4 || optionMatches.map((match) => match[1]).join("") !== "1234") return null;
  const prompt = cleanBlock(block.slice(0, optionMatches[0].index));
  const options = optionMatches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = optionMatches[index + 1]?.index ?? block.length;
    return cleanBlock(block.slice(start, end));
  });
  if (!prompt || options.some((option) => !option || option.length > 900) || new Set(options).size !== 4) return null;
  if (/նկար(?:ում|ի|ը|ից)|գծապատկեր/i.test(prompt)) return null;
  return {
    type: "choice",
    prompt,
    options,
    correct: options[correctIndex - 1],
    source: { ...source, question: String(number) },
  };
}

function parseChoiceChapter(text, answers, source) {
  const roots = locateRootQuestions(text);
  const questions = [];
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    if (!answers.has(current.number)) continue;
    const end = roots[index + 1]?.index ?? text.length;
    const parsed = parseChoiceQuestion(text.slice(current.bodyStart, end), current.number, answers.get(current.number), source);
    if (parsed) questions.push(parsed);
  }
  return questions;
}

function parseNumericAnswers(section = "") {
  const answers = new Map();
  for (const match of section.matchAll(/(?:^|\s)(\d{1,3}(?:\.\d)?)\s*-\s*(-?\d+(?:[.,]\d+)?)(?=\s|$)/g)) {
    answers.set(match[1], match[2].replace(",", "."));
  }
  return answers;
}

function parseShortQuestions(text, answers, source) {
  const roots = locateRootQuestions(text);
  const questions = [];
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const root = roots[rootIndex];
    const end = roots[rootIndex + 1]?.index ?? text.length;
    const block = text.slice(root.bodyStart, end);
    const children = [...block.matchAll(/^\s*(\d{1,3}\.\d)\.\s*/gm)];
    const rootStemEnd = children[0]?.index ?? block.length;
    const rootStem = cleanBlock(block.slice(0, rootStemEnd));

    if (!children.length) {
      const id = String(root.number);
      if (answers.has(id) && /[Ա-Ֆա-ֆ]/.test(rootStem) && !/^\d\)/m.test(block) && /[։.?:]$/.test(rootStem)) {
        questions.push({
          type: "short", prompt: rootStem, correct: answers.get(id), answerMode: "sequence",
          source: { ...source, question: id },
        });
      }
      continue;
    }

    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      const id = child[1];
      if (!answers.has(id)) continue;
      const childEnd = children[childIndex + 1]?.index ?? block.length;
      const childText = block.slice(child.index + child[0].length, childEnd);
      if (/^\s*[1-4]\)\s/m.test(childText)) continue;
      const prompt = cleanBlock(childText);
      if (!/[Ա-Ֆա-ֆ]/.test(prompt) || !/[։.?:]$/.test(prompt)) continue;
      questions.push({
        type: "short",
        context: rootStem,
        prompt,
        correct: answers.get(id),
        answerMode: "sequence",
        placeholder: "Գրեք միայն թվային պատասխանը",
        source: { ...source, question: id },
      });
    }
  }
  return questions;
}

function seededShuffle(items, seed) {
  const output = [...items];
  let value = seed >>> 0;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

const choiceByPart = new Map(volumes.map((volume) => [volume.part, []]));
let shortPool = [];

for (const volume of volumes) {
  const pdf = path.join(pdfDir, `kensab-${volume.part}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`Missing source PDF: ${pdf}`);
  const answerText = pdfText(pdf, volume.answers, volume.pages);
  const answerSections = parseAnswerSections(answerText);

  for (let chapter = 1; chapter <= 5; chapter += 1) {
    const start = volume.starts[chapter - 1];
    const end = volume.starts[chapter] - 1;
    const chapterText = pdfText(pdf, start, end);
    const answers = parseSingleChoiceAnswers(answerSections.get(chapter));
    choiceByPart.get(volume.part).push(...parseChoiceChapter(chapterText, answers, {
      part: volume.part,
      topic: chapter,
      topicName: topicNames[chapter - 1],
    }));
  }

  if (volume.part === 4) {
    const problemText = pdfText(pdf, volume.starts[5], volume.answers - 1);
    const numericAnswers = parseNumericAnswers(answerSections.get(6));
    shortPool = parseShortQuestions(problemText, numericAnswers, {
      part: 4,
      topic: 6,
      topicName: topicNames[5],
    });
  }
}

const interleavedChoices = [];
const queues = [1, 2, 3, 4].map((part) => seededShuffle(choiceByPart.get(part), 202600 + part));
while (queues.some((queue) => queue.length)) {
  for (const queue of queues) {
    if (queue.length) interleavedChoices.push(queue.shift());
  }
}
shortPool = seededShuffle(shortPool, 202604);

const testCount = Math.max(2, Math.ceil(interleavedChoices.length / 40));
const tests = [];
for (let testIndex = 0; testIndex < testCount; testIndex += 1) {
  const choices = Array.from({ length: 40 }, (_, index) => interleavedChoices[(testIndex * 40 + index) % interleavedChoices.length]);
  const shorts = Array.from({ length: 20 }, (_, index) => shortPool[(testIndex * 20 + index) % shortPool.length]);
  const questions = [...choices, ...shorts].map((question, index) => ({ ...question, id: index + 1 }));
  tests.push({
    id: `test-${testIndex + 1}`,
    title: `Տարբերակ ${testIndex + 1}`,
    subtitle: "40 ընտրովի · 20 կարճ պատասխան",
    questions,
  });
}

const stats = {
  tests: tests.length,
  choiceQuestions: interleavedChoices.length,
  shortQuestions: shortPool.length,
  perPart: Object.fromEntries([...choiceByPart].map(([part, questions]) => [part, questions.length])),
};

const output = `/* Generated from the four biology question-bank PDFs. */\nwindow.BIOLOGY_BANK_STATS = ${JSON.stringify(stats, null, 2)};\nwindow.BIOLOGY_BANK_TESTS = ${JSON.stringify(tests, null, 2)};\n`;
fs.writeFileSync(outputPath, output);
console.log(JSON.stringify(stats, null, 2));
